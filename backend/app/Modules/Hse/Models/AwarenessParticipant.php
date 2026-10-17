<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;
use App\Traits\BelongsToEnterprise;
use Illuminate\Database\Eloquent\Model;

class AwarenessParticipant extends Model
{
    use BelongsToEnterprise;

    protected $fillable = [
        'enterprise_id', 'campaign_id', 'user_id', 'kind', 'external_name', 'external_email', 'organization', 'token_hash',
        'invited_at', 'completed_at', 'attestation_number',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return ['invited_at' => 'datetime', 'completed_at' => 'datetime'];
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function campaign()
    {
        return $this->belongsTo(AwarenessCampaign::class, 'campaign_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function receipts()
    {
        return $this->hasMany(AwarenessReceipt::class, 'participant_id');
    }

    public function displayName(): string
    {
        return $this->kind === 'external' ? (string) $this->external_name : (string) ($this->user?->name ?? '');
    }
}
