<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

/**
 * Étalonnage ou vérification d'un instrument : historique en ajout seul.
 */
class InstrumentCalibration extends Model
{
    use BelongsToEnterprise;

    protected $fillable = ['enterprise_id', 'instrument_id', 'calibrated_on', 'next_due_on', 'result', 'certificate_ref', 'provider', 'note', 'recorded_by'];

    protected function casts(): array
    {
        return ['calibrated_on' => 'date', 'next_due_on' => 'date'];
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
