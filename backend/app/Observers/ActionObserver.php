<?php

namespace App\Observers;

use App\Events\Action\ActionAssigned;
use App\Models\Action;
use App\Traits\NotifiesSiteUsers;
use Beg\SupervisionClient\Events\EventReporter;

class ActionObserver
{
    use NotifiesSiteUsers;

    public function created(Action $action): void
    {
        if ($action->responsible_id) {
            event(new ActionAssigned($action));
        }

        if ($action->site_id) {
            $this->notifySiteUsers($action->site_id, 'action_assigned', [
                'type' => 'action_assigned',
                'message' => "Nouvelle action: {$action->title}",
                'urgency' => $this->getUrgency($action),
                'action_url' => "/company/actions",
            ]);
        }

        EventReporter::record('action.created', 'Nouvelle action corrective', [
            'category' => 'quality',
            'severity' => 'info',
            'external_ref' => 'action-created-'.$action->id,
            'message' => $action->title,
            'metadata' => ['action_id' => $action->id, 'site_id' => $action->site_id],
        ]);
    }

    public function updated(Action $action): void
    {
        if ($action->wasChanged(['progress', 'progress_rate', 'status'])) {
            $this->refreshLinkedObjectiveProgress($action);
        }

        if (
            $action->wasChanged('responsible_id')
            && !empty($action->responsible_id)
        ) {
            event(new ActionAssigned($action));
        }

        if ($action->wasChanged('status') && $action->status === 'completed' && $action->site_id) {
            $this->notifySiteUsers($action->site_id, 'action_completed', [
                'type' => 'action_completed',
                'message' => "Action terminée: {$action->title}",
                'urgency' => 'info',
                'action_url' => "/company/actions",
            ]);
        }
    }

    public function deleted(Action $action): void
    {
        $this->refreshLinkedObjectiveProgress($action);
    }

    private function refreshLinkedObjectiveProgress(Action $action): void
    {
        $action->objectives()->get()->each(
            fn ($objective) => $objective->updateProgress(),
        );
    }

    private function getUrgency(Action $action): string
    {
        if (!$action->deadline) return 'info';
        
        $daysUntilDeadline = now()->diffInDays($action->deadline, false);
        
        if ($daysUntilDeadline <= 3) return 'critical';
        if ($daysUntilDeadline <= 7) return 'high';
        
        return 'info';
    }
}
