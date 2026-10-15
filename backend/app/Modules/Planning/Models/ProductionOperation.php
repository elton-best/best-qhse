<?php

namespace App\Modules\Planning\Models;

use App\Traits\HasAuditFields;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Processes\Models\Process;
use App\Modules\Support\Models\Equipement;

class ProductionOperation extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields;

    public const STATUS_PLANIFIEE = 'planifiee';
    public const STATUS_EN_COURS = 'en_cours';
    public const STATUS_CONTROLEE = 'controlee';
    public const STATUS_LIBEREE = 'liberee';
    public const STATUS_BLOQUEE = 'bloquee';

    public const STATUSES = [
        self::STATUS_PLANIFIEE,
        self::STATUS_EN_COURS,
        self::STATUS_CONTROLEE,
        self::STATUS_LIBEREE,
        self::STATUS_BLOQUEE,
    ];

    public const STATUS_LABELS = [
        self::STATUS_PLANIFIEE => 'Planifiée',
        self::STATUS_EN_COURS => 'En cours',
        self::STATUS_CONTROLEE => 'Contrôlée',
        self::STATUS_LIBEREE => 'Libérée',
        self::STATUS_BLOQUEE => 'Bloquée',
    ];

    /** Transitions autorisées (statut actuel => statuts cibles). */
    public const TRANSITIONS = [
        self::STATUS_PLANIFIEE => [self::STATUS_EN_COURS],
        self::STATUS_EN_COURS => [self::STATUS_CONTROLEE, self::STATUS_BLOQUEE],
        self::STATUS_CONTROLEE => [self::STATUS_LIBEREE, self::STATUS_BLOQUEE],
        self::STATUS_BLOQUEE => [self::STATUS_EN_COURS],
        self::STATUS_LIBEREE => [],
    ];

    protected $fillable = [
        'enterprise_id',
        'site_id',
        'process_id',
        'equipment_id',
        'title',
        'client_order',
        'planned_date',
        'criteria',
        'control_result',
        'status',
        'released_by',
        'released_at',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'planned_date' => 'date',
        'released_at' => 'datetime',
    ];

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function process()
    {
        return $this->belongsTo(Process::class);
    }

    public function equipment()
    {
        return $this->belongsTo(Equipement::class, 'equipment_id');
    }

    public function releases()
    {
        return $this->hasMany(ProductRelease::class, 'production_operation_id');
    }

    public function canTransitionTo(string $target): bool
    {
        return in_array($target, self::TRANSITIONS[$this->status] ?? [], true);
    }

    public function statusLabel(): string
    {
        return self::STATUS_LABELS[$this->status] ?? (string) $this->status;
    }
}
