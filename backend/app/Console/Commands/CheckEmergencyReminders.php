<?php

namespace App\Console\Commands;

use App\Modules\Hse\Services\EmergencyAlertService;
use Illuminate\Console\Command;

class CheckEmergencyReminders extends Command
{
    protected $signature = 'emergency:check-reminders';

    protected $description = "Alerte les responsables : vérification des moyens d'intervention (J-30, J-7, J) et exercices d'urgence à planifier";

    public function handle(EmergencyAlertService $alerts): int
    {
        $this->info($alerts->alertDueReminders()." alerte(s) d'urgence envoyée(s).");

        return self::SUCCESS;
    }
}
