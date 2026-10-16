<?php

namespace App\Modules\Improvement\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Improvement\Models\Action;
use App\Modules\Improvement\Models\NonConformity;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Traitement d'une non-conformité selon ISO 14001:2026 §10.2 : déclaration rapide par tout utilisateur, traitement immédiat,
 * décision proportionnée, analyse des causes guidée, plan correctif, mise à jour du SME et tableau de bord.
 */
class NonConformityHandlingController extends Controller
{
    use ScopesToUserTenant;

    public const REPORT_SOURCES = ['audit', 'inspection', 'compliance_evaluation', 'complaint', 'incident', 'report'];

    private const PHOTO_DISK = 'local';

    /** @var array<string, array{type: string, source: string, detection: string}> */
    private const SOURCE_MAP = [
        'audit' => ['type' => 'normative', 'source' => 'audit', 'detection' => 'internal_audit'],
        'inspection' => ['type' => 'procedural', 'source' => 'internal', 'detection' => 'internal_control'],
        'compliance_evaluation' => ['type' => 'regulatory', 'source' => 'internal', 'detection' => 'internal_control'],
        'complaint' => ['type' => 'contractual', 'source' => 'complaint', 'detection' => 'customer_complaint'],
        'incident' => ['type' => 'procedural', 'source' => 'internal', 'detection' => 'other'],
        'report' => ['type' => 'procedural', 'source' => 'internal', 'detection' => 'other'],
    ];

    private function nc(Request $request, int $id): NonConformity
    {
        $this->assertTenant($request);
        $nc = NonConformity::query()->findOrFail($id);
        $enterpriseId = Site::query()->withoutGlobalScopes()->where('id', $nc->site_id)->value('enterprise_id');
        abort_unless((int) $enterpriseId === (int) $request->user()->enterprise_id, 404, 'Non-conformité introuvable.');

        return $nc;
    }

    private function assertOpen(NonConformity $nc): void
    {
        abort_if(in_array($nc->status, ['closed'], true) || $nc->workflowState?->code === 'closed', 422, 'Cette non-conformité est clôturée.');
    }

    // ------------------------------------------------------------------ M17-01 déclaration rapide

