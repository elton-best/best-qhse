<?php

namespace App\Modules\Planning\Controllers;

use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Http\Controllers\Controller;
use App\Http\Resources\OpportunityResource;
use App\Modules\Planning\Models\Opportunity;
use App\Modules\Processes\Models\Process;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OpportunityController extends Controller
{
    use AuthorizesSiteAccess;

    public function index(Request $request)
    {
        $query = Opportunity::query()
            ->with(['site', 'process', 'responsible', 'responsibleUser', 'effectivenessReviewedBy']);
        $this->scopeToUserSites($request, $query);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        if ($request->filled('process_id')) {
            $query->where('process_id', $request->integer('process_id'));
        }

        if ($request->filled('status')) {
            $query->where('quality_status', (string) $request->string('status'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->string('search'));
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery
                    ->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('ref', 'like', "%{$search}%");
            });
        }

        return OpportunityResource::collection(
            $query->orderByDesc('created_at')
                ->orderByDesc('id')
                ->paginate(max(1, min(100, $request->integer('per_page', 100)))),
        );
    }

    public function store(Request $request)
    {
        $validated = $request->validate($this->rules());
        $process = Process::query()->findOrFail($validated['process_id']);
        $this->assertSiteAccess($request, (int) $process->site_id);

        $validated = $this->normalizePayload($validated, null, (int) $request->user()->id);
        $this->assertActionPlanForDecision($validated);
        $this->assertEffectivenessReviewComplete($validated);
        $this->assertEffectivenessForClosure($validated);
        $opportunity = Opportunity::query()->create($this->toModelAttributes(
            $validated,
            $process,
            (int) $request->user()->id,
        ));

        return new OpportunityResource($opportunity->load([
            'site',
            'process',
            'responsible',
            'responsibleUser',
            'effectivenessReviewedBy',
        ]));
    }

    public function show(Request $request, Opportunity $opportunity)
    {
        $this->assertSiteAccess($request, (int) $opportunity->site_id);

        return new OpportunityResource($opportunity->load([
            'site',
            'process',
            'responsible',
            'responsibleUser',
            'effectivenessReviewedBy',
        ]));
    }

    public function update(Request $request, Opportunity $opportunity)
    {
        $this->assertSiteAccess($request, (int) $opportunity->site_id);
        $validated = $request->validate($this->rules(false, $opportunity->opportunity_decision));
        $process = array_key_exists('process_id', $validated)
            ? Process::query()->findOrFail($validated['process_id'])
            : $opportunity->process;
        abort_unless($process, 404);
        $this->assertSiteAccess($request, (int) $process->site_id);

        $existingActions = is_array($opportunity->planned_actions) ? $opportunity->planned_actions : [];
        $validated = $this->normalizePayload(
            $validated,
            $existingActions,
            (int) $request->user()->id,
        );
        $this->assertActionPlanForDecision($validated, $opportunity);
        $this->assertEffectivenessReviewComplete($validated, $opportunity);
        $this->assertEffectivenessForClosure($validated, $opportunity);

        $opportunity->fill($this->toModelAttributes(
            $validated,
            $process,
            (int) $request->user()->id,
            $opportunity,
        ));
        $opportunity->save();

        return new OpportunityResource($opportunity->fresh()->load([
            'site',
            'process',
            'responsible',
            'responsibleUser',
            'effectivenessReviewedBy',
        ]));
    }

    public function destroy(Request $request, Opportunity $opportunity)
    {
        $this->assertSiteAccess($request, (int) $opportunity->site_id);
        $opportunity->delete();

        return response()->json(null, 204);
    }

    private function rules(bool $creating = true, ?string $currentDecision = null): array
    {
        $required = $creating ? 'required' : 'sometimes|required';
        $nullable = $creating ? 'nullable' : 'sometimes|nullable';
        $decision = request()->input('opportunity_decision', $currentDecision);
        $actionPlanRequired = $creating && $decision !== 'reject';
        $actionPlanMinimum = $decision !== 'reject' ? 'min:1' : null;
        $actionRules = [
            $actionPlanRequired ? 'required' : 'sometimes',
            'array',
        ];
        if ($actionPlanMinimum !== null) {
            $actionRules[] = $actionPlanMinimum;
        }

        return [
            'process_id' => [$required, 'integer', 'exists:processes,id'],
            'title' => [$required, 'string', 'max:255'],
            'description' => [$required, 'string', 'max:10000'],
            'source_category' => [
                $required,
                'in:contexte,parties_interessees,capacites,mesures,marche,technologie,reglementation,autre',
            ],
            'source_detail' => [$required, 'string', 'max:2000'],
            'assessment_method' => [$required, 'in:qualitative,quantitative'],
            'desired_effect' => [$required, 'string', 'max:2000'],
            'opportunity_decision' => [$required, 'in:retain,defer,reject'],
            'decision_rationale' => [$required, 'string', 'max:2000'],
            'responsible_user_id' => [$nullable, 'integer', 'exists:users,id'],
            'probabilite' => [$creating ? 'required' : 'sometimes|required', 'integer', 'min:1', 'max:4'],
            'gravite' => [$creating ? 'required' : 'sometimes|required', 'integer', 'min:1', 'max:4'],
            'probabilite_residuelle' => [$nullable, 'integer', 'min:1', 'max:4'],
            'gravite_residuelle' => [$nullable, 'integer', 'min:1', 'max:4'],
            'normes_iso' => [$nullable, 'array'],
            'normes_iso.*' => ['string', 'max:30'],
            'planned_actions' => $actionRules,
            'planned_actions.*.id' => ['nullable', 'string', 'max:100'],
            'planned_actions.*.title' => ['required', 'string', 'max:255'],
            'planned_actions.*.description' => ['nullable', 'string', 'max:2000'],
            'planned_actions.*.action_type' => ['nullable', 'in:preventive,corrective,control'],
            'planned_actions.*.responsible_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'planned_actions.*.implicated_user_ids' => ['nullable', 'array'],
            'planned_actions.*.implicated_user_ids.*' => ['integer', 'exists:users,id'],
            'planned_actions.*.deadline' => [$creating ? 'required' : 'nullable', 'date'],
            'planned_actions.*.implementation_status' => ['nullable', 'in:planned,in_progress,completed'],
            'planned_actions.*.effectiveness_result' => ['nullable', 'in:efficace,partiellement_efficace,non_efficace'],
            'planned_actions.*.effectiveness_review' => ['nullable', 'string', 'max:2000'],
            'planned_actions.*.effectiveness_review_date' => ['nullable', 'date', 'before_or_equal:today'],
            'effectiveness_result' => [$nullable, 'in:efficace,partiellement_efficace,non_efficace'],
            'effectiveness_review' => [$nullable, 'string', 'max:2000'],
            'effectiveness_review_date' => [$nullable, 'date', 'before_or_equal:today'],
            'target_date' => [$nullable, 'date'],
            'status' => [$creating ? 'required' : 'sometimes|required', 'in:identifie,en_cours,traite,surveille,cloture'],
        ];
    }

    private function normalizePayload(
        array $payload,
        ?array $existingActions,
        int $actorId,
    ): array {
        if (!array_key_exists('planned_actions', $payload)) {
            return $payload;
        }

        $existingById = collect($existingActions ?? [])
            ->filter(fn ($action) => is_array($action) && !empty($action['id']))
            ->keyBy(fn (array $action) => (string) $action['id']);
        $payload['planned_actions'] = array_values(array_map(
            function ($item) use ($existingById, $actorId): array {
                if (!is_array($item)) {
                    throw ValidationException::withMessages([
                        'planned_actions' => 'Chaque action doit être un objet valide.',
                    ]);
                }
                $existing = !empty($item['id'])
                    ? $existingById->get((string) $item['id'])
                    : null;
                $action = [
                    'id' => is_array($existing) && !empty($existing['id'])
                        ? (string) $existing['id']
                        : (string) Str::uuid(),
                    'title' => trim((string) $item['title']),
                    'description' => trim((string) ($item['description'] ?? '')),
                    'action_type' => $item['action_type'] ?? 'preventive',
                    'responsible_user_id' => $item['responsible_user_id'] ?? null,
                    'implicated_user_ids' => array_values($item['implicated_user_ids'] ?? []),
                    'deadline' => $item['deadline'] ?? null,
                    'implementation_status' => $item['implementation_status'] ?? 'planned',
                    'effectiveness_result' => $item['effectiveness_result'] ?? null,
                    'effectiveness_review' => trim((string) ($item['effectiveness_review'] ?? '')),
                    'effectiveness_review_date' => $item['effectiveness_review_date'] ?? null,
                ];
                $hasReview = $action['effectiveness_result'] !== null
                    || $action['effectiveness_review'] !== ''
                    || $action['effectiveness_review_date'] !== null;
                $reviewChanged = !is_array($existing)
                    || collect([
                        'effectiveness_result',
                        'effectiveness_review',
                        'effectiveness_review_date',
                    ])->contains(fn (string $field) =>
                        ($action[$field] ?? null) !== ($existing[$field] ?? null));
                if ($hasReview && $reviewChanged) {
                    $action['effectiveness_reviewed_by'] = $actorId;
                } elseif (is_array($existing) && !empty($existing['effectiveness_reviewed_by'])) {
                    $action['effectiveness_reviewed_by'] = $existing['effectiveness_reviewed_by'];
                }

                $this->assertActionReviewComplete($action);

                return $action;
            },
            $payload['planned_actions'],
        ));

        return $payload;
    }

    private function toModelAttributes(
        array $payload,
        Process $process,
        int $actorId,
        ?Opportunity $existing = null,
    ): array {
        $attributes = [];
        $fieldMap = [
            'title' => 'title',
            'description' => 'description',
            'source_category' => 'source_category',
            'source_detail' => 'source_detail',
            'assessment_method' => 'assessment_method',
            'desired_effect' => 'desired_effect',
            'opportunity_decision' => 'opportunity_decision',
            'decision_rationale' => 'decision_rationale',
            'probabilite' => 'probabilite',
            'gravite' => 'gravite',
            'probabilite_residuelle' => 'probabilite_residuelle',
            'gravite_residuelle' => 'gravite_residuelle',
            'normes_iso' => 'normes_iso',
            'planned_actions' => 'planned_actions',
            'effectiveness_result' => 'effectiveness_result',
            'effectiveness_review' => 'effectiveness_review',
            'effectiveness_review_date' => 'effectiveness_review_date',
        ];

        foreach ($fieldMap as $input => $attribute) {
            if (array_key_exists($input, $payload)) {
                $attributes[$attribute] = $payload[$input];
            }
        }

        $attributes['process_id'] = $process->id;
        $attributes['site_id'] = $process->site_id;
        $attributes['enterprise_id'] = $process->enterprise_id
            ?? $process->site?->enterprise_id;

        if (array_key_exists('planned_actions', $payload)) {
            $attributes['exploitation_actions'] = collect($payload['planned_actions'])
                ->pluck('title')
                ->implode("\n");
        }

        if (array_key_exists('target_date', $payload)) {
            $attributes['deadline'] = $payload['target_date'];
        }

        if (array_key_exists('status', $payload)) {
            $attributes['quality_status'] = $payload['status'];
            $attributes['status'] = match ($payload['status']) {
                'en_cours' => 'evaluated',
                'traite' => 'exploited',
                'surveille', 'cloture' => 'monitored',
                default => 'identified',
            };
        } elseif (!$existing) {
            $attributes['quality_status'] = 'identifie';
            $attributes['status'] = 'identified';
        }

        if (array_key_exists('normes_iso', $payload)) {
            $attributes['applicable_norms'] = $payload['normes_iso'];
        }

        $probability = $attributes['probabilite'] ?? $existing?->probabilite;
        $gravity = $attributes['gravite'] ?? $existing?->gravite;
        if ($probability !== null && $gravity !== null) {
            $criticality = (int) $probability * (int) $gravity;
            $attributes['criticite'] = $criticality;
            $attributes['niveau'] = match (true) {
                $criticality >= 12 => 'critique',
                $criticality >= 8 => 'eleve',
                $criticality >= 4 => 'moyen',
                default => 'faible',
            };
        }

        $residualProbability = array_key_exists('probabilite_residuelle', $attributes)
            ? $attributes['probabilite_residuelle']
            : $existing?->probabilite_residuelle;
        $residualGravity = array_key_exists('gravite_residuelle', $attributes)
            ? $attributes['gravite_residuelle']
            : $existing?->gravite_residuelle;
        if ($residualProbability !== null && $residualGravity !== null) {
            $attributes['criticite_residuelle'] =
                (int) $residualProbability * (int) $residualGravity;
        } elseif (
            array_key_exists('probabilite_residuelle', $attributes)
            || array_key_exists('gravite_residuelle', $attributes)
        ) {
            $attributes['criticite_residuelle'] = null;
        }

        if (array_key_exists('effectiveness_result', $payload)
            || array_key_exists('effectiveness_review', $payload)
            || array_key_exists('effectiveness_review_date', $payload)) {
            $hasReview = !empty($payload['effectiveness_result'])
                || !empty($payload['effectiveness_review'])
                || !empty($payload['effectiveness_review_date']);
            $reviewChanged = !$existing
                || collect([
                    'effectiveness_result',
                    'effectiveness_review',
                    'effectiveness_review_date',
                ])->contains(fn (string $field) =>
                    array_key_exists($field, $payload)
                    && $this->canonicalReviewValue($field, $payload[$field])
                        !== $this->canonicalReviewValue($field, $existing->{$field}));
            if ($hasReview && $reviewChanged) {
                $attributes['effectiveness_reviewed_by'] = $actorId;
            } elseif ($existing) {
                $attributes['effectiveness_reviewed_by'] = $existing->effectiveness_reviewed_by;
            } else {
                $attributes['effectiveness_reviewed_by'] = null;
            }
        }

        if (!$existing) {
            $attributes['created_by'] = $actorId;
        }

        if (array_key_exists('responsible_user_id', $payload)) {
            $attributes['responsible_user_id'] = $payload['responsible_user_id'];
            $attributes['responsible_id'] = $payload['responsible_user_id'];
        }

        return $attributes;
    }

    private function canonicalReviewValue(string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($field === 'effectiveness_review_date') {
            return $value instanceof \DateTimeInterface
                ? $value->format('Y-m-d')
                : (string) $value;
        }

        return is_string($value) ? trim($value) : (string) $value;
    }

    private function assertActionPlanForDecision(
        array $payload,
        ?Opportunity $existing = null,
    ): void {
        $decision = $payload['opportunity_decision'] ?? $existing?->opportunity_decision;
        if ($decision === 'reject') {
            return;
        }

        $actions = $payload['planned_actions'] ?? $existing?->planned_actions ?? [];
        if (!is_array($actions) || $actions === []) {
            throw ValidationException::withMessages([
                'planned_actions' => 'Une opportunité retenue ou différée doit comporter au moins une action d’exploitation.',
            ]);
        }
    }

    private function assertActionReviewComplete(array $action): void
    {
        $hasReview = !empty($action['effectiveness_result'])
            || !empty($action['effectiveness_review'])
            || !empty($action['effectiveness_review_date']);

        if (!$hasReview) {
            return;
        }

        foreach (['effectiveness_result', 'effectiveness_review', 'effectiveness_review_date'] as $field) {
            if (empty($action[$field])) {
                throw ValidationException::withMessages([
                    "planned_actions.{$field}" => 'Un résultat, une preuve et une date sont requis pour évaluer l’efficacité.',
                ]);
            }
        }

        if ($action['implementation_status'] !== 'completed') {
            throw ValidationException::withMessages([
                'planned_actions.implementation_status' => 'Une action doit être terminée avant l’évaluation de son efficacité.',
            ]);
        }
    }

    private function assertEffectivenessReviewComplete(
        array $payload,
        ?Opportunity $existing = null,
    ): void {
        $result = array_key_exists('effectiveness_result', $payload)
            ? $payload['effectiveness_result']
            : $existing?->effectiveness_result;
        $review = array_key_exists('effectiveness_review', $payload)
            ? $payload['effectiveness_review']
            : $existing?->effectiveness_review;
        $date = array_key_exists('effectiveness_review_date', $payload)
            ? $payload['effectiveness_review_date']
            : $existing?->effectiveness_review_date;
        $hasAny = !empty($result) || !empty($review) || !empty($date);

        if ($hasAny && (empty($result) || empty($review) || empty($date))) {
            throw ValidationException::withMessages([
                'effectiveness_review' => 'Le résultat, la preuve et la date de l’évaluation d’efficacité sont tous requis.',
            ]);
        }
    }

    private function assertEffectivenessForClosure(
        array $payload,
        ?Opportunity $existing = null,
    ): void {
        $status = array_key_exists('status', $payload)
            ? $payload['status']
            : ($existing?->quality_status ?? 'identifie');
        $decision = array_key_exists('opportunity_decision', $payload)
            ? $payload['opportunity_decision']
            : $existing?->opportunity_decision;
        if ($status !== 'cloture' || $decision === 'reject') {
            return;
        }

        $result = array_key_exists('effectiveness_result', $payload)
            ? $payload['effectiveness_result']
            : $existing?->effectiveness_result;
        $review = array_key_exists('effectiveness_review', $payload)
            ? $payload['effectiveness_review']
            : $existing?->effectiveness_review;
        $date = array_key_exists('effectiveness_review_date', $payload)
            ? $payload['effectiveness_review_date']
            : $existing?->effectiveness_review_date;
        $actions = array_key_exists('planned_actions', $payload)
            ? $payload['planned_actions']
            : ($existing?->planned_actions ?? []);

        if ($result !== 'efficace' || empty($review) || empty($date)) {
            throw ValidationException::withMessages([
                'effectiveness_result' => 'Une opportunité traitée ne peut être clôturée sans évaluation d’efficacité efficace, datée et justifiée.',
            ]);
        }

        foreach ($actions as $index => $action) {
            if (
                ($action['implementation_status'] ?? null) !== 'completed'
                || ($action['effectiveness_result'] ?? null) !== 'efficace'
                || empty($action['effectiveness_review'])
                || empty($action['effectiveness_review_date'])
            ) {
                throw ValidationException::withMessages([
                    "planned_actions.{$index}.effectiveness_result" => 'Chaque action doit être terminée et évaluée efficace avec une preuve datée avant la clôture.',
                ]);
            }
        }
    }
}
