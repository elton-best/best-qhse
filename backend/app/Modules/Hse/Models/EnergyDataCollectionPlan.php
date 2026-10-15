<?php

namespace App\Modules\Hse\Models;

/**
 * Planification de la collecte des données énergétiques (ISO 50001 §6.6).
 */
class EnergyDataCollectionPlan extends EnergyRecord
{
    protected static string $referencePrefix = 'PCD';

    protected $table = 'energy_data_collection_plans';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'energy_source', 'data_point', 'measurement_method', 'equipment_id', 'frequency',
        'unit', 'data_source', 'storage_location', 'last_collected_at', 'next_due_date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'last_collected_at' => 'date',
            'next_due_date' => 'date',
        ];
    }

    public function equipment()
    {
        return $this->belongsTo(\App\Models\Equipement::class, 'equipment_id');
    }
}
