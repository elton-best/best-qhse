<?php

namespace App\Modules\Evaluation\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Enregistrement signé de la revue : instantané du dossier, des conclusions et des décisions, scellé par empreinte.
 */
class ManagementReviewRecord extends Model
{
    use BelongsToEnterprise;

    protected $fillable = ['enterprise_id', 'review_id', 'snapshot', 'sha256', 'signed_by', 'signed_at'];

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'signed_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('L\'enregistrement signé d\'une revue est immuable.'));
        static::deleting(fn () => throw new LogicException('L\'enregistrement signé d\'une revue ne peut pas être supprimé.'));
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    public static function hashOf(array $snapshot): string
    {
        return hash('sha256', json_encode(self::normalise($snapshot), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>
     */
    private static function normalise(array $value): array
    {
        ksort($value);
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = array_is_list($item) ? array_map(fn ($i) => is_array($i) ? self::normalise($i) : $i, $item) : self::normalise($item);
            }
        }

        return $value;
    }

    public function signer()
    {
        return $this->belongsTo(User::class, 'signed_by');
    }

    public function integrityIsIntact(): bool
    {
        return hash_equals($this->sha256, self::hashOf($this->snapshot));
    }
}
