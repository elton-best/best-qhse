<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyMonitoringRecord;
use Illuminate\Database\Eloquent\Model;

/**
 * Relevé de surveillance énergétique.
 */
class EnergyMonitoringRecordController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EnergyMonitoringRecord::class;
    }

    protected function label(): string
    {
        return 'Relevé de surveillance énergétique';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'ipe_id' => 'nullable|integer',
            'equipment_id' => 'nullable|integer',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'planned_value' => 'nullable|numeric',
            'measured_value' => 'required|numeric',
            'unit' => 'nullable|string|max:30',
            'analysis' => 'nullable|string',
            'action_required' => 'nullable|boolean',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:recorded,analysed,action_required,closed',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['period_start', 'Début période (AAAA-MM-JJ)', 'date'],
            ['period_end', 'Fin période (AAAA-MM-JJ)', 'date'],
            ['planned_value', 'Valeur prévue', 'number'],
            ['measured_value', 'Valeur mesurée', 'number'],
            ['unit', 'Unité', 'text'],
            ['analysis', 'Analyse', 'text'],
            ['action_required', 'Action requise (oui/non)', 'bool'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (recorded, analysed, action_required, closed)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'ipe_id', 'equipment_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        $planned = array_key_exists('planned_value', $data) ? $data['planned_value'] : $existing?->planned_value;
        $measured = array_key_exists('measured_value', $data) ? $data['measured_value'] : $existing?->measured_value;
        if ($planned !== null && $measured !== null) {
            $deviation = (float) $measured - (float) $planned;
            $data['deviation'] = round($deviation, 3);
            $data['deviation_percent'] = (float) $planned !== 0.0 ? round($deviation / (float) $planned * 100, 2) : null;
        } else {
            $data['deviation'] = null;
            $data['deviation_percent'] = null;
        }

        if (($data['status'] ?? null) === 'action_required') {
            $data['action_required'] = true;
        }

        return $data;
    }
}
