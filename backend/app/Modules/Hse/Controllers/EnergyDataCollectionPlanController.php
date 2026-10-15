<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyDataCollectionPlan;

/**
 * Planification de la collecte des données énergétiques.
 */
class EnergyDataCollectionPlanController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EnergyDataCollectionPlan::class;
    }

    protected function label(): string
    {
        return 'Planification de la collecte des données énergétiques';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'data_point' => 'required|string|max:255',
            'energy_source' => 'nullable|string|max:255',
            'measurement_method' => 'nullable|string',
            'equipment_id' => 'nullable|integer',
            'frequency' => 'nullable|in:continuous,daily,weekly,monthly,quarterly,annual',
            'unit' => 'nullable|string|max:30',
            'data_source' => 'nullable|string|max:255',
            'storage_location' => 'nullable|string|max:255',
            'last_collected_at' => 'nullable|date',
            'next_due_date' => 'nullable|date',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:planned,active,suspended,archived',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['data_point', 'Donnée à collecter', 'text'],
            ['energy_source', 'Source d\'énergie', 'text'],
            ['measurement_method', 'Méthode de mesure', 'text'],
            ['frequency', 'Fréquence (continuous, daily, weekly, monthly, quarterly, annual)', 'text'],
            ['unit', 'Unité', 'text'],
            ['data_source', 'Source de la donnée', 'text'],
            ['storage_location', 'Lieu de stockage', 'text'],
            ['next_due_date', 'Prochaine échéance (AAAA-MM-JJ)', 'date'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (planned, active, suspended, archived)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'frequency'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'data_point'];
    }
}
