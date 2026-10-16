<?php

namespace App\Modules\Hse\Models;

use App\Modules\Enterprise\Models\User;

/**
 * Changement (ISO 14001 §6.3) : demande, analyse d'impact, approbation, mise en œuvre et revue.
 */
class ManagementChange extends ManagedRecord
{
    protected static string $referencePrefix = 'CHG';

    protected $table = 'management_changes';

    public const TYPES = [
        'new_product', 'new_service', 'new_process', 'new_equipment', 'new_site', 'obligation_change',
        'knowledge_technology', 'material_specification', 'merger_divestment', 'personnel_supplier', 'activity_interruption',
    ];

    /** Dimensions de l'analyse d'impact (M8-02) et module touché par la tâche de mise à jour (M8-04). */
    public const DIMENSIONS = [
        'aspects' => 'Aspects environnementaux',
        'obligations' => 'Obligations de conformité',
        'risks' => 'Risques et opportunités',
        'competences' => 'Compétences',
        'documents' => 'Informations documentées',
        'emergencies' => 'Situations d\'urgence',
        'suppliers' => 'Fournisseurs et prestataires',
    ];

    protected $fillable = [
        'ref', 'enterprise_id', 'site_id', 'title', 'responsible_id', 'change_type', 'origin', 'duration', 'is_planned',
        'description', 'planned_start_date', 'planned_end_date', 'impact_analysis', 'affected_aspect_ids',
        'resources_requested', 'resources_decision', 'resources_decision_note', 'unplanned_consequences',
        'mitigation_measures', 'status', 'analysis_submitted_at', 'decided_by', 'decided_at', 'decision_note',
        'implemented_at', 'review_result', 'review_note', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'is_planned' => 'boolean',
            'planned_start_date' => 'date',
            'planned_end_date' => 'date',
            'impact_analysis' => 'array',
            'affected_aspect_ids' => 'array',
            'resources_requested' => 'array',
            'analysis_submitted_at' => 'datetime',
            'decided_at' => 'datetime',
            'implemented_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function tasks()
    {
        return $this->hasMany(ManagementChangeTask::class, 'change_id');
    }

    public function decider()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
