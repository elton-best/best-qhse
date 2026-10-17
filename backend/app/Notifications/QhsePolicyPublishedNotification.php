<?php

namespace App\Notifications;

use App\Models\QhsePolicy;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class QhsePolicyPublishedNotification extends Notification
{
    use Queueable;

    public function __construct(private QhsePolicy $policy)
    {
    }

    public function via($notifiable): array
    {
        return ['database'];
    }

    public function toArray($notifiable): array
    {
        return [
            'title' => 'Nouvelle politique qualité à lire',
            'message' => 'La politique qualité '.$this->policy->version.' est publiée. Consultez-la et confirmez votre compréhension.',
            'type' => 'qhse_policy_published',
            'policy_id' => $this->policy->id,
            'policy_version' => $this->policy->version,
            'site_id' => $this->policy->site_id,
        ];
    }
}
