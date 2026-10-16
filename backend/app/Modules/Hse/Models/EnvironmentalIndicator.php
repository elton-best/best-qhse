<?php

namespace App\Modules\Hse\Models;

/**
 * Indicateur de performance environnementale (ISO 14001 §9.1.1) : définition, seuils et liens avec aspect, objectif, obligation.
 */
class EnvironmentalIndicator extends ManagedRecord
{
    protected static string $referencePrefix = 'IEN';

    protected $table = 'environmental_indicators';

    public const FREQUENCY_DAYS = ['daily' => 1, 'weekly' => 7, 'monthly' => 31, 'quarterly' => 92, 'annual' => 366];

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'library_code', 'category', 'unit', 'formula', 'scope',
        'measurement_method', 'frequency', 'data_source', 'threshold_direction', 'target_value', 'alert_threshold', 'allows_negative',
        'normalization', 'normalization_unit', 'aspect_id', 'objective_id', 'obligation_id', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'target_value' => 'float',
            'alert_threshold' => 'float',
            'allows_negative' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function readings()
    {
        return $this->hasMany(IndicatorReading::class, 'indicator_id');
    }

    public function aspect()
    {
        return $this->belongsTo(EnvironmentalAspect::class, 'aspect_id');
    }

    public function obligation()
    {
        return $this->belongsTo(ComplianceObligationText::class, 'obligation_id');
    }
}
