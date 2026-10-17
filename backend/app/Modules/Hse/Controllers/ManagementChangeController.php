<?php

namespace App\Modules\Hse\Controllers;

use App\Models\User;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Models\ManagementChange;
use App\Modules\Hse\Models\ManagementChangeTask;
use App\Notifications\SiteEventNotification;
use App\Services\ScopeReviewService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Gestion des changements (ISO 14001:2026 §6.3, §8.1) : demande, analyse d'impact obligatoire, approbation,
 * tâches de mise à jour dans les modules touchés, revue après mise en œuvre.
 */
class ManagementChangeController extends ManagedRecordController
{
    private const EDITABLE = ['requested', 'in_analysis'];

    protected function modelClass(): string
    {
        return ManagementChange::class;
    }

    protected function label(): string
    {
        return 'Changement';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'change_type' => ['required', Rule::in(ManagementChange::TYPES)],
            'origin' => 'nullable|in:internal,external',
            'duration' => 'nullable|in:temporary,permanent',
            'is_planned' => 'nullable|boolean',
            'description' => 'nullable|string',
            'planned_start_date' => 'nullable|date',
            'planned_end_date' => 'nullable|date|after_or_equal:planned_start_date',
            'responsible_id' => 'nullable|integer',
            'unplanned_consequences' => 'nullable|string',
            'mitigation_measures' => 'nullable|string',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Changement', 'text'],
            ['change_type', 'Type', 'text'],
            ['origin', 'Origine (internal, external)', 'text'],
            ['duration', 'Durée (temporary, permanent)', 'text'],
            ['planned_start_date', 'Début prévu', 'date'],
            ['status', 'Statut', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'change_type', 'origin'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'decider:id,name'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        $planned = $data['is_planned'] ?? $existing?->is_planned ?? true;
        $duration = $data['duration'] ?? $existing?->duration ?? 'permanent';
        $errors = [];
        if (! $planned) {
            foreach (['unplanned_consequences', 'mitigation_measures'] as $field) {
                $value = array_key_exists($field, $data) ? $data[$field] : $existing?->{$field};
                if (mb_strlen(trim((string) $value)) < 10) {
                    $errors[$field] = ['Un changement non planifié exige l\'analyse de ses conséquences et des mesures d\'atténuation (au moins 10 caractères).'];
                }
            }
        }
        if ($duration === 'temporary' && empty($data['planned_end_date'] ?? $existing?->planned_end_date)) {
            $errors['planned_end_date'] = ['Un changement temporaire doit avoir une date de fin.'];
        }
        if ($errors !== []) {
            abort(response()->json(['message' => 'Données invalides.', 'errors' => $errors], 422));
        }
        if ($existing === null) {
            $data['status'] = 'requested';
        }

        return $data;
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);

        return response()->json(ManagementChange::query()->with($this->relations())
            ->with(['tasks' => fn ($query) => $query->with('responsible:id,name')->orderBy('id')])->findOrFail($id));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        abort_unless(in_array(ManagementChange::query()->findOrFail($id)->status, self::EDITABLE, true), 422, 'La fiche n\'est modifiable que tant que le changement n\'est pas soumis à approbation.');

        return parent::update($request, $id);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        abort_unless(in_array(ManagementChange::query()->findOrFail($id)->status, ['requested', 'rejected'], true), 422, 'Un changement engagé est conservé comme preuve : il ne peut pas être supprimé.');

        return parent::destroy($request, $id);
    }

    /**
     * Analyse d'impact (M8-02) et ressources demandées (M9-01).
     */
    public function saveAnalysis(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $change = ManagementChange::query()->findOrFail($id);
        abort_unless(in_array($change->status, self::EDITABLE, true), 422, 'L\'analyse n\'est plus modifiable.');

        $data = $request->validate([
            'impact_analysis' => 'required|array',
            'impact_analysis.*.impacted' => 'required|boolean',
            'impact_analysis.*.note' => 'nullable|string|max:2000',
            'affected_aspect_ids' => 'nullable|array',
            'affected_aspect_ids.*' => 'integer',
            'resources_requested' => 'nullable|array',
            'resources_requested.human' => 'nullable|string|max:1000',
            'resources_requested.financial' => 'nullable|string|max:1000',
            'resources_requested.technical' => 'nullable|string|max:1000',
            'resources_requested.infrastructure' => 'nullable|string|max:1000',
        ]);
        $unknown = array_diff(array_keys($data['impact_analysis']), array_keys(ManagementChange::DIMENSIONS));
        abort_if($unknown !== [], 422, 'Dimension d\'impact inconnue : '.implode(', ', $unknown));

        $aspectIds = array_values(array_unique($data['affected_aspect_ids'] ?? []));
        if ($aspectIds !== []) {
            $owned = EnvironmentalAspect::query()->whereIn('id', $aspectIds)->where('enterprise_id', $change->enterprise_id)->count();
            abort_if($owned !== count($aspectIds), 422, 'Un aspect sélectionné est introuvable pour votre entreprise.');
        }

        $change->update([
            'impact_analysis' => $data['impact_analysis'],
            'affected_aspect_ids' => $aspectIds,
            'resources_requested' => $this->nonEmpty($data['resources_requested'] ?? []),
            'status' => 'in_analysis',
        ]);

        return response()->json($change->fresh($this->relations()));
    }

