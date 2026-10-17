<?php

namespace App\Modules\Leadership\Models;

use App\Modules\Enterprise\Models\User;
use App\Modules\Leadership\Models\QhsePolicy;
use Illuminate\Database\Eloquent\Model;

class QhsePolicyAcknowledgement extends Model
{
    protected $fillable = [
        'qhse_policy_id',
        'user_id',
        'notified_at',
        'acknowledged_at',
        'quiz_score',
        'quiz_passed',
        'quiz_answers',
        'quiz_completed_at',
    ];

    protected $casts = [
        'notified_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'quiz_score' => 'integer',
        'quiz_passed' => 'boolean',
        'quiz_answers' => 'array',
        'quiz_completed_at' => 'datetime',
    ];

    public function policy()
    {
        return $this->belongsTo(QhsePolicy::class, 'qhse_policy_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
