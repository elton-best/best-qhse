<?php

namespace App\Console\Commands;

use App\Modules\Hse\Services\ComplianceWatchService;
use Illuminate\Console\Command;

class CheckComplianceExpirations extends Command
{
    protected $signature = 'compliance:alert-expirations';

    protected $description = 'Alerte les responsables des permis et licences arrivant à échéance (J-90, J-30, J-7)';

    public function handle(ComplianceWatchService $watch): int
    {
        $sent = $watch->alertDueMilestones();
        $this->info("{$sent} alerte(s) d'échéance envoyée(s).");

        return self::SUCCESS;
    }
}
