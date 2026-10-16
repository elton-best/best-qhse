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
 * Signalement éthique confidentiel (ISO 9001 §5.1.1 i, §7.3 e — Q3-06).
 *
 * Le canal accepte les signalements anonymes ; aucun score individuel n'est
 * calculé et le champ `concerned_area` désigne un service, jamais une personne.
 */
class EthicsReport extends Model
{
    use HasFactory, SoftDeletes, HasAuditFields, HasReference, BelongsToEnterprise;

    public const CHANNELS = ['web', 'boite', 'telephone', 'courrier', 'reunion', 'autre'];

    public const CATEGORIES = [
        'harcelement', 'discrimination', 'corruption', 'conflit_interets',
        'fraude', 'securite', 'environnement', 'qualite', 'autre',
    ];

    public const STATUSES = ['received', 'in_progress', 'resolved', 'closed', 'rejected'];

    protected $fillable = [
        'ref',
        'enterprise_id',
        'site_id',
        'is_anonymous',
        'reporter_name',
        'reporter_email',
        'channel',
        'category',
        'concerned_area',
        'description',
        'received_at',
        'acknowledged_at',
        'status',
        'resolution',
        'handled_by',
        'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'is_anonymous' => 'boolean',
            'received_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
