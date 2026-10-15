<?php

namespace App\Modules\Hse\Models;

/**
 * Exercice ou simulation d'un scénario d'urgence, avec constats et actions.
 */
class EmergencyExercise extends ManagedRecord
{
    public const TYPES = ['drill', 'tabletop', 'evacuation', 'full_scale'];

    protected static string $referencePrefix = 'EXE';

    protected $table = 'emergency_exercises';

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'procedure_id', 'exercise_type', 'planned_date',
        'performed_date', 'participants_count', 'participants', 'description', 'findings', 'actions_required',
        'stakeholders_informed', 'status',
    ];

    protected function casts(): array
    {
        return ['planned_date' => 'date', 'performed_date' => 'date', 'participants_count' => 'integer'];
    }

    public function procedure()
    {
        return $this->belongsTo(EmergencyProcedure::class, 'procedure_id');
    }
}
