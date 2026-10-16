<?php

namespace App\Modules\Evaluation\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Evaluation\Models\ManagementReview;
use App\Modules\Evaluation\Models\ManagementReviewDecision;
use App\Modules\Evaluation\Models\ManagementReviewRecord;
use App\Modules\Evaluation\Models\ManagementReviewSession;
use App\Modules\Evaluation\Services\ManagementReviewDossierService;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Improvement\Models\Action;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Revue de direction ISO 14001:2026 §9.3 : planification, dossier d'entrée généré, réunions, conclusions,
 * décisions suivies comme actions, signature et archivage (M16).
 */
class ManagementReviewIsoController extends Controller
{
    use ScopesToUserTenant;

    public const INTERVAL_MONTHS = 12;

    public const CONCLUSIONS = ['suitability' => 'Pertinence', 'adequacy' => 'Adéquation', 'effectiveness' => 'Efficacité'];

    private function review(Request $request, int $id): ManagementReview
    {
        $this->assertTenant($request);
        $user = $request->user();
        $review = ManagementReview::query()->findOrFail($id);
        $enterpriseId = DB::table('sites')->where('id', $review->site_id)->value('enterprise_id');
        abort_unless((int) $enterpriseId === (int) $user->enterprise_id, 404, 'Revue introuvable.');
        if (! $user->isEnterpriseAdmin() && $user->site_id) {
            abort_unless((int) $user->site_id === (int) $review->site_id, 403, 'Accès non autorisé à cette revue.');
        }

        return $review;
    }

    private function editable(ManagementReview $review): ManagementReview
    {
        abort_if(ManagementReviewRecord::query()->where('review_id', $review->id)->exists(), 422, 'Cette revue est signée et archivée : elle ne peut plus être modifiée.');

        return $review;
    }

    /**
     * Planification à intervalles définis (M16-01) : dernière revue, échéance, revues prévues.
     */
    public function schedule(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $site = $this->resolveSite($request, $request->filled('site_id') ? $request->integer('site_id') : null);
        $last = ManagementReview::query()->where('site_id', $site->id)->where('status', 'completed')->orderByDesc('actual_date')->orderByDesc('id')->first();
        $due = $last?->actual_date?->copy()->addMonths(self::INTERVAL_MONTHS);
        $planned = ManagementReview::query()->where('site_id', $site->id)->whereIn('status', ['planned', 'in_progress'])->orderBy('scheduled_date')->get(['id', 'ref', 'title', 'scheduled_date', 'status']);

        $state = match (true) {
            $planned->isNotEmpty() => 'planned',
            $last === null => 'never_done',
            $due->isPast() => 'overdue',
            $due->lte(today()->addDays(30)) => 'due_soon',
            default => 'ok',
        };

        return response()->json(['data' => [
            'interval_months' => self::INTERVAL_MONTHS, 'state' => $state,
            'last' => $last ? ['id' => $last->id, 'ref' => $last->ref, 'date' => $last->actual_date?->toDateString()] : null,
            'next_due' => $due?->toDateString(), 'planned' => $planned,
        ]]);
    }

    public function dossier(Request $request, int $id): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $dossier = app(ManagementReviewDossierService::class)->build($review);
        $input = $review->input_data ?? [];
        $input['iso_14001_9_3_2'] = $dossier;
        $review->update(['input_data' => $input, 'generated_at' => now()]);

