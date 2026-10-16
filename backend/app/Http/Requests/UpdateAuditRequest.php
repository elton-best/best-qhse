<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ScopedExistsRules;
use App\Models\Audit;
use Illuminate\Foundation\Http\FormRequest;

class UpdateAuditRequest extends FormRequest
{
    use ScopedExistsRules;

    public function authorize(): bool
    {
        $audit = $this->route('id') ? Audit::find($this->route('id')) : null;

        return $audit && $this->user()->can('update', $audit);
    }

    public function rules(): array
    {
        return [
            'type' => 'sometimes|in:internal,external,certification,system,process,product,supplier,thematic,surveillance',
            'title' => 'sometimes|string|max:255',
            'planned_date' => 'sometimes|date|after_or_equal:today',
            'lead_auditor_id' => ['sometimes', ...$this->ownedExists('users')],
            'assigned_to' => ['required_if:type,internal', ...$this->ownedExists('users')],
            'team_members' => 'nullable|array',
            'team_members.*' => $this->ownedExists('users'),
            'scope' => 'nullable|string|max:2000',
            'objectives' => 'required_if:type,internal|string|max:2000',
            'reference_documents' => 'required_if:type,internal|string|max:3000',
            'report_source' => 'sometimes|in:auto,external',
            'report_version' => 'sometimes|integer|min:1|max:999',
            'm9_d2_traceability' => 'nullable|array',
            'm9_d5_traceability' => 'nullable|array',
        ];
    }
}
