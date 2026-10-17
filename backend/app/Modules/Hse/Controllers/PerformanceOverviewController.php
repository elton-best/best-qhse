<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use App\Modules\Hse\Services\IndicatorAnalysisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Tableau de bord de la performance environnementale : indicateurs d'efficacité du SME (M14-07)
 * et rapport périodique à destination des décideurs et de la revue de direction (M14-08).
 */
class PerformanceOverviewController extends Controller
{
    use ScopesToUserTenant;

    /**
     * @return array{0: int, 1: array<int, int>}
     */
    private function scope(Request $request): array
    {
        $this->assertTenant($request);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $siteIds = Site::query()->where('enterprise_id', $enterpriseId)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if ($request->filled('site_id')) {
            $site = $this->resolveSite($request, $request->integer('site_id'));
            $siteIds = [(int) $site->id];
        }

        return [$enterpriseId, $siteIds];
    }

    private function rate(int $part, int $total): ?float
    {
        return $total === 0 ? null : round($part / $total * 100, 1);
    }

    /**
     * Taux d'objectifs atteints, d'actions à l'heure, d'obligations évaluées et de non-conformités récurrentes (M14-07).
     */
    public function overview(Request $request): JsonResponse
    {
        [$enterpriseId, $siteIds] = $this->scope($request);
        $since = today()->subYear();

        $objectives = DB::table('objectives')->whereNull('deleted_at')->whereIn('site_id', $siteIds)->whereNotIn('status', ['draft', 'cancelled']);
        $objectivesTotal = (clone $objectives)->count();
        $objectivesAchieved = (clone $objectives)->where('status', 'achieved')->count();

        $actions = DB::table('actions')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->whereIn('site_id', $siteIds)->where('status', '!=', 'cancelled')
            ->where(fn ($q) => $q->whereIn('status', ['completed', 'verified'])->orWhere('deadline', '<', today()));
        $actionsDue = (clone $actions)->count();
        $actionsOnTime = (clone $actions)->whereIn('status', ['completed', 'verified'])->whereColumn('completion_date', '<=', 'deadline')->count();

        $obligations = DB::table('compliance_obligation_texts')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('is_applicable', true)
            ->where(fn ($q) => $q->whereIn('site_id', $siteIds)->orWhereNull('site_id'));
        $obligationsApplicable = (clone $obligations)->count();
        $obligationsEvaluated = (clone $obligations)->whereDate('last_evaluation_date', '>=', $since)->count();

        $ncs = DB::table('non_conformities')->whereNull('deleted_at')->whereIn('site_id', $siteIds)->whereDate('created_at', '>=', $since);
        $ncTotal = (clone $ncs)->count();
        $recurring = (clone $ncs)->select(DB::raw('count(*) as c'))->groupBy('process_id', DB::raw('lower(title)'))->havingRaw('count(*) >= 2')->get()->sum('c');

        $indicators = EnvironmentalIndicator::query()->whereIn('site_id', $siteIds)->where('is_active', true)->get();
        $analysis = app(IndicatorAnalysisService::class);
        $states = ['alert' => 0, 'above_target' => 0, 'ok' => 0, 'no_data' => 0];
        $overdueReadings = 0;
        foreach ($indicators as $indicator) {
            $last = IndicatorReading::query()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')->orderByDesc('measured_on')->first();
            $states[$analysis->state($indicator, $last?->value)]++;
            $limit = EnvironmentalIndicator::FREQUENCY_DAYS[$indicator->frequency] ?? 31;
            if (! $last || $last->measured_on->diffInDays(today()) > $limit) {
                $overdueReadings++;
            }
        }

        $instruments = MonitoringInstrument::query()->whereIn('site_id', $siteIds)->where('status', '!=', 'retired')->get();
        $expired = $instruments->filter(fn ($i) => $i->status === 'out_of_service' || $i->next_calibration_date === null || $i->next_calibration_date->isPast())->count();

        return response()->json(['data' => [
            'objectives' => ['total' => $objectivesTotal, 'achieved' => $objectivesAchieved, 'rate' => $this->rate($objectivesAchieved, $objectivesTotal)],
            'actions' => ['due' => $actionsDue, 'on_time' => $actionsOnTime, 'rate' => $this->rate($actionsOnTime, $actionsDue)],
            'obligations' => ['applicable' => $obligationsApplicable, 'evaluated_12m' => $obligationsEvaluated, 'rate' => $this->rate($obligationsEvaluated, $obligationsApplicable)],
            'nonconformities' => ['total_12m' => $ncTotal, 'recurring' => (int) $recurring, 'recurring_rate' => $this->rate((int) $recurring, $ncTotal)],
            'indicators' => ['active' => $indicators->count(), 'by_state' => $states, 'readings_overdue' => $overdueReadings],
            'instruments' => ['total' => $instruments->count(), 'not_valid' => $expired],
        ]]);
    }

    /**
     * Rapport périodique : résultats par indicateur, dépassements, relevés douteux, instruments hors validité.
     */
    public function report(Request $request): JsonResponse
    {
        [, $siteIds] = $this->scope($request);
        $range = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from']);
        $to = Carbon::parse($range['to'] ?? today());
        $from = Carbon::parse($range['from'] ?? $to->copy()->subMonths(3)->addDay());
        $analysis = app(IndicatorAnalysisService::class);

        $rows = EnvironmentalIndicator::query()->whereIn('site_id', $siteIds)->where('is_active', true)->with('site:id,name')->orderBy('category')->orderBy('title')->get()
            ->map(function (EnvironmentalIndicator $indicator) use ($analysis, $from, $to) {
                $a = $analysis->analyse($indicator, $from, $to);

                return [
                    'ref' => $indicator->ref, 'title' => $indicator->title, 'site' => $indicator->site?->name, 'unit' => $indicator->unit, 'category' => $indicator->category,
                    'target_value' => $indicator->target_value, 'alert_threshold' => $indicator->alert_threshold,
                ] + collect($a)->only(['count', 'total', 'average', 'last_value', 'trend', 'change_vs_previous_pct', 'threshold_state', 'flagged_readings'])->all();
            });

        $flagged = IndicatorReading::query()->whereIn('site_id', $siteIds)->whereNull('superseded_by_id')->whereBetween('measured_on', [$from->toDateString(), $to->toDateString()])
            ->where('instrument_valid', false)->count();

        return response()->json(['data' => [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'indicators' => $rows->values(),
            'alerts' => $rows->where('threshold_state', 'alert')->values(),
            'readings_with_invalid_instrument' => $flagged,
            'generated_at' => now()->toIso8601String(),
        ]]);
    }
}
