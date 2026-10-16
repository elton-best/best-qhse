<?php

namespace App\Console\Commands;

use App\Services\ScopeReviewService;
use Illuminate\Console\Command;

class CheckScopeReviews extends Command
{
    protected $signature = 'scopes:check-reviews';

    protected $description = "Rappeler la revue périodique ou déclenchée du domaine d'application";

    public function handle(ScopeReviewService $service): int
    {
        $this->info($service->sendReminders().' rappel(s) de revue envoyé(s).');

        return self::SUCCESS;
    }
}
