<?php

namespace App\Modules\Evaluation\Services;

use App\Modules\Evaluation\Models\ManagementReview;
use App\Modules\Evaluation\Models\ManagementReviewDecision;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use App\Modules\Hse\Services\IndicatorAnalysisService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Dossier d'entrée de la revue de direction, généré à partir des données réelles du système (ISO 14001:2026 §9.3.2) :
 * actions précédentes, changements, objectifs, tendances, ressources, communications et opportunités d'amélioration.
 */
class ManagementReviewDossierService
{
    /**
     * @return array<string, mixed>
     */
    public function build(ManagementReview $review): array
    {
        $siteId = (int) $review->site_id;
        $enterpriseId = (int) DB::table('sites')->where('id', $siteId)->value('enterprise_id');
        $since = Carbon::now()->subYear();

        return [
            'generated_at' => now()->toIso8601String(),
            'period' => ['from' => $since->toDateString(), 'to' => today()->toDateString()],
            'previous_actions' => $this->previousActions($review, $siteId),
            'changes' => $this->changes($enterpriseId, $siteId, $since),
            'objectives' => $this->objectives($siteId),
            'trends' => $this->trends($enterpriseId, $siteId, $since),
            'resources' => $this->resources($enterpriseId, $siteId),
            'communications' => $this->communications($siteId, $since),
            'improvement' => $this->improvement($siteId, $since),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function previousActions(ManagementReview $review, int $siteId): array
    {
        $previous = ManagementReview::query()->where('site_id', $siteId)->where('status', 'completed')->where('id', '!=', $review->id)
            ->orderByDesc('actual_date')->orderByDesc('id')->first();
        if (! $previous) {
            return ['previous_review' => null, 'items' => [], 'done' => 0, 'open' => 0, 'overdue' => 0];
        }

        $decisions = ManagementReviewDecision::query()->where('review_id', $previous->id)->where('not_applicable', false)->with('action:id,ref,status,deadline,completion_date')->get();
        $items = $decisions->map(fn (ManagementReviewDecision $d) => [
            'output_type' => $d->output_type, 'text' => $d->text, 'action_ref' => $d->action?->ref, 'status' => $d->action?->status,
            'deadline' => $d->action?->deadline?->toDateString(),
        ])->all();
        $done = $decisions->filter(fn ($d) => in_array($d->action?->status, ['completed', 'verified'], true))->count();
        $overdue = $decisions->filter(fn ($d) => $d->action && ! in_array($d->action->status, ['completed', 'verified', 'cancelled'], true) && $d->action->deadline?->isPast())->count();

        return [
            'previous_review' => ['id' => $previous->id, 'ref' => $previous->ref, 'date' => $previous->actual_date?->toDateString()],
            'items' => $items, 'done' => $done, 'open' => $decisions->count() - $done, 'overdue' => $overdue,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function changes(int $enterpriseId, int $siteId, Carbon $since): array
    {
        $aspects = DB::table('environmental_aspects')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->where('status', '!=', 'archived');
        $obligations = DB::table('compliance_obligation_texts')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where(fn ($q) => $q->where('site_id', $siteId)->orWhereNull('site_id'));
        $changes = DB::table('management_changes')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->where('created_at', '>=', $since)->where('status', '!=', 'rejected');
        $risks = DB::table('process_risks_opportunities as r')->join('processes as p', 'p.id', '=', 'r.process_id')->where('p.site_id', $siteId)->whereNull('r.deleted_at');

        return [
            'significant_aspects' => [
                'total' => (clone $aspects)->where('is_significant', true)->count(),
                'new_12m' => (clone $aspects)->where('is_significant', true)->where('created_at', '>=', $since)->count(),
                'to_reassess' => (clone $aspects)->where('needs_reassessment', true)->count(),
            ],
            'obligations' => [
                'new_or_modified_12m' => (clone $obligations)->whereIn('regulatory_change_status', ['new', 'modified'])->where('updated_at', '>=', $since)->count(),
                'to_analyze' => (clone $obligations)->where('analysis_status', 'to_analyze')->count(),
            ],
            'stakeholders_new_12m' => DB::table('stakeholders')->whereNull('deleted_at')->where('site_id', $siteId)->where('created_at', '>=', $since)->count(),
            'risks_opportunities' => [
                'risks' => (clone $risks)->where('r.type', 'risque')->count(),
                'opportunities' => (clone $risks)->where('r.type', '!=', 'risque')->count(),
                'high_criticality' => (clone $risks)->where('r.criticite', '>=', 12)->count(),
            ],
            'system_changes' => [
                'total_12m' => (clone $changes)->count(),
                'unplanned' => (clone $changes)->where('is_planned', false)->count(),
                'in_progress' => (clone $changes)->whereIn('status', ['awaiting_approval', 'implementing', 'implemented'])->count(),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function objectives(int $siteId): array
    {
        $objectives = DB::table('objectives')->whereNull('deleted_at')->where('site_id', $siteId)->whereNotIn('status', ['draft', 'cancelled'])->get(['title', 'status', 'progress', 'deadline', 'target_value', 'current_value']);
        $achieved = $objectives->where('status', 'achieved')->count();

        return [
            'total' => $objectives->count(), 'achieved' => $achieved, 'not_achieved' => $objectives->count() - $achieved,
            'rate' => $objectives->isEmpty() ? null : round($achieved / $objectives->count() * 100, 1),
            'not_achieved_items' => $objectives->where('status', '!=', 'achieved')->take(15)->map(fn ($o) => [
                'title' => $o->title, 'progress' => $o->progress, 'deadline' => $o->deadline, 'target' => $o->target_value, 'current' => $o->current_value,
            ])->values()->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function trends(int $enterpriseId, int $siteId, Carbon $since): array
    {
        $ncs = DB::table('non_conformities')->whereNull('deleted_at')->where('site_id', $siteId)->where('created_at', '>=', $since);
        $byQuarter = (clone $ncs)->get(['created_at'])->groupBy(fn ($row) => Carbon::parse($row->created_at)->format('Y').'-T'.Carbon::parse($row->created_at)->quarter)->map->count()->sortKeys();
        $recurring = (clone $ncs)->select(DB::raw('count(*) as c'))->groupBy('process_id', DB::raw('lower(title)'))->havingRaw('count(*) >= 2')->get()->sum('c');

        $analysis = app(IndicatorAnalysisService::class);
        $states = ['alert' => 0, 'above_target' => 0, 'ok' => 0, 'no_data' => 0];
        $alerts = [];
        foreach (EnvironmentalIndicator::query()->withoutGlobalScopes()->where('site_id', $siteId)->where('is_active', true)->get() as $indicator) {
            $last = IndicatorReading::query()->withoutGlobalScopes()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')->orderByDesc('measured_on')->first();
            $state = $analysis->state($indicator, $last?->value);
            $states[$state]++;
            if ($state === 'alert') {
                $alerts[] = ['indicator' => $indicator->title, 'last_value' => $last?->value, 'unit' => $indicator->unit, 'threshold' => $indicator->alert_threshold];
            }
        }

        $compliance = DB::table('compliance_obligation_texts')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('is_applicable', true)->where(fn ($q) => $q->where('site_id', $siteId)->orWhereNull('site_id'));
        $audits = DB::table('audits')->whereNull('deleted_at')->where('site_id', $siteId)->where('status', 'completed')->where(DB::raw('coalesce(actual_date, planned_date)'), '>=', $since->toDateString());
        $findings = DB::table('audit_findings')->whereNull('deleted_at')->whereIn('audit_id', (clone $audits)->select('id'))->get(['type', 'status']);

        return [
            'nonconformities' => ['total_12m' => (clone $ncs)->count(), 'open' => (clone $ncs)->whereNotIn('status', ['closed', 'verified'])->count(), 'recurring' => (int) $recurring, 'by_quarter' => $byQuarter->all()],
            'monitoring' => ['by_state' => $states, 'alerts' => $alerts, 'instruments_not_valid' => $this->instrumentsNotValid($siteId)],
            'compliance' => [
                'applicable' => (clone $compliance)->count(),
                'by_status' => (clone $compliance)->select('compliance_status', DB::raw('count(*) as c'))->groupBy('compliance_status')->pluck('c', 'compliance_status')->all(),
            ],
            'audits' => [
                'completed_12m' => (clone $audits)->count(),
                'findings_by_type' => $findings->countBy('type')->all(),
                'open_nonconformities' => $findings->whereIn('type', ['nc_major', 'nc_minor'])->whereNotIn('status', ['resolved', 'verified', 'closed'])->count(),
            ],
        ];
    }

    private function instrumentsNotValid(int $siteId): int
    {
        return MonitoringInstrument::query()->withoutGlobalScopes()->where('site_id', $siteId)->get()
            ->filter(fn ($i) => $i->status === 'out_of_service' || $i->next_calibration_date === null || $i->next_calibration_date->isPast())->count();
    }

    /**
     * @return array<string, mixed>
     */
    private function resources(int $enterpriseId, int $siteId): array
    {
        $emergency = DB::table('emergency_resources')->whereNull('deleted_at')->where('site_id', $siteId);

        return [
            'resources_refused_12m' => DB::table('management_changes')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->where('resources_decision', 'refused')->count(),
            'instruments_not_valid' => $this->instrumentsNotValid($siteId),
            'emergency_resources_defective' => (clone $emergency)->whereIn('status', ['defective', 'out_of_service'])->count(),
            'emergency_resources_overdue' => (clone $emergency)->whereDate('next_check_date', '<', today())->count(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function communications(int $siteId, Carbon $since): array
    {
        $complaints = DB::table('reclamations')->whereNull('deleted_at')->where('site_id', $siteId)->where('created_at', '>=', $since);

        return [
            'complaints_12m' => (clone $complaints)->count(),
            'complaints_open' => (clone $complaints)->whereNull('closed_date')->count(),
            'by_severity' => (clone $complaints)->select('severity', DB::raw('count(*) as c'))->groupBy('severity')->pluck('c', 'severity')->all(),
            'average_satisfaction' => (clone $complaints)->whereNotNull('satisfaction_rating')->avg('satisfaction_rating'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function improvement(int $siteId, Carbon $since): array
    {
        $suggestions = DB::table('improvement_suggestions')->whereNull('deleted_at')->where('site_id', $siteId)->where('created_at', '>=', $since);
        $findings = DB::table('audit_findings as f')->join('audits as a', 'a.id', '=', 'f.audit_id')->whereNull('f.deleted_at')->where('a.site_id', $siteId)->whereIn('f.type', ['opportunity', 'good_practice'])
            ->where('f.created_at', '>=', $since)->orderByDesc('f.id')->limit(10)->get(['f.title', 'f.type']);

        return [
            'suggestions_12m' => (clone $suggestions)->count(),
            'suggestions_by_status' => (clone $suggestions)->select('status', DB::raw('count(*) as c'))->groupBy('status')->pluck('c', 'status')->all(),
            'audit_opportunities' => $findings->map(fn ($f) => ['title' => $f->title, 'type' => $f->type])->all(),
        ];
    }
}
