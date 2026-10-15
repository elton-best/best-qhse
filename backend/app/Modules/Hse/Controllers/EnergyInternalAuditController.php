<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyInternalAudit;

/**
 * Audit énergétique interne.
 */
class EnergyInternalAuditController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EnergyInternalAudit::class;
    }

    protected function label(): string
    {
        return 'Audit énergétique interne';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'audit_id' => 'nullable|integer',
            'scope' => 'nullable|string',
            'criteria' => 'nullable|string',
            'planned_date' => 'nullable|date',
            'actual_date' => 'nullable|date',
            'auditors' => 'nullable|string|max:255',
            'nonconformities_count' => 'nullable|integer|min:0',
            'observations_count' => 'nullable|integer|min:0',
            'findings' => 'nullable|string',
            'improvement_opportunities' => 'nullable|string',
            'conclusion' => 'nullable|string',
            'next_audit_date' => 'nullable|date',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:planned,in_progress,completed,closed',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['scope', 'Périmètre', 'text'],
            ['criteria', 'Critères d\'audit', 'text'],
            ['planned_date', 'Date prévue (AAAA-MM-JJ)', 'date'],
            ['actual_date', 'Date réalisée (AAAA-MM-JJ)', 'date'],
            ['auditors', 'Auditeurs', 'text'],
            ['nonconformities_count', 'Non-conformités', 'number'],
            ['observations_count', 'Observations', 'number'],
            ['findings', 'Constats', 'text'],
            ['next_audit_date', 'Prochain audit (AAAA-MM-JJ)', 'date'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (planned, in_progress, completed, closed)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'auditors'];
    }
}
