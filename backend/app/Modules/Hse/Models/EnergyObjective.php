<?php

namespace App\Modules\Hse\Models;

/**
 * Objectifs et cibles énergétiques, plans d'action (ISO 50001 §6.2).
 */
class EnergyObjective extends ManagedRecord
{
    protected static string $referencePrefix = 'OBE';

    protected $table = 'energy_objectives';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'objective_type', 'ipe_id', 'energy_source', 'baseline_value', 'target_value', 'unit',
        'current_value', 'deadline', 'action_plan', 'resources_needed', 'progress_percent', 'status',
    ];

    protected function casts(): array
    {
        return [
            'baseline_value' => 'decimal:3',
            'target_value' => 'decimal:3',
            'current_value' => 'decimal:3',
            'deadline' => 'date',
            'progress_percent' => 'integer',
        ];
    }

    public function ipe()
    {
        return $this->belongsTo(Ipe::class);
    }
}
