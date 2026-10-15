<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Registre unifié des obligations de conformité (ISO 14001:2026 §6.1.3 et §9.1.2).
 */
class ComplianceObligationText extends Model
{
    use BelongsToEnterprise, HasAuditFields, HasFactory, SoftDeletes;

    public const SOURCE_TYPES = [
        'law', 'decree', 'order', 'permit', 'licence', 'court_decision',
        'contract', 'agreement', 'voluntary_code', 'sector_standard',
    ];

    /** Types d'obligation qui expirent : suivis par alertes J-90, J-30 et J-7. */
    public const EXPIRING_TYPES = ['permit', 'licence'];

    protected $fillable = [
        'aspect_id',
        'enterprise_id',
        'site_id',
        'ref',
        'title',
        'source_type',
        'authority',
        'source_url',
        'regulatory_reference',
        'description',
        'applicable_requirement',
        'watch_source',
        'entry_into_force_date',
        'regulatory_change_status',
        'validity_status',
        'compliance_status',
        'actions_corrective_preventive',
        'deadline',
        'responsible_id',
        'evaluation_frequency',
        'comments',
        'is_applicable',
        'applicability_justification',
        'applicability_decided_by',
        'applicability_decided_at',
        'permit_number',
        'expiry_date',
        'last_evaluation_date',
        'next_evaluation_date',
        'analysis_status',
        'analysis_note',
        'analyzed_by',
        'analyzed_at',
        'agreement_parent_id',
        'legacy_table',
        'legacy_id',
    ];

    protected function casts(): array
    {
        return [
            'entry_into_force_date' => 'date',
            'deadline' => 'date',
            'expiry_date' => 'date',
            'last_evaluation_date' => 'date',
            'next_evaluation_date' => 'date',
            'is_applicable' => 'boolean',
            'applicability_decided_at' => 'datetime',
            'analyzed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Le périmètre d'un texte suit toujours celui de son thème (site, puis entreprise).
        static::saving(function (ComplianceObligationText $text) {
            if ($text->aspect_id && ($text->isDirty('aspect_id') || ! $text->site_id)) {
                $aspect = ComplianceObligationAspect::query()->withoutGlobalScopes()->find($text->aspect_id);
                if ($aspect) {
                    $text->site_id = $aspect->site_id;
                    $text->enterprise_id = Site::query()->whereKey($aspect->site_id)->value('enterprise_id');
                }
            }
        });
    }

    public function aspect(): BelongsTo
    {
        return $this->belongsTo(ComplianceObligationAspect::class, 'aspect_id');
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function responsible(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(ComplianceObligationAction::class, 'text_id');
    }

    public function evaluations(): HasMany
    {
        return $this->hasMany(ComplianceEvaluation::class, 'text_id')->orderByDesc('evaluated_at')->orderByDesc('id');
    }

    public function environmentalAspects(): BelongsToMany
    {
        return $this->belongsToMany(EnvironmentalAspect::class, 'compliance_obligation_environmental_aspect', 'text_id', 'environmental_aspect_id')
            ->withTimestamps();
    }

    public function agreementParent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'agreement_parent_id');
    }

    public function agreementPlans(): HasMany
    {
        return $this->hasMany(self::class, 'agreement_parent_id');
    }
}
