<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyDesignReview;

/**
 * Revue de conception énergétique.
 */
class EnergyDesignReviewController extends EnergyRecordController
{
    protected function modelClass(): string
    {
        return EnergyDesignReview::class;
    }

    protected function label(): string
    {
        return 'Revue de conception énergétique';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'project_ref' => 'nullable|string|max:255',
            'design_stage' => 'nullable|in:concept,design,review,validation,commissioning',
            'description' => 'nullable|string',
            'performance_criteria' => 'nullable|string',
            'expected_saving' => 'nullable|numeric',
            'unit' => 'nullable|string|max:30',
            'review_notes' => 'nullable|string',
            'outputs' => 'nullable|string',
            'review_date' => 'nullable|date',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:planned,in_review,validated,rejected',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['project_ref', 'Référence projet', 'text'],
            ['design_stage', 'Étape (concept, design, review, validation, commissioning)', 'text'],
            ['description', 'Description', 'text'],
            ['performance_criteria', 'Critères de performance énergétique', 'text'],
            ['expected_saving', 'Gain énergétique attendu', 'number'],
            ['unit', 'Unité', 'text'],
            ['review_date', 'Date de revue (AAAA-MM-JJ)', 'date'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (planned, in_review, validated, rejected)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'design_stage'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'project_ref'];
    }
}
