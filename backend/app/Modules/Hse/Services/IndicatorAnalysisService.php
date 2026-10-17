<?php

namespace App\Modules\Hse\Services;

use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Analyse d'un indicateur (M14-06) : série, tendance, comparaison avec la période précédente, normalisation
 * par activité et état par rapport aux seuils.
 */
class IndicatorAnalysisService
{
    public const TREND_TOLERANCE = 0.05;

    /**
     * @return array<string, mixed>
     */
    public function analyse(EnvironmentalIndicator $indicator, Carbon $from, Carbon $to): array
    {
        $readings = $this->readings($indicator, $from, $to);
        $series = $readings->map(fn (IndicatorReading $r) => [
            'id' => $r->id,
            'measured_on' => $r->measured_on->toDateString(),
            'value' => $r->value,
            'normalized' => $this->normalized($indicator, $r),
            'flags' => $r->flags ?? [],
            'instrument_valid' => $r->instrument_valid,
        ])->values();

        $values = $readings->pluck('value');
        $days = max(1, $from->diffInDays($to) + 1);
        $previous = $this->readings($indicator, $from->copy()->subDays($days), $from->copy()->subDay());
        $currentTotal = $values->sum();
        $previousTotal = $previous->sum('value');

        $half = intdiv($values->count(), 2);
        $trend = 'insufficient';
        if ($values->count() >= 4) {
            $first = $values->take($half)->avg();
            $second = $values->slice($half)->avg();
            $change = $first != 0.0 ? ($second - $first) / abs($first) : ($second == 0.0 ? 0.0 : 1.0);
            $trend = abs($change) <= self::TREND_TOLERANCE ? 'stable' : ($change > 0 ? 'up' : 'down');
        }

        $last = $readings->last();

        return [
            'indicator_id' => $indicator->id,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'count' => $values->count(),
            'series' => $series,
            'total' => round($currentTotal, 4),
            'average' => $values->isEmpty() ? null : round($values->avg(), 4),
            'min' => $values->min(),
            'max' => $values->max(),
            'trend' => $trend,
            'previous_total' => round($previousTotal, 4),
            'previous_count' => $previous->count(),
            'change_vs_previous_pct' => $previous->isNotEmpty() && $previousTotal != 0.0 ? round(($currentTotal - $previousTotal) / abs($previousTotal) * 100, 1) : null,
            'last_value' => $last?->value,
            'last_measured_on' => $last?->measured_on->toDateString(),
            'threshold_state' => $this->state($indicator, $last?->value),
            'flagged_readings' => $series->filter(fn (array $row) => $row['flags'] !== [])->count(),
        ];
    }

    /**
     * ok | above_target (dérive) | alert (seuil dépassé) | no_data.
     */
    public function state(EnvironmentalIndicator $indicator, ?float $value): string
    {
        if ($value === null) {
            return 'no_data';
        }
        $worse = fn (float $limit) => $indicator->threshold_direction === 'max' ? $value > $limit : $value < $limit;
        if ($indicator->alert_threshold !== null && $worse($indicator->alert_threshold)) {
            return 'alert';
        }
        if ($indicator->target_value !== null && $worse($indicator->target_value)) {
            return 'above_target';
        }

        return 'ok';
    }

    private function normalized(EnvironmentalIndicator $indicator, IndicatorReading $reading): ?float
    {
        if ($indicator->normalization === 'none' || ! $reading->activity_quantity) {
            return null;
        }

        return round($reading->value / $reading->activity_quantity, 4);
    }

    /**
     * @return Collection<int, IndicatorReading>
     */
    private function readings(EnvironmentalIndicator $indicator, Carbon $from, Carbon $to)
    {
        return IndicatorReading::query()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')
            ->whereBetween('measured_on', [$from->toDateString(), $to->toDateString()])->orderBy('measured_on')->orderBy('id')->get();
    }
}
