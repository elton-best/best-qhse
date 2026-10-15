<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyEquipmentPurchase;

/**
 * Achat d'équipement énergétique.
 */
class EnergyEquipmentPurchaseController extends EnergyRecordController
{
    protected function modelClass(): string
    {
        return EnergyEquipmentPurchase::class;
    }

    protected function label(): string
    {
        return 'Achat d\'équipement énergétique';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'equipment_id' => 'nullable|integer',
            'provider_partner_id' => 'nullable|integer',
            'supplier_name' => 'nullable|string|max:255',
            'efficiency_class' => 'nullable|string|max:255',
            'expected_consumption' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:30',
            'purchase_cost' => 'nullable|numeric|min:0',
            'lifecycle_cost' => 'nullable|numeric|min:0',
            'purchase_date' => 'nullable|date',
            'efficiency_criteria' => 'nullable|string',
            'evaluation_notes' => 'nullable|string',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:draft,ordered,received,evaluated,cancelled',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['supplier_name', 'Fournisseur', 'text'],
            ['efficiency_class', 'Classe d\'efficacité', 'text'],
            ['expected_consumption', 'Consommation attendue', 'number'],
            ['unit', 'Unité', 'text'],
            ['purchase_cost', 'Coût d\'achat', 'number'],
            ['lifecycle_cost', 'Coût sur cycle de vie', 'number'],
            ['purchase_date', 'Date d\'achat (AAAA-MM-JJ)', 'date'],
            ['efficiency_criteria', 'Critères d\'efficacité énergétique', 'text'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (draft, ordered, received, evaluated, cancelled)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'equipment_id', 'provider_partner_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'supplier_name'];
    }
}
