<?php

namespace App\Modules\Hse\Models;

use App\Models\Enterprise;
use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Services\AesSignificanceService;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EnvironmentalAspect extends Model
{
    use BelongsToEnterprise, HasFactory, SoftDeletes, HasAuditFields;

    protected $table = 'environmental_aspects';

    protected $fillable = [
        'enterprise_id',
        'process_id',
        'site_id',
        'sub_process',
        'mode', // 'N' (Normal), 'A' (Accidentel / Dégradé)
        'aspect_number',
        'activity',
        'aspect',
        'impact',
        'risk',
        'existing_controls',
        'gravity',
        'frequency',
        'sensitivity',
        'mastery',
        'criticality_score',
        'significance_threshold',
        'is_significant',
        'condition_type',
        'frequency_score',
        'severity_score',
        'regulatory_score',
        'significance_score',
        'control_measures',
        'additional_actions',
        'responsible_id',
        'responsible_name',
        'deadline',
        'effectiveness_criterion',
        'efficiency_criterion',
        'observations',
        'action_ids',
        'status',
        'lifecycle_phase',
        'situation',
        'control_level',
        'aspect_type',
        'impact_nature',
        'impact_scale',
        'impact_kind',
        'group_label',
        'legal_criterion',
        'stakeholder_criterion',
        'significance_basis',
        'is_emergency_potential',
        'emergency_procedure_id',
        'needs_reassessment',
        'reassessment_reason',
        'reassessment_flagged_at',
        'last_reviewed_at',
        'next_review_date',
        'method_snapshot',
    ];

    protected $casts = [
        'gravity' => 'integer',
        'frequency' => 'integer',
        'sensitivity' => 'integer',
        'mastery' => 'integer',
        'criticality_score' => 'integer',
        'significance_threshold' => 'integer',
        'frequency_score' => 'integer',
        'severity_score' => 'integer',
        'regulatory_score' => 'integer',
        'significance_score' => 'integer',
        'is_significant' => 'boolean',
        'deadline' => 'date',
        'action_ids' => 'array',
        'legal_criterion' => 'boolean',
        'stakeholder_criterion' => 'boolean',
        'is_emergency_potential' => 'boolean',
        'needs_reassessment' => 'boolean',
        'reassessment_flagged_at' => 'datetime',
        'last_reviewed_at' => 'date',
        'next_review_date' => 'date',
        'method_snapshot' => 'array',
    ];

    protected static function booted()
    {
        static::saving(function (EnvironmentalAspect $aspect) {
            $hasScores = $aspect->gravity !== null || $aspect->frequency !== null
                || $aspect->sensitivity !== null || $aspect->mastery !== null;

            if ($hasScores) {
                // Canevas BASE AES : Cr = G × F × S × M ; significatif si Cr > seuil (343 par défaut).
                $service = app(AesSignificanceService::class);
                $settings = $service->settingsFor($aspect->enterprise_id ? (int) $aspect->enterprise_id : null);
                $result = $service->evaluate(
                    (int) ($aspect->gravity ?? 1),
                    (int) ($aspect->frequency ?? 1),
                    (int) ($aspect->sensitivity ?? 1),
                    (int) ($aspect->mastery ?? 1),
                    (bool) $aspect->legal_criterion,
                    (bool) $aspect->stakeholder_criterion,
                    $settings,
                );
                $aspect->criticality_score = $result['criticality'];
                $aspect->significance_threshold = (int) $settings['significance_threshold'];
                $aspect->is_significant = $result['is_significant'];
                $aspect->significance_basis = $result['basis'];
                $aspect->method_snapshot = $service->method($settings);
            } elseif ($aspect->frequency_score !== null || $aspect->severity_score !== null) {
                // Ancienne cotation (avant le canevas BASE AES).
                $freq = $aspect->frequency_score ?? 0;
                $sev = $aspect->severity_score ?? 0;
                $reg = $aspect->regulatory_score ?? 0;
                $aspect->significance_score = $freq + $sev + $reg;
                $aspect->is_significant = $aspect->significance_score >= 9;
            }

            // « N » / « A » (canevas) et situation ISO 14001:2026 restent synchronisés.
            if ($aspect->isDirty('mode') && ! $aspect->isDirty('situation')) {
                $aspect->situation = $aspect->mode === 'A' ? 'abnormal' : 'normal';
            } elseif ($aspect->isDirty('situation') && ! $aspect->isDirty('mode')) {
                $aspect->mode = in_array($aspect->situation, ['normal', 'startup_shutdown'], true) ? 'N' : 'A';
            }
        });
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function process()
    {
        return $this->belongsTo(Process::class);
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function emergencyProcedure()
    {
        return $this->belongsTo(EmergencyProcedure::class, 'emergency_procedure_id');
    }
}

