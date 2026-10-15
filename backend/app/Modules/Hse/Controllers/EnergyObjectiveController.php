<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyObjective;
use Illuminate\Database\Eloquent\Model;

/**
 * Objectif ou cible énergétique.
 */
class EnergyObjectiveController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EnergyObjective::class;
    }

    protected function label(): string
    {
        return 'Objectif ou cible énergétique';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'objective_type' => 'nullable|in:objective,target',
            'ipe_id' => 'nullable|integer',
            'energy_source' => 'nullable|string|max:255',
            'baseline_value' => 'nullable|numeric',
            'target_value' => 'nullable|numeric',
            'current_value' => 'nullable|numeric',
            'unit' => 'nullable|string|max:30',
            'deadline' => 'nullable|date',
            'action_plan' => 'nullable|string',
            'resources_needed' => 'nullable|string',
            'progress_percent' => 'nullable|integer|between:0,100',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:planned,in_progress,achieved,missed,cancelled',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['objective_type', 'Type (objective, target)', 'text'],
            ['energy_source', 'Source d\'énergie', 'text'],
            ['baseline_value', 'Valeur de référence', 'number'],
            ['target_value', 'Valeur cible', 'number'],
            ['current_value', 'Valeur actuelle', 'number'],
            ['unit', 'Unité', 'text'],
            ['deadline', 'Échéance (AAAA-MM-JJ)', 'date'],
            ['action_plan', 'Plan d\'action', 'text'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (planned, in_progress, achieved, missed, cancelled)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'objective_type', 'ipe_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'energy_source'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        if (($data['status'] ?? null) === 'achieved') {
            $data['progress_percent'] = 100;
        }

        return $data;
    }
}
