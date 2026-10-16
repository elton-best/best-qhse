<?php

namespace App\Modules\Hse\Services;

use App\Modules\Hse\Models\Duerp;
use App\Modules\Hse\Models\DuerpDanger;
use App\Modules\Hse\Models\DuerpRiskFamily;
use App\Modules\Hse\Models\DuerpScoringScale;

/**
 * Cotation et contrôle de conformité du DUERP (Code du travail R.4121-1 à R.4121-4, INRS ED 840).
 *
 * - Risque brut = Gravité × Fréquence.
 * - Risque évalué = Risque brut × Maîtrise des mesures existantes (1 = bonne, plus élevé = faible ou absente).
 * - Risque résiduel (après actions) = Gravité résiduelle × Fréquence résiduelle × Maîtrise résiduelle.
 * Les niveaux (faible, moyen, significatif) sont relatifs au maximum des échelles de l'entreprise.
 */
class DuerpScoringService
{
    public const LOW_RATIO = 0.2;

    public const MEDIUM_RATIO = 0.5;

    /** Un DUERP est mis à jour au moins une fois par an (R.4121-2). */
    public const MAX_MONTHS_BETWEEN_EVALUATIONS = 12;

    public const REVISION_REASONS = ['initial', 'annual', 'significant_change', 'new_information', 'accident', 'other'];

    /**
     * Échelles de l'entreprise (personnalisées si elles existent, sinon celles de la plateforme).
     *
     * @return array{gravity: array<int, float>, frequency: array<int, float>, maitrise: array<int, float>}
     */
    public function scales(int $enterpriseId): array
    {
        $rows = DuerpScoringScale::withoutGlobalScopes()->where('enterprise_id', $enterpriseId)->where('is_active', true)->get();
        if ($rows->isEmpty()) {
            $rows = DuerpScoringScale::withoutGlobalScopes()->whereNull('enterprise_id')->where('is_active', true)->get();
        }

        $result = ['gravity' => [], 'frequency' => [], 'maitrise' => []];
        foreach ($rows as $row) {
            $result[$row->scale_type][(int) $row->level] = (float) $row->score_value;
        }

        return $result;
    }

    public function levelFor(float $score, float $max): string
    {
        $ratio = $max > 0 ? $score / $max : 0;

        return match (true) {
            $ratio <= self::LOW_RATIO => 'Faible',
            $ratio <= self::MEDIUM_RATIO => 'Moyen',
            default => 'Significatif',
        };
    }

