<?php

namespace App\Console\Commands;

use App\Modules\Hse\Services\MonitoringAlertService;
use Illuminate\Console\Command;

class CheckMonitoringReminders extends Command
{
    protected $signature = 'monitoring:check-reminders';

    protected $description = 'Alerte les responsables : étalonnage des instruments (J-30, J-7, J) et relevés d\'indicateurs attendus';

    public function handle(MonitoringAlertService $alerts): int
    {
        $this->info($alerts->alertDue().' rappel(s) de surveillance envoyé(s).');

        return self::SUCCESS;
    }
}
