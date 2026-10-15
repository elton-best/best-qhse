<?php

namespace App\Modules\Hse\Models;

use App\Models\Equipement;

/**
 * Surveillance, mesurage et analyse de la performance énergétique (ISO 50001 §9.1.1).
 */
class EnergyMonitoringRecord extends ManagedRecord
{
    protected static string $referencePrefix = 'SUR';

    protected $table = 'energy_monitoring_records';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'ipe_id', 'equipment_id', 'period_start', 'period_end', 'planned_value', 'measured_value',
        'deviation', 'deviation_percent', 'unit', 'analysis', 'action_required', 'status',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'planned_value' => 'decimal:3',
            'measured_value' => 'decimal:3',
            'deviation' => 'decimal:3',
            'deviation_percent' => 'decimal:2',
            'action_required' => 'boolean',
        ];
    }

    public function ipe()
    {
        return $this->belongsTo(Ipe::class);
    }

    public function equipment()
    {
        return $this->belongsTo(Equipement::class, 'equipment_id');
    }
}
