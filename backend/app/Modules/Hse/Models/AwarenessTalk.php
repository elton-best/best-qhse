<?php

namespace App\Modules\Hse\Models;

/**
 * Causerie de 10 minutes : liste d'émargement signée par QR code.
 */
class AwarenessTalk extends ManagedRecord
{
    protected static string $referencePrefix = 'CAU';

    protected $table = 'awareness_talks';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'campaign_id', 'topic', 'held_on', 'duration_minutes', 'notes',
        'qr_token', 'status', 'closed_at',
    ];

    protected $hidden = ['qr_token'];

    protected function casts(): array
    {
        return ['held_on' => 'date', 'closed_at' => 'datetime', 'duration_minutes' => 'integer'];
    }

    public function attendances()
    {
        return $this->hasMany(AwarenessAttendance::class, 'talk_id')->orderBy('signed_at');
    }
}
