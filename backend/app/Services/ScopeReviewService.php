<?php

namespace App\Services;

use App\Models\ApplicationScope;
use App\Models\User;
use App\Notifications\SiteEventNotification;
use Illuminate\Support\Facades\DB;

class ScopeReviewService
{
    /** @param array{review_frequency_months: int, action: string, reason?: ?string} $data */
    public function updateReview(ApplicationScope $scope, array $data, int $actorId): void
    {
        DB::transaction(function () use ($scope, $data, $actorId) {
            $scope = ApplicationScope::query()->lockForUpdate()->findOrFail($scope->id);
            $scope->review_frequency_months = $data['review_frequency_months'];
            if ($data['action'] === 'complete') {
                $scope->last_reviewed_at = today();
                $scope->next_review_date = today()->addMonthsNoOverflow($data['review_frequency_months']);
                $scope->review_required_at = null;
                $scope->review_reason = null;
                $scope->review_notified_at = null;
                activity()->performedOn($scope)->causedBy(User::findOrFail($actorId))->withProperties(['reason' => $data['reason']])->log('scope_review_completed');
            } elseif ($data['action'] === 'request') {
                $scope->review_required_at = now();
                $scope->review_reason = $data['reason'];
                $scope->review_notified_at = null;
            } else {
                $scope->next_review_date = ($scope->last_reviewed_at ?? $scope->created_at)->copy()->addMonthsNoOverflow($data['review_frequency_months']);
            }
            $scope->save();
        });
    }

    public function flagChange(int $siteId, string $reason): void
    {
        ApplicationScope::query()->where('site_id', $siteId)->where('is_current', true)->update([
            'review_required_at' => now(), 'review_reason' => $reason, 'review_notified_at' => null,
        ]);
        DB::afterCommit(fn () => $this->sendReminders($siteId));
    }

    public function sendReminders(?int $siteId = null): int
    {
        $sent = 0;
        ApplicationScope::query()->where('is_current', true)
            ->when($siteId, fn ($query) => $query->where('site_id', $siteId))
            ->where(fn ($q) => $q->whereDate('next_review_date', '<=', today())->orWhereNotNull('review_required_at'))
            ->where(fn ($q) => $q->whereNull('review_notified_at')->orWhere('review_notified_at', '<=', now()->subWeek()))
            ->chunkById(100, function ($scopes) use (&$sent) {
                foreach ($scopes as $scope) {
                    $recipients = User::query()->where('enterprise_id', $scope->enterprise_id)->where('is_active', true)
                        ->where(fn ($q) => $q->whereHas('roles', fn ($roles) => $roles->where('name', 'admin_entreprise'))
                            ->orWhere('id', $scope->created_by))->get();
                    foreach ($recipients as $user) {
                        $user->notify(new SiteEventNotification('scope_review_due', [
                            'title' => "Revue du domaine d'application requise",
                            'message' => $scope->review_reason ?: 'La revue périodique du périmètre est arrivée à échéance.',
                            'action_url' => '/app/perimetre', 'scope_id' => $scope->id, 'site_id' => $scope->site_id,
                        ]));
                        $sent++;
                    }
                    if ($recipients->isNotEmpty()) {
                        $scope->forceFill(['review_notified_at' => now()])->saveQuietly();
                    }
                }
            });

        return $sent;
    }
}
