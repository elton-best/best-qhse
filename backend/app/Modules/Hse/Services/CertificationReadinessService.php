<?php

namespace App\Modules\Hse\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Score de préparation à l'audit de certification ISO 14001:2026 (T-03) : pour chaque article, un état
 * (conforme, à compléter, manquant) calculé à partir des informations réellement présentes, à jour et validées,
 * avec le lien pour corriger chaque manque.
 */
class CertificationReadinessService
{
    public const OK = 'ok';

    public const PARTIAL = 'partial';

    public const MISSING = 'missing';

    private int $enterpriseId;

    private int $siteId;

    /**
     * @return array{score: float, counts: array<string, int>, clauses: array<int, array<string, mixed>>, gaps: array<int, array<string, mixed>>}
     */
    public function compute(int $enterpriseId, int $siteId): array
    {
        $this->enterpriseId = $enterpriseId;
        $this->siteId = $siteId;

        $clauses = [];
        $points = 0.0;
        $total = 0;
        $gaps = [];
        foreach ($this->definitions() as [$clause, $title, $checks]) {
            $rows = [];
            foreach ($checks as [$label, $fix, $evaluate]) {
                [$state, $detail] = $evaluate();
                $rows[] = ['label' => $label, 'state' => $state, 'detail' => $detail, 'fix' => $fix];
                $points += $state === self::OK ? 1 : ($state === self::PARTIAL ? 0.5 : 0);
                $total++;
                if ($state !== self::OK) {
                    $gaps[] = ['clause' => $clause, 'title' => $title, 'label' => $label, 'state' => $state, 'detail' => $detail, 'fix' => $fix];
                }
            }
            $states = array_column($rows, 'state');
            $status = ! in_array(self::PARTIAL, $states, true) && ! in_array(self::MISSING, $states, true) ? 'compliant'
                : (count(array_filter($states, fn ($s) => $s !== self::MISSING)) === 0 ? 'missing' : 'to_complete');
            $clauses[] = ['clause' => $clause, 'title' => $title, 'status' => $status, 'checks' => $rows];
        }

        return [
            'score' => $total === 0 ? 0.0 : round($points / $total * 100, 1),
            'counts' => ['compliant' => count(array_filter($clauses, fn ($c) => $c['status'] === 'compliant')), 'to_complete' => count(array_filter($clauses, fn ($c) => $c['status'] === 'to_complete')), 'missing' => count(array_filter($clauses, fn ($c) => $c['status'] === 'missing'))],
            'clauses' => $clauses,
            'gaps' => $gaps,
        ];
    }

