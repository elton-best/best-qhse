<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\AesSignificanceService;
use App\Modules\Hse\Services\AesWorkbookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Aspects environnementaux et AES — ISO 14001:2026 §6.1.2.
 *
 * Le périmètre (entreprise, site) est imposé côté serveur ; la cotation et la
 * significativité sont toujours calculées par le serveur à partir des paramètres de l'organisme.
 */
class EnvironmentalAspectController extends Controller
{
    use ScopesToUserTenant;

    private const RELATIONS = ['process:id,code,title', 'site:id,name', 'responsible:id,name', 'emergencyProcedure:id,title,status'];

    public const LIFECYCLE_PHASES = ['acquisition', 'design', 'production', 'transport', 'use', 'end_of_life', 'final_disposal'];

    public const ASPECT_TYPES = [
        'air_emissions', 'water_discharges', 'soil_discharges', 'resources_materials', 'energy',
        'emitted_energy', 'waste', 'land_use', 'marine_coastal',
    ];

    public function __construct(
        private readonly AesSignificanceService $significance,
        private readonly AesWorkbookService $workbook,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = EnvironmentalAspect::query()->with(self::RELATIONS);

        foreach (['site_id', 'process_id', 'mode', 'status', 'situation', 'lifecycle_phase', 'aspect_type', 'group_label'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }
        foreach (['is_significant', 'needs_reassessment', 'is_emergency_potential'] as $flag) {
            if ($request->filled($flag)) {
                $query->where($flag, filter_var($request->query($flag), FILTER_VALIDATE_BOOLEAN));
            }
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->query('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('activity', 'ilike', $term)
                    ->orWhere('aspect', 'ilike', $term)
                    ->orWhere('impact', 'ilike', $term)
                    ->orWhere('risk', 'ilike', $term)
                    ->orWhere('aspect_number', 'ilike', $term);
            });
        }

        $aspects = $query->orderBy('process_id')->orderBy('id')->get();

        return response()->json([
            'success' => true,
            'data' => $aspects,
            'meta' => [
                'total' => $aspects->count(),
                'significant_count' => $aspects->where('is_significant', true)->count(),
                'non_significant_count' => $aspects->where('is_significant', false)->count(),
            ],
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);

        return response()->json([
            'success' => true,
            'data' => EnvironmentalAspect::query()->with(self::RELATIONS)->findOrFail($id),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $validated = $request->validate($this->rules($request, true));
        $site = $this->resolveSite($request, isset($validated['site_id']) ? (int) $validated['site_id'] : null);
        $this->assertOwnedByEnterprise($this->ownedTargets(), $validated, (int) $site->enterprise_id);
        $this->assertCoherence($validated, null, (int) $site->enterprise_id);
        $this->assertNumberAvailable($validated['aspect_number'] ?? null, (int) $site->enterprise_id, null);
        unset($validated['is_significant']);

        $validated['site_id'] = $site->id;
        $validated['enterprise_id'] = $site->enterprise_id;
        $validated['status'] = 'draft';
        $validated['aspect_number'] = $validated['aspect_number'] ?? $this->nextNumber((int) $site->enterprise_id);

        $aspect = DB::transaction(function () use ($validated) {
            $aspect = EnvironmentalAspect::create($validated);
            $this->syncEmergency($aspect);

            return $aspect;
        });

        return response()->json([
            'success' => true,
            'message' => 'Aspect environnemental enregistré avec succès.',
            'data' => $aspect->fresh(self::RELATIONS),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $aspect = EnvironmentalAspect::query()->findOrFail($id);
        abort_if($aspect->status === 'archived', 422, 'Un aspect archivé doit être rouvert avant modification.');

        $validated = $request->validate($this->rules($request, false));
        if (isset($validated['site_id']) && (int) $validated['site_id'] !== (int) $aspect->site_id) {
            $this->resolveSite($request, (int) $validated['site_id']);
        }
        $this->assertOwnedByEnterprise($this->ownedTargets(), $validated, (int) $aspect->enterprise_id);
        $this->assertCoherence($validated, $aspect, (int) $aspect->enterprise_id);
        $this->assertNumberAvailable($validated['aspect_number'] ?? null, (int) $aspect->enterprise_id, $aspect->id);
        unset($validated['is_significant']);

        DB::transaction(function () use ($aspect, $validated) {
            $aspect->fill($validated);
            // Une modification de fond d'un aspect validé le renvoie en revue (versionnage, M4-10).
            $substantive = array_diff(array_keys($aspect->getDirty()), [
                'additional_actions', 'responsible_id', 'responsible_name', 'deadline', 'effectiveness_criterion',
                'efficiency_criterion', 'observations', 'action_ids', 'criticality_score', 'significance_threshold',
                'is_significant', 'significance_basis', 'method_snapshot', 'updated_by',
            ]);
            if ($aspect->status === 'validated' && $substantive !== []) {
                $aspect->status = 'in_review';
            }
            if ($aspect->isDirty(['gravity', 'frequency', 'sensitivity', 'mastery', 'legal_criterion', 'stakeholder_criterion'])) {
                $aspect->needs_reassessment = false;
            }
            $aspect->save();
            $this->syncEmergency($aspect);
        });

        return response()->json([
            'success' => true,
            'message' => 'Aspect environnemental mis à jour avec succès.',
            'data' => $aspect->fresh(self::RELATIONS),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $aspect = EnvironmentalAspect::query()->findOrFail($id);
        abort_if($aspect->status === 'validated', 422, 'Un aspect validé sert de preuve : archivez-le plutôt que de le supprimer.');
        $aspect->delete();

        return response()->json(['success' => true, 'message' => 'Aspect environnemental supprimé avec succès.']);
    }

    /**
     * Workflow : validate | archive | reopen.
     */
    public function transition(Request $request, int $id, string $action): JsonResponse
    {
        $this->assertTenant($request);
        $aspect = EnvironmentalAspect::query()->findOrFail($id);
        $settings = $this->significance->settingsFor((int) $aspect->enterprise_id);

        match ($action) {
            'validate' => $this->validateAspect($aspect, (int) $settings['review_frequency_months']),
            'archive' => $aspect->forceFill(['status' => 'archived'])->save(),
            'reopen' => $aspect->forceFill(['status' => 'draft'])->save(),
        };

        return response()->json(['success' => true, 'data' => $aspect->fresh(self::RELATIONS)]);
    }

    /**
     * Signale qu'un aspect doit être réévalué (changement, incident, nouvelle obligation, plainte).
     */
    public function flagReassessment(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['reason' => 'required|string|max:1000']);
        $aspect = EnvironmentalAspect::query()->findOrFail($id);
        $aspect->forceFill([
            'needs_reassessment' => true,
            'reassessment_reason' => $data['reason'],
            'reassessment_flagged_at' => now(),
        ])->save();

        return response()->json(['success' => true, 'data' => $aspect->fresh(self::RELATIONS)]);
    }

    /**
     * Déclenche la réévaluation d'un ensemble d'aspects à la suite d'un événement (M4-08).
     */
    public function triggerReassessment(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate([
            'trigger' => ['required', Rule::in(['change', 'incident', 'emergency', 'obligation', 'complaint', 'other'])],
            'reason' => 'required|string|max:1000',
            'site_id' => 'nullable|integer',
            'process_id' => 'nullable|integer',
            'aspect_ids' => 'nullable|array',
            'aspect_ids.*' => 'integer',
        ]);
        abort_if(
            empty($data['aspect_ids']) && empty($data['site_id']) && empty($data['process_id']),
            422,
            'Précisez au moins un aspect, un site ou un processus concerné.',
        );

        $query = EnvironmentalAspect::query()->where('status', '!=', 'archived');
        if (! empty($data['aspect_ids'])) {
            $query->whereIn('id', $data['aspect_ids']);
        }
        if (! empty($data['site_id'])) {
            $query->where('site_id', $data['site_id']);
        }
        if (! empty($data['process_id'])) {
            $query->where('process_id', $data['process_id']);
        }

        $label = ['change' => 'Changement', 'incident' => 'Incident', 'emergency' => "Situation d'urgence",
            'obligation' => 'Nouvelle obligation', 'complaint' => 'Plainte', 'other' => 'Autre'][$data['trigger']];
        $flagged = 0;
        $query->get()->each(function (EnvironmentalAspect $aspect) use ($data, $label, &$flagged) {
            $aspect->forceFill([
                'needs_reassessment' => true,
                'reassessment_reason' => "{$label} : {$data['reason']}",
                'reassessment_flagged_at' => now(),
            ])->save();
            $flagged++;
        });

        return response()->json(['success' => true, 'data' => ['flagged' => $flagged]]);
    }

    public function statistics(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = EnvironmentalAspect::query()->where('status', '!=', 'archived');
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->query('site_id'));
        }
        $all = $query->get();
        $significant = $all->where('is_significant', true);

        $heatmap = [];
        foreach ($all->whereNotNull('gravity') as $aspect) {
            $key = $aspect->gravity . '-' . $aspect->frequency;
            $heatmap[$key] = ($heatmap[$key] ?? 0) + 1;
        }

        return response()->json([
            'success' => true,
            'data' => [
                'total' => $all->count(),
                'significant' => $significant->count(),
                'non_significant' => $all->where('is_significant', false)->count(),
                'mode_normal' => $all->where('mode', 'N')->count(),
                'mode_accidental' => $all->where('mode', 'A')->count(),
                'validated' => $all->where('status', 'validated')->count(),
                'by_process' => $all->groupBy('process_id')->map->count(),
                'by_type' => $all->whereNotNull('aspect_type')->groupBy('aspect_type')->map->count(),
                'by_lifecycle' => $all->whereNotNull('lifecycle_phase')->groupBy('lifecycle_phase')->map->count(),
                'needs_reassessment' => $all->where('needs_reassessment', true)->count(),
                'review_due' => $all->filter(fn ($a) => $a->next_review_date && $a->next_review_date->lte(today()))->count(),
                // M7-03 : un aspect significatif doit être traité en priorité (action ou mesure complémentaire).
                'significant_without_action' => $significant
                    ->filter(fn ($a) => blank($a->action_ids) && blank($a->additional_actions))
                    ->pluck('id')->values(),
                'emergency_potential' => $all->where('is_emergency_potential', true)->count(),
                'heatmap' => $heatmap,
            ],
        ]);
    }

    /**
     * Fiche synthétique des AES par site et par processus, à diffuser aux personnes concernées (M4-09).
     */
    public function significantSheet(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = EnvironmentalAspect::query()->with(['process:id,code,title', 'site:id,name', 'responsible:id,name'])
            ->where('is_significant', true)->where('status', '!=', 'archived');
        foreach (['site_id', 'process_id'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        $groups = $query->orderBy('site_id')->orderBy('process_id')->get()
            ->groupBy(fn ($a) => ($a->site?->name ?? 'Sans site') . '||' . ($a->process?->title ?? 'Sans processus'))
            ->map(function ($items, $key) {
                [$site, $process] = explode('||', $key);

                return [
                    'site' => $site,
                    'process' => $process,
                    'aspects' => $items->map(fn ($a) => [
                        'id' => $a->id,
                        'aspect_number' => $a->aspect_number,
                        'activity' => $a->activity,
                        'aspect' => $a->aspect,
                        'impact' => $a->impact,
                        'criticality_score' => $a->criticality_score,
                        'significance_basis' => $a->significance_basis,
                        'existing_controls' => $a->existing_controls,
                        'additional_actions' => $a->additional_actions,
                        'responsible' => $a->responsible?->name ?? $a->responsible_name,
                        'deadline' => $a->deadline?->toDateString(),
                    ])->values(),
                ];
            })->values();

        return response()->json([
            'success' => true,
            'data' => [
                'generated_at' => now()->toIso8601String(),
                'method' => $this->significance->method($this->significance->settingsFor($request->user()->enterprise_id)),
                'groups' => $groups,
            ],
        ]);
    }

    public function downloadTemplate(Request $request)
    {
        $this->assertTenant($request);
        $settings = $this->significance->settingsFor($request->user()->enterprise_id);
        $path = $this->workbook->save($this->workbook->buildTemplate($settings));

        return response()->download($path, 'canevas_registre_aspects_iso14001.xlsx')->deleteFileAfterSend(true);
    }

    /**
     * Import contrôlé : `dry_run` ne crée rien ; sans `skip_invalid`, une seule erreur annule tout.
     */
    public function importXlsx(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $request->validate([
            'site_id' => 'nullable|integer',
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
            'dry_run' => 'nullable|boolean',
            'skip_invalid' => 'nullable|boolean',
        ]);
        $site = $this->resolveSite($request, $request->filled('site_id') ? $request->integer('site_id') : null);
        $settings = $this->significance->settingsFor((int) $site->enterprise_id);
        $parsed = $this->workbook->parse($request->file('file')->getRealPath(), (int) $site->enterprise_id, (int) $site->id, $settings);

        $summary = [
            'total' => $parsed['total'],
            'valid' => count($parsed['rows']),
            'significant' => collect($parsed['rows'])->where('is_significant', true)->count(),
            'errors' => $parsed['errors'],
        ];

        if ($request->boolean('dry_run')) {
            return response()->json(['success' => true, 'dry_run' => true, 'data' => $summary + [
                'preview' => collect($parsed['rows'])->take(50)->map(fn ($r) => [
                    'line' => $r['line'], 'activity' => $r['activity'], 'aspect' => $r['aspect'],
                    'criticality' => $r['criticality'], 'is_significant' => $r['is_significant'],
                ])->values(),
            ]]);
        }

        if ($parsed['errors'] !== [] && ! $request->boolean('skip_invalid')) {
            return response()->json([
                'success' => false,
                'message' => 'Le fichier contient des erreurs : aucune ligne n\'a été importée.',
                'data' => $summary,
            ], 422);
        }

        $imported = DB::transaction(function () use ($parsed, $site) {
            $count = 0;
            foreach ($parsed['rows'] as $row) {
                unset($row['line'], $row['criticality'], $row['is_significant']);
                EnvironmentalAspect::create($row + [
                    'enterprise_id' => $site->enterprise_id,
                    'site_id' => $site->id,
                    'status' => 'draft',
                    'aspect_number' => $row['aspect_number'] ?? $this->nextNumber((int) $site->enterprise_id),
                ]);
                $count++;
            }

            return $count;
        });

        return response()->json(['success' => true, 'message' => "{$imported} aspect(s) importé(s).", 'data' => $summary + ['imported' => $imported]]);
    }

    public function exportXlsx(Request $request)
    {
        $this->assertTenant($request);
        $user = $request->user();
        $filters = [
            'site_id' => $request->filled('site_id') ? (int) $request->site_id : ($user->site_id ?: null),
            'process_id' => $request->filled('process_id') ? (int) $request->process_id : null,
            'is_significant' => $request->filled('is_significant') ? filter_var($request->query('is_significant'), FILTER_VALIDATE_BOOLEAN) : null,
        ];

        $tempFile = app(\App\Modules\Hse\Services\HseExportService::class)
            ->exportEnvironmentalAspectsXlsx((int) $user->enterprise_id, $filters);
        $siteSuffix = ! empty($filters['site_id']) ? "_site_{$filters['site_id']}" : '_tous_sites';

        return response()->download($tempFile, 'aes_iso14001' . $siteSuffix . '_' . date('Ymd_His') . '.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    // ------------------------------------------------------------------ privé

    /**
     * @return array<string, mixed>
     */
    private function rules(Request $request, bool $creating): array
    {
        $settings = $this->significance->settingsFor($request->user()->enterprise_id);
        $required = $creating ? 'required' : 'sometimes|required';

        return [
            'site_id' => 'nullable|integer',
            'process_id' => 'nullable|integer',
            'sub_process' => 'nullable|string|max:255',
            'mode' => 'nullable|in:N,A',
            'situation' => 'nullable|in:normal,abnormal,startup_shutdown,emergency',
            'aspect_number' => 'nullable|string|max:50',
            'activity' => "{$required}|string|max:255",
            'aspect' => "{$required}|string|max:255",
            'impact' => "{$required}|string|max:255",
            'risk' => 'nullable|string',
            'existing_controls' => 'nullable|string',
            'gravity' => "nullable|integer|between:1,{$settings['max_gravity']}",
            'frequency' => "nullable|integer|between:1,{$settings['max_frequency']}",
            'sensitivity' => "nullable|integer|between:1,{$settings['max_sensitivity']}",
            'mastery' => "nullable|integer|between:1,{$settings['max_mastery']}",
            'lifecycle_phase' => ['nullable', Rule::in(self::LIFECYCLE_PHASES)],
            'control_level' => 'nullable|in:controlled,influenced',
            'aspect_type' => ['nullable', Rule::in(self::ASPECT_TYPES)],
            'impact_nature' => 'nullable|in:negative,beneficial',
            'impact_scale' => 'nullable|in:local,regional,global',
            'impact_kind' => 'nullable|in:direct,indirect,cumulative',
            'group_label' => 'nullable|string|max:255',
            'legal_criterion' => 'nullable|boolean',
            'stakeholder_criterion' => 'nullable|boolean',
            'is_emergency_potential' => 'nullable|boolean',
            'is_significant' => 'nullable|boolean',
            'additional_actions' => 'nullable|string',
            'responsible_id' => 'nullable|integer',
            'responsible_name' => 'nullable|string|max:255',
            'deadline' => 'nullable|date',
            'effectiveness_criterion' => 'nullable|string',
            'efficiency_criterion' => 'nullable|string',
            'observations' => 'nullable|string',
            'action_ids' => 'nullable|array',
            'action_ids.*' => 'integer',
        ];
    }

    /**
     * @return array<string, array{table: string, column: string}>
     */
    private function ownedTargets(): array
    {
        return [
            'process_id' => ['table' => 'processes', 'column' => 'enterprise_id'],
            'responsible_id' => ['table' => 'users', 'column' => 'enterprise_id'],
        ];
    }

    /**
     * Règle de cohérence (A.6.1.2) : un critère additionnel peut faire monter un aspect au-dessus
     * du seuil, jamais le déclasser s'il est déjà significatif par son impact environnemental.
     *
     * @param  array<string, mixed>  $validated
     */
    private function assertCoherence(array $validated, ?EnvironmentalAspect $existing, int $enterpriseId): void
    {
        if (! array_key_exists('is_significant', $validated) || $validated['is_significant'] !== false) {
            return;
        }

        $pick = fn (string $key, int $default) => (int) ($validated[$key] ?? $existing?->{$key} ?? $default);
        $settings = $this->significance->settingsFor($enterpriseId);
        $result = $this->significance->evaluate(
            $pick('gravity', 1), $pick('frequency', 1), $pick('sensitivity', 1), $pick('mastery', 1), false, false, $settings,
        );

        if ($result['environmental_significant']) {
            abort(response()->json([
                'message' => "Cet aspect est significatif par son impact environnemental (Cr = {$result['criticality']} > {$settings['significance_threshold']}) : un critère additionnel ne peut pas le déclasser.",
                'errors' => ['is_significant' => ['Déclassement refusé : significatif par son impact environnemental.']],
            ], 422));
        }
    }

    private function validateAspect(EnvironmentalAspect $aspect, int $reviewMonths): void
    {
        // Les colonnes de cotation ont une valeur par défaut : seul le score calculé prouve qu'elles ont été saisies.
        abort_if(
            $aspect->criticality_score === null,
            422,
            'La cotation (G, F, S, M) doit être complète avant validation.',
        );
        abort_if($aspect->status === 'archived', 422, 'Un aspect archivé doit être rouvert avant validation.');

        $aspect->forceFill([
            'status' => 'validated',
            'last_reviewed_at' => today(),
            'next_review_date' => today()->addMonths($reviewMonths),
            'needs_reassessment' => false,
            'reassessment_reason' => null,
            'reassessment_flagged_at' => null,
        ])->save();
    }

    /**
     * M4-07 : un aspect à potentiel d'urgence crée (une seule fois) la fiche de situation d'urgence.
     */
    private function syncEmergency(EnvironmentalAspect $aspect): void
    {
        if (! $aspect->is_emergency_potential || $aspect->emergency_procedure_id) {
            return;
        }

        $procedure = EmergencyProcedure::create([
            'enterprise_id' => $aspect->enterprise_id,
            'site_id' => $aspect->site_id,
            'aspect_id' => $aspect->id,
            'responsible_id' => $aspect->responsible_id,
            'emergency_type' => 'À définir',
            'title' => 'Urgence — ' . $aspect->aspect,
            'hazard_nature' => $aspect->impact,
            'status' => 'planifie',
        ]);
        $aspect->forceFill(['emergency_procedure_id' => $procedure->id])->saveQuietly();
    }

    private function numberExists(string $number, int $enterpriseId, ?int $ignoreId = null): bool
    {
        return EnvironmentalAspect::query()->withoutGlobalScopes()->withTrashed()
            ->where('enterprise_id', $enterpriseId)->where('aspect_number', $number)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))->exists();
    }

    private function assertNumberAvailable(?string $number, int $enterpriseId, ?int $ignoreId): void
    {
        if ($number !== null && $this->numberExists($number, $enterpriseId, $ignoreId)) {
            abort(response()->json([
                'message' => "Le numéro « {$number} » est déjà utilisé dans votre registre.",
                'errors' => ['aspect_number' => ['Numéro déjà utilisé.']],
            ], 422));
        }
    }

    private function nextNumber(int $enterpriseId): string
    {
        $next = EnvironmentalAspect::query()->withoutGlobalScopes()->withTrashed()->where('enterprise_id', $enterpriseId)->count() + 1;
        while ($this->numberExists(sprintf('ASP-%03d', $next), $enterpriseId)) {
            $next++;
        }

        return sprintf('ASP-%03d', $next);
    }
}
