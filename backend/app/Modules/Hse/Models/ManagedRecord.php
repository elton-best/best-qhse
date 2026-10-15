<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Base des enregistrements d'un système de management (ISO 50001, ISO 14001…) : référence, entreprise, site, responsable.
 *
 * Le cloisonnement par entreprise est garanti par le scope global
 * `BelongsToEnterprise` ; `enterprise_id` est toujours déduit du site côté serveur.
 */
abstract class ManagedRecord extends Model
{
    use BelongsToEnterprise, HasAuditFields, HasReference, SoftDeletes;

    /** Préfixe de la référence générée (ex. SER-2026-001). */
    protected static string $referencePrefix = 'ENR';

    protected function getReferencePrefix(): string
    {
        return static::$referencePrefix;
    }

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }
}
