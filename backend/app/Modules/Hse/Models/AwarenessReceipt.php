<?php

namespace App\Modules\Hse\Models;

use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Accusé de lecture ou tentative de quiz : preuve en ajout seul.
 */
class AwarenessReceipt extends Model
{
    use BelongsToEnterprise;

    protected $fillable = ['enterprise_id', 'participant_id', 'material_id', 'read_at', 'quiz_score', 'passed'];

    protected function casts(): array
    {
        return ['read_at' => 'datetime', 'passed' => 'boolean', 'quiz_score' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Un accusé de lecture est immuable.'));
        static::deleting(fn () => throw new LogicException('Un accusé de lecture ne peut pas être supprimé.'));
    }
}
