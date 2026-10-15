<?php

namespace App\Modules\Hse\Models;

/**
 * Conception énergétique (ISO 50001 §8.3).
 */
class EnergyDesignReview extends EnergyRecord
{
    protected static string $referencePrefix = 'CEN';

    protected $table = 'energy_design_reviews';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id',
        'project_ref', 'design_stage', 'description', 'performance_criteria', 'expected_saving',
        'unit', 'review_notes', 'outputs', 'review_date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'expected_saving' => 'decimal:3',
            'review_date' => 'date',
        ];
    }
}
