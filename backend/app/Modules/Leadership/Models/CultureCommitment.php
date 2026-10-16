<?php

namespace App\Modules\Leadership\Models;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Charte de valeurs et engagements de la direction (ISO 9001 §5.1.1 i — Q3-06).
 */
class CultureCommitment extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference, BelongsToEnterprise;

    public const TYPES = ['valeur', 'engagement', 'charte'];

    public const STATUSES = ['active', 'in_review', 'archived'];

    protected $fillable = [
        'ref',
        'enterprise_id',
        'site_id',
        'title',
        'type',
        'description',
        'owner_id',
        'status',
        'review_frequency_months',
        'last_reviewed_at',
        'next_review_at',
        'published_at',
    ];

    protected function casts(): array
    {
        return [
            'last_reviewed_at' => 'date',
            'next_review_at' => 'date',
            'published_at' => 'datetime',
        ];
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
