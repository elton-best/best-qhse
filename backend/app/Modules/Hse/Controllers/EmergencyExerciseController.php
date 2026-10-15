<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EmergencyExercise;
use App\Modules\Hse\Models\EmergencyProcedure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Exercices et simulations (M13-05) : planification, puis compte rendu avec constats et actions.
 */
class EmergencyExerciseController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EmergencyExercise::class;
    }

    protected function label(): string
    {
        return 'Exercice';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'procedure_id' => 'required|integer',
            'exercise_type' => 'nullable|in:'.implode(',', EmergencyExercise::TYPES),
            'planned_date' => 'nullable|date',
            'description' => 'nullable|string',
            'participants' => 'nullable|string',
            'stakeholders_informed' => 'nullable|string',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Exercice', 'text'],
            ['exercise_type', 'Type (drill, tabletop, evacuation, full_scale)', 'text'],
            ['planned_date', 'Date prévue (AAAA-MM-JJ)', 'date'],
            ['performed_date', 'Date réalisée (AAAA-MM-JJ)', 'date'],
            ['participants_count', 'Participants', 'number'],
            ['findings', 'Constats', 'text'],
            ['status', 'Statut', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'procedure_id', 'exercise_type'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'procedure:id,title,status'];
    }

    public function update(Request $request, int $id): JsonResponse
    {
        abort_if($this->modelClass()::query()->findOrFail($id)->status === 'done', 422, 'Un exercice réalisé est un compte rendu figé : planifiez un nouvel exercice pour le compléter.');

        return parent::update($request, $id);
    }

    /**
     * Compte rendu de l'exercice : constats obligatoires ; le scénario devient « testé » et l'exercice suivant est planifié.
     */
    public function complete(Request $request, int $id): JsonResponse
    {
        $exercise = EmergencyExercise::query()->with('procedure')->findOrFail($id);
        abort_if($exercise->status === 'done', 422, 'Cet exercice est déjà clôturé.');
        abort_if($exercise->status === 'cancelled', 422, 'Un exercice annulé ne peut pas être clôturé.');

        $data = $request->validate([
            'performed_date' => 'required|date|before_or_equal:today',
            'findings' => 'required|string|min:10',
            'participants_count' => 'nullable|integer|min:1|max:100000',
            'actions_required' => 'nullable|string',
            'stakeholders_informed' => 'nullable|string',
            'next_drill_date' => 'nullable|date|after:performed_date',
        ]);

        DB::transaction(function () use ($exercise, $data) {
            $exercise->update([
                'performed_date' => $data['performed_date'],
                'findings' => $data['findings'],
                'participants_count' => $data['participants_count'] ?? $exercise->participants_count,
                'actions_required' => $data['actions_required'] ?? null,
                'stakeholders_informed' => $data['stakeholders_informed'] ?? $exercise->stakeholders_informed,
                'status' => 'done',
            ]);

            /** @var EmergencyProcedure|null $procedure */
            $procedure = $exercise->procedure;
            if ($procedure) {
                $procedure->update([
                    'last_drill_date' => $data['performed_date'],
                    'drill_report' => $data['findings'],
                    'next_drill_date' => $data['next_drill_date'] ?? null,
                    // Un exercice ne valide pas un plan incomplet ni ne masque une révision demandée.
                    'status' => in_array($procedure->status, ['operationnel', 'teste'], true) ? 'teste' : $procedure->status,
                ]);
            }
        });

        return response()->json($exercise->fresh($this->relations()));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $exercise = EmergencyExercise::query()->findOrFail($id);
        abort_if($exercise->status !== 'planned', 422, 'Seul un exercice planifié peut être annulé.');
        $exercise->update(['status' => 'cancelled']);

        return response()->json($exercise->fresh($this->relations()));
    }
}