    /**
     * @return array<string, mixed>
     */
    private function declarationRules(): array
    {
        return [
            'site_id' => 'nullable|integer',
            'process_id' => 'nullable|integer',
            'report_source' => 'required|in:'.implode(',', self::REPORT_SOURCES),
            'description' => 'required|string|min:10|max:5000',
            'location' => 'nullable|string|max:255',
            'occurred_at' => 'nullable|date|before_or_equal:today',
            'severity' => 'nullable|in:minor,major,critical',
            'environmental_impact' => 'nullable|boolean',
            'client_uuid' => 'nullable|string|max:64',
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<int, string>  $photos
     */
    private function declare(Request $request, array $data, array $photos): NonConformity
    {
        if (! empty($data['client_uuid']) && ($existing = NonConformity::query()->where('client_uuid', $data['client_uuid'])->first())) {
            return $existing;
        }
        $site = $this->resolveSite($request, isset($data['site_id']) ? (int) $data['site_id'] : null);
        $this->assertOwnedByEnterprise(['process_id' => ['table' => 'processes', 'column' => 'enterprise_id']], $data, (int) $site->enterprise_id);
        $map = self::SOURCE_MAP[$data['report_source']];
        $severity = $data['severity'] ?? 'minor';

        return NonConformity::create([
            'site_id' => $site->id, 'process_id' => $data['process_id'] ?? null,
            'title' => Str::limit(trim(preg_replace('/\s+/', ' ', $data['description'])), 90, '…'),
            'finding_type' => 'non_conformity', 'type' => $map['type'], 'source' => $map['source'], 'detection_source' => $map['detection'],
            'severity' => $severity, 'priority' => ['minor' => 'low', 'major' => 'high', 'critical' => 'critical'][$severity],
            'description' => $data['description'], 'detected_by' => $request->user()->id, 'detected_at' => $data['occurred_at'] ?? today()->toDateString(),
            'report_source' => $data['report_source'], 'location' => $data['location'] ?? null, 'photos' => $photos === [] ? null : $photos,
            'client_uuid' => $data['client_uuid'] ?? null, 'environmental_impact' => (bool) ($data['environmental_impact'] ?? false), 'status' => 'open',
        ]);
    }

    public function quickDeclare(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate($this->declarationRules() + ['photos' => 'nullable|array|max:5', 'photos.*' => 'image|max:5120']);
        $paths = [];
        foreach ($request->file('photos', []) as $photo) {
            $paths[] = ['path' => $photo->store('nc-photos/'.$request->user()->enterprise_id, self::PHOTO_DISK), 'name' => $photo->getClientOriginalName()];
        }
        $nc = $this->declare($request, $data, $paths);

        return response()->json(['data' => $nc], $nc->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Synchronisation d'une file de déclarations saisies hors connexion (sans photo) : idempotente.
     */
    public function quickDeclareBatch(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $request->validate(['items' => 'required|array|min:1|max:50', 'items.*.client_uuid' => 'required|string|max:64']);
        $results = [];
        foreach ($request->input('items') as $item) {
            try {
                $data = validator($item, $this->declarationRules())->validate();
                $nc = $this->declare($request, $data, []);
                $results[] = ['client_uuid' => $item['client_uuid'], 'status' => $nc->wasRecentlyCreated ? 'created' : 'exists', 'id' => $nc->id, 'ref' => $nc->ref];
            } catch (ValidationException $e) {
                $results[] = ['client_uuid' => $item['client_uuid'], 'status' => 'rejected', 'message' => collect($e->errors())->flatten()->first()];
            } catch (HttpResponseException|HttpException $e) {
                $results[] = ['client_uuid' => $item['client_uuid'], 'status' => 'rejected', 'message' => $e instanceof HttpResponseException ? 'Site ou référence non autorisé.' : $e->getMessage()];
            }
        }

        return response()->json(['data' => $results]);
    }

    public function photo(Request $request, int $id, int $index): StreamedResponse
    {
        $nc = $this->nc($request, $id);
        $photo = ($nc->photos ?? [])[$index] ?? null;
        abort_unless($photo && Storage::disk(self::PHOTO_DISK)->exists($photo['path']), 404, 'Photo introuvable.');

        return Storage::disk(self::PHOTO_DISK)->download($photo['path'], $photo['name']);
    }

    // ------------------------------------------------------------------ M17-02 traitement immédiat

    public function immediateTreatment(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);
        $this->assertOpen($nc);
        $data = $request->validate([
            'immediate_action' => 'required|string|min:10',
            'consequences_treatment' => 'nullable|string',
            'impact_mitigation' => ($nc->environmental_impact ? 'required' : 'nullable').'|string|min:10',
        ], ['impact_mitigation.required' => 'Une non-conformité à impact environnemental exige les mesures d\'atténuation de cet impact.']);

        $nc->update($data + ['immediate_action_at' => now(), 'immediate_action_by' => $request->user()->id]);

        return response()->json(['data' => $nc->fresh()]);
    }

    // ------------------------------------------------------------------ M17-03 décision et analyse des causes

    /**
     * Décision de mener ou non une action corrective. Une non-conformité majeure ou critique ne peut pas être écartée.
     */
    public function decide(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);
        $this->assertOpen($nc);
        $data = $request->validate(['decision' => 'required|in:required,not_required', 'justification' => 'required_if:decision,not_required|nullable|string|min:10']);
        if ($data['decision'] === 'not_required') {
            abort_if($nc->severity !== 'minor', 422, 'Une non-conformité majeure ou critique exige une action corrective : la décision doit être proportionnée à ses effets.');
            abort_if($nc->actions()->whereNotIn('status', ['cancelled'])->exists(), 422, 'Des actions sont déjà liées à cette non-conformité.');
        }

        $nc->update(['corrective_decision' => $data['decision'], 'decision_justification' => $data['justification'] ?? null, 'decided_by' => $request->user()->id, 'decided_at' => now()]);

        return response()->json(['data' => $nc->fresh()]);
    }

    /**
     * Non-conformités similaires déjà enregistrées (24 mois) pour juger de la récurrence.
     */
    public function similar(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);

        return response()->json(['data' => $this->similarTo($nc)]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function similarTo(NonConformity $nc): array
    {
        $siteIds = Site::query()->withoutGlobalScopes()->where('enterprise_id', Site::query()->withoutGlobalScopes()->where('id', $nc->site_id)->value('enterprise_id'))->pluck('id');
        $words = collect(preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($nc->title.' '.$nc->requirement_reference)))
            ->filter(fn ($w) => mb_strlen($w) >= 5)->unique()->values();

        return NonConformity::query()->withoutGlobalScopes()->whereIn('site_id', $siteIds)->where('id', '!=', $nc->id)
            ->where('created_at', '>=', now()->subMonths(24))->orderByDesc('id')->limit(300)->get(['id', 'ref', 'title', 'process_id', 'requirement_reference', 'status', 'severity', 'created_at'])
            ->map(function (NonConformity $other) use ($nc, $words) {
                $otherWords = collect(preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($other->title.' '.$other->requirement_reference)))->filter(fn ($w) => mb_strlen($w) >= 5);
                $shared = $words->intersect($otherWords)->count();
                $score = $shared * 2 + ($nc->process_id && $nc->process_id === $other->process_id ? 3 : 0)
                    + ($nc->requirement_reference && $nc->requirement_reference === $other->requirement_reference ? 4 : 0);

                return ['id' => $other->id, 'ref' => $other->ref, 'title' => $other->title, 'status' => $other->status, 'severity' => $other->severity, 'date' => $other->created_at->toDateString(), 'score' => $score];
            })->filter(fn (array $row) => $row['score'] >= 4)->sortByDesc('score')->take(10)->values()->all();
    }

    /**
     * Analyse des causes guidée : 5 pourquoi ou diagramme causes-effets (6M). La récurrence est évaluée à l'enregistrement.
     */
    public function rootCause(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);
        $this->assertOpen($nc);
        abort_if($nc->corrective_decision === 'not_required', 422, 'Aucune action corrective n\'est décidée : pas d\'analyse des causes à mener.');
        $data = $request->validate([
            'method' => 'required|in:five_why,cause_effect',
            'root_cause' => 'required|string|min:10',
            'five_whys' => 'required_if:method,five_why|nullable|array|min:3|max:7',
            'five_whys.*.why' => 'required|string|max:500',
            'five_whys.*.answer' => 'required|string|max:1000',
            'cause_effect' => 'required_if:method,cause_effect|nullable|array',
            'cause_effect.*' => 'array',
            'cause_effect.*.*' => 'string|max:500',
        ], ['five_whys.min' => 'Descendez d\'au moins trois « pourquoi » avant de conclure.']);
        if ($data['method'] === 'cause_effect') {
            $categories = array_keys(array_filter($data['cause_effect'] ?? [], fn ($items) => ! empty($items)));
            abort_if($categories === [], 422, 'Renseignez au moins une cause dans une des catégories (méthodes, matériel, main-d\'œuvre, matières, milieu, mesure).');
            $unknown = array_diff($categories, ['methods', 'machines', 'manpower', 'materials', 'environment', 'measurement']);
            abort_if($unknown !== [], 422, 'Catégorie inconnue : '.implode(', ', $unknown));
        }

        $similar = $this->similarTo($nc);
        $recent = array_filter($similar, fn (array $row) => Carbon::parse($row['date'])->gte(now()->subMonths(12)));
        $nc->update([
            'root_cause_method' => $data['method'], 'root_cause_analysis' => ['text' => $data['root_cause']],
            'five_whys' => $data['method'] === 'five_why' ? $data['five_whys'] : null,
            'cause_effect' => $data['method'] === 'cause_effect' ? $data['cause_effect'] : null,
            'similar_ids' => array_column($similar, 'id'), 'is_recurrent' => $recent !== [],
        ]);

        return response()->json(['data' => $nc->fresh(), 'similar' => $similar]);
    }

