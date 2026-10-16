<?php

namespace App\Modules\Support\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Support\Models\CalibrationPlan;
use App\Modules\Support\Models\CalibrationRecord;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * Équipements de surveillance et de mesure — étalonnage / vérification
 * (ISO 9001 §7.1.5.1 et §7.1.5.2 — Q8-05, Q8-06).
 *
 * Le registre s'appuie sur `equipements` (adéquation à l'usage, étalon de
 * référence, protection contre les réglages). Chaque intervention d'étalonnage
 * est historisée dans calibration_records ; un résultat non conforme exige une
 * analyse d'impact sur la validité des résultats.
 */
class CalibrationController extends Controller
{
    public function index(Request $request)
    {
        $query = CalibrationPlan::with([
            'equipment:id,nom_commun,code_complet',
            'responsible:id,name',
        ]);

        if ($request->filled('equipment_id')) {
            $query->where('equipment_id', $request->integer('equipment_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->boolean('overdue')) {
            $query->where('next_calibration_date', '<', now()->toDateString())
                ->whereNotIn('status', ['suspended']);
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('service_provider', 'like', $term)
                    ->orWhere('reference_standard', 'like', $term)
                    ->orWhereHas('equipment', function ($eq) use ($term) {
                        $eq->where('nom_commun', 'like', $term)->orWhere('code_complet', 'like', $term);
                    });
            });
        }

        return response()->json($query->orderBy('next_calibration_date')->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $this->normalizeInput($request);
        $validated = $this->validated($request);
        $validated['enterprise_id'] = $validated['enterprise_id'] ?? $request->user()?->enterprise_id;

        $plan = CalibrationPlan::create($validated);

        return response()->json(
            $plan->load(['equipment:id,nom_commun,code_complet', 'responsible:id,name']),
            201
        );
    }

    public function show(CalibrationPlan $calibrationPlan)
    {
        return response()->json($calibrationPlan->load([
            'equipment:id,nom_commun,code_complet',
            'responsible:id,name',
            'records' => fn ($q) => $q->latest('performed_date'),
        ]));
    }

    public function update(Request $request, CalibrationPlan $calibrationPlan)
    {
        $this->normalizeInput($request);
        $validated = $this->validated($request, partial: true);

        $calibrationPlan->update($validated);

        return response()->json(
            $calibrationPlan->fresh()->load(['equipment:id,nom_commun,code_complet', 'responsible:id,name'])
        );
    }

    public function destroy(CalibrationPlan $calibrationPlan)
    {
        $calibrationPlan->delete();

        return response()->json(['message' => 'Plan d\'étalonnage supprimé.']);
    }

    /**
     * Historique des étalonnages / vérifications d'un équipement de mesure.
     */
    public function indexRecords(CalibrationPlan $calibrationPlan)
    {
        return response()->json(
            $calibrationPlan->records()->latest('performed_date')->get()
        );
    }

    /**
     * Enregistre un étalonnage. Un résultat non conforme exige une analyse
     * d'impact (§7.1.5.2) et suspend l'équipement jusqu'à remise en service.
     */
    public function storeRecord(Request $request, CalibrationPlan $calibrationPlan)
    {
        $validated = $request->validate([
            'performed_date' => 'required|date',
            'certificate_number' => 'nullable|string|max:255',
            'certificate_path' => 'nullable|string|max:500',
            'results' => 'nullable|array',
            'conformity_status' => 'nullable|in:conforming,non_conforming,partial',
            'cost' => 'nullable|numeric|min:0',
            'next_calibration_date' => 'nullable|date|after:performed_date',
            'impact_analysis' => 'nullable|string',
            'impact_assessed' => 'nullable|boolean',
            'comments' => 'nullable|string',
        ]);

        $conformity = $validated['conformity_status'] ?? 'conforming';
        if ($conformity === 'non_conforming' && trim((string) ($validated['impact_analysis'] ?? '')) === '') {
            return response()->json([
                'message' => 'Une analyse d\'impact sur la validité des résultats est exigée (§ 7.1.5.2).',
                'errors' => ['impact_analysis' => ['Analyse d\'impact obligatoire en cas d\'étalonnage non conforme.']],
            ], 422);
        }

        $performed = CarbonImmutable::parse($validated['performed_date']);
        $next = $validated['next_calibration_date'] ?? null;
        if ($next === null && $calibrationPlan->frequency) {
            $months = $this->frequencyInMonths($calibrationPlan->frequency);
            if ($months !== null) {
                $next = $performed->addMonths($months)->toDateString();
            }
        }

        $record = CalibrationRecord::create([
            'calibration_plan_id' => $calibrationPlan->id,
            'performed_date' => $performed->toDateString(),
            'certificate_number' => $validated['certificate_number'] ?? null,
            'certificate_path' => $validated['certificate_path'] ?? null,
            'results' => $validated['results'] ?? null,
            'conformity_status' => $conformity,
            'cost' => $validated['cost'] ?? null,
            'next_calibration_date' => $next,
            'impact_analysis' => $validated['impact_analysis'] ?? null,
            'impact_assessed' => (bool) ($validated['impact_assessed'] ?? false),
        ]);

        $calibrationPlan->forceFill([
            'last_calibration_date' => $performed->toDateString(),
            'next_calibration_date' => $next ?? $calibrationPlan->next_calibration_date,
            'scheduled_date' => $next ?? $calibrationPlan->scheduled_date,
            'status' => match ($conformity) {
                'conforming' => 'valid',
                'partial' => 'due',
                default => 'suspended',
            },
            'alert_sent' => false,
        ])->save();

        return response()->json($record, 201);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'enterprise_id' => 'nullable|exists:enterprises,id',
            'equipment_id' => 'nullable|exists:equipements,id',
            'frequency' => "{$required}|string|max:50",
            'last_calibration_date' => 'nullable|date',
            'next_calibration_date' => 'nullable|date',
            'scheduled_date' => 'nullable|date',
            'calibration_certificate_path' => 'nullable|string|max:500',
            'alert_days_before' => 'nullable|integer|min:1|max:365',
            'service_provider' => 'nullable|string|max:255',
            'service_provider_accreditation' => 'nullable|string|max:255',
            'usage_fitness' => 'nullable|string',
            'reference_standard' => 'nullable|string|max:255',
            'reference_standard_documented' => 'nullable|boolean',
            'protected_against_adjustment' => 'nullable|boolean',
            'responsible_user_id' => 'nullable|exists:users,id',
            'status' => 'nullable|in:valid,due,overdue,suspended',
        ]);
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }
        foreach (['reference_standard_documented', 'protected_against_adjustment'] as $flag) {
            if ($request->has($flag)) {
                $merge[$flag] = $this->normalizeBoolean($request->input($flag));
            }
        }
        // Alias frontend : pilot_id (responsable générique) -> responsible_user_id.
        if (!$request->filled('responsible_user_id') && $request->filled('pilot_id')) {
            $pilot = $request->input('pilot_id');
            $merge['responsible_user_id'] = is_numeric($pilot) ? (int) $pilot : null;
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'valid' => 'valid',
            'valide' => 'valid',
            'a etalonner' => 'due',
            'due' => 'due',
            'en retard' => 'overdue',
            'overdue' => 'overdue',
            'suspendu' => 'suspended',
            'suspendue' => 'suspended',
            'suspended' => 'suspended',
        ];
        $status = $map[$normalized] ?? 'valid';

        return in_array($status, CalibrationPlan::STATUSES, true) ? $status : 'valid';
    }

    private function normalizeBoolean(mixed $value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_bool($value)) {
            return $value;
        }

        $normalized = $this->unaccent(mb_strtolower(trim((string) $value)));

        if (in_array($normalized, ['oui', 'yes', 'true', '1', 'vrai'], true)) {
            return true;
        }
        if (in_array($normalized, ['non', 'no', 'false', '0', 'faux'], true)) {
            return false;
        }

        return null;
    }

    /**
     * "12", "12 mois", "annuel", "semestriel", "trimestriel", "mensuel" -> mois.
     */
    private function frequencyInMonths(string $frequency): ?int
    {
        $normalized = $this->unaccent(mb_strtolower(trim($frequency)));
        $keywords = [
            'annuel' => 12,
            'annuelle' => 12,
            'semestriel' => 6,
            'semestrielle' => 6,
            'trimestriel' => 3,
            'trimestrielle' => 3,
            'mensuel' => 1,
            'mensuelle' => 1,
        ];
        foreach ($keywords as $keyword => $months) {
            if (str_contains($normalized, $keyword)) {
                return $months;
            }
        }

        if (preg_match('/(\d+)\s*(mois|month)/', $normalized, $m)) {
            return (int) $m[1];
        }
        if (preg_match('/(\d+)\s*(an|annee|year)/', $normalized, $m)) {
            return (int) $m[1] * 12;
        }
        if (preg_match('/^(\d+)$/', $normalized, $m)) {
            return (int) $m[1];
        }

        return null;
    }

    private function unaccent(string $value): string
    {
        return str_replace(
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç', '’'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c', "'"],
            $value
        );
    }
}