    /**
     * Calcule tous les scores d'une ligne. Les niveaux doivent exister dans les échelles de l'entreprise.
     *
     * @param  array<string, mixed>  $data  niveaux : gravity, frequency, mitigation_level, residual_*
     * @return array<string, mixed> attributs calculés à enregistrer
     */
    public function compute(array $data, int $enterpriseId): array
    {
        $scales = $this->scales($enterpriseId);
        $errors = [];
        $score = function (string $scale, mixed $level, string $field) use ($scales, &$errors): ?float {
            if ($level === null || $level === '') {
                return null;
            }
            if (! isset($scales[$scale][(int) $level])) {
                $errors[$field] = ['Ce niveau n\'existe pas dans l\'échelle de cotation de votre entreprise.'];

                return null;
            }

            return $scales[$scale][(int) $level];
        };

        $g = $score('gravity', $data['gravity'] ?? null, 'gravity');
        $f = $score('frequency', $data['frequency'] ?? null, 'frequency');
        $m = $score('maitrise', $data['mitigation_level'] ?? null, 'mitigation_level');
        $rg = $score('gravity', $data['residual_gravity'] ?? null, 'residual_gravity');
        $rf = $score('frequency', $data['residual_frequency'] ?? null, 'residual_frequency');
        $rm = $score('maitrise', $data['residual_mitigation_level'] ?? null, 'residual_mitigation_level');

        if (($rg === null) !== ($rf === null)) {
            $errors['residual_frequency'] = ['Renseignez la gravité et la fréquence résiduelles ensemble.'];
        }

        $computed = [];
        if ($g !== null && $f !== null) {
            $rawMax = max($scales['gravity'] ?: [1]) * max($scales['frequency'] ?: [1]);
            $raw = $g * $f;
            $computed['raw_risk_score'] = (int) round($raw);
            $computed['raw_risk_level'] = $this->levelFor($raw, $rawMax);

            if ($m !== null) {
                $assessedMax = $rawMax * max($scales['maitrise'] ?: [1]);
                $assessed = $raw * $m;
                $computed['mitigation_coef'] = $m;
                $computed['assessed_risk_score'] = (int) round($assessed);
                $computed['assessed_risk_level'] = $this->levelFor($assessed, $assessedMax);

                if ($rg !== null && $rf !== null) {
                    $residual = $rg * $rf * ($rm ?? 1.0);
                    if ($residual > $assessed) {
                        $errors['residual_gravity'] = ['Le risque résiduel ne peut pas dépasser le risque évalué : revoyez la cotation après actions.'];
                    }
                    $computed['residual_mitigation_coef'] = $rm ?? 1.0;
                    $computed['residual_risk_score'] = (int) round($residual);
                    $computed['residual_risk_level'] = $this->levelFor($residual, $assessedMax);
                } else {
                    $computed['residual_risk_score'] = null;
                    $computed['residual_risk_level'] = null;
                    $computed['residual_mitigation_coef'] = null;
                }
            }
        }

        if ($errors !== []) {
            abort(response()->json(['message' => 'Cotation invalide.', 'errors' => $errors], 422));
        }

        return $computed;
    }

