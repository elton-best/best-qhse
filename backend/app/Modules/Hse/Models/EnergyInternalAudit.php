<?php

namespace App\Modules\Hse\Models;

/**
 * Audit énergétique interne (ISO 50001 §9.2).
 */
class EnergyInternalAudit extends EnergyRecord
{
    protected static string $referencePrefix = 'AUE';

    protected $table = 'energy_internal_audits';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'audit_id', 'scope', 'criteria', 'planned_date', 'actual_date', 'auditors',
        'nonconformities_count', 'observations_count', 'findings', 'improvement_opportunities',
        'conclusion', 'next_audit_date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'planned_date' => 'date',
            'actual_date' => 'date',
            'next_audit_date' => 'date',
            'nonconformities_count' => 'integer',
            'observations_count' => 'integer',
        ];
    }
}
