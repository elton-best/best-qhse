<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EmergencyContact;

/**
 * Annuaire d'urgence (M13-03) : joignable en un clic depuis un téléphone.
 */
class EmergencyContactController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EmergencyContact::class;
    }

    protected function label(): string
    {
        return "Contact d'urgence";
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'category' => 'nullable|in:'.implode(',', EmergencyContact::CATEGORIES),
            'job_role' => 'nullable|string|max:255',
            'phone' => ['required', 'string', 'max:50', 'regex:/^[0-9+()\s.\-]{3,}$/'],
            'phone_alt' => ['nullable', 'string', 'max:50', 'regex:/^[0-9+()\s.\-]{3,}$/'],
            'email' => 'nullable|email|max:255',
            'available_24h' => 'nullable|boolean',
            'procedure_id' => 'nullable|integer',
            'sort_order' => 'nullable|integer|min:0|max:65000',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Nom', 'text'],
            ['category', 'Catégorie (staff, fire_brigade, ambulance, police, depollution, utility, neighbour, authority, other)', 'text'],
            ['job_role', 'Fonction', 'text'],
            ['phone', 'Téléphone', 'text'],
            ['phone_alt', 'Téléphone secondaire', 'text'],
            ['email', 'E-mail', 'text'],
            ['available_24h', 'Joignable 24h/24 (oui/non)', 'bool'],
        ];
    }

    protected function filterable(): array
    {
        return ['category', 'procedure_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'job_role', 'phone'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'procedure:id,title'];
    }
}
