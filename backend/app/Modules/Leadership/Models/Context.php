<?php

namespace App\Modules\Leadership\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Site;

class Context extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    protected $fillable = [
        'ref',
        'site_id',
        'type',
        'category',
        'description',
        'impact',
        'analysis',
        'year',
        'title',
        'review_frequency_months',
        'last_reviewed_at',
        'next_review_at',
        'last_review_reminder_at',
        'swot_strengths',
        'swot_weaknesses',
        'swot_opportunities',
        'swot_threats',
        'pestel_political',
        'pestel_economic',
        'pestel_social',
        'pestel_technological',
        'pestel_environmental',
        'pestel_legal',
    ];

    protected $casts = [
        'review_frequency_months' => 'integer',
        'last_reviewed_at' => 'datetime',
        'next_review_at' => 'date',
        'last_review_reminder_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(ContextReview::class)->orderByDesc('reviewed_at');
    }
}

