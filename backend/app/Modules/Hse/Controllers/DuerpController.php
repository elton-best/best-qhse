<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\Duerp;
use App\Modules\Hse\Models\DuerpDanger;
use App\Modules\Hse\Models\DuerpRiskFamily;
use App\Modules\Hse\Models\DuerpScoringScale;
use App\Modules\Hse\Models\DuerpWorkUnit;
use App\Modules\Hse\Services\DuerpScoringService;
use App\Modules\Hse\Services\HseExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Document unique d'évaluation des risques professionnels (DUERP) — Code du travail R.4121-1 à R.4121-4,
 * méthode INRS (unités de travail, familles de risques, cotation G × F, plan d'actions, mise à jour annuelle)
 * et ISO 45001 (§6.1.2, §8.1.2).
 *
 * Un document approuvé est figé : il évolue par une nouvelle version, la précédente est conservée.
 */
class DuerpController extends Controller
{
    use ScopesToUserTenant;

    private const ACTION_STATUSES = 'en_continu,en_cours,realise';

    /** Champs de suivi qui restent modifiables sur un document déjà soumis ou approuvé. */
    private const FOLLOW_UP_FIELDS = [
        'action_status', 'action_done_at', 'action_evaluation_date', 'action_effectivity_criteria', 'action_efficacy_criteria',
        'residual_gravity', 'residual_frequency', 'residual_mitigation_level', 'observations', 'confirm_reviewed',
    ];

    private function scoring(): DuerpScoringService
    {
        return app(DuerpScoringService::class);
    }

    private function enterpriseId(Request $request): int
    {
        $this->assertTenant($request);

        return (int) $request->user()->enterprise_id;
    }

    /**
     * DUERP de l'entreprise de l'utilisateur ; un utilisateur rattaché à un site (non administrateur) est limité à ce site.
     */
    private function ownedDuerp(Request $request, int $id): Duerp
    {
        $user = $request->user();
        $query = Duerp::query()->where('enterprise_id', $this->enterpriseId($request));
        if (! $user->isEnterpriseAdmin() && $user->site_id) {
            $query->where('site_id', $user->site_id);
        }

        return $query->findOrFail($id);
    }

    private function assertDraft(Duerp $duerp, string $message = 'Ce DUERP est figé : créez une nouvelle version pour le modifier.'): void
    {
        abort_unless($duerp->workflow_status === 'draft', 422, $message);
    }

    /**
     * @return array<string, mixed>
     */
    private function dangerRules(int $enterpriseId, bool $partial): array
    {
        $sometimes = $partial ? 'sometimes|' : '';
        $owned = fn (string $table) => Rule::exists($table, 'id')->where('enterprise_id', $enterpriseId);

        return [
            'work_unit_id' => ['nullable', $owned('duerp_work_units')],
            'risk_family_id' => ['nullable', Rule::exists('duerp_risk_families', 'id')->where(fn ($q) => $q->whereNull('enterprise_id')->orWhere('enterprise_id', $enterpriseId))],
            'process_id' => ['nullable', $owned('processes')],
            'work_unit' => $partial ? 'sometimes|nullable|string|max:255' : 'required_without:work_unit_id|nullable|string|max:255',
            'activity' => 'nullable|string|max:255',
            'activity_name' => 'nullable|string|max:255',
            'inrs_family' => $partial ? 'sometimes|nullable|string|max:255' : 'required_without:risk_family_id|nullable|string|max:255',
            'dangerous_situation' => $sometimes.'required|string|min:5',
            'identified_risks' => $sometimes.'required|string|min:3',
            'consequences' => 'nullable|string',
            'gravity' => $sometimes.'required|integer|min:1',
            'frequency' => $sometimes.'required|integer|min:1',
            'mitigation_level' => $sometimes.'required|integer|min:1',
            'exposed_workers_count' => 'nullable|integer|min:1',
            'existing_preventions' => 'nullable|string',
            'prevention_actions' => 'nullable|string',
            'prevention_type' => 'nullable|in:elimination,substitution,collective,organizational,individual',
            'responsible_id' => ['nullable', $owned('users')],
            'responsible_name' => 'nullable|string|max:255',
            'deadline' => 'nullable|date',
            'action_status' => 'nullable|in:'.self::ACTION_STATUSES,
            'action_done_at' => 'nullable|date|before_or_equal:today|required_if:action_status,realise',
            'action_evaluation_date' => 'nullable|date',
            'action_effectivity_criteria' => 'nullable|string',
            'action_efficacy_criteria' => 'nullable|string',
            'observations' => 'nullable|string',
            'residual_gravity' => 'nullable|integer|min:1',
            'residual_frequency' => 'nullable|integer|min:1',
            'residual_mitigation_level' => 'nullable|integer|min:1',
            'confirm_reviewed' => 'nullable|boolean',
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function prepareDanger(array $data, Duerp $duerp, ?DuerpDanger $existing): array
    {
        $merged = array_merge($existing?->only(['gravity', 'frequency', 'mitigation_level', 'residual_gravity', 'residual_frequency', 'work_unit_id', 'risk_family_id']) ?? [], $data);
        if ($existing && ! array_key_exists('residual_mitigation_level', $data) && $existing->residual_mitigation_coef !== null) {
            $merged['residual_mitigation_level'] = $this->levelOfScore('maitrise', (float) $existing->residual_mitigation_coef, (int) $duerp->enterprise_id);
        }

        if (! empty($merged['work_unit_id'])) {
            $unit = DuerpWorkUnit::query()->find($merged['work_unit_id']);
            abort_if($unit && $unit->duerp_id !== null && (int) $unit->duerp_id !== (int) $duerp->id, 422, 'Cette unité de travail appartient à une autre version du DUERP.');
            if (empty($data['work_unit'])) {
                $data['work_unit'] = $unit?->name;
            }
            if (empty($data['exposed_workers_count']) && ! $existing) {
                $data['exposed_workers_count'] = $unit?->headcount;
            }
        }
        if (! empty($merged['risk_family_id']) && empty($data['inrs_family'])) {
            $data['inrs_family'] = DuerpRiskFamily::withoutGlobalScopes()->find($merged['risk_family_id'])?->name;
        }

        $computed = $this->scoring()->compute($merged, (int) $duerp->enterprise_id);

        $data = array_merge($data, $computed);
        if (array_key_exists('mitigation_level', $data)) {
            $data['mitigation_level'] = (string) $data['mitigation_level'];
        }
        unset($data['residual_mitigation_level'], $data['confirm_reviewed']);

        $family = $data['inrs_family'] ?? $existing?->inrs_family ?? 'Risque identifié';
        $data['danger_type'] = $family;
        $data['danger_description'] = $data['dangerous_situation'] ?? $existing?->dangerous_situation ?? $family;

        return $data;
    }

    private function levelOfScore(string $scale, float $score, int $enterpriseId): ?int
    {
        $level = array_search($score, $this->scoring()->scales($enterpriseId)[$scale], true);

        return $level === false ? null : (int) $level;
    }

    // =========================================================================
    // DOCUMENT
    // =========================================================================

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Duerp::query()
            ->where('enterprise_id', $this->enterpriseId($request))
            ->with(['site:id,name', 'managingProcess:id,code,title', 'submitter:id,name', 'verifier:id,name', 'approver:id,name'])
            ->withCount(['dangers', 'workUnits']);

        if (! $user->isEnterpriseAdmin() && $user->site_id) {
            $query->where('site_id', $user->site_id);
        }
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('managing_process_id')) {
            $query->where('managing_process_id', $request->integer('managing_process_id'));
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('is_current')->orderByDesc('evaluation_date')->orderByDesc('id')->get(),
        ]);
    }

    public function exportXlsx(Request $request)
    {
        $enterpriseId = $this->enterpriseId($request);
        $user = $request->user();
        $siteId = $request->filled('site_id') ? $this->resolveSite($request, $request->integer('site_id'))->id : ($user->site_id ?: null);
        $duerpId = $request->filled('duerp_id') ? $this->ownedDuerp($request, $request->integer('duerp_id'))->id : null;
        $tempFile = app(HseExportService::class)->exportDuerpXlsx($enterpriseId, $siteId, $duerpId);

        $filename = 'duerp_iso45001'.($siteId ? "_site_{$siteId}" : '_tous_sites').'_'.date('Ymd_His').'.xlsx';

        return response()->download($tempFile, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Nouveau DUERP (première évaluation du site). Les versions suivantes passent par `revise`.
     */
    public function store(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $validated = $request->validate($this->documentRules(false));
        $site = $this->resolveSite($request, isset($validated['site_id']) ? (int) $validated['site_id'] : null);
        $this->assertOwnedProcess($validated, $enterpriseId);

        abort_if(
            Duerp::query()->where('enterprise_id', $enterpriseId)->where('site_id', $site->id)->exists(),
            422,
            'Ce site a déjà un DUERP : créez une nouvelle version à partir du document existant.',
        );

        $evaluationDate = $validated['evaluation_date'] ?? today()->toDateString();
        $duerp = Duerp::create(array_merge($validated, [
            'enterprise_id' => $enterpriseId,
            'site_id' => $site->id,
            'evaluation_date' => $evaluationDate,
            'next_evaluation_date' => $validated['next_evaluation_date'] ?? Carbon::parse($evaluationDate)->addYear()->toDateString(),
            'version' => $validated['version'] ?? '1.0',
            'revision_reason' => 'initial',
            'workflow_status' => 'draft',
            'is_current' => false,
            'created_by' => $request->user()->id,
        ]));

        return response()->json([
            'success' => true,
            'message' => 'DUERP initialisé avec succès.',
            'data' => $duerp->load(['site:id,name', 'managingProcess:id,code,title']),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function documentRules(bool $partial): array
    {
        $sometimes = $partial ? 'sometimes|' : '';

        return [
            'site_id' => 'nullable|integer',
            'managing_process_id' => 'nullable|integer',
            'title' => 'nullable|string|max:255',
            'version' => 'nullable|string|max:50',
            'evaluation_date' => $sometimes.'nullable|date|before_or_equal:today',
            'next_evaluation_date' => 'nullable|date|after:evaluation_date',
            'work_unit_definition' => 'nullable|in:process,site,custom',
            'participants' => 'nullable|array',
            'participants.*.name' => 'required|string|max:255',
            'participants.*.role' => 'nullable|string|max:255',
            'consultation_notes' => 'nullable|string',
            'methodology_notes' => 'nullable|string',
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function assertOwnedProcess(array $validated, int $enterpriseId): void
    {
        $this->assertOwnedByEnterprise(['managing_process_id' => ['table' => 'processes', 'column' => 'enterprise_id']], $validated, $enterpriseId);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        $duerp->load([
            'site:id,name', 'managingProcess:id,code,title', 'submitter:id,name', 'verifier:id,name', 'approver:id,name', 'rejecter:id,name',
            'workUnits', 'dangers.process:id,code,title', 'dangers.workUnit:id,name,code', 'dangers.riskFamily:id,name,code', 'dangers.responsible:id,name',
        ]);

        return response()->json(['success' => true, 'data' => $duerp]);
    }

    /**
     * Arborescence du canevas : unité de travail ➔ famille de risques ➔ risques identifiés.
     */
    public function tree(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        $duerp->load([
            'site:id,name', 'managingProcess:id,code,title', 'workUnits',
            'dangers' => fn ($q) => $q->with(['workUnit', 'riskFamily', 'process:id,code,title', 'responsible:id,name'])->orderByDesc('assessed_risk_score'),
        ]);

        $grouped = [];
        foreach ($duerp->workUnits as $unit) {
            $grouped[$unit->name] = ['work_unit' => $unit->name, 'work_unit_id' => $unit->id, 'headcount' => $unit->headcount, 'families' => []];
        }
        foreach ($duerp->dangers as $danger) {
            $unitName = $danger->work_unit ?: ($danger->workUnit?->name ?: 'Unité non précisée');
            $familyName = $danger->inrs_family ?: ($danger->riskFamily?->name ?: 'Autres risques');
            $grouped[$unitName] ??= ['work_unit' => $unitName, 'work_unit_id' => $danger->work_unit_id, 'headcount' => $danger->workUnit?->headcount, 'families' => []];
            $grouped[$unitName]['families'][$familyName] ??= ['family_name' => $familyName, 'family_id' => $danger->risk_family_id, 'dangers' => []];
            $grouped[$unitName]['families'][$familyName]['dangers'][] = $danger;
        }

        $tree = array_values(array_map(function (array $unit) {
            $unit['families'] = array_values($unit['families']);

            return $unit;
        }, $grouped));

        return response()->json([
            'success' => true,
            'duerp' => [
                'id' => $duerp->id,
                'title' => $duerp->title,
                'version' => $duerp->version,
                'work_unit_definition' => $duerp->work_unit_definition,
                'managing_process' => $duerp->managingProcess,
                'workflow_status' => $duerp->workflow_status,
                'total_dangers_count' => $duerp->dangers->count(),
            ],
            'data' => $tree,
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        $this->assertDraft($duerp);
        $validated = $request->validate($this->documentRules(true));
        $this->assertOwnedProcess($validated, (int) $duerp->enterprise_id);
        unset($validated['site_id']);

        $evaluation = Carbon::parse($validated['evaluation_date'] ?? $duerp->evaluation_date);
        $next = isset($validated['next_evaluation_date']) ? Carbon::parse($validated['next_evaluation_date']) : $duerp->next_evaluation_date;
        if ($next && ! $next->gt($evaluation)) {
            abort(response()->json(['message' => 'Date invalide.', 'errors' => ['next_evaluation_date' => ['La prochaine mise à jour doit suivre la date d\'évaluation.']]], 422));
        }

        $duerp->update($validated + ['updated_by' => $request->user()->id]);

        return response()->json([
            'success' => true,
            'message' => 'DUERP mis à jour avec succès.',
            'data' => $duerp->fresh(['site:id,name', 'managingProcess:id,code,title']),
        ]);
    }

    /**
     * Seul un brouillon jamais soumis peut être supprimé : un DUERP soumis ou approuvé est conservé.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        abort_unless($duerp->workflow_status === 'draft' && $duerp->submitted_at === null, 422, 'Un DUERP soumis ou approuvé est conservé : il ne peut pas être supprimé.');
        DB::transaction(function () use ($duerp) {
            $duerp->dangers()->delete();
            $duerp->workUnits()->delete();
            $duerp->delete();
        });

        return response()->json(['success' => true, 'message' => 'DUERP supprimé avec succès.']);
    }

    public function versions(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        $versions = Duerp::query()->where('enterprise_id', $duerp->enterprise_id)->where('site_id', $duerp->site_id)
            ->with('approver:id,name')->withCount('dangers')->orderByDesc('evaluation_date')->orderByDesc('id')->get();

        return response()->json(['success' => true, 'data' => $versions]);
    }

    /**
     * Contrôles de conformité (R.4121-1 à R.4121-4, INRS) et synthèse chiffrée.
     */
    public function conformity(Request $request, int $id): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->scoring()->conformity($this->ownedDuerp($request, $id))]);
    }

    /**
     * Nouvelle version d'un DUERP approuvé : copie des unités et des risques, motif de mise à jour obligatoire.
     */
    public function revise(Request $request, int $id): JsonResponse
    {
        $source = $this->ownedDuerp($request, $id);
        abort_unless($source->workflow_status === 'approved_by_ceo', 422, 'Seul un DUERP approuvé peut donner lieu à une nouvelle version.');
        abort_if(
            Duerp::query()->where('site_id', $source->site_id)->where('workflow_status', '!=', 'approved_by_ceo')->exists(),
            422,
            'Une version en cours de rédaction existe déjà pour ce site.',
        );
        $data = $request->validate([
            'revision_reason' => ['required', Rule::in(array_diff(DuerpScoringService::REVISION_REASONS, ['initial']))],
            'notes' => 'nullable|string',
        ]);

        $copy = DB::transaction(function () use ($source, $data, $request) {
            $copy = Duerp::create([
                'enterprise_id' => $source->enterprise_id,
                'site_id' => $source->site_id,
                'managing_process_id' => $source->managing_process_id,
                'title' => $source->title,
                'version' => $this->nextVersion($source->version),
                'is_current' => false,
                'workflow_status' => 'draft',
                'work_unit_definition' => $source->work_unit_definition,
                'evaluation_date' => today(),
                'next_evaluation_date' => today()->addYear(),
                'previous_version_id' => $source->id,
                'revision_reason' => $data['revision_reason'],
                'participants' => $source->participants,
                'methodology_notes' => $source->methodology_notes,
                'consultation_notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);

            $unitMap = [];
            foreach ($source->workUnits as $unit) {
                $unitMap[$unit->id] = DuerpWorkUnit::create(array_merge($unit->only(['enterprise_id', 'site_id', 'process_id', 'name', 'code', 'description', 'headcount', 'manager_id', 'is_active']), ['duerp_id' => $copy->id]))->id;
            }
            foreach ($source->dangers as $danger) {
                $attributes = collect($danger->getAttributes())->except(['id', 'duerp_id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'])->all();
                $attributes['work_unit_id'] = $danger->work_unit_id ? ($unitMap[$danger->work_unit_id] ?? null) : null;
                foreach (['exposed_workers', 'actions', 'applicable_norms'] as $json) {
                    if (isset($attributes[$json]) && is_string($attributes[$json])) {
                        $attributes[$json] = json_decode($attributes[$json], true);
                    }
                }
                $copy->dangers()->create($attributes + ['created_by' => $request->user()->id]);
            }

            return $copy;
        });

        return response()->json(['success' => true, 'message' => 'Nouvelle version créée à partir du DUERP approuvé.', 'data' => $copy->load('site:id,name')], 201);
    }

    private function nextVersion(?string $version): string
    {
        if ($version !== null && preg_match('/^(\d+)(?:\.(\d+))?$/', $version, $m)) {
            return ((int) $m[1] + 1).'.0';
        }

        return ($version ?? '1.0').'-rev';
    }

    // =========================================================================
    // WORKFLOW : brouillon ➔ soumis (RQ / SST) ➔ approuvé (Direction)
    // =========================================================================

    public function submitForVerification(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        $this->assertDraft($duerp, 'Seul un brouillon peut être soumis à la validation.');

        $report = $this->scoring()->conformity($duerp);
        if (! $report['ready']) {
            $blocking = collect($report['checks'])->filter(fn ($check) => ! $check['ok'] && $check['blocking']);
            abort(response()->json([
                'message' => 'Le DUERP n\'est pas conforme : corrigez les points bloquants avant de le soumettre.',
                'errors' => ['conformity' => $blocking->map(fn ($check) => $check['label'].($check['detail'] ? ' — '.$check['detail'] : ''))->values()],
                'checks' => $blocking->values(),
            ], 422));
        }

        $duerp->update([
            'workflow_status' => 'submitted_by_rq',
            'submitted_by' => $request->user()->id,
            'submitted_at' => now(),
            'submission_notes' => $request->input('notes', 'DUERP finalisé et soumis pour validation par la Direction.'),
            'rejection_reason' => null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'DUERP soumis avec succès pour validation par la Direction.',
            'data' => $duerp->fresh(['submitter:id,name', 'site:id,name']),
        ]);
    }

    /**
     * Approbation par la Direction : le valideur ne peut pas être l'auteur de la soumission.
     * La version approuvée devient la version en vigueur du site ; la précédente est conservée.
     */
    public function approveByCeo(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        abort_unless($duerp->workflow_status === 'submitted_by_rq', 422, 'Seul un DUERP soumis peut être approuvé.');
        abort_if((int) $duerp->submitted_by === (int) $request->user()->id, 403, 'Le valideur ne peut pas être la personne qui a soumis le document.');

        DB::transaction(function () use ($duerp, $request) {
            Duerp::query()->where('enterprise_id', $duerp->enterprise_id)->where('site_id', $duerp->site_id)
                ->where('id', '!=', $duerp->id)->update(['is_current' => false, 'update_required' => false]);
            $duerp->update([
                'workflow_status' => 'approved_by_ceo',
                'is_current' => true,
                'approved_by' => $request->user()->id,
                'approved_at' => now(),
                'approval_notes' => $request->input('notes', $request->input('comment', 'DUERP approuvé par la Direction.')),
                'update_required' => false,
                'update_reason' => null,
                'update_flagged_at' => null,
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'DUERP approuvé : il devient la version en vigueur du site.',
            'data' => $duerp->fresh(['approver:id,name', 'site:id,name']),
        ]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $id);
        abort_unless($duerp->workflow_status === 'submitted_by_rq', 422, 'Seul un DUERP soumis peut être retourné.');
        $reason = $request->input('reason', $request->input('comment'));
        validator(['reason' => $reason], ['reason' => 'required|string|min:5'], ['reason.required' => 'Le motif du retour est obligatoire.'])->validate();

        $duerp->update([
            'workflow_status' => 'draft',
            'rejected_by' => $request->user()->id,
            'rejected_at' => now(),
            'rejection_reason' => $reason,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'DUERP retourné en brouillon pour corrections.',
            'data' => $duerp->fresh(['rejecter:id,name', 'site:id,name']),
        ]);
    }

    // =========================================================================
    // RISQUES DU DUERP
    // =========================================================================

    public function storeDanger(Request $request, int $duerpId): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $duerpId);
        $this->assertDraft($duerp, 'Ce DUERP est figé : créez une nouvelle version pour ajouter un risque.');
        $validated = $request->validate($this->dangerRules((int) $duerp->enterprise_id, false));

        $data = $this->prepareDanger($validated, $duerp, null);
        $danger = $duerp->dangers()->create($data + ['created_by' => $request->user()->id]);

        return response()->json([
            'success' => true,
            'message' => 'Risque enregistré dans le DUERP avec succès.',
            'data' => $danger->load(['process:id,code,title', 'workUnit:id,name,code', 'riskFamily:id,name,code', 'responsible:id,name']),
        ], 201);
    }

    /**
     * Brouillon : toute la ligne est modifiable. Document soumis ou approuvé : seul le suivi des actions
     * et la cotation résiduelle peuvent évoluer, l'évaluation initiale reste figée.
     */
    public function updateDanger(Request $request, int $duerpId, int $dangerId): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $duerpId);
        $danger = $duerp->dangers()->findOrFail($dangerId);
        $validated = $request->validate($this->dangerRules((int) $duerp->enterprise_id, true));

        if ($duerp->workflow_status !== 'draft') {
            abort_if($duerp->workflow_status === 'submitted_by_rq', 422, 'Ce DUERP est en cours de validation : il ne peut plus être modifié.');
            $forbidden = array_diff(array_keys($validated), self::FOLLOW_UP_FIELDS);
            abort_if($forbidden !== [], 422, 'Document approuvé : seul le suivi des actions est modifiable ('.implode(', ', $forbidden).'). Créez une nouvelle version pour modifier l\'évaluation.');
        }

        $reviewed = (bool) ($validated['confirm_reviewed'] ?? false);
        $data = $this->prepareDanger($validated, $duerp, $danger);
        if ($reviewed) {
            abort_unless($duerp->workflow_status === 'draft', 422, 'Une ligne à réévaluer se traite dans une nouvelle version.');
            $data['needs_review'] = false;
            $data['review_reason'] = null;
        }
        $danger->update($data + ['updated_by' => $request->user()->id]);

        return response()->json([
            'success' => true,
            'message' => 'Ligne du DUERP mise à jour avec succès.',
            'data' => $danger->fresh(['process:id,code,title', 'workUnit:id,name,code', 'riskFamily:id,name,code', 'responsible:id,name']),
        ]);
    }

    public function destroyDanger(Request $request, int $duerpId, int $dangerId): JsonResponse
    {
        $duerp = $this->ownedDuerp($request, $duerpId);
        $this->assertDraft($duerp, 'Ce DUERP est figé : une ligne évaluée ne peut plus être supprimée.');
        $duerp->dangers()->findOrFail($dangerId)->delete();

        return response()->json(['success' => true, 'message' => 'Ligne supprimée du DUERP.']);
    }

    // =========================================================================
    // FAMILLES DE RISQUES
    // =========================================================================

    /**
     * Familles INRS de la plateforme et familles propres à l'entreprise ; une famille personnalisée masque
     * la famille de la plateforme dont elle est issue.
     */
    public function riskFamilies(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $families = DuerpRiskFamily::withoutGlobalScopes()
            ->where(fn ($q) => $q->whereNull('enterprise_id')->orWhere('enterprise_id', $enterpriseId))
            ->where('is_active', true)->orderBy('order_num')->orderBy('name')->get();
        $overridden = $families->whereNotNull('enterprise_id')->pluck('code')->filter()->all();

        return response()->json([
            'success' => true,
            'data' => $families->reject(fn ($family) => $family->enterprise_id === null && in_array($family->code, $overridden, true))->values(),
        ]);
    }

    public function storeRiskFamily(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'description' => 'nullable|string',
            'order_num' => 'nullable|integer',
        ]);
        $family = DuerpRiskFamily::create($validated + ['enterprise_id' => $enterpriseId, 'is_active' => true]);

        return response()->json(['success' => true, 'message' => 'Nouveau type de risque ajouté avec succès.', 'data' => $family], 201);
    }

    public function updateRiskFamily(Request $request, int $id): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $family = DuerpRiskFamily::withoutGlobalScopes()->where(fn ($q) => $q->where('enterprise_id', $enterpriseId)->orWhereNull('enterprise_id'))->findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => 'nullable|string|max:50',
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
            'order_num' => 'nullable|integer',
        ]);

        if ($family->enterprise_id === null) {
            $copy = DuerpRiskFamily::create(array_merge($family->only(['name', 'code', 'description', 'order_num']), $validated, ['enterprise_id' => $enterpriseId, 'is_active' => $validated['is_active'] ?? true]));

            return response()->json(['success' => true, 'message' => 'Famille de risques personnalisée pour l\'entreprise.', 'data' => $copy]);
        }
        $family->update($validated);

        return response()->json(['success' => true, 'message' => 'Famille de risques mise à jour.', 'data' => $family]);
    }

    public function destroyRiskFamily(Request $request, int $id): JsonResponse
    {
        $family = DuerpRiskFamily::withoutGlobalScopes()->where('enterprise_id', $this->enterpriseId($request))->findOrFail($id);
        abort_if(DuerpDanger::query()->where('risk_family_id', $family->id)->exists(), 422, 'Cette famille est utilisée par des risques évalués : désactivez-la plutôt que de la supprimer.');
        $family->delete();

        return response()->json(['success' => true, 'message' => 'Type de risque retiré.']);
    }

    // =========================================================================
    // ÉCHELLES DE COTATION
    // =========================================================================

    public function scoringScales(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $custom = DuerpScoringScale::withoutGlobalScopes()->where('enterprise_id', $enterpriseId)->where('is_active', true)->orderBy('level')->get();
        $rows = $custom->isNotEmpty() ? $custom : DuerpScoringScale::withoutGlobalScopes()->whereNull('enterprise_id')->where('is_active', true)->orderBy('level')->get();

        return response()->json([
            'success' => true,
            'is_custom' => $custom->isNotEmpty(),
            'data' => [
                'gravity' => $rows->where('scale_type', 'gravity')->values(),
                'frequency' => $rows->where('scale_type', 'frequency')->values(),
                'maitrise' => $rows->where('scale_type', 'maitrise')->values(),
            ],
        ]);
    }

    /**
     * Échelles propres à l'entreprise : les trois échelles sont remplacées ensemble et ne peuvent plus changer
     * tant qu'un DUERP est en cours de validation (la cotation des lignes en dépend).
     */
    public function updateScoringScales(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $rules = [];
        foreach (['gravity', 'frequency', 'maitrise'] as $type) {
            $rules[$type] = 'required|array|min:2';
            $rules["{$type}.*.level"] = 'required|integer|min:1|distinct';
            $rules["{$type}.*.label"] = 'required|string|max:100';
            $rules["{$type}.*.score_value"] = 'required|integer|min:1';
            $rules["{$type}.*.description"] = 'nullable|string';
        }
        $rules['gravity.*.consequences'] = 'nullable|string';
        $rules['frequency.*.cadence'] = 'nullable|string';
        $validated = $request->validate($rules);

        abort_if(
            Duerp::query()->where('enterprise_id', $enterpriseId)->where('workflow_status', 'submitted_by_rq')->exists(),
            422,
            'Un DUERP est en cours de validation : attendez sa décision avant de modifier les échelles de cotation.',
        );

        $used = DuerpDanger::query()->whereHas('duerp', fn ($q) => $q->where('enterprise_id', $enterpriseId))
            ->get(['gravity', 'frequency', 'mitigation_level', 'residual_gravity', 'residual_frequency']);
        $levels = fn (string $type) => collect($validated[$type])->pluck('level')->map(fn ($level) => (int) $level)->all();
        $missing = [];
        foreach (['gravity' => ['gravity', 'residual_gravity'], 'frequency' => ['frequency', 'residual_frequency'], 'maitrise' => ['mitigation_level']] as $type => $columns) {
            foreach ($columns as $column) {
                foreach ($used->pluck($column)->filter()->map(fn ($level) => (int) $level)->unique() as $level) {
                    if (! in_array($level, $levels($type), true)) {
                        $missing[] = "{$type} niveau {$level}";
                    }
                }
            }
        }
        abort_if($missing !== [], 422, 'Des risques déjà évalués utilisent des niveaux absents des nouvelles échelles ('.implode(', ', array_unique($missing)).') : conservez ces niveaux.');

        $saved = 0;
        DB::transaction(function () use ($validated, $enterpriseId, &$saved) {
            DuerpScoringScale::withoutGlobalScopes()->where('enterprise_id', $enterpriseId)->delete();
            foreach (['gravity', 'frequency', 'maitrise'] as $type) {
                foreach ($validated[$type] as $item) {
                    DuerpScoringScale::create([
                        'enterprise_id' => $enterpriseId, 'scale_type' => $type, 'level' => $item['level'], 'label' => $item['label'],
                        'score_value' => $item['score_value'], 'cadence' => $item['cadence'] ?? null,
                        'consequences' => $item['consequences'] ?? null, 'description' => $item['description'] ?? null, 'is_active' => true,
                    ]);
                    $saved++;
                }
            }
        });

        return response()->json(['success' => true, 'message' => 'Échelles de cotation DUERP enregistrées avec succès.', 'items_count' => $saved]);
    }

    // =========================================================================
    // UNITÉS DE TRAVAIL
    // =========================================================================

    public function workUnits(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = DuerpWorkUnit::query()->where('enterprise_id', $this->enterpriseId($request))
            ->with(['process:id,code,title', 'manager:id,name', 'site:id,name'])->withCount('dangers');

        if (! $user->isEnterpriseAdmin() && $user->site_id) {
            $query->where('site_id', $user->site_id);
        }
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('duerp_id')) {
            $query->where('duerp_id', $request->integer('duerp_id'));
        }

        return response()->json(['success' => true, 'data' => $query->orderBy('name')->get()]);
    }

    public function storeWorkUnit(Request $request): JsonResponse
    {
        $enterpriseId = $this->enterpriseId($request);
        $validated = $request->validate($this->unitRules(false));
        $duerp = isset($validated['duerp_id']) ? $this->ownedDuerp($request, (int) $validated['duerp_id']) : null;
        if ($duerp) {
            $this->assertDraft($duerp, 'Ce DUERP est figé : créez une nouvelle version pour ajouter une unité de travail.');
        }
        $site = $this->resolveSite($request, isset($validated['site_id']) ? (int) $validated['site_id'] : ($duerp?->site_id));
        $this->assertUnitReferences($validated, $enterpriseId);

        $unit = DuerpWorkUnit::create(array_merge($validated, ['enterprise_id' => $enterpriseId, 'site_id' => $site->id]));

        return response()->json([
            'success' => true,
            'message' => 'Unité de travail créée avec succès.',
            'data' => $unit->load(['process:id,code,title', 'manager:id,name', 'site:id,name']),
        ], 201);
    }

    public function updateWorkUnit(Request $request, int $id): JsonResponse
    {
        $unit = DuerpWorkUnit::query()->where('enterprise_id', $this->enterpriseId($request))->findOrFail($id);
        $this->assertUnitEditable($unit);
        $validated = $request->validate($this->unitRules(true));
        $this->assertUnitReferences($validated, (int) $unit->enterprise_id);
        unset($validated['site_id'], $validated['duerp_id']);

        $unit->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Unité de travail mise à jour avec succès.',
            'data' => $unit->fresh(['process:id,code,title', 'manager:id,name', 'site:id,name']),
        ]);
    }

    public function destroyWorkUnit(Request $request, int $id): JsonResponse
    {
        $unit = DuerpWorkUnit::query()->where('enterprise_id', $this->enterpriseId($request))->findOrFail($id);
        $this->assertUnitEditable($unit);
        abort_if($unit->dangers()->exists(), 422, 'Cette unité porte des risques évalués : déplacez-les avant de la supprimer.');
        $unit->delete();

        return response()->json(['success' => true, 'message' => 'Unité de travail supprimée.']);
    }

    private function assertUnitEditable(DuerpWorkUnit $unit): void
    {
        if ($unit->duerp_id) {
            $this->assertDraft(Duerp::query()->findOrFail($unit->duerp_id), 'Ce DUERP est figé : créez une nouvelle version pour modifier ses unités de travail.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function unitRules(bool $partial): array
    {
        return [
            'name' => ($partial ? 'sometimes|' : '').'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'site_id' => 'nullable|integer',
            'duerp_id' => 'nullable|integer',
            'process_id' => 'nullable|integer',
            'manager_id' => 'nullable|integer',
            'headcount' => 'nullable|integer|min:1',
            'description' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function assertUnitReferences(array $validated, int $enterpriseId): void
    {
        $this->assertOwnedByEnterprise([
            'process_id' => ['table' => 'processes', 'column' => 'enterprise_id'],
            'manager_id' => ['table' => 'users', 'column' => 'enterprise_id'],
        ], $validated, $enterpriseId);
    }
}
