<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EmergencyProcedure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Scénarios de situations d'urgence et plans de réponse (ISO 14001:2026 §8.2, M13-01 et M13-02).
 */
class EmergencyProcedureController extends Controller
{
    use ScopesToUserTenant;

    private const RELATIONS = ['site:id,name', 'responsible:id,name,email', 'aspect:id,aspect_number,aspect,impact'];

    /** Statuts qui supposent un plan de réponse défini : « prêt », puis « testé ». */
    private const READY_STATUSES = ['operationnel', 'teste'];

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = EmergencyProcedure::query()->with(self::RELATIONS)->withCount(['exercises', 'events']);

        foreach (['site_id', 'emergency_type', 'status'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }
        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->query('search')).'%';
            $query->where(fn ($inner) => $inner->where('title', 'ilike', $term)->orWhere('emergency_type', 'ilike', $term)->orWhere('hazard_nature', 'ilike', $term));
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByRaw("case status when 'a_reviser' then 0 when 'planifie' then 1 else 2 end")->orderBy('next_drill_date')->paginate(min($request->integer('per_page', 50), 200)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $validated = $request->validate($this->rules(false));
        $site = $this->resolveSite($request, isset($validated['site_id']) ? (int) $validated['site_id'] : null);
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $validated, (int) $site->enterprise_id);

        $validated['status'] = $validated['status'] ?? 'planifie';
        $this->assertReadyWhenOperational($validated, null);

        $procedure = EmergencyProcedure::create($validated + ['site_id' => $site->id, 'enterprise_id' => $site->enterprise_id]);

        return response()->json([
            'success' => true,
            'message' => 'Situation d\'urgence enregistrée avec succès.',
            'data' => $procedure->load(self::RELATIONS),
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);

        return response()->json([
            'success' => true,
            'data' => EmergencyProcedure::query()->with(self::RELATIONS)->with(['contacts', 'exercises' => fn ($q) => $q->orderByDesc('planned_date')])->findOrFail($id),
        ]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $procedure = EmergencyProcedure::query()->findOrFail($id);
        $validated = $request->validate($this->rules(true));
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $validated, (int) $procedure->enterprise_id);
        $this->assertReadyWhenOperational($validated, $procedure);

        if (array_key_exists('status', $validated) && $validated['status'] !== 'a_reviser' && $procedure->status === 'a_reviser') {
            $validated['last_reviewed_at'] = today();
            $validated['review_reason'] = null;
        }
        $procedure->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Situation d\'urgence mise à jour.',
            'data' => $procedure->fresh(self::RELATIONS),
        ]);
    }

    /**
     * Enregistrement direct d'un exercice (historique) : conservé pour compatibilité ; le suivi complet
     * passe par les exercices (`emergency-exercises`).
     */
    public function recordDrill(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $procedure = EmergencyProcedure::query()->findOrFail($id);

        $validated = $request->validate([
            'drill_date' => 'required|date|before_or_equal:today',
            'drill_report' => 'required|string',
            'next_drill_date' => 'nullable|date|after:drill_date',
        ]);

        $procedure->update([
            'last_drill_date' => $validated['drill_date'],
            'drill_report' => $validated['drill_report'],
            'next_drill_date' => $validated['next_drill_date'] ?? null,
            'status' => 'teste',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Exercice de simulation enregistré avec succès.',
            'data' => $procedure->fresh(self::RELATIONS),
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $procedure = EmergencyProcedure::query()->findOrFail($id);
        abort_if($procedure->events()->exists(), 422, 'Ce scénario est lié à des situations d\'urgence réelles : archivez-le plutôt que de le supprimer.');
        $procedure->delete();

        return response()->json(['success' => true, 'message' => 'Situation d\'urgence supprimée.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(bool $sometimes): array
    {
        $required = $sometimes ? 'sometimes|required' : 'required';
        $optional = $sometimes ? 'sometimes|nullable' : 'nullable';

        return [
            'site_id' => 'nullable|integer',
            'emergency_type' => "{$required}|string|max:100",
            'title' => "{$required}|string|max:255",
            'measures' => "{$optional}|string",
            'responsible_id' => "{$optional}|integer",
            'deadline' => "{$optional}|date",
            'status' => "{$optional}|in:planifie,operationnel,teste,a_reviser",
            'hazard_nature' => "{$optional}|string|max:255",
            'probable_scale' => "{$optional}|string|max:255",
            'neighbour_risk' => "{$optional}|string",
            'prevention_actions' => "{$optional}|string",
            'mitigation_actions' => "{$optional}|string",
            'internal_communication' => "{$optional}|string",
            'external_communication' => "{$optional}|string",
            'evacuation_routes' => "{$optional}|string",
            'assembly_points' => "{$optional}|string",
            'procedure_steps' => "{$optional}|array",
            'required_equipment' => "{$optional}|array",
            'training_required' => "{$optional}|boolean",
            'next_drill_date' => "{$optional}|date",
            'next_review_date' => "{$optional}|date",
            'review_reason' => "{$optional}|string|max:255",
        ];
    }

    /**
     * Un scénario ne devient « prêt » ou « testé » que si son plan de réponse est défini : mesures et responsable.
     *
     * @param  array<string, mixed>  $validated
     */
    private function assertReadyWhenOperational(array $validated, ?EmergencyProcedure $existing): void
    {
        $status = $validated['status'] ?? $existing?->status;
        if (! in_array($status, self::READY_STATUSES, true)) {
            return;
        }

        $measures = array_key_exists('measures', $validated) ? $validated['measures'] : $existing?->measures;
        $responsible = array_key_exists('responsible_id', $validated) ? $validated['responsible_id'] : $existing?->responsible_id;
        $missing = array_filter([blank($measures) ? 'measures' : null, blank($responsible) ? 'responsible_id' : null]);
        if ($missing !== []) {
            abort(response()->json([
                'message' => 'Le plan de réponse est incomplet : renseignez les mesures de préparation et de réponse et un responsable avant de déclarer le scénario prêt.',
                'errors' => array_fill_keys($missing, ['Obligatoire pour un scénario prêt.']),
            ], 422));
        }
    }
}
