<?php

namespace App\Modules\Leadership\Models;

use App\Models\Site;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QhseEthicsReport extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'enterprise_id',
        'site_id',
        'reporter_user_id',
        'tracking_token_hash',
        'category',
        'subject',
        'description',
        'incident_date',
        'is_anonymous',
        'status',
        'public_update',
        'handling_notes',
        'handled_by_user_id',
        'handled_at',
    ];

    protected $casts = [
        'incident_date' => 'date',
        'is_anonymous' => 'boolean',
        'handled_at' => 'datetime',
        'description' => 'encrypted',
        'public_update' => 'encrypted',
        'handling_notes' => 'encrypted',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_user_id');
    }

    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by_user_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(QhseEthicsReportEvent::class, 'report_id')->orderBy('created_at');
    }
}