    /** @return array{0: string, 1: string} */
    private function state(string $state, string $detail): array
    {
        return [$state, $detail];
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function byRatio(int $done, int $total, string $subject, float $okRatio = 0.9): array
    {
        if ($total === 0) {
            return $this->state(self::MISSING, "Aucun élément : {$subject}.");
        }
        $ratio = $done / $total;

        return $this->state($ratio >= $okRatio ? self::OK : ($done > 0 ? self::PARTIAL : self::MISSING), "{$done} sur {$total} — {$subject}.");
    }

    private function site(string $table): Builder
    {
        return DB::table($table)->where('site_id', $this->siteId)->when(Schema::hasColumn($table, 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'));
    }

    /**
     * @return array<int, array{0: string, 1: string, 2: array<int, array{0: string, 1: string, 2: \Closure}>}>
     */
    private function definitions(): array
    {
        $yearAgo = now()->subYear();

        return [
            ['4.1', 'Enjeux externes et internes', [
                ['Analyse du contexte (SWOT/PESTEL) à jour', 'contexte', function () use ($yearAgo) {
                    $last = $this->site('organization_contexts')->max('updated_at');

                    return $last === null ? $this->state(self::MISSING, 'Aucune analyse du contexte.') : ($last >= $yearAgo ? $this->state(self::OK, 'Analyse revue depuis moins de 12 mois.') : $this->state(self::PARTIAL, 'Analyse non revue depuis plus de 12 mois.'));
                }],
            ]],
            ['4.2', 'Parties intéressées', [
                ['Parties intéressées identifiées avec leurs attentes', 'parties-interessees', function () {
                    $all = $this->site('stakeholders');
                    $total = (clone $all)->count();
                    if ($total < 3) {
                        return $this->state($total === 0 ? self::MISSING : self::PARTIAL, "{$total} partie(s) intéressée(s) : au moins 3 sont attendues.");
                    }

                    return $this->byRatio((clone $all)->where(fn ($q) => $q->whereNotNull('needs_expectations')->where('needs_expectations', '!=', ''))->count(), $total, 'avec leurs besoins et attentes');
                }],
            ]],
            ['4.3', 'Domaine d\'application du SME', [
                ['Périmètre documenté', 'perimetre', function () {
                    $scope = DB::table('application_scopes')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('is_current', true)->first();

                    return $scope === null ? $this->state(self::MISSING, 'Aucun domaine d\'application courant.') : (filled($scope->scope) || filled($scope->scope_definition) ? $this->state(self::OK, 'Domaine d\'application défini.') : $this->state(self::PARTIAL, 'Domaine d\'application vide.'));
                }],
            ]],
            ['5.2', 'Politique environnementale', [
                ['Politique rédigée et validée par la direction', 'politique', function () {
                    $policy = DB::table('qhse_policies')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('is_current', true)->first();
                    if ($policy === null) {
                        return $this->state(self::MISSING, 'Aucune politique courante.');
                    }

                    return filled($policy->environmental_policy) && $policy->validated_by_direction_at !== null
                        ? $this->state(self::OK, 'Politique environnementale validée.')
                        : $this->state(self::PARTIAL, filled($policy->environmental_policy) ? 'Politique non validée par la direction.' : 'Volet environnemental de la politique non rédigé.');
                }],
            ]],
            ['5.3', 'Rôles et responsabilités', [
                ['Pilote désigné pour chaque processus', 'processus', function () {
                    $processes = $this->site('processes');

                    return $this->byRatio((clone $processes)->whereNotNull('pilot_id')->count(), (clone $processes)->count(), 'processus avec un pilote');
                }],
            ]],
            ['6.1.2', 'Aspects environnementaux', [
                ['Aspects identifiés', 'aspects-environnementaux', fn () => ($n = $this->aspects()->count()) > 0 ? $this->state(self::OK, "{$n} aspect(s) identifié(s).") : $this->state(self::MISSING, 'Aucun aspect environnemental.')],
                ['Aspects évalués et validés', 'aspects-environnementaux', fn () => $this->byRatio($this->aspects()->where('status', 'validated')->count(), $this->aspects()->count(), 'aspects validés')],
                ['Aucun aspect à réévaluer', 'aspects-environnementaux', function () {
                    $n = $this->aspects()->where('needs_reassessment', true)->count();

                    return $n === 0 ? $this->state(self::OK, 'Aucun aspect en attente de réévaluation.') : $this->state(self::PARTIAL, "{$n} aspect(s) à réévaluer.");
                }],
                ['Version du registre figée dans l\'année', 'aspects-environnementaux', function () use ($yearAgo) {
                    $last = DB::table('aes_registry_versions')->where('enterprise_id', $this->enterpriseId)->where('site_id', $this->siteId)->max('created_at');

                    return $last === null ? $this->state(self::MISSING, 'Aucune version du registre.') : ($last >= $yearAgo ? $this->state(self::OK, 'Registre figé depuis moins de 12 mois.') : $this->state(self::PARTIAL, 'Registre non figé depuis plus de 12 mois.'));
                }],
            ]],
            ['6.1.3', 'Obligations de conformité', [
                ['Obligations identifiées', 'obligations', fn () => ($n = $this->obligations()->count()) > 0 ? $this->state(self::OK, "{$n} obligation(s) enregistrée(s).") : $this->state(self::MISSING, 'Aucune obligation enregistrée.')],
                ['Applicabilité décidée pour chacune', 'obligations', function () {
                    $n = $this->obligations()->where('analysis_status', 'to_analyze')->count();
                    $total = $this->obligations()->count();

                    return $total === 0 ? $this->state(self::MISSING, 'Aucune obligation.') : ($n === 0 ? $this->state(self::OK, 'Toutes les obligations sont qualifiées.') : $this->state(self::PARTIAL, "{$n} obligation(s) à qualifier."));
                }],
            ]],
            ['6.1.4', 'Risques et opportunités', [
                ['Risques et opportunités identifiés', 'risques', function () {
                    $n = DB::table('process_risks_opportunities as r')->join('processes as p', 'p.id', '=', 'r.process_id')->where('p.site_id', $this->siteId)->whereNull('r.deleted_at')->count();

                    return $n > 0 ? $this->state(self::OK, "{$n} risque(s) ou opportunité(s).") : $this->state(self::MISSING, 'Aucun risque ni opportunité.');
                }],
            ]],
            ['6.2', 'Objectifs environnementaux', [
                ['Objectifs fixés avec cible et échéance', 'objectifs', function () {
                    $objectives = DB::table('objectives')->whereNull('deleted_at')->where('site_id', $this->siteId)->whereNotIn('status', ['cancelled']);

                    return $this->byRatio((clone $objectives)->whereNotNull('deadline')->whereNotNull('target_value')->count(), (clone $objectives)->count(), 'objectifs avec cible et échéance');
                }],
            ]],
            ['6.3', 'Planification des changements', [
                ['Aucun changement bloqué en attente de décision', 'changements', function () {
                    $stuck = DB::table('management_changes')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('site_id', $this->siteId)->where('status', 'awaiting_approval')->where('updated_at', '<', now()->subDays(30))->count();

                    return $stuck === 0 ? $this->state(self::OK, 'Aucun changement en attente depuis plus de 30 jours.') : $this->state(self::PARTIAL, "{$stuck} changement(s) en attente de décision depuis plus de 30 jours.");
                }],
            ]],
            ['7.2', 'Compétences', [
                ['Compétences acquises tracées et valides', 'competences', function () {
                    $all = DB::table('competences_acquises')->where('enterprise_id', $this->enterpriseId)->where('site_id', $this->siteId);
                    $total = (clone $all)->count();
                    if ($total === 0) {
                        return $this->state(self::MISSING, 'Aucune compétence enregistrée.');
                    }
                    $expired = (clone $all)->where(fn ($q) => $q->where('status', 'expired')->orWhere('expiry_date', '<', today()))->count();

                    return $expired === 0 ? $this->state(self::OK, 'Aucune compétence expirée.') : $this->state(self::PARTIAL, "{$expired} compétence(s) expirée(s).");
                }],
            ]],
            ['7.3', 'Sensibilisation', [
                ['Personnel sensibilisé (campagnes terminées)', 'campagnes-sensibilisation', function () {
                    $row = DB::table('awareness_participants as p')->join('awareness_campaigns as c', 'c.id', '=', 'p.campaign_id')->where('c.site_id', $this->siteId)->whereNull('c.deleted_at')->whereIn('c.status', ['active', 'closed'])
                        ->selectRaw('count(p.id) as total, count(p.completed_at) as done')->first();

                    return $this->byRatio((int) $row->done, (int) $row->total, 'personnes sensibilisées', 0.8);
                }],
            ]],
            ['7.4', 'Communication', [
                ['Plan de communication de l\'année', 'communication', fn () => DB::table('communication_plans')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('year', (int) date('Y'))->exists() ? $this->state(self::OK, 'Plan de l\'année en place.') : $this->state(self::MISSING, 'Aucun plan de communication pour l\'année.')],
            ]],
            ['7.5', 'Informations documentées', [
                ['Documents approuvés', 'documents', fn () => ($n = $this->site('documents')->where('status', 'approved')->count()) > 0 ? $this->state(self::OK, "{$n} document(s) approuvé(s).") : $this->state(self::MISSING, 'Aucun document approuvé.')],
                ['Aucune revue documentaire en retard', 'documents', function () {
                    $n = $this->site('documents')->where('status', 'approved')->where('review_due_date', '<', today())->count();

                    return $n === 0 ? $this->state(self::OK, 'Aucun document à réviser.') : $this->state(self::PARTIAL, "{$n} document(s) à réviser.");
                }],
            ]],
            ['8.1', 'Maîtrise opérationnelle', [
                ['Maîtrises opérationnelles définies', 'maitrise-operationnelle', fn () => ($n = DB::table('operational_controls')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('site_id', $this->siteId)->count()) > 0 ? $this->state(self::OK, "{$n} maîtrise(s) définie(s).") : $this->state(self::MISSING, 'Aucune maîtrise opérationnelle.')],
            ]],
            ['8.2', 'Préparation aux situations d\'urgence', [
                ['Scénarios prêts', 'urgences', function () {
                    $all = $this->site('emergency_procedures');

                    return $this->byRatio((clone $all)->whereIn('status', ['operationnel', 'teste'])->count(), (clone $all)->count(), 'scénarios prêts', 1.0);
                }],
                ['Exercices et vérifications à jour', 'urgences', function () {
                    $overdueDrills = $this->site('emergency_procedures')->whereIn('status', ['operationnel', 'teste'])->where('next_drill_date', '<', today())->count();
                    $overdueChecks = $this->site('emergency_resources')->where('next_check_date', '<', today())->count();

                    return $overdueDrills + $overdueChecks === 0 ? $this->state(self::OK, 'Aucun exercice ni contrôle en retard.') : $this->state(self::PARTIAL, "{$overdueDrills} exercice(s) et {$overdueChecks} contrôle(s) en retard.");
                }],
            ]],
            ['9.1.1', 'Surveillance et mesurage', [
                ['Indicateurs suivis', 'performance-environnementale', fn () => ($n = DB::table('environmental_indicators')->whereNull('deleted_at')->where('site_id', $this->siteId)->where('is_active', true)->count()) > 0 ? $this->state(self::OK, "{$n} indicateur(s) actif(s).") : $this->state(self::MISSING, 'Aucun indicateur de performance environnementale.')],
                ['Instruments de mesure valides', 'performance-environnementale', function () {
                    $all = DB::table('monitoring_instruments')->whereNull('deleted_at')->where('site_id', $this->siteId);

                    return $this->byRatio((clone $all)->where('status', 'in_service')->whereDate('next_calibration_date', '>=', today())->count(), (clone $all)->count(), 'instruments valides', 1.0);
                }],
            ]],
            ['9.1.2', 'Évaluation de la conformité', [
                ['Obligations applicables évaluées dans l\'année', 'obligations', function () use ($yearAgo) {
                    $applicable = $this->obligations()->where('is_applicable', true);

                    return $this->byRatio((clone $applicable)->whereDate('last_evaluation_date', '>=', $yearAgo)->count(), (clone $applicable)->count(), 'obligations évaluées');
                }],
            ]],
            ['9.2', 'Audit interne', [
                ['Audit interne réalisé dans l\'année', 'audits', function () use ($yearAgo) {
                    $done = DB::table('audits')->whereNull('deleted_at')->where('site_id', $this->siteId)->where('status', 'completed')->where(DB::raw('coalesce(actual_date, planned_date)'), '>=', $yearAgo->toDateString())->count();
                    $planned = DB::table('audits')->whereNull('deleted_at')->where('site_id', $this->siteId)->whereIn('status', ['planned', 'in_progress'])->count();

                    return $done > 0 ? $this->state(self::OK, "{$done} audit(s) réalisé(s).") : ($planned > 0 ? $this->state(self::PARTIAL, "{$planned} audit(s) planifié(s), aucun terminé.") : $this->state(self::MISSING, 'Aucun audit interne.'));
                }],
            ]],
            ['9.3', 'Revue de direction', [
                ['Revue signée dans les 12 derniers mois', 'revue-direction', function () use ($yearAgo) {
                    $signed = DB::table('management_review_records as r')->join('management_reviews as m', 'm.id', '=', 'r.review_id')->where('m.site_id', $this->siteId)->where('r.signed_at', '>=', $yearAgo)->exists();
                    $any = DB::table('management_reviews')->whereNull('deleted_at')->where('site_id', $this->siteId)->exists();

                    return $signed ? $this->state(self::OK, 'Revue signée et archivée.') : ($any ? $this->state(self::PARTIAL, 'Une revue existe mais n\'est pas signée ou date de plus de 12 mois.') : $this->state(self::MISSING, 'Aucune revue de direction.'));
                }],
            ]],
            ['10.2', 'Non-conformités et actions correctives', [
                ['Aucune non-conformité en retard', 'non-conformites', function () {
                    $n = $this->site('non_conformities')->whereNull('resolution_date')->where('deadline', '<', today())->count();

                    return $n === 0 ? $this->state(self::OK, 'Aucune non-conformité en retard.') : $this->state(self::PARTIAL, "{$n} non-conformité(s) en retard.");
                }],
                ['Efficacité vérifiée avant clôture', 'non-conformites', function () {
                    $closed = $this->site('non_conformities')->whereNotNull('resolution_date');
                    $total = (clone $closed)->count();

                    return $total === 0 ? $this->state(self::OK, 'Aucune non-conformité clôturée.') : $this->byRatio((clone $closed)->where(fn ($q) => $q->where('effectiveness_verified', true)->orWhere('corrective_decision', 'not_required'))->count(), $total, 'clôtures avec efficacité vérifiée', 1.0);
                }],
            ]],
            ['10.3', 'Amélioration continue', [
                ['Opportunités d\'amélioration enregistrées et décidées', 'amelioration', function () {
                    $all = $this->site('improvement_suggestions');
                    $total = (clone $all)->count();

                    return $total === 0 ? $this->state(self::MISSING, 'Aucune opportunité d\'amélioration enregistrée.') : $this->byRatio((clone $all)->whereIn('status', ['adopted', 'rejected'])->count(), $total, 'opportunités avec décision', 0.7);
                }],
            ]],
        ];
    }

    private function aspects(): Builder
    {
        return DB::table('environmental_aspects')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where('site_id', $this->siteId)->where('status', '!=', 'archived');
    }

    private function obligations(): Builder
    {
        return DB::table('compliance_obligation_texts')->whereNull('deleted_at')->where('enterprise_id', $this->enterpriseId)->where(fn ($q) => $q->where('site_id', $this->siteId)->orWhereNull('site_id'));
    }
}
