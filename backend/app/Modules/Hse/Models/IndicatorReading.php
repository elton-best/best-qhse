<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * Relevé d'un indicateur : valeur, auteur, date, instrument et preuve (A.9.1.1). Jamais modifié ni supprimé :
 * une erreur se corrige par un nouveau relevé qui remplace l'ancien tout en le conservant.
 */
class IndicatorReading extends Model
{
    use BelongsToEnterprise;

    protected $fillable = [
        'enterprise_id', 'site_id', 'indicator_id', 'measured_on', 'value', 'unit', 'activity_quantity', 'instrument_id',
        'instrument_valid', 'source', 'client_uuid', 'evidence_path', 'evidence_name', 'note', 'flags', 'recorded_by',
        'supersedes_id', 'correction_reason',
    ];

    protected function casts(): array
    {
        return [
            'measured_on' => 'date',
            'value' => 'float',
            'activity_quantity' => 'float',
            'instrument_valid' => 'boolean',
            'flags' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (IndicatorReading $reading) {
            $allowed = ['superseded_by_id', 'updated_at'];
            if (array_diff(array_keys($reading->getDirty()), $allowed) !== []) {
                throw new LogicException('Un relevé est immuable : enregistrez un relevé corrigé.');
            }
        });
        static::deleting(fn () => throw new LogicException('Un relevé ne peut pas être supprimé.'));
    }

    public function indicator()
    {
        return $this->belongsTo(EnvironmentalIndicator::class, 'indicator_id');
    }

    public function instrument()
    {
        return $this->belongsTo(MonitoringInstrument::class, 'instrument_id');
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
