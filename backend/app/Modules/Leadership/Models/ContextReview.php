<?php

namespace App\Modules\Leadership\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContextReview extends Model
{
    protected $fillable = [
        'context_id',
        'reviewer_user_id',
        'reviewed_at',
        'summary',
        'snapshot',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'snapshot' => 'array',
    ];

    public function context(): BelongsTo
    {
        return $this->belongsTo(Context::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_user_id');
    }
}
