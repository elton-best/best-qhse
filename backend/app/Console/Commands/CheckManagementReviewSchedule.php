<?php

namespace App\Console\Commands;

use App\Modules\Evaluation\Services\ManagementReviewReminderService;
use Illuminate\Console\Command;

class CheckManagementReviewSchedule extends Command
{
    protected $signature = 'management-review:check-schedule';

    protected $description = 'Alerte la direction quand la revue de direction d\'un site est en retard ou à planifier';

    public function handle(ManagementReviewReminderService $reminders): int
    {
        $this->info($reminders->remind().' rappel(s) de revue de direction envoyé(s).');

        return self::SUCCESS;
    }
}
