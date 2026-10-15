<?php

namespace App\Modules\Hse\Models;

use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Version figée du registre des aspects : écriture seule, jamais modifiée ni supprimée.
 */
class AesRegistryVersion extends Model
{
    use BelongsToEnterprise;

    protected $table = 'aes_registry_versions';

    protected $fillable = [
        'enterprise_id', 'site_id', 'version_number', 'label', 'snapshot', 'method',
        'aspects_count', 'significant_count', 'created_by',
    ];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'method' => 'array'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Une version figée du registre ne peut pas être modifiée.'));
        static::deleting(fn () => throw new LogicException('Une version figée du registre ne peut pas être supprimée.'));
    }
}
