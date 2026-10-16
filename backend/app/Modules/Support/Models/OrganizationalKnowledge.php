<?php

namespace App\Modules\Support\Models;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Connaissances organisationnelles (ISO 9001 §7.1.6 — Q8-07).
 *
 * Sources : expérience des personnes, formation, méthodes et processus,
 * documents, systèmes numériques, retours d'expérience. Le drapeau
 * `single_holder_alert` signale un savoir critique détenu par une seule
 * personne (risque de perte avant un départ).
 */
class OrganizationalKnowledge extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference, BelongsToEnterprise;

    protected $table = 'organizational_knowledges';

    public const CATEGORIES = [
        'experience', 'formation', 'methodes', 'documents', 'systemes', 'retour_experience',
    ];

    public const STATUSES = ['active', 'review', 'obsolete'];

    protected $fillable = [
        'ref',
        'enterprise_id',
        'site_id',
        'title',
        'category',
        'description',
        'holder_id',
        'is_critical',
        'single_holder',
        'successor_id',
        'transfer_plan',
        'sharing_evidence',
        'review_frequency_months',
        'last_reviewed_at',
        'next_review_at',
        'status',
    ];

    protected $casts = [
        'is_critical' => 'boolean',
        'single_holder' => 'boolean',
        'last_reviewed_at' => 'date',
        'next_review_at' => 'date',
    ];

    protected $appends = ['single_holder_alert'];

    /**
     * Alerte « savoir critique détenu par une seule personne » (§7.1.6).
     */
    public function getSingleHolderAlertAttribute(): bool
    {
        return (bool) $this->is_critical && (bool) $this->single_holder;
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function holder()
    {
        return $this->belongsTo(User::class, 'holder_id');
    }

    public function successor()
    {
        return $this->belongsTo(User::class, 'successor_id');
    }
}
