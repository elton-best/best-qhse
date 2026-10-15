<?php

namespace App\Modules\Improvement\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;

/**
 * Sorties non conformes (ISO 9001 §8.7).
 *
 * Distinct de NonConformity (§10.2) : traite les produits / services
 * non conformes détectés (isolement, correction, dérogation, rebut, clôture).
 */
class NonconformingOutput extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    public const STATUSES = [
        'detected',
        'isolated',
        'corrected',
        'under_derogation',
        'scrapped',
        'closed',
    ];

    protected $fillable = [
        'ref',
        'site_id',
        'process_id',
        'title',
        'description',
        'detection_source',
        'detection_date',
        'quantity',
        'unit',
        'severity',
        'decision',
        'status',
        'responsible_id',
        'corrective_action',
        'derogation_reference',
        'derogation_granted_by',
        'closed_by',
        'closed_at',
        'closure_comment',
    ];

    protected function casts(): array
    {
        return [
            'detection_date' => 'date',
            'quantity' => 'decimal:2',
            'closed_at' => 'datetime',
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

    public function closedBy()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }
}
