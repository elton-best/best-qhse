<?php

namespace App\Modules\Support\Models;

use App\Models\User;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FormationHistory extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'formation_history';

    protected $fillable = [
        'formation_id',
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

    public function formation(): BelongsTo
    {
        return $this->belongsTo(Formation::class);
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
