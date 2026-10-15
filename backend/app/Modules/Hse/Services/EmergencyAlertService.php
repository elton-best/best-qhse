<?php

namespace App\Modules\Hse\Services;

use App\Models\User;
use App\Modules\Hse\Models\EmergencyEvent;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EmergencyResource;
use App\Notifications\SiteEventNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Alertes de la préparation aux urgences (ISO 14001 §8.2) : déclaration d'une situation réelle,
 * vérification des moyens d'intervention (J-30, J-7, jour J) et exercices à planifier (J-30, J-7).
 */
class EmergencyAlertService
{
    public const CHECK_MILESTONES = [30, 7, 0];

    public const DRILL_MILESTONES = [30, 7];

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

    public function notifyDeclared(EmergencyEvent $event): void
    {
        $recipients = $this->recipients($event->responsible_id, (int) $event->enterprise_id)
            ->merge(User::query()->where('enterprise_id', $event->enterprise_id)->role('admin_entreprise')->get())
            ->unique('id')->reject(fn (User $user) => $user->id === $event->declared_by);

        foreach ($recipients as $user) {
            $user->notify(new SiteEventNotification('emergency_declared', [
                'title' => 'Situation d\'urgence déclarée',
                'message' => "{$event->title} — gravité {$event->severity}. Consultez la conduite à tenir.",
                'event_id' => $event->id,
                'reference' => $event->ref,
                'severity' => $event->severity,
                'url' => '/app/urgences',
            ]));
        }
    }

    /**
     * @return int nombre de notifications créées
     */
    public function alertDueReminders(?\DateTimeInterface $today = null): int
    {
        $today = Carbon::instance($today ?? now())->startOfDay();
        $sent = 0;

        foreach (self::CHECK_MILESTONES as $days) {
            $resources = EmergencyResource::query()->withoutGlobalScopes()
                ->whereDate('next_check_date', $today->copy()->addDays($days)->toDateString())
                ->whereNotIn('status', ['out_of_service'])->get();

            foreach ($resources as $resource) {
                foreach ($this->recipients($resource->responsible_id, (int) $resource->enterprise_id) as $user) {
                    $user->notify(new SiteEventNotification('emergency_resource_check', [
                        'title' => $days === 0 ? 'Vérification de moyen d\'intervention à faire aujourd\'hui' : "Vérification de moyen d'intervention dans {$days} jour(s)",
                        'message' => "{$resource->title}".($resource->location ? " ({$resource->location})" : ''),
                        'resource_id' => $resource->id,
                        'days_left' => $days,
                        'url' => '/app/urgences',
                    ]));
                    $sent++;
                }
            }
        }

        foreach (self::DRILL_MILESTONES as $days) {
            $procedures = EmergencyProcedure::query()->withoutGlobalScopes()
                ->whereDate('next_drill_date', $today->copy()->addDays($days)->toDateString())->get();

            foreach ($procedures as $procedure) {
                foreach ($this->recipients($procedure->responsible_id, (int) $procedure->enterprise_id) as $user) {
                    $user->notify(new SiteEventNotification('emergency_drill_due', [
                        'title' => "Exercice d'urgence à planifier dans {$days} jour(s)",
                        'message' => $procedure->title,
                        'procedure_id' => $procedure->id,
                        'days_left' => $days,
                        'url' => '/app/urgences',
                    ]));
                    $sent++;
                }
            }
        }

        return $sent;
    }
}
