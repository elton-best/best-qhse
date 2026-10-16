<?php

namespace App\Modules\Hse\Models;

/**
 * Campagne de sensibilisation (ISO 14001 §7.3) : politique, aspects significatifs, contribution au SME, conséquences.
 */
class AwarenessCampaign extends ManagedRecord
{
    protected static string $referencePrefix = 'CSN';

    protected $table = 'awareness_campaigns';

    /** Les quatre points que la sensibilisation doit couvrir (7.3 a à d). */
    public const TOPICS = [
        'policy' => 'La politique environnementale',
        'significant_aspects' => 'Les aspects environnementaux significatifs liés à leur travail',
        'contribution' => 'Leur contribution à l\'efficacité du système de management',
        'consequences' => 'Les conséquences d\'une non-satisfaction des exigences',
    ];

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'objective', 'audience', 'selected_user_ids', 'aspect_ids',
        'start_date', 'end_date', 'status', 'activated_at', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'selected_user_ids' => 'array',
            'aspect_ids' => 'array',
            'start_date' => 'date',
            'end_date' => 'date',
            'activated_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function materials()
    {
        return $this->hasMany(AwarenessMaterial::class, 'campaign_id')->orderBy('position')->orderBy('id');
    }

    public function participants()
    {
        return $this->hasMany(AwarenessParticipant::class, 'campaign_id');
    }
}
