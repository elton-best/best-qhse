<?php

namespace App\Modules\Hse\Services;

use App\Models\User;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use App\Notifications\SiteEventNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Rappels de la surveillance (ISO 14001 §9.1.1) : étalonnage des instruments (J-30, J-7, jour J)
 * et relevés attendus à la date prévue.
 */
class MonitoringAlertService
{
    public const CALIBRATION_MILESTONES = [30, 7, 0];

    /**
     * @return Collection<int, User>
     */
    private function recipients(?int $responsibleId, int $enterpriseId): Collection
    {
        if ($responsibleId && ($user = User::query()->find($responsibleId))) {
            return collect([$user]);
        }

        return User::query()->where('enterprise_id', $enterpriseId)->role('admin_entreprise')->get();
    }

    /**
     * @return int nombre de notifications créées
     */
    public function alertDue(?\DateTimeInterface $today = null): int
    {
        $today = Carbon::instance($today ?? now())->startOfDay();
        $sent = 0;

        foreach (self::CALIBRATION_MILESTONES as $days) {
            $instruments = MonitoringInstrument::query()->withoutGlobalScopes()->where('status', 'in_service')
                ->whereDate('next_calibration_date', $today->copy()->addDays($days)->toDateString())->get();
            foreach ($instruments as $instrument) {
                foreach ($this->recipients($instrument->responsible_id, (int) $instrument->enterprise_id) as $user) {
                    $user->notify(new SiteEventNotification('instrument_calibration_due', [
                        'title' => $days === 0 ? 'Étalonnage à faire aujourd\'hui' : "Étalonnage dans {$days} jour(s)",
                        'message' => "{$instrument->title} ({$instrument->ref}) : les mesures faites après l'échéance seront signalées.",
                        'instrument_id' => $instrument->id,
                        'days_left' => $days,
                        'url' => '/app/performance-environnementale',
                    ]));
                    $sent++;
                }
            }
        }

        $indicators = EnvironmentalIndicator::query()->withoutGlobalScopes()->where('is_active', true)->get();
        foreach ($indicators as $indicator) {
            $period = EnvironmentalIndicator::FREQUENCY_DAYS[$indicator->frequency] ?? 31;
            $last = IndicatorReading::query()->withoutGlobalScopes()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')->max('measured_on');
            $due = $last ? Carbon::parse($last)->addDays($period) : $indicator->created_at->copy()->addDays($period);
            // Rappel le jour de l'échéance puis une semaine plus tard, pas tous les jours.
            if (! in_array((int) $due->startOfDay()->diffInDays($today, false), [0, 7], true)) {
                continue;
            }
            foreach ($this->recipients($indicator->responsible_id, (int) $indicator->enterprise_id) as $user) {
                $user->notify(new SiteEventNotification('indicator_reading_due', [
                    'title' => 'Relevé à saisir',
                    'message' => "{$indicator->title} ({$indicator->ref}) : relevé attendu depuis le {$due->format('d/m/Y')}.",
                    'indicator_id' => $indicator->id,
                    'url' => '/app/performance-environnementale',
                ]));
                $sent++;
            }
        }

        return $sent;
    }
}
