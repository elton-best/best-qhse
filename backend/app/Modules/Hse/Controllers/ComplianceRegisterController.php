<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\ComplianceEvaluation;
use App\Modules\Hse\Models\ComplianceObligationText;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\ComplianceWatchService;
use App\Modules\Improvement\Models\NonConformity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Registre de conformité — applicabilité, évaluations, veille, accords et tableau de bord
 * (ISO 14001:2026 §6.1.3 et §9.1.2).
 */
class ComplianceRegisterController extends Controller
{
    use ScopesToUserTenant;

    private const FREQUENCY_MONTHS = ['monthly' => 1, 'quarterly' => 3, 'semiannual' => 6, 'annual' => 12];

    /**
     * M5-02 — Détermination de l'applicabilité, toujours justifiée.
     */
    public function applicability(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $text = ComplianceObligationText::query()->findOrFail($id);
        $data = $request->validate([
            'is_applicable' => 'required|boolean',
            'justification' => 'required|string|min:5|max:2000',
        ]);

        $text->forceFill([
            'is_applicable' => $data['is_applicable'],
            'applicability_justification' => $data['justification'],
            'applicability_decided_by' => $request->user()->id,
            'applicability_decided_at' => now(),
            'compliance_status' => $data['is_applicable']
                ? ($text->last_evaluation_date ? $text->compliance_status : 'not_evaluated')
                : 'not_applicable',
        ])->save();

        return response()->json(['success' => true, 'data' => $this->summary($text->fresh())]);
    }

    /**
     * M5-03 — Historique des évaluations d'une obligation.
     */
    public function evaluations(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $text = ComplianceObligationText::query()->findOrFail($id);

        return response()->json(['success' => true, 'data' => $text->evaluations()->with('evaluator:id,name')->get()]);
    }

    /**
     * M5-03 / M5-04 — Évaluation périodique avec preuve ; un écart ouvre une non-conformité (M17)
     * ou, s'il est déjà corrigé par le système, une fiche « écart traité ».
     */
    public function evaluate(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $text = ComplianceObligationText::query()->findOrFail($id);
        abort_if(
            $text->is_applicable !== true,
            422,
            $text->is_applicable === false
                ? "Cette obligation est déclarée non applicable : aucune évaluation n'est attendue."
                : "Déterminez d'abord l'applicabilité de l'obligation avant de l'évaluer.",
        );

        $data = $request->validate([
            'result' => ['required', Rule::in(['compliant', 'partial', 'non_compliant'])],
            'evaluated_at' => 'nullable|date|before_or_equal:today',
            'method' => 'nullable|string|max:255',
            'evidence' => 'nullable|string|max:5000',
            'evidence_file' => 'nullable|file|mimes:pdf,jpg,jpeg,png,doc,docx,xls,xlsx|max:10240',
            'external' => 'nullable|boolean',
            'external_body' => 'required_if_accepted:external|nullable|string|max:255',
            'comment' => 'nullable|string|max:5000',
            'gap_already_treated' => 'nullable|boolean',
        ]);
        abort_if(
            $data['result'] === 'compliant' && blank($data['evidence'] ?? null) && ! $request->hasFile('evidence_file'),
            422,
            'Une preuve (description ou fichier) est exigée pour déclarer une obligation conforme.',
        );

        $evaluation = DB::transaction(function () use ($data, $request, $text) {
            $date = isset($data['evaluated_at']) ? Carbon::parse($data['evaluated_at']) : today();
            $path = $request->hasFile('evidence_file')
                ? $request->file('evidence_file')->store("compliance-evidence/{$text->enterprise_id}", 'local')
                : null;

            $evaluation = ComplianceEvaluation::create([
                'enterprise_id' => $text->enterprise_id,
                'site_id' => $text->site_id,
                'text_id' => $text->id,
                'evaluated_at' => $date,
                'evaluator_id' => $request->user()->id,
                'result' => $data['result'],
                'method' => $data['method'] ?? null,
                'evidence' => $data['evidence'] ?? null,
                'evidence_path' => $path,
                'external' => (bool) ($data['external'] ?? false),
                'external_body' => $data['external_body'] ?? null,
                'comment' => $data['comment'] ?? null,
            ]);

            $months = self::FREQUENCY_MONTHS[$text->evaluation_frequency] ?? null;
            $text->forceFill([
                'compliance_status' => $data['result'],
                'last_evaluation_date' => $date,
                'next_evaluation_date' => $months ? $date->copy()->addMonthsNoOverflow($months) : null,
            ])->save();

            if ($data['result'] === 'non_compliant') {
                $treated = (bool) ($data['gap_already_treated'] ?? false);
                $nonConformity = NonConformity::create([
                    'site_id' => $text->site_id,
                    'title' => ($treated ? 'Écart traité — ' : 'Non-conformité réglementaire — ').($text->title ?: $text->regulatory_reference),
                    'finding_type' => $treated ? 'gap' : 'non_conformity',
                    'type' => 'legal',
                    'source' => 'internal',
                    'detection_source' => 'internal_control',
                    'severity' => 'major',
                    'priority' => 'high',
                    'status' => $treated ? 'resolved' : 'open',
                    'description' => trim("Évaluation de conformité {$date->format('d/m/Y')} de l'obligation {$text->ref}. ".($data['comment'] ?? '')),
                    'detected_by' => $request->user()->id,
                    'detected_at' => $date->toDateString(),
                    'requirement_reference' => $text->regulatory_reference,
                    'responsible_id' => $text->responsible_id,
                ]);
                $evaluation->forceFill([
                    'gap_status' => $treated ? 'gap_treated' : 'nc_opened',
                    'nonconformity_id' => $nonConformity->id,
                ])->saveQuietly();
            }

            return $evaluation;
        });

        return response()->json([
            'success' => true,
            'data' => [
                'evaluation' => $evaluation->fresh('evaluator:id,name'),
                'obligation' => $this->summary($text->fresh()),
            ],
        ], 201);
    }

