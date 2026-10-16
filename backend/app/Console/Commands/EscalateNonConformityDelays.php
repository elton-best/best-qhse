<?php

namespace App\Console\Commands;

use App\Modules\Improvement\Services\NonConformityEscalationService;
use Illuminate\Console\Command;

class EscalateNonConformityDelays extends Command
{
    protected $signature = 'improvement:escalate-delays';

    protected $description = 'Escalade les non-conformités en retard : responsable, pilote du processus, direction';

    public function handle(NonConformityEscalationService $escalation): int
    {
        $this->info($escalation->run().' alerte(s) de retard envoyée(s).');

        return self::SUCCESS;
    }
}
