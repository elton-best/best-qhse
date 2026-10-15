<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;

/**
 * Situation d'urgence réelle : chronologie, maîtrise, clôture et retour d'expérience obligatoire.
 */
class EmergencyEvent extends ManagedRecord
{
    protected static string $referencePrefix = 'URG';

    protected $table = 'emergency_events';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'procedure_id', 'event_type', 'severity',
        'declared_at', 'declared_by', 'description', 'timeline', 'contained_at', 'closed_at', 'debrief',
        'lessons_actions', 'plan_revision_requested', 'aspects_flagged', 'status',
    ];

    protected function casts(): array
    {
        return [
            'declared_at' => 'datetime',
            'contained_at' => 'datetime',
            'closed_at' => 'datetime',
            'timeline' => 'array',
            'plan_revision_requested' => 'boolean',
            'aspects_flagged' => 'integer',
        ];
    }

    public function procedure()
    {
        return $this->belongsTo(EmergencyProcedure::class, 'procedure_id');
    }

    public function declarer()
    {
        return $this->belongsTo(User::class, 'declared_by');
    }
}