    public function downloadEvidence(Request $request, int $evaluationId): StreamedResponse
    {
        $this->assertTenant($request);
        $evaluation = ComplianceEvaluation::query()->findOrFail($evaluationId);
        abort_unless($evaluation->evidence_path && Storage::disk('local')->exists($evaluation->evidence_path), 404, 'Aucun fichier de preuve.');

        return Storage::disk('local')->download($evaluation->evidence_path);
    }

    /**
     * M5-08 — Conclusion de l'analyse d'impact d'un texte nouveau ou modifié ; les aspects concernés
     * sont signalés « à réévaluer » (M4-08).
     */
    public function analysis(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $text = ComplianceObligationText::query()->with('environmentalAspects')->findOrFail($id);
        $data = $request->validate(['note' => 'required|string|min:10|max:5000']);

        $flagged = DB::transaction(function () use ($text, $data, $request) {
            $text->forceFill([
                'analysis_status' => 'analyzed',
                'analysis_note' => $data['note'],
                'analyzed_by' => $request->user()->id,
                'analyzed_at' => now(),
            ])->save();

            $count = 0;
            foreach ($text->environmentalAspects->where('status', '!=', 'archived') as $aspect) {
                $aspect->forceFill([
                    'needs_reassessment' => true,
                    'reassessment_reason' => "Nouvelle obligation : {$text->ref} — ".($text->title ?: $text->regulatory_reference),
                    'reassessment_flagged_at' => now(),
                ])->save();
                $count++;
            }

            return $count;
        });

        return response()->json(['success' => true, 'data' => ['obligation' => $this->summary($text->fresh()), 'aspects_flagged' => $flagged]]);
    }

