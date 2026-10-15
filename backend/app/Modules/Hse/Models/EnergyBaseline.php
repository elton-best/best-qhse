<?php

namespace App\Modules\Hse\Models;

/**
 * Situation énergétique de référence (ISO 50001 §6.5).
 */
class EnergyBaseline extends EnergyRecord
{
    protected static string $referencePrefix = 'SER';

    protected $table = 'energy_baselines';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'energy_source', 'period_start', 'period_end', 'baseline_consumption', 'unit',
        'relevant_variables', 'normalization_method', 'ipe_id', 'adjustment_notes',
        'status', 'validated_by', 'validated_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'baseline_consumption' => 'decimal:3',
            'validated_at' => 'datetime',
        ];
    }

    public function ipe()
    {
        return $this->belongsTo(Ipe::class);
    }
}
