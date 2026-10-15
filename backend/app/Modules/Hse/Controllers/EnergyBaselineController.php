<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyBaseline;
use Illuminate\Database\Eloquent\Model;

/**
 * Situation énergétique de référence.
 */
class EnergyBaselineController extends EnergyRecordController
{
    protected function modelClass(): string
    {
        return EnergyBaseline::class;
    }

    protected function label(): string
    {
        return 'Situation énergétique de référence';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'energy_source' => 'required|string|max:255',
            'period_start' => 'required|date',
            'period_end' => 'required|date|after_or_equal:period_start',
            'baseline_consumption' => 'required|numeric|min:0',
            'unit' => 'required|string|max:30',
            'relevant_variables' => 'nullable|string',
            'normalization_method' => 'nullable|string',
            'adjustment_notes' => 'nullable|string',
            'ipe_id' => 'nullable|integer',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:draft,validated,revised,archived',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['energy_source', 'Source d\'énergie', 'text'],
            ['period_start', 'Début période (AAAA-MM-JJ)', 'date'],
            ['period_end', 'Fin période (AAAA-MM-JJ)', 'date'],
            ['baseline_consumption', 'Consommation de référence', 'number'],
            ['unit', 'Unité', 'text'],
            ['relevant_variables', 'Variables pertinentes', 'text'],
            ['normalization_method', 'Méthode de normalisation', 'text'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (draft, validated, revised, archived)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'energy_source'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'energy_source'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        if (($data['status'] ?? null) === 'validated' && $existing?->status !== 'validated') {
            $data['validated_by'] = auth()->id();
            $data['validated_at'] = now();
        }

        return $data;
    }
}