    /**
     * M5-05 — Un plan d'actions convenu avec un organisme de réglementation devient lui-même
     * une obligation de conformité suivie.
     */
    public function agreementPlan(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $parent = ComplianceObligationText::query()->findOrFail($id);
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'authority' => 'nullable|string|max:255',
            'expiry_date' => 'nullable|date',
            'responsible_id' => 'nullable|integer',
            'evaluation_frequency' => 'nullable|in:monthly,quarterly,semiannual,annual,on_demand',
            'actions' => 'required|array|min:1',
            'actions.*.title' => 'required|string|max:1000',
            'actions.*.due_date' => 'nullable|date',
            'actions.*.responsible_id' => 'nullable|integer',
        ]);
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, (int) $parent->enterprise_id);

        $child = DB::transaction(function () use ($parent, $data, $request) {
            $child = ComplianceObligationText::create([
                'aspect_id' => $parent->aspect_id,
                'ref' => $this->nextRef(),
                'title' => $data['title'],
                'source_type' => 'agreement',
                'authority' => $data['authority'] ?? $parent->authority,
                'regulatory_reference' => $data['title'],
                'description' => "Plan d'actions convenu avec l'organisme de réglementation, rattaché à {$parent->ref}.",
                'expiry_date' => $data['expiry_date'] ?? null,
                'responsible_id' => $data['responsible_id'] ?? $parent->responsible_id,
                'evaluation_frequency' => $data['evaluation_frequency'] ?? 'quarterly',
                'compliance_status' => 'not_evaluated',
                'validity_status' => 'in_force',
                'is_applicable' => true,
                'applicability_justification' => "Engagement pris auprès de l'organisme de réglementation.",
                'applicability_decided_by' => $request->user()->id,
                'applicability_decided_at' => now(),
                'agreement_parent_id' => $parent->id,
            ]);
            foreach ($data['actions'] as $action) {
                $child->actions()->create([
                    'title' => $action['title'],
                    'due_date' => $action['due_date'] ?? null,
                    'responsible_id' => $action['responsible_id'] ?? $child->responsible_id,
                    'status' => 'pending',
                ]);
            }

            return $child;
        });

        return response()->json(['success' => true, 'data' => $this->summary($child->load('actions'))], 201);
    }

    /**
     * M5-06 — Permis, licences et autorisations triés par échéance.
     */
    public function expirations(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = ComplianceObligationText::query()->whereNotNull('expiry_date')->orderBy('expiry_date');
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        $rows = $query->get()->map(fn (ComplianceObligationText $text) => $this->summary($text) + [
            'days_left' => (int) today()->diffInDays($text->expiry_date, false),
            'bucket' => ComplianceWatchService::expiryBucket($text->expiry_date),
        ]);

        return response()->json(['success' => true, 'data' => $rows->values()]);
    }

    /**
     * M5-07 — Tableau de bord de conformité par site, par domaine et par échéance.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = ComplianceObligationText::query()->with(['site:id,name', 'aspect:id,name'])
            ->where(fn ($inner) => $inner->where('validity_status', '!=', 'obsolete')->orWhereNull('validity_status'));
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        $all = $query->get();

        $applicable = $all->filter(fn ($t) => $t->is_applicable === true);
        $evaluated = $applicable->whereNotNull('last_evaluation_date');
        $rateOf = fn ($collection) => $collection->isEmpty()
            ? null
            : (int) round($collection->where('compliance_status', 'compliant')->count() / $collection->count() * 100);

        $group = fn ($collection, callable $key) => $collection->groupBy($key)->map(fn ($items, $name) => [
            'name' => $name,
            'total' => $items->count(),
            'applicable' => $items->filter(fn ($t) => $t->is_applicable === true)->count(),
            'non_compliant' => $items->where('compliance_status', 'non_compliant')->count(),
            'rate' => $rateOf($items->filter(fn ($t) => $t->is_applicable === true)->whereNotNull('last_evaluation_date')),
        ])->values();

        return response()->json(['success' => true, 'data' => [
            'total' => $all->count(),
            'applicable' => $applicable->count(),
            'not_applicable' => $all->filter(fn ($t) => $t->is_applicable === false)->count(),
            'to_qualify' => $all->whereNull('is_applicable')->count(),
            'evaluated' => $evaluated->count(),
            'compliance_rate' => $rateOf($evaluated),
            'by_status' => $applicable->groupBy('compliance_status')->map->count(),
            'never_evaluated' => $applicable->whereNull('last_evaluation_date')->map(fn ($t) => $this->summary($t))->values(),
            'overdue_evaluations' => $applicable->filter(fn ($t) => $t->next_evaluation_date && $t->next_evaluation_date->lt(today()))
                ->map(fn ($t) => $this->summary($t))->values(),
            'due_in_30_days' => $applicable->filter(fn ($t) => $t->next_evaluation_date && $t->next_evaluation_date->betweenIncluded(today(), today()->addDays(30)))->count(),
            'to_analyze' => $all->where('analysis_status', 'to_analyze')->map(fn ($t) => $this->summary($t))->values(),
            'expirations' => collect(['expired', 'd7', 'd30', 'd90'])->mapWithKeys(fn ($bucket) => [
                $bucket => $all->filter(fn ($t) => $t->expiry_date && ComplianceWatchService::expiryBucket($t->expiry_date) === $bucket)->count(),
            ]),
            'by_site' => $group($all, fn ($t) => $t->site?->name ?? 'Sans site'),
            'by_domain' => $group($all, fn ($t) => $t->aspect?->name ?? 'Sans thème'),
            'linked_aspects_at_risk' => EnvironmentalAspect::query()->where('needs_reassessment', true)->count(),
        ]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(ComplianceObligationText $text): array
    {
        return [
            'id' => $text->id,
            'ref' => $text->ref,
            'title' => $text->title ?: $text->regulatory_reference,
            'source_type' => $text->source_type,
            'site_id' => $text->site_id,
            'is_applicable' => $text->is_applicable,
            'applicability_justification' => $text->applicability_justification,
            'compliance_status' => $text->compliance_status,
            'evaluation_frequency' => $text->evaluation_frequency,
            'last_evaluation_date' => $text->last_evaluation_date?->toDateString(),
            'next_evaluation_date' => $text->next_evaluation_date?->toDateString(),
            'expiry_date' => $text->expiry_date?->toDateString(),
            'analysis_status' => $text->analysis_status,
            'agreement_parent_id' => $text->agreement_parent_id,
        ];
    }

    private function nextRef(): string
    {
        $prefix = 'OBL-'.now()->format('Y').'-';
        $last = ComplianceObligationText::query()->withoutGlobalScopes()->withTrashed()
            ->where('ref', 'like', $prefix.'%')->orderByDesc('ref')->value('ref');
        $next = $last && preg_match('/(\d+)$/', $last, $matches) ? ((int) $matches[1]) + 1 : 1;

        return $prefix.str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
