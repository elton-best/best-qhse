<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EnergyPurchase;
use Illuminate\Database\Eloquent\Model;

/**
 * Achat d'énergie.
 */
class EnergyPurchaseController extends EnergyRecordController
{
    protected function modelClass(): string
    {
        return EnergyPurchase::class;
    }

    protected function label(): string
    {
        return 'Achat d\'énergie';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'energy_type' => 'required|string|max:255',
            'provider_partner_id' => 'nullable|integer',
            'supplier_name' => 'nullable|string|max:255',
            'contract_ref' => 'nullable|string|max:255',
            'quantity' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:30',
            'unit_price' => 'nullable|numeric|min:0',
            'total_amount' => 'nullable|numeric|min:0',
            'purchase_date' => 'nullable|date',
            'delivery_date' => 'nullable|date',
            'evaluation_criteria' => 'nullable|string',
            'supplier_score' => 'nullable|integer|between:0,100',
            'evaluation_notes' => 'nullable|string',
            'responsible_id' => 'nullable|integer',
            'status' => 'nullable|in:draft,ordered,received,evaluated,cancelled',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Titre', 'text'],
            ['energy_type', 'Type d\'énergie', 'text'],
            ['supplier_name', 'Fournisseur', 'text'],
            ['contract_ref', 'Référence contrat', 'text'],
            ['quantity', 'Quantité', 'number'],
            ['unit', 'Unité', 'text'],
            ['unit_price', 'Prix unitaire', 'number'],
            ['total_amount', 'Montant total', 'number'],
            ['purchase_date', 'Date d\'achat (AAAA-MM-JJ)', 'date'],
            ['supplier_score', 'Note fournisseur (0-100)', 'number'],
            ['responsible_id', 'Responsable (nom)', 'user'],
            ['status', 'Statut (draft, ordered, received, evaluated, cancelled)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'energy_type', 'provider_partner_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'supplier_name', 'energy_type'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        $quantity = array_key_exists('quantity', $data) ? $data['quantity'] : $existing?->quantity;
        $unitPrice = array_key_exists('unit_price', $data) ? $data['unit_price'] : $existing?->unit_price;
        if (! array_key_exists('total_amount', $data) && $quantity !== null && $unitPrice !== null) {
            $data['total_amount'] = round((float) $quantity * (float) $unitPrice, 2);
        }

        return $data;
    }
}