        return response()->json(['data' => $dossier]);
    }

    public function sessions(Request $request, int $id): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $data = $request->validate(['held_on' => 'required|date|before_or_equal:today', 'attendees' => 'nullable|array', 'attendees.*' => 'string|max:255', 'notes' => 'required|string|min:10']);
        $session = ManagementReviewSession::create($data + ['enterprise_id' => $request->user()->enterprise_id, 'review_id' => $review->id, 'created_by' => $request->user()->id]);
        if ($review->status === 'planned') {
            $review->update(['status' => 'in_progress', 'opened_at' => $review->opened_at ?? now(), 'opened_by_user_id' => $review->opened_by_user_id ?? $request->user()->id, 'actual_date' => $review->actual_date ?? $data['held_on']]);
        }

        return response()->json(['data' => $session], 201);
    }

    /**
     * Conclusions sur la pertinence, l'adéquation et l'efficacité du système (9.3.3 a).
     */
    public function conclusions(Request $request, int $id): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $rules = [];
        foreach (array_keys(self::CONCLUSIONS) as $key) {
            $rules[$key] = 'required|array';
            $rules["{$key}.assessment"] = 'required|in:adequate,partly,inadequate';
            $rules["{$key}.comment"] = 'required|string|min:10';
        }
        $data = $request->validate($rules);
        $output = $review->output_decisions ?? [];
        $output['iso_14001_conclusions'] = collect($data)->only(array_keys(self::CONCLUSIONS))->all();
        $review->update(['output_decisions' => $output]);

        return response()->json(['data' => $output['iso_14001_conclusions']]);
    }

    /**
     * Décision liée à une sortie de 9.3.3 : elle devient une action suivie, avec responsable et échéance (M16-04).
     */
    public function addDecision(Request $request, int $id): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $enterpriseId = (int) $request->user()->enterprise_id;
        $data = $request->validate([
            'output_type' => ['required', Rule::in(array_keys(ManagementReviewDecision::OUTPUT_TYPES))],
            'text' => 'required|string|min:10',
            'not_applicable' => 'nullable|boolean',
            'responsible_id' => 'nullable|integer',
            'due_date' => 'nullable|date|after_or_equal:today',
        ]);
        $notApplicable = (bool) ($data['not_applicable'] ?? false);
        if (! $notApplicable) {
            $missing = array_filter(['responsible_id' => empty($data['responsible_id']), 'due_date' => empty($data['due_date'])]);
            if ($missing !== []) {
                abort(response()->json(['message' => 'Une décision précise son responsable et son échéance.', 'errors' => array_map(fn () => ['Obligatoire pour une décision.'], $missing)], 422));
            }
            $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, $enterpriseId);
        }

        $decision = DB::transaction(function () use ($review, $data, $notApplicable, $request, $enterpriseId) {
            $actionId = null;
            if (! $notApplicable) {
                $label = ManagementReviewDecision::OUTPUT_TYPES[$data['output_type']];
                $actionId = Action::create([
                    'enterprise_id' => $enterpriseId, 'site_id' => $review->site_id, 'source' => 'management_review', 'source_type' => 'management_review',
                    'source_id' => $review->id, 'source_ref' => $review->ref,
                    'type' => $data['output_type'] === 'objectives_not_met' ? 'corrective' : ($data['output_type'] === 'system_changes_resources' ? 'preventive' : 'improvement'),
                    'priority' => 'medium', 'title' => 'Revue de direction '.($review->ref ?? $review->id).' — '.mb_substr($data['text'], 0, 90),
                    'description' => "{$label}\n\n{$data['text']}", 'initiator_id' => $request->user()->id, 'responsible_id' => $data['responsible_id'],
                    'deadline' => $data['due_date'], 'status' => 'planned',
                ])->id;
            }

            return ManagementReviewDecision::create([
                'enterprise_id' => $enterpriseId, 'review_id' => $review->id, 'output_type' => $data['output_type'], 'text' => $data['text'], 'not_applicable' => $notApplicable,
                'responsible_id' => $notApplicable ? null : $data['responsible_id'], 'due_date' => $notApplicable ? null : $data['due_date'], 'action_id' => $actionId, 'created_by' => $request->user()->id,
            ]);
        });

        return response()->json(['data' => $decision->load('action:id,ref,status')], 201);
    }

    public function removeDecision(Request $request, int $id, int $decisionId): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $decision = ManagementReviewDecision::query()->where('review_id', $review->id)->findOrFail($decisionId);
        DB::transaction(function () use ($decision) {
            if ($decision->action_id) {
                Action::query()->whereKey($decision->action_id)->update(['status' => 'cancelled']);
            }
            $decision->delete();
        });

        return response()->json(['message' => 'Décision retirée ; l\'action associée est annulée.']);
    }

    /**
     * Vue complète pour l'écran : dossier, réunions, conclusions, décisions, état de la signature.
     */
    public function workspace(Request $request, int $id): JsonResponse
    {
        $review = $this->review($request, $id);
        $record = ManagementReviewRecord::query()->where('review_id', $review->id)->with('signer:id,name')->first();

        return response()->json(['data' => [
            'review' => $review->load('site:id,name', 'chairman:id,name')->only(['id', 'ref', 'title', 'status', 'scheduled_date', 'actual_date', 'site', 'chairman']),
            'dossier' => $review->input_data['iso_14001_9_3_2'] ?? null,
            'sessions' => ManagementReviewSession::query()->where('review_id', $review->id)->orderBy('held_on')->get(),
            'conclusions' => $review->output_decisions['iso_14001_conclusions'] ?? null,
            'decisions' => ManagementReviewDecision::query()->where('review_id', $review->id)->with(['responsible:id,name', 'action:id,ref,status,deadline'])->orderBy('id')->get(),
            'output_types' => ManagementReviewDecision::OUTPUT_TYPES,
            'readiness' => $this->readiness($review),
            'record' => $record ? ['signed_at' => $record->signed_at->toIso8601String(), 'signed_by' => $record->signer?->name, 'sha256' => $record->sha256, 'intact' => $record->integrityIsIntact()] : null,
        ]]);
    }

    /**
     * Points restant à régler avant la signature.
     *
     * @return array<int, string>
     */
    private function readiness(ManagementReview $review): array
    {
        $missing = [];
        $dossier = $review->input_data['iso_14001_9_3_2'] ?? null;
        if ($dossier === null) {
            $missing[] = 'Générez le dossier d\'entrée (9.3.2).';
        }
        if (! ManagementReviewSession::query()->where('review_id', $review->id)->exists()) {
            $missing[] = 'Enregistrez au moins une réunion.';
        }
        if (count($review->output_decisions['iso_14001_conclusions'] ?? []) < count(self::CONCLUSIONS)) {
            $missing[] = 'Concluez sur la pertinence, l\'adéquation et l\'efficacité du système.';
        }
        $decisions = ManagementReviewDecision::query()->where('review_id', $review->id)->get();
        foreach (ManagementReviewDecision::OUTPUT_TYPES as $type => $label) {
            if ($decisions->where('output_type', $type)->isEmpty()) {
                $missing[] = "Traitez ou déclarez sans objet : {$label}.";
            }
        }
        if (($dossier['objectives']['not_achieved'] ?? 0) > 0 && $decisions->where('output_type', 'objectives_not_met')->where('not_applicable', false)->isEmpty()) {
            $missing[] = 'Des objectifs ne sont pas atteints : décidez d\'au moins une action.';
        }

        return $missing;
    }

    /**
     * Signature de la direction (M16-05) : instantané scellé par empreinte, la revue devient un enregistrement figé.
     */
    public function sign(Request $request, int $id): JsonResponse
    {
        $review = $this->editable($this->review($request, $id));
        $user = $request->user();
        abort_unless($user->isEnterpriseAdmin() || (int) $review->chairman_id === (int) $user->id || $user->can('evaluation.revue_direction.validate'), 403, 'Seule la direction (ou le président de la revue) peut signer.');

        $missing = $this->readiness($review);
        if ($missing !== []) {
            abort(response()->json(['message' => 'La revue n\'est pas prête à être signée.', 'errors' => ['readiness' => $missing]], 422));
        }

        $record = DB::transaction(function () use ($review, $user) {
            $snapshot = [
                'review' => ['ref' => $review->ref, 'title' => $review->title, 'site_id' => $review->site_id, 'actual_date' => $review->actual_date?->toDateString(), 'chairman_id' => $review->chairman_id],
                'dossier' => $review->input_data['iso_14001_9_3_2'],
                'conclusions' => $review->output_decisions['iso_14001_conclusions'],
                'sessions' => ManagementReviewSession::query()->where('review_id', $review->id)->orderBy('held_on')->get(['held_on', 'attendees', 'notes'])->toArray(),
                'decisions' => ManagementReviewDecision::query()->where('review_id', $review->id)->with('action:id,ref')->orderBy('id')->get()
                    ->map(fn ($d) => ['output_type' => $d->output_type, 'text' => $d->text, 'not_applicable' => $d->not_applicable, 'responsible_id' => $d->responsible_id, 'due_date' => $d->due_date?->toDateString(), 'action_ref' => $d->action?->ref])->all(),
                'signed_by' => ['id' => $user->id, 'name' => $user->name],
                'signed_at' => now()->toIso8601String(),
            ];
            $record = ManagementReviewRecord::create([
                'enterprise_id' => $user->enterprise_id, 'review_id' => $review->id, 'snapshot' => $snapshot,
                'sha256' => ManagementReviewRecord::hashOf($snapshot), 'signed_by' => $user->id, 'signed_at' => now(),
            ]);
            $review->update([
                'status' => 'completed', 'closed_at' => $review->closed_at ?? now(), 'closed_by_user_id' => $review->closed_by_user_id ?? $user->id,
                'validated_by_ceo_at' => now(), 'validated_by_ceo_user_id' => $user->id,
            ]);

            return $record;
        });

        return response()->json(['data' => ['signed_at' => $record->signed_at->toIso8601String(), 'sha256' => $record->sha256]], 201);
    }
}
