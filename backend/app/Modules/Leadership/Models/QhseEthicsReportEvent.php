<?php

namespace App\Modules\Leadership\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QhseEthicsReportEvent extends Model
{
    protected $fillable = [
        'actor_user_id',
        'event_type',
        'from_status',
        'to_status',
        'notes',
    ];

    protected $casts = [
        'notes' => 'encrypted',
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(QhseEthicsReport::class, 'report_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
