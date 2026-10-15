<?php

namespace App\Modules\Hse\Models;

/**
 * Achats d'énergie (ISO 50001 §8.4).
 */
class EnergyPurchase extends EnergyRecord
{
    protected static string $referencePrefix = 'AEN';

    protected $table = 'energy_purchases';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'provider_partner_id', 'supplier_name', 'energy_type', 'contract_ref', 'quantity', 'unit',
        'unit_price', 'total_amount', 'purchase_date', 'delivery_date', 'evaluation_criteria',
        'supplier_score', 'evaluation_notes', 'status',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'unit_price' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'purchase_date' => 'date',
            'delivery_date' => 'date',
            'supplier_score' => 'integer',
        ];
    }

    public function providerPartner()
    {
        return $this->belongsTo(\App\Models\ProviderPartner::class);
    }
}
