<?php

namespace App\Modules\Hse\Models;

/**
 * Moyen d'intervention (extincteur, kit anti-déversement…) avec sa prochaine vérification.
 */
class EmergencyResource extends ManagedRecord
{
    public const TYPES = ['extinguisher', 'spill_kit', 'first_aid', 'alarm', 'eyewash', 'pump', 'other'];

    protected static string $referencePrefix = 'MOY';

    protected $table = 'emergency_resources';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'resource_type', 'location', 'quantity',
        'specification', 'last_check_date', 'check_frequency_days', 'next_check_date', 'status', 'procedure_id',
    ];

    protected $appends = ['is_overdue'];

    public function getIsOverdueAttribute(): bool
    {
        return $this->next_check_date !== null && $this->next_check_date->lt(today());
    }

    protected function casts(): array
    {
        return [
            'last_check_date' => 'date',
            'next_check_date' => 'date',
            'quantity' => 'integer',
            'check_frequency_days' => 'integer',
        ];
    }

    public function procedure()
    {
        return $this->belongsTo(EmergencyProcedure::class, 'procedure_id');
    }
}
