<?php

namespace App\Modules\Planning\Models;

use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;

class ProductRelease extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields;

    public const STATUS_EN_ATTENTE = 'en_attente';
    public const STATUS_LIBERE = 'libere';
    public const STATUS_DEROGATION = 'derogation';
    public const STATUS_REJETE = 'rejete';

    public const STATUSES = [
        self::STATUS_EN_ATTENTE,
        self::STATUS_LIBERE,
        self::STATUS_DEROGATION,
        self::STATUS_REJETE,
    ];

    public const STATUS_LABELS = [
        self::STATUS_EN_ATTENTE => 'En attente',
        self::STATUS_LIBERE => 'Libéré',
        self::STATUS_DEROGATION => 'Dérogation',
        self::STATUS_REJETE => 'Rejeté',
    ];

    /** Décisions acceptées par POST validate (depuis en_attente). */
    public const DECISIONS = [
        self::STATUS_LIBERE,
        self::STATUS_DEROGATION,
        self::STATUS_REJETE,
    ];

    protected $fillable = [
        'enterprise_id',
        'site_id',
        'production_operation_id',
        'batch_number',
        'criteria',
        'release_date',
        'status',
        'authorized_by',
        'decision_notes',
        'decided_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'release_date' => 'date',
        'decided_at' => 'datetime',
    ];

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function productionOperation()
    {
        return $this->belongsTo(ProductionOperation::class, 'production_operation_id');
    }

    public function statusLabel(): string
    {
        return self::STATUS_LABELS[$this->status] ?? (string) $this->status;
    }
}
