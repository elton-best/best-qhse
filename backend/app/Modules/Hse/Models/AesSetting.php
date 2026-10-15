<?php

namespace App\Modules\Hse\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Paramètres de cotation et de significativité des aspects (ISO 14001 §6.1.2), par organisme.
 */
class AesSetting extends Model
{
    protected $table = 'aes_settings';

    protected $fillable = [
        'enterprise_id', 'significance_threshold', 'max_gravity', 'max_frequency', 'max_sensitivity',
        'max_mastery', 'use_legal_criterion', 'use_stakeholder_criterion', 'review_frequency_months', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'significance_threshold' => 'integer',
            'max_gravity' => 'integer',
            'max_frequency' => 'integer',
            'max_sensitivity' => 'integer',
            'max_mastery' => 'integer',
            'use_legal_criterion' => 'boolean',
            'use_stakeholder_criterion' => 'boolean',
            'review_frequency_months' => 'integer',
        ];
    }
}
