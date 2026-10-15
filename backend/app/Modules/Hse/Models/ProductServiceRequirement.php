<?php

namespace App\Modules\Hse\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;

/**
 * Exigences relatives aux produits et services (ISO 9001 §8.2).
 *
 * Exigences client, légales, réglementaires et internes applicables
 * aux produits et services, avec revue dédiée (POST review).
 */
class ProductServiceRequirement extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    protected $fillable = [
        'ref',
        'site_id',
        'title',
        'requirement_type',
        'source',
        'description',
        'customer_requirements',
        'delivery_requirements',
        'compliance_status',
        'review_status',
        'responsible_id',
        'deadline',
        'reviewed_by',
        'reviewed_at',
        'review_comment',
    ];

    protected function casts(): array
    {
        return [
            'deadline' => 'date',
            'reviewed_at' => 'datetime',
        ];
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
