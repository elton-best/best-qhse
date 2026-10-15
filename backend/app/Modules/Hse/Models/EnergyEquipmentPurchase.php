<?php

namespace App\Modules\Hse\Models;

/**
 * Achats d'équipements à impact énergétique (ISO 50001 §8.4).
 */
class EnergyEquipmentPurchase extends EnergyRecord
{
    protected static string $referencePrefix = 'AEQ';

    protected $table = 'energy_equipment_purchases';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'equipment_id', 'provider_partner_id', 'supplier_name', 'efficiency_class', 'expected_consumption',
        'unit', 'purchase_cost', 'lifecycle_cost', 'purchase_date', 'efficiency_criteria',
        'evaluation_notes', 'status',
    ];

    protected function casts(): array
    {
        return [
            'expected_consumption' => 'decimal:3',
            'purchase_cost' => 'decimal:2',
            'lifecycle_cost' => 'decimal:2',
            'purchase_date' => 'date',
        ];
    }

    public function equipment()
    {
        return $this->belongsTo(\App\Models\Equipement::class, 'equipment_id');
    }

    public function providerPartner()
    {
        return $this->belongsTo(\App\Models\ProviderPartner::class);
    }
}
