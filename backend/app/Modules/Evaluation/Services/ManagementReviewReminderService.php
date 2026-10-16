<?php

namespace App\Modules\Evaluation\Services;

use App\Models\User;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Evaluation\Controllers\ManagementReviewIsoController;
use App\Modules\Evaluation\Models\ManagementReview;
use App\Notifications\SiteEventNotification;

/**
 * Rappel à la direction quand la revue de direction d'un site est en retard ou à planifier dans les 30 jours (ISO 14001 §9.3.1).
 */
class ManagementReviewReminderService
{
    /**
     * @return int nombre de notifications créées
     */
    public function remind(): int
    {
        $sent = 0;
        foreach (Site::query()->withoutGlobalScopes()->get(['id', 'enterprise_id', 'name']) as $site) {
            $hasPlanned = ManagementReview::query()->where('site_id', $site->id)->whereIn('status', ['planned', 'in_progress'])->exists();
            if ($hasPlanned) {
                continue;
            }
            $last = ManagementReview::query()->where('site_id', $site->id)->where('status', 'completed')->orderByDesc('actual_date')->first();
            if ($last === null) {
                continue;
            }
            $due = $last->actual_date?->copy()->addMonths(ManagementReviewIsoController::INTERVAL_MONTHS);
            if ($due === null || $due->gt(today()->addDays(30))) {
                continue;
            }
            $late = $due->isPast();
            foreach (User::query()->where('enterprise_id', $site->enterprise_id)->role('admin_entreprise')->get() as $user) {
                $user->notify(new SiteEventNotification('management_review_due', [
                    'title' => $late ? 'Revue de direction en retard' : 'Revue de direction à planifier',
                    'message' => "{$site->name} : dernière revue le {$last->actual_date->format('d/m/Y')}, prochaine échéance le {$due->format('d/m/Y')}.",
                    'url' => '/app/revue-direction',
                ]));
                $sent++;
            }
        }

        return $sent;
    }
}
