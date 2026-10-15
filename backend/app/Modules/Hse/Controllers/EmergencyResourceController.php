<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EmergencyResource;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Inventaire des moyens d'intervention (M13-04) avec dates de vérification et alertes.
 */
class EmergencyResourceController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EmergencyResource::class;
    }

    protected function label(): string
    {
        return "Moyen d'intervention";
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'resource_type' => 'nullable|in:'.implode(',', EmergencyResource::TYPES),
            'location' => 'nullable|string|max:255',
            'quantity' => 'nullable|integer|min:0|max:100000',
            'specification' => 'nullable|string|max:255',
            'last_check_date' => 'nullable|date|before_or_equal:today',
            'check_frequency_days' => 'nullable|integer|min:1|max:3650',
            'status' => 'nullable|in:operational,to_check,defective,out_of_service',
            'procedure_id' => 'nullable|integer',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Moyen', 'text'],
            ['resource_type', 'Type (extinguisher, spill_kit, first_aid, alarm, eyewash, pump, other)', 'text'],
            ['location', 'Emplacement', 'text'],
            ['quantity', 'Quantité', 'number'],
            ['specification', 'Caractéristiques', 'text'],
            ['last_check_date', 'Dernière vérification (AAAA-MM-JJ)', 'date'],
            ['check_frequency_days', 'Fréquence de vérification (jours)', 'number'],
            ['status', 'Statut (operational, to_check, defective, out_of_service)', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'resource_type', 'procedure_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'location'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'procedure:id,title'];
    }

    /**
     * La prochaine vérification découle de la dernière et de la fréquence ; un moyen vérifié repasse « opérationnel ».
     */
    protected function derive(array $data, ?Model $existing): array
    {
        $last = array_key_exists('last_check_date', $data) ? $data['last_check_date'] : $existing?->last_check_date;
        $frequency = (int) (array_key_exists('check_frequency_days', $data) ? $data['check_frequency_days'] : ($existing?->check_frequency_days ?? 365));
        if ($last) {
            $data['next_check_date'] = Carbon::parse($last)->addDays($frequency)->toDateString();
            if (array_key_exists('last_check_date', $data) && ! array_key_exists('status', $data) && $existing?->status === 'to_check') {
                $data['status'] = 'operational';
            }
        }

        return $data;
    }
}
