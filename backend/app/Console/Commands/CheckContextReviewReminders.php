<?php

namespace App\Console\Commands;

use App\Models\Context;
use App\Models\User;
use App\Notifications\ContextReviewDueNotification;
use Illuminate\Console\Command;

class CheckContextReviewReminders extends Command
{
    protected $signature = 'contexts:check-review-reminders';

    protected $description = 'Notifier les responsables des revues de contexte échues';

    public function handle(): int
    {
        $today = today()->toDateString();
        $reminderCutoff = now()->subDays(7);
        $sent = 0;

        $contexts = Context::query()
            ->with('site')
            ->whereNotNull('next_review_at')
            ->whereDate('next_review_at', '<=', $today)
            ->where(function ($query) use ($reminderCutoff) {
                $query->whereNull('last_review_reminder_at')
                    ->orWhere('last_review_reminder_at', '<=', $reminderCutoff);
            })
            ->get();

        foreach ($contexts as $context) {
            $site = $context->site;
            if (!$site) {
                continue;
            }

            $recipientIds = collect([$site->manager_id])
                ->merge(
                    User::query()
                        ->where('enterprise_id', $site->enterprise_id)
                        ->where('is_active', true)
                        ->whereHas('roles', fn ($roles) => $roles->where('name', 'admin_entreprise'))
                        ->pluck('id'),
                )
                ->filter()
                ->unique()
                ->values();

            $recipients = User::query()
                ->whereIn('id', $recipientIds)
                ->where('is_active', true)
                ->get();

            if ($recipients->isEmpty()) {
                continue;
            }

            foreach ($recipients as $recipient) {
                $recipient->notify(new ContextReviewDueNotification($context));
                $sent++;
            }

            $context->forceFill(['last_review_reminder_at' => now()])->save();
        }

        $this->info("Rappels de revue de contexte envoyés : {$sent}");

        return self::SUCCESS;
    }
}