    /**
     * Soumission : toutes les dimensions doivent être tranchées. Un changement non planifié, déjà subi,
     * est régularisé directement ; un changement planifié part en approbation.
     */
    public function submit(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $change = ManagementChange::query()->findOrFail($id);
        abort_unless($change->status === 'in_analysis', 422, 'Enregistrez d\'abord l\'analyse d\'impact.');

        $analysis = $change->impact_analysis ?? [];
        $errors = [];
        foreach (ManagementChange::DIMENSIONS as $key => $label) {
            $entry = $analysis[$key] ?? null;
            if (! is_array($entry) || ! array_key_exists('impacted', $entry)) {
                $errors["impact_analysis.{$key}"] = ["Indiquez si « {$label} » est concerné."];
            } elseif ($entry['impacted'] && mb_strlen(trim((string) ($entry['note'] ?? ''))) < 5) {
                $errors["impact_analysis.{$key}"] = ["Décrivez l'impact sur « {$label} »."];
            }
        }
        if ($errors !== []) {
            abort(response()->json(['message' => 'L\'analyse d\'impact est incomplète.', 'errors' => $errors], 422));
        }

        DB::transaction(function () use ($change) {
            $change->update(['analysis_submitted_at' => now()]);
            if ($change->is_planned) {
                $change->update(['status' => 'awaiting_approval']);
                $this->notifyApprovers($change);
            } else {
                $change->update(['decided_by' => auth()->id(), 'decided_at' => now(), 'decision_note' => 'Régularisation d\'un changement non planifié (8.1).']);
                $this->launch($change);
            }
        });

        return response()->json($change->fresh($this->relations()));
    }

    /**
     * Décision de la direction (M8-03), avec l'octroi ou le refus des ressources demandées (M9-01).
     */
    public function decide(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $change = ManagementChange::query()->findOrFail($id);
        abort_unless($change->status === 'awaiting_approval', 422, 'Ce changement n\'attend pas de décision.');

        $data = $request->validate([
            'decision' => 'required|in:approve,reject',
            'note' => 'nullable|string',
            'resources_decision' => 'nullable|in:granted,refused',
            'resources_decision_note' => 'nullable|string',
        ]);
        if ($data['decision'] === 'reject' && mb_strlen(trim((string) ($data['note'] ?? ''))) < 5) {
            abort(response()->json(['message' => 'Motivez le refus.', 'errors' => ['note' => ['Le motif du refus est obligatoire.']]], 422));
        }
        $needsResourcesDecision = $data['decision'] === 'approve' && ! empty($change->resources_requested);
        if ($needsResourcesDecision && empty($data['resources_decision'])) {
            abort(response()->json(['message' => 'Statuez sur les ressources demandées.', 'errors' => ['resources_decision' => ['Accordez ou refusez les ressources demandées.']]], 422));
        }
        if (($data['resources_decision'] ?? null) === 'refused' && mb_strlen(trim((string) ($data['resources_decision_note'] ?? ''))) < 5) {
            abort(response()->json(['message' => 'Motivez le refus des ressources.', 'errors' => ['resources_decision_note' => ['Le motif est obligatoire.']]], 422));
        }

        DB::transaction(function () use ($change, $data) {
            $change->update([
                'decided_by' => auth()->id(),
                'decided_at' => now(),
                'decision_note' => $data['note'] ?? null,
                'resources_decision' => $data['resources_decision'] ?? null,
                'resources_decision_note' => $data['resources_decision_note'] ?? null,
            ]);
            if ($data['decision'] === 'reject') {
                $change->update(['status' => 'rejected']);

                return;
            }
            $this->launch($change);
        });

        return response()->json($change->fresh($this->relations()));
    }

    public function completeTask(Request $request, int $taskId): JsonResponse
    {
        $this->assertTenant($request);
        $task = ManagementChangeTask::query()->with('change')->findOrFail($taskId);
        abort_unless($task->change->status === 'implementing', 422, 'Le changement n\'est pas en cours de mise en œuvre.');
        abort_if($task->status === 'done', 422, 'Cette tâche est déjà terminée.');
        $data = $request->validate(['note' => 'required|string|min:5']);

        DB::transaction(function () use ($task, $data) {
            $task->update(['status' => 'done', 'done_at' => now(), 'done_by' => auth()->id(), 'done_note' => $data['note']]);
            if (! $task->change->tasks()->where('status', '!=', 'done')->exists()) {
                $task->change->update(['status' => 'implemented', 'implemented_at' => now()]);
            }
        });

        return response()->json($task->change->fresh([...$this->relations(), 'tasks']));
    }

