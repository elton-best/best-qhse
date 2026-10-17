<?php

namespace App\Notifications;

use App\Models\Context;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class ContextReviewDueNotification extends Notification
{
    use Queueable;

    public function __construct(public Context $context) {}

    public function via($notifiable): array
    {
        return ['database'];
    }

    public function toArray($notifiable): array
    {
        return [
            'type' => 'context_review_due',
            'context_id' => $this->context->id,
            'site_id' => $this->context->site_id,
            'title' => $this->context->title ?? 'Analyse de contexte',
            'due_date' => $this->context->next_review_at?->toDateString(),
            'message' => 'La revue périodique du contexte est à effectuer.',
            'url' => '/app/contexte',
        ];
    }
}
