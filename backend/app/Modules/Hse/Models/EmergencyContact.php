<?php

namespace App\Modules\Hse\Models;

/**
 * Annuaire d'urgence (ISO 14001 §8.2) : personnel clé, secours, dépollution, voisins, autorités.
 */
class EmergencyContact extends ManagedRecord
{
    public const CATEGORIES = ['staff', 'fire_brigade', 'ambulance', 'police', 'depollution', 'utility', 'neighbour', 'authority', 'other'];

    protected static string $referencePrefix = 'ANU';

    protected $table = 'emergency_contacts';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'category', 'job_role', 'phone', 'phone_alt',
        'email', 'available_24h', 'procedure_id', 'sort_order',
    ];

    protected function casts(): array
    {
        return ['available_24h' => 'boolean', 'sort_order' => 'integer'];
    }

    public function procedure()
    {
        return $this->belongsTo(EmergencyProcedure::class, 'procedure_id');
    }
}
