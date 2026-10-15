<?php

namespace App\Modules\Support\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Modules\Enterprise\Models\User;

class CommunicationHistory extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'communication_id',
        'action',
        'user_id',
        'user_name',
        'comment',
        'previous_date',
        'new_date',
    ];

    protected $casts = [
        'previous_date' => 'date',
        'new_date' => 'date',
    ];

    protected $appends = ['action_label'];

    public function communication(): BelongsTo
    {
        return $this->belongsTo(Communication::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Libellé français de l'action pour l'affichage (traçabilité).
     */
    public function getActionLabelAttribute(): string
    {
        return match ($this->action) {
            'created' => 'Création',
            'updated' => 'Modification',
            'completed' => 'Réalisation',
            'rescheduled' => 'Replanification',
            'cancelled' => 'Annulation',
            'deleted' => 'Suppression',
            default => (string) $this->action,
        };
    }
}
