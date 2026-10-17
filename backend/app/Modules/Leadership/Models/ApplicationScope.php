<?php

namespace App\Modules\Leadership\Models;

use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Modules\Support\Models\Document;
use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApplicationScope extends Model
{
    use HasAuditFields, HasFactory, SoftDeletes;

    protected $fillable = [
        'enterprise_id',
        'site_id',
        'version',
        'is_current',
        'status',
        'published_by',
        'published_at',
        'objective',
        'scope',
        'document_objective',
        'scope_definition',
        'referenced_documents',
        'processes',
        'included_processes',
        'products_services',
        'organizational_units',
        'locations',
        'exclusions',
        'scope_exclusions',
        'exclusions_justification',
        'iso_exclusions',
        'iso_exclusions_justification',
        'norm_exclusions',
        'norm_exclusions_justifications',
        'applicable_norms',
        'document_generated',
        'document_path',
        'metadata',
        'generated_at',
        'review_frequency_months', 'last_reviewed_at', 'next_review_date',
        'review_required_at', 'review_reason', 'review_notified_at',
    ];

    protected $casts = [
        'review_frequency_months' => 'integer',
        'last_reviewed_at' => 'date', 'next_review_date' => 'date',
        'review_required_at' => 'datetime', 'review_notified_at' => 'datetime',
        'is_current' => 'boolean',
        'published_at' => 'datetime',
        'referenced_documents' => 'array',
        'processes' => 'array',
        'included_processes' => 'array',
        'products_services' => 'array',
        'organizational_units' => 'array',
        'locations' => 'array',
        'applicable_norms' => 'array',
        'norm_exclusions' => 'array',
        'norm_exclusions_justifications' => 'array',
        'document_generated' => 'boolean',
        'metadata' => 'array',
        'generated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (ApplicationScope $scope) {
            $scope->next_review_date ??= today()->addMonthsNoOverflow($scope->review_frequency_months ?? 12);
        });
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function publishedBy()
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    public function documents()
    {
        return $this->hasMany(Document::class, 'module_id')->where('metadata->source_type', 'application_scope');
    }
}