    // ------------------------------------------------------------------ M17-04 plan correctif et mise à jour du SME

    public function correctivePlan(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);
        $this->assertOpen($nc);
        abort_unless($nc->corrective_decision === 'required', 422, 'Décidez d\'abord de mener une action corrective.');
        abort_if($nc->root_cause_method === null, 422, 'Analysez d\'abord les causes de la non-conformité.');
        $data = $request->validate([
            'responsible_id' => 'required|integer', 'deadline' => 'required|date|after_or_equal:today', 'description' => 'required|string|min:10',
            'resources_needed' => 'nullable|string', 'sme_update_required' => 'nullable|boolean', 'sme_update_note' => 'required_if:sme_update_required,true|nullable|string|min:10',
        ]);
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, (int) $request->user()->enterprise_id);

        $action = DB::transaction(function () use ($nc, $data, $request) {
            $action = Action::create([
                'enterprise_id' => $request->user()->enterprise_id, 'site_id' => $nc->site_id, 'process_id' => $nc->process_id, 'type' => 'corrective',
                'priority' => ['minor' => 'low', 'major' => 'high', 'critical' => 'critical'][$nc->severity] ?? 'medium',
                'title' => 'Action corrective — '.Str::limit($nc->title, 100), 'description' => $data['description'], 'source' => 'non_conformity',
                'source_type' => 'non_conformity', 'source_id' => $nc->id, 'source_ref' => $nc->ref, 'non_conformity_id' => $nc->id,
                'initiator_id' => $request->user()->id, 'responsible_id' => $data['responsible_id'], 'deadline' => $data['deadline'],
                'required_resources' => $data['resources_needed'] ?? null, 'status' => 'planned',
            ]);
            $nc->addAction($action);
            $nc->update([
                'responsible_id' => $data['responsible_id'], 'deadline' => $data['deadline'], 'resources_needed' => $data['resources_needed'] ?? null,
                'sme_update_required' => (bool) ($data['sme_update_required'] ?? false), 'sme_update_note' => $data['sme_update_note'] ?? null, 'sme_update_done' => false,
            ]);

            return $action;
        });

        return response()->json(['data' => ['action_id' => $action->id, 'action_ref' => $action->ref]], 201);
    }

    public function smeUpdateDone(Request $request, int $id): JsonResponse
    {
        $nc = $this->nc($request, $id);
        abort_unless($nc->sme_update_required, 422, 'Aucune mise à jour du système n\'est demandée pour cette non-conformité.');
        $nc->update(['sme_update_done' => true]);

        return response()->json(['data' => $nc->fresh()]);
    }

    // ------------------------------------------------------------------ M17-07 tableau de bord

    public function dashboard(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $sites = Site::query()->withoutGlobalScopes()->where('enterprise_id', $enterpriseId)->pluck('name', 'id');
        if ($request->filled('site_id')) {
            $sites = $sites->only([(int) $this->resolveSite($request, $request->integer('site_id'))->id]);
        }
        $range = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from']);
        $from = Carbon::parse($range['from'] ?? now()->subYear())->startOfDay();
        $to = Carbon::parse($range['to'] ?? now())->endOfDay();

        $all = NonConformity::query()->withoutGlobalScopes()->whereIn('site_id', $sites->keys())->whereBetween('created_at', [$from, $to])->get();
        $closed = $all->filter(fn (NonConformity $nc) => $nc->resolution_date !== null);
        $open = $all->reject(fn (NonConformity $nc) => $nc->resolution_date !== null || $nc->corrective_decision === 'not_required');
        $delays = $closed->map(fn (NonConformity $nc) => $nc->created_at->diffInDays($nc->resolution_date));
        $sourceOf = fn (NonConformity $nc) => $nc->report_source ?? match ($nc->detection_source) {
            'internal_audit', 'external_audit' => 'audit', 'customer_complaint' => 'complaint', 'internal_control' => 'inspection', 'management_review' => 'review', default => 'report',
        };

        return response()->json(['data' => [
            'total' => $all->count(), 'open' => $open->count(), 'closed' => $closed->count(),
            'overdue' => $open->filter(fn (NonConformity $nc) => $nc->deadline?->isPast())->count(),
            'average_closure_days' => $delays->isEmpty() ? null : round($delays->avg(), 1),
            'recurrent' => $all->where('is_recurrent', true)->count(),
            'recurrence_rate' => $all->isEmpty() ? null : round($all->where('is_recurrent', true)->count() / $all->count() * 100, 1),
            'effectiveness_pending' => $open->filter(fn (NonConformity $nc) => $nc->corrective_decision === 'required' && ! $nc->effectiveness_verified)->count(),
            'not_required' => $all->where('corrective_decision', 'not_required')->count(),
            'by_source' => $all->groupBy($sourceOf)->map->count()->all(),
            'by_severity' => $all->groupBy('severity')->map->count()->all(),
            'by_site' => $all->groupBy('site_id')->map(fn ($rows, $siteId) => ['site' => $sites[$siteId] ?? $siteId, 'total' => $rows->count(), 'open' => $rows->whereNull('resolution_date')->count()])->values()->all(),
        ]]);
    }
}
