<?php

namespace App\Modules\Processes\Models;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Revue des exigences avant engagement — commandes et contrats (ISO 9001 §8.2.3).
 *
 * Cinq points de contrôle + écarts avec une demande antérieure bloquants
 * jusqu'à résolution, confirmation sans énoncé écrit (8.2.3 / Q12-05) et
 * avenants avec notification (8.2.4 / Q12-06).
 */
class OrderReview extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference, BelongsToEnterprise;

    public const ENGAGEMENT_TYPES = ['commande', 'contrat', 'offre', 'vente_en_ligne', 'autre'];

    public const STATUSES = ['draft', 'in_review', 'blocked', 'validated', 'closed'];

    /** Les cinq points obligatoires de revue (8.2.3 b). */
    public const CHECKLIST = [
        'requirements_stated',
        'requirements_implied',
        'requirements_org',
        'requirements_legal',
        'differences_previous',
    ];

    protected $fillable = [
        'ref',
        'enterprise_id',
        'site_id',
        'title',
        'customer_name',
        'order_reference',
        'engagement_type',
        'review_date',
        'reviewer_id',
        'requirements_stated',
        'requirements_implied',
        'requirements_org',
        'requirements_legal',
        'differences_previous',
        'checklist_notes',
        'differences_detail',
        'differences_resolved',
        'resolution_notes',
        'verbal_confirmation',
        'catalogue_review',
        'amendments',
        'amendment_notified',
        'amendment_notified_to',
        'status',
        'validated_by',
        'validated_at',
        'validation_comment',
    ];

    protected function casts(): array
    {
        return [
            'review_date' => 'date',
            'requirements_stated' => 'boolean',
            'requirements_implied' => 'boolean',
            'requirements_org' => 'boolean',
            'requirements_legal' => 'boolean',
            'differences_previous' => 'boolean',
            'differences_resolved' => 'boolean',
            'verbal_confirmation' => 'boolean',
            'catalogue_review' => 'boolean',
            'amendment_notified' => 'boolean',
            'validated_at' => 'datetime',
        ];
    }

    /**
     * L'engagement est bloqué tant qu'un écart avec une demande antérieure
     * n'est pas résolu (8.2.3 : « les écarts sont résolus » avant acceptation).
     */
    public function isEngagementBlocked(): bool
    {
        return (bool) $this->differences_previous && !$this->differences_resolved;
    }

    /**
     * Checklist complète : les cinq points ont été examinés.
     */
    public function isChecklistComplete(): bool
    {
        foreach (self::CHECKLIST as $point) {
            if ($this->{$point} === null) {
                return false;
            }
        }

        return true;
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function validator()
    {
        return $this->belongsTo(User::class, 'validated_by');
    }
}
