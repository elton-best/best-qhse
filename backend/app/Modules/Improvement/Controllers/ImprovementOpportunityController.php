<?php

namespace App\Modules\Improvement\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Evaluation\Models\AuditFinding;
use App\Modules\Evaluation\Models\ManagementReviewDecision;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Services\IndicatorAnalysisService;
use App\Modules\Improvement\Models\Action;
use App\Modules\Improvement\Models\ImprovementSuggestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Registre des opportunités d'amélioration (ISO 14001:2026 §10.1, M17-06) : alimenté par les audits, la revue de direction,
 * les indicateurs et les idées du personnel, avec décision motivée et suivi par une action.
 */
class ImprovementOpportunityController extends Controller
{
    use ScopesToUserTenant;

    private function suggestion(Request $request, int $id): ImprovementSuggestion
    {
        $this->assertTenant($request);
        $suggestion = ImprovementSuggestion::query()->findOrFail($id);
        $enterpriseId = Site::query()->withoutGlobalScopes()->where('id', $suggestion->site_id)->value('enterprise_id');
        abort_unless((int) $enterpriseId === (int) $request->user()->enterprise_id, 404, 'Opportunité introuvable.');

        return $suggestion;
    }

    /**
     * Crée l'entrée du registre à partir d'une constatation d'audit, d'une décision de revue ou d'un indicateur.
     */
    public function fromSource(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['source_type' => 'required|in:audit_finding,review_decision,indicator', 'source_id' => 'required|integer']);
        $enterpriseId = (int) $request->user()->enterprise_id;

        if ($existing = ImprovementSuggestion::query()->where('source_type', $data['source_type'])->where('source_id', $data['source_id'])->first()) {
            $this->suggestion($request, $existing->id);

            return response()->json(['data' => $existing], 200);
        }

        [$siteId, $title, $description, $ref, $impact, $actionId] = match ($data['source_type']) {
            'audit_finding' => $this->fromFinding((int) $data['source_id'], $enterpriseId),
            'review_decision' => $this->fromDecision((int) $data['source_id'], $enterpriseId),
            'indicator' => $this->fromIndicator((int) $data['source_id'], $enterpriseId),
        };

        $suggestion = ImprovementSuggestion::create([
            'site_id' => $siteId, 'proposer_id' => $request->user()->id, 'title' => $title, 'description' => $description, 'impact' => $impact,
            'status' => $actionId ? 'adopted' : 'pending', 'proposed_at' => today(), 'source_type' => $data['source_type'], 'source_id' => $data['source_id'],
            'source_ref' => $ref, 'action_id' => $actionId, 'decided_by' => $actionId ? $request->user()->id : null, 'decided_at' => $actionId ? now() : null,
            'decision_note' => $actionId ? 'Décision de la revue de direction.' : null,
        ]);

