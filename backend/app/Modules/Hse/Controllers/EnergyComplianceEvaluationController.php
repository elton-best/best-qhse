<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyComplianceEvaluation;

/**
 * Évaluation de conformité énergétique.
 */
class EnergyComplianceEvaluationController extends EnergyRecordController
{
    protected function modelClass(): string
    {
        return EnergyComplianceEvaluation::class;
    }

    protected function label(): string
    {
        return 'Évaluation de conformité énergétique';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'legal_requirement' => 'required|string',
            'source' => 'nullable|string|max:255',
            'evaluation_method' => 'nullable|string|max:255',
            'evaluation_date' => 'nullable|date',
            'next_evaluation_date' => 'nullable|date',
            'result' => 'nullable|in:not_evaluated,compliant,partial,non_compliant',
            'gap_description' => 'nullable|string',
            'action_required' => 'nullable|string',
            'evidence' => 'nullable|string',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:planned,evaluated,action_open,closed',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['legal_requirement', 'Exigence légale ou autre', 'text'],
            ['source', 'Source', 'text'],
            ['evaluation_method', 'Méthode d\'évaluation', 'text'],
            ['evaluation_date', 'Date d\'évaluation (AAAA-MM-JJ)', 'date'],
            ['next_evaluation_date', 'Prochaine évaluation (AAAA-MM-JJ)', 'date'],
            ['result', 'Résultat (not_evaluated, compliant, partial, non_compliant)', 'text'],
            ['gap_description', 'Écart constaté', 'text'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (planned, evaluated, action_open, closed)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'result'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'source'];
    }
}