    /**
     * Revue après mise en œuvre (M8-03) : clôture de la fiche.
     */
    public function review(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $change = ManagementChange::query()->findOrFail($id);
        abort_unless($change->status === 'implemented', 422, 'La revue se fait une fois toutes les tâches terminées.');
        $data = $request->validate(['result' => 'required|in:effective,partial,ineffective', 'note' => 'required|string|min:10']);

        $change->update(['review_result' => $data['result'], 'review_note' => $data['note'], 'status' => 'closed', 'closed_at' => now()]);

        return response()->json($change->fresh([...$this->relations(), 'tasks']));
    }

    /**
     * Changements d'une période : alimente la revue de direction (M16) et le programme d'audit (M15).
     */
    public function periodSummary(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from', 'site_id' => 'nullable|integer']);
        $from = $data['from'] ?? now()->subYear()->toDateString();
        $to = $data['to'] ?? now()->toDateString();

        $changes = ManagementChange::query()->with('site:id,name')
            ->whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->when(! empty($data['site_id']), fn ($query) => $query->where('site_id', $data['site_id']))
            ->orderByDesc('id')->get();

        return response()->json(['data' => [
            'from' => $from,
            'to' => $to,
            'total' => $changes->count(),
            'by_status' => $changes->countBy('status'),
            'unplanned' => $changes->where('is_planned', false)->count(),
            'by_dimension' => collect(array_keys(ManagementChange::DIMENSIONS))->mapWithKeys(fn (string $key) => [
                $key => $changes->filter(fn (ManagementChange $change) => ($change->impact_analysis[$key]['impacted'] ?? false) === true)->count(),
            ]),
            'changes' => $changes->map(fn (ManagementChange $change) => [
                'id' => $change->id, 'ref' => $change->ref, 'title' => $change->title, 'change_type' => $change->change_type,
                'status' => $change->status, 'is_planned' => $change->is_planned, 'site' => $change->site?->name,
                'review_result' => $change->review_result,
            ])->values(),
        ]]);
    }

    public function myTasks(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = ManagementChangeTask::query()->with('change:id,ref,title,status')->orderBy('due_date');
        if (! $request->boolean('all')) {
            $query->where('responsible_id', auth()->id());
        }
        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        return response()->json(['data' => $query->limit(200)->get()]);
    }

    /**
     * Approuve : génère une tâche par dimension touchée, signale les aspects concernés à réévaluer, lance la mise en œuvre.
     */
    private function launch(ManagementChange $change): void
    {
        app(ScopeReviewService::class)->flagChange(
            (int) $change->site_id, "Changement approuvé {$change->ref} : {$change->title}",
        );
        $dueDate = $change->planned_start_date && $change->planned_start_date->isFuture() ? $change->planned_start_date : today()->addDays(30);
        $created = 0;
        foreach (ManagementChange::DIMENSIONS as $key => $label) {
            if (($change->impact_analysis[$key]['impacted'] ?? false) !== true) {
                continue;
            }
            ManagementChangeTask::create([
                'enterprise_id' => $change->enterprise_id,
                'change_id' => $change->id,
                'dimension' => $key,
                'title' => "Mettre à jour : {$label} — {$change->title}",
                'responsible_id' => $change->responsible_id,
                'due_date' => $dueDate,
            ]);
            $created++;
        }

        foreach (EnvironmentalAspect::query()->whereIn('id', $change->affected_aspect_ids ?? [])->get() as $aspect) {
            $aspect->forceFill([
                'needs_reassessment' => true,
                'reassessment_reason' => "Changement {$change->ref} : {$change->title}",
                'reassessment_flagged_at' => now(),
            ])->save();
        }

        $change->update($created === 0
            ? ['status' => 'implemented', 'implemented_at' => now()]
            : ['status' => 'implementing']);

        if ($created > 0 && $change->responsible_id && ($user = User::query()->find($change->responsible_id))) {
            $user->notify(new SiteEventNotification('change_tasks_created', [
                'title' => 'Tâches de mise à jour à réaliser',
                'message' => "{$created} tâche(s) ouverte(s) pour le changement {$change->ref} : {$change->title}.",
                'reference' => $change->ref,
                'url' => '/app/changements',
            ]));
        }
    }

    private function notifyApprovers(ManagementChange $change): void
    {
        foreach (User::query()->where('enterprise_id', $change->enterprise_id)->role('admin_entreprise')->get() as $user) {
            $user->notify(new SiteEventNotification('change_awaiting_approval', [
                'title' => 'Changement à approuver',
                'message' => "{$change->ref} — {$change->title} attend votre décision.",
                'reference' => $change->ref,
                'url' => '/app/changements',
            ]));
        }
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>|null
     */
    private function nonEmpty(array $values): ?array
    {
        $filled = array_filter($values, fn ($value) => filled($value));

        return $filled === [] ? null : $filled;
    }
}
