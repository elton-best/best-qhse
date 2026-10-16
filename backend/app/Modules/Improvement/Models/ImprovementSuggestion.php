<?php

namespace App\Modules\Improvement\Models;

use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use App\Traits\HasAuditFields;
use App\Traits\HasReference;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ImprovementSuggestion extends Model
{
    use HasAuditFields, HasFactory, HasReference, SoftDeletes;

    protected $fillable = [
        'ref',
        'site_id',
        'process_id',
        'proposer_id',
        'assigned_to',
        'title',
        'description',
        'normes',
        'impact',
        'status',
        'follow_up',
        'validation_comment',
        'proposed_at',
        'source_type', 'source_ref', 'source_id', 'decision_note', 'decided_by', 'decided_at', 'action_id',
    ];

    protected function casts(): array
    {
        return [
            'proposed_at' => 'date',
            'decided_at' => 'datetime',
            'normes' => 'array',
        ];
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function process(): BelongsTo
    {
        return $this->belongsTo(Process::class);
    }

    public function proposer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'proposer_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