    /**
     * Contrôles de conformité du document : bloquants avant soumission, ou simples alertes.
     *
     * @return array{ready: bool, checks: array<int, array{code: string, label: string, ok: bool, blocking: bool, detail: string|null}>, summary: array<string, mixed>}
     */
    public function conformity(Duerp $duerp): array
    {
        $duerp->loadMissing(['dangers', 'workUnits']);
        $dangers = $duerp->dangers;
        $units = $duerp->workUnits;
        $checks = [];
        $add = function (string $code, string $label, bool $ok, bool $blocking, ?string $detail = null) use (&$checks): void {
            $checks[] = compact('code', 'label', 'ok', 'blocking', 'detail');
        };

        $add('dated', 'Date d\'évaluation renseignée (R.4121-1)', $duerp->evaluation_date !== null, true);

        $nextOk = $duerp->next_evaluation_date !== null
            && $duerp->evaluation_date !== null
            && $duerp->next_evaluation_date->gt($duerp->evaluation_date)
            && $duerp->next_evaluation_date->lte($duerp->evaluation_date->copy()->addMonths(self::MAX_MONTHS_BETWEEN_EVALUATIONS));
        $add('next_evaluation', 'Prochaine mise à jour planifiée dans les 12 mois (R.4121-2)', $nextOk, true,
            $nextOk ? null : 'Planifiez la prochaine évaluation au plus tard 12 mois après celle-ci.');

        $add('units_defined', 'Unités de travail définies', $units->isNotEmpty() || $dangers->whereNotNull('work_unit')->isNotEmpty(), true);

        $uncovered = $units->filter(fn ($unit) => $dangers->where('work_unit_id', $unit->id)->isEmpty());
        $add('units_covered', 'Chaque unité de travail a au moins un risque évalué', $uncovered->isEmpty(), true,
            $uncovered->isEmpty() ? null : 'Sans risque évalué : '.$uncovered->pluck('name')->implode(', '));

        $add('dangers_present', 'Au moins un risque identifié', $dangers->isNotEmpty(), true);

        $incomplete = $dangers->filter(fn (DuerpDanger $d) => blank($d->dangerous_situation) || blank($d->inrs_family) || blank($d->work_unit)
            || $d->gravity === null || $d->frequency === null || $d->assessed_risk_score === null);
        $add('required_fields', 'Chaque risque est complet (unité, famille, situation dangereuse, cotation)', $incomplete->isEmpty(), true,
            $incomplete->isEmpty() ? null : $incomplete->count().' ligne(s) incomplète(s).');

        $noPlan = $dangers->filter(fn (DuerpDanger $d) => $d->assessed_risk_level === 'Significatif'
            && (blank($d->prevention_actions) || (blank($d->responsible_id) && blank($d->responsible_name)) || $d->deadline === null));
        $add('significant_plan', 'Tout risque significatif a un plan d\'actions (action, responsable, échéance)', $noPlan->isEmpty(), true,
            $noPlan->isEmpty() ? null : $noPlan->count().' risque(s) significatif(s) sans plan complet.');

        $flagged = $dangers->where('needs_review', true);
        $add('flagged_reviewed', 'Aucun risque en attente de réévaluation (accident, changement)', $flagged->isEmpty(), true,
            $flagged->isEmpty() ? null : $flagged->count().' ligne(s) à réévaluer.');

        $overdue = $dangers->filter(fn (DuerpDanger $d) => $d->deadline !== null && $d->deadline->isPast() && $d->action_status !== 'realise' && $d->action_status !== 'en_continu');
        $add('actions_on_time', 'Actions de prévention dans les délais', $overdue->isEmpty(), false,
            $overdue->isEmpty() ? null : $overdue->count().' action(s) en retard.');

        $notEvaluated = $dangers->filter(fn (DuerpDanger $d) => $d->action_status === 'realise' && $d->residual_risk_score === null);
        $add('residual_evaluated', 'Risque résiduel évalué pour chaque action réalisée', $notEvaluated->isEmpty(), false,
            $notEvaluated->isEmpty() ? null : $notEvaluated->count().' action(s) réalisée(s) sans risque résiduel.');

        $covered = $dangers->pluck('inrs_family')->filter()->unique();
        $missing = DuerpRiskFamily::withoutGlobalScopes()->whereNull('enterprise_id')->where('is_active', true)->orderBy('order_num')->pluck('name')->diff($covered);
        $add('families_reviewed', 'Toutes les familles de risques INRS ont été examinées', $missing->isEmpty(), false,
            $missing->isEmpty() ? null : $missing->count().' famille(s) sans risque : justifiez qu\'elles ne s\'appliquent pas.');

        $add('consultation', 'Consultation des travailleurs tracée (ISO 45001 §5.4)', ! empty($duerp->participants), false,
            'Indiquez les personnes consultées (salariés, représentants, CSE, médecin du travail).');

        if ($duerp->workflow_status === 'approved_by_ceo' && $duerp->is_current) {
            $late = $duerp->next_evaluation_date !== null && $duerp->next_evaluation_date->isPast();
            $add('up_to_date', 'Document à jour', ! $late && ! $duerp->update_required, false,
                $duerp->update_required ? ($duerp->update_reason ?? 'Une mise à jour est requise.') : ($late ? 'La date de mise à jour est dépassée.' : null));
        }

        $byLevel = ['Faible' => 0, 'Moyen' => 0, 'Significatif' => 0];
        foreach ($dangers as $danger) {
            if (isset($byLevel[$danger->assessed_risk_level])) {
                $byLevel[$danger->assessed_risk_level]++;
            }
        }
        $residualByLevel = ['Faible' => 0, 'Moyen' => 0, 'Significatif' => 0];
        foreach ($dangers as $danger) {
            if (isset($residualByLevel[$danger->residual_risk_level])) {
                $residualByLevel[$danger->residual_risk_level]++;
            }
        }

        return [
            'ready' => collect($checks)->every(fn (array $check) => $check['ok'] || ! $check['blocking']),
            'checks' => $checks,
            'summary' => [
                'dangers' => $dangers->count(),
                'units' => $units->count(),
                'by_level' => $byLevel,
                'residual_by_level' => $residualByLevel,
                'actions_overdue' => $overdue->count(),
                'actions_done' => $dangers->where('action_status', 'realise')->count(),
                'families_missing' => $missing->values(),
            ],
        ];
    }
}
