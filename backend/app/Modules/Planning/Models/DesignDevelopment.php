<?php

namespace App\Modules\Planning\Models;

use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;

/**
 * Conception et développement des produits et services (ISO 9001 §8.3).
 *
 * Cycle : planifié -> entrées -> contrôles -> sorties -> validé -> clôturé,
 * piloté via POST transition.
 */
class DesignDevelopment extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference;

    public const STAGES = ['planning', 'inputs', 'controls', 'outputs', 'changes'];

    public const STATUSES = ['draft', 'in_progress', 'in_review', 'validated', 'closed'];

    protected $fillable = [
        'ref',
        'site_id',
        'title',
        'project_code',
        'stage',
        'status',
        'description',
        'inputs',
        'outputs',
        'controls',
        'changes',
        'responsible_id',
        'planned_date',
        'actual_date',
        'validated_by',
        'validated_at',
        'validation_comment',
    ];

    protected function casts(): array
    {
        return [
            'planned_date' => 'date',
            'actual_date' => 'date',
            'validated_at' => 'datetime',
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

    public function validator()
    {
        return $this->belongsTo(User::class, 'validated_by');
    }
}
