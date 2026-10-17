<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ScopedExistsRules;
use App\Models\Audit;
use Illuminate\Foundation\Http\FormRequest;

class StoreAuditRequest extends FormRequest
{
    use ScopedExistsRules;

    public function authorize(): bool
    {
        return $this->user()->can('create', Audit::class);
    }

    public function rules(): array
    {
        return [
            'audit_program_id' => ['nullable', ...$this->ownedProgramExists()],
            'site_id' => ['required', ...$this->ownedExists('sites')],
            'type' => 'required|in:internal,external,certification,system,process,product,supplier,thematic,surveillance',
            'title' => 'required|string|max:255',
            'planned_date' => 'required|date|after_or_equal:today',
            'quarter' => 'nullable|integer|between:1,4',
            'frequency' => 'nullable|in:annual,biannual,quarterly,monthly,ad_hoc',
            'lead_auditor_id' => ['required', ...$this->ownedExists('users')],
            'assigned_to' => ['required_if:type,internal', ...$this->ownedExists('users')],
            'team_members' => 'nullable|array',
            'team_members.*' => $this->ownedExists('users'),
            'auditor_ids' => 'nullable|array',
            'auditor_ids.*' => $this->ownedExists('users'),
            'auditee_ids' => 'nullable|array',
            'auditee_ids.*' => $this->ownedExists('users'),
            'scope' => 'nullable|string|max:2000',
            'objectives' => 'required_if:type,internal|string|max:2000',
            'reference_documents' => 'required_if:type,internal|string|max:3000',
            'risk_based_criteria' => 'nullable|string|max:1000',
            'm9_d2_traceability' => 'nullable|array',
            'm9_d5_traceability' => 'nullable|array',
            'axes' => 'nullable|array',
            'axes.*' => 'string|in:Q,HS,E',
            'processes' => 'nullable|array',
            'processes.*' => $this->ownedExists('processes'),
            'process_ids' => 'nullable|array',
            'process_ids.*' => $this->ownedExists('processes'),
        ];
    }
}
