<?php

namespace App\Modules\Hse\Models;

/**
 * Évaluation de la conformité énergétique (ISO 50001 §9.1.2).
 */
class EnergyComplianceEvaluation extends EnergyRecord
{
    protected static string $referencePrefix = 'CEV';

    protected $table = 'energy_compliance_evaluations';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'legal_requirement', 'source', 'evaluation_method', 'evaluation_date', 'next_evaluation_date',
        'result', 'gap_description', 'action_required', 'evidence', 'status',
    ];

    protected function casts(): array
    {
        return [
            'evaluation_date' => 'date',
            'next_evaluation_date' => 'date',
        ];
    }
}
