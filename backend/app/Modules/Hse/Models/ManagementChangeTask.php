<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

/**
 * Tâche de mise à jour générée par un changement approuvé, dans le module touché.
 */
class ManagementChangeTask extends Model
{
    use BelongsToEnterprise;

    protected $fillable = [
        'enterprise_id', 'change_id', 'dimension', 'title', 'responsible_id', 'due_date', 'status', 'done_at', 'done_by', 'done_note',
    ];

    protected function casts(): array
    {
        return ['due_date' => 'date', 'done_at' => 'datetime'];
    }

    public function change()
    {
        return $this->belongsTo(ManagementChange::class, 'change_id');
    }

    public function responsible()
    {
        return $this->belongsTo(User::class, 'responsible_id');
    }
}