        return response()->json(['data' => $suggestion], 201);
    }

    /**
     * @return array{0: int, 1: string, 2: string, 3: string|null, 4: string, 5: int|null}
     */
    private function fromFinding(int $id, int $enterpriseId): array
    {
        $finding = AuditFinding::query()->with('audit:id,site_id,ref')->findOrFail($id);
        abort_unless($finding->audit && (int) Site::query()->withoutGlobalScopes()->where('id', $finding->audit->site_id)->value('enterprise_id') === $enterpriseId, 404, 'Constat introuvable.');
        abort_unless(in_array($finding->type, ['opportunity', 'good_practice'], true), 422, 'Seules les pistes d\'amélioration et les points forts alimentent le registre.');

        return [(int) $finding->audit->site_id, $finding->title, $finding->description, $finding->ref ?? $finding->audit->ref, 'medium', null];
    }

    /**
     * @return array{0: int, 1: string, 2: string, 3: string|null, 4: string, 5: int|null}
     */
    private function fromDecision(int $id, int $enterpriseId): array
    {
        $decision = ManagementReviewDecision::query()->with('review:id,site_id,ref')->findOrFail($id);
        abort_unless($decision->enterprise_id === $enterpriseId && $decision->review, 404, 'Décision introuvable.');
        abort_unless($decision->output_type === 'improvement' && ! $decision->not_applicable, 422, 'Seules les décisions d\'amélioration continue alimentent le registre.');

        return [(int) $decision->review->site_id, 'Revue de direction : '.mb_substr($decision->text, 0, 100), $decision->text, $decision->review->ref, 'medium', $decision->action_id];
    }

    /**
     * @return array{0: int, 1: string, 2: string, 3: string|null, 4: string, 5: int|null}
     */
    private function fromIndicator(int $id, int $enterpriseId): array
    {
        $indicator = EnvironmentalIndicator::query()->where('enterprise_id', $enterpriseId)->findOrFail($id);
        $last = IndicatorReading::query()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')->orderByDesc('measured_on')->first();
        $state = app(IndicatorAnalysisService::class)->state($indicator, $last?->value);
        abort_unless(in_array($state, ['above_target', 'alert'], true), 422, 'Cet indicateur respecte sa cible : aucune opportunité à enregistrer.');

        return [
            (int) $indicator->site_id, "Améliorer l'indicateur : {$indicator->title}",
            "Dernier relevé {$last?->value} {$indicator->unit} pour une cible de {$indicator->target_value} {$indicator->unit} ({$indicator->ref}).", $indicator->ref, $state === 'alert' ? 'high' : 'medium', null,
        ];
    }

    /**
     * Décision motivée : l'adoption crée une action suivie avec responsable et échéance ; le rejet est justifié.
     */
    public function decide(Request $request, int $id): JsonResponse
    {
        $suggestion = $this->suggestion($request, $id);
        abort_unless($suggestion->status === 'pending', 422, 'Cette opportunité a déjà fait l\'objet d\'une décision.');
        $data = $request->validate([
            'decision' => 'required|in:adopt,reject', 'note' => 'required|string|min:10', 'responsible_id' => 'required_if:decision,adopt|nullable|integer', 'deadline' => 'required_if:decision,adopt|nullable|date|after_or_equal:today',
        ]);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, $enterpriseId);

        DB::transaction(function () use ($suggestion, $data, $request, $enterpriseId) {
            $actionId = null;
            if ($data['decision'] === 'adopt') {
                $actionId = Action::create([
                    'enterprise_id' => $enterpriseId, 'site_id' => $suggestion->site_id, 'process_id' => $suggestion->process_id, 'type' => 'improvement', 'priority' => $suggestion->impact === 'high' ? 'high' : 'medium',
                    'title' => 'Amélioration : '.mb_substr($suggestion->title, 0, 120), 'description' => $suggestion->description, 'source_type' => 'improvement_suggestion', 'source_id' => $suggestion->id,
                    'source_ref' => $suggestion->ref, 'initiator_id' => $request->user()->id, 'responsible_id' => $data['responsible_id'], 'deadline' => $data['deadline'], 'status' => 'planned',
                ])->id;
            }
            $suggestion->update([
                'status' => $data['decision'] === 'adopt' ? 'adopted' : 'rejected', 'decision_note' => $data['note'], 'decided_by' => $request->user()->id, 'decided_at' => now(), 'action_id' => $actionId,
            ]);
        });

        return response()->json(['data' => $suggestion->fresh()]);
    }

    /**
     * Synthèse du registre : volumes par statut et par origine, et avancement des opportunités adoptées.
     */
    public function summary(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $siteIds = Site::query()->withoutGlobalScopes()->where('enterprise_id', $request->user()->enterprise_id)->pluck('id');
        $rows = ImprovementSuggestion::query()->withoutGlobalScopes()->whereIn('site_id', $siteIds)->with('site:id,name')->get();
        $adopted = $rows->where('status', 'adopted');
        $actionStatus = DB::table('actions')->whereIn('id', $adopted->pluck('action_id')->filter())->pluck('status', 'id');

        return response()->json(['data' => [
            'total' => $rows->count(),
            'by_status' => $rows->countBy('status')->all(),
            'by_source' => $rows->countBy('source_type')->all(),
            'adopted_done' => $adopted->filter(fn ($s) => in_array($actionStatus[$s->action_id] ?? null, ['completed', 'verified'], true))->count(),
            'adopted_open' => $adopted->filter(fn ($s) => ! in_array($actionStatus[$s->action_id] ?? null, ['completed', 'verified', 'cancelled'], true))->count(),
            'pending' => $rows->where('status', 'pending')->count(),
        ]]);
    }
}
