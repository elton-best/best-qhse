<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * Évaluation de conformité d'une obligation : preuve en ajout seul, jamais modifiée ni supprimée.
 * Une erreur se corrige par une nouvelle évaluation.
 */
class ComplianceEvaluation extends Model
{
    use BelongsToEnterprise;

    protected $fillable = [
        'enterprise_id', 'site_id', 'text_id', 'evaluated_at', 'evaluator_id', 'result', 'method', 'evidence',
        'evidence_path', 'external', 'external_body', 'comment', 'gap_status', 'nonconformity_id',
    ];

    protected function casts(): array
    {
        return ['evaluated_at' => 'date', 'external' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Une évaluation de conformité est une preuve : elle ne peut pas être modifiée.'));
        static::deleting(fn () => throw new LogicException('Une évaluation de conformité est une preuve : elle ne peut pas être supprimée.'));
    }

    public function text(): BelongsTo
    {
        return $this->belongsTo(ComplianceObligationText::class, 'text_id');
    }

    public function evaluator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'evaluator_id');
    }
}
