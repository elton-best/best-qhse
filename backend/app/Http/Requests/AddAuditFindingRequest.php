<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ScopedExistsRules;
use App\Models\Audit;
use Illuminate\Foundation\Http\FormRequest;

class AddAuditFindingRequest extends FormRequest
{
    use ScopedExistsRules;

    public function authorize(): bool
    {
        $audit = $this->route('id') ? Audit::find($this->route('id')) : null;

        return $audit && $this->user()->can('addFinding', $audit);
    }

    public function rules(): array
    {
        return [
            'type' => 'required|in:nc_major,nc_minor,observation,opportunity,good_practice,conforming',
            'title' => 'required|string|max:255',
            'description' => 'required|string|min:10|max:2000',
            'evidence' => 'nullable|string|max:1000',
            'clause_iso' => 'nullable|string|max:50',
            'process_id' => ['nullable', ...$this->ownedExists('processes')],
            'severity' => 'required_if:type,nc_major,nc_minor|nullable|in:low,medium,high,critical',
            'priority' => 'required_if:type,nc_major,nc_minor|nullable|integer|between:1,5',
        ];
    }
}
