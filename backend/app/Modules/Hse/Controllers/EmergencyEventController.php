<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\EmergencyEvent;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\EmergencyAlertService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Situations d'urgence réelles (M13-06) : déclaration rapide, chronologie, maîtrise, puis clôture avec
 * retour d'expérience obligatoire qui révise le plan et la liste des aspects (M4-08).
 */
class EmergencyEventController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return EmergencyEvent::class;
    }

    protected function label(): string
    {
        return "Situation d'urgence";
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'procedure_id' => 'nullable|integer',
            'event_type' => 'nullable|string|max:100',
            'severity' => 'nullable|in:minor,major,critical',
            'description' => 'nullable|string',
            'declared_at' => 'nullable|date|before_or_equal:now',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Événement', 'text'],
            ['event_type', 'Nature', 'text'],
            ['severity', 'Gravité (minor, major, critical)', 'text'],
            ['description', 'Description', 'text'],
            ['status', 'Statut', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'severity', 'procedure_id'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'event_type'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'procedure:id,title,status,procedure_steps,measures,evacuation_routes,assembly_points', 'declarer:id,name'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        if ($existing === null) {
            $declaredAt = isset($data['declared_at']) ? Carbon::parse($data['declared_at']) : now();
            $data['declared_at'] = $declaredAt;
            $data['declared_by'] = auth()->id();
            $data['status'] = 'ongoing';
            $data['timeline'] = [$this->entry($declaredAt->toIso8601String(), 'Déclaration de la situation d\'urgence.')];
        }

        return $data;
    }

    public function store(Request $request): JsonResponse
    {
        $response = parent::store($request);
        if ($response->getStatusCode() === 201) {
            $event = EmergencyEvent::query()->find($response->getData(true)['id'] ?? 0);
            if ($event) {
                app(EmergencyAlertService::class)->notifyDeclared($event);
            }
        }

        return $response;
    }

    public function update(Request $request, int $id): JsonResponse
    {
        abort_if(EmergencyEvent::query()->findOrFail($id)->status === 'closed', 422, 'Une situation clôturée est un enregistrement figé.');

        return parent::update($request, $id);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        abort_if(EmergencyEvent::query()->findOrFail($id)->status === 'closed', 422, 'Une situation clôturée sert de preuve : elle ne peut pas être supprimée.');

        return parent::destroy($request, $id);
    }

    public function addTimeline(Request $request, int $id): JsonResponse
    {
        $event = EmergencyEvent::query()->findOrFail($id);
        abort_if($event->status === 'closed', 422, 'La situation est clôturée.');
        $data = $request->validate(['text' => 'required|string|max:2000', 'at' => 'nullable|date|before_or_equal:now']);

        $at = isset($data['at']) ? Carbon::parse($data['at']) : now();
        abort_if($at->lt($event->declared_at), 422, 'Une entrée de la chronologie ne peut pas précéder la déclaration de la situation.');

        $timeline = $event->timeline ?? [];
        $timeline[] = $this->entry($at->toIso8601String(), $data['text']);
        usort($timeline, fn ($a, $b) => strcmp($a['at'], $b['at']));
        $event->update(['timeline' => $timeline]);

        return response()->json($event->fresh($this->relations()));
    }

    public function contain(Request $request, int $id): JsonResponse
    {
        $event = EmergencyEvent::query()->findOrFail($id);
        abort_if($event->status !== 'ongoing', 422, 'Seule une situation en cours peut être déclarée maîtrisée.');

        $timeline = $event->timeline ?? [];
        $timeline[] = $this->entry(now()->toIso8601String(), 'Situation maîtrisée.');
        $event->update(['status' => 'contained', 'contained_at' => now(), 'timeline' => $timeline]);

        return response()->json($event->fresh($this->relations()));
    }

    /**
     * Clôture : le retour d'expérience est obligatoire ; le scénario est marqué « à réviser » et les
     * aspects environnementaux qui en sont à l'origine sont signalés « à réévaluer ».
     */
    public function close(Request $request, int $id): JsonResponse
    {
        $event = EmergencyEvent::query()->with('procedure')->findOrFail($id);
        abort_if($event->status === 'closed', 422, 'La situation est déjà clôturée.');
        $data = $request->validate([
            'debrief' => 'required|string|min:20',
            'lessons_actions' => 'nullable|string',
        ]);

        DB::transaction(function () use ($event, $data) {
            $flagged = 0;
            /** @var EmergencyProcedure|null $procedure */
            $procedure = $event->procedure;
            if ($procedure) {
                $procedure->update([
                    'status' => 'a_reviser',
                    'review_reason' => "Retour d'expérience {$event->ref}",
                    'next_review_date' => today()->addDays(30),
                ]);

                $aspects = EnvironmentalAspect::query()->where('status', '!=', 'archived')
                    ->where(fn ($query) => $query->where('id', $procedure->aspect_id)->orWhere('emergency_procedure_id', $procedure->id))->get();
                foreach ($aspects as $aspect) {
                    $aspect->forceFill([
                        'needs_reassessment' => true,
                        'reassessment_reason' => "Situation d'urgence réelle {$event->ref} : {$event->title}",
                        'reassessment_flagged_at' => now(),
                    ])->save();
                    $flagged++;
                }
            }

            $timeline = $event->timeline ?? [];
            $timeline[] = $this->entry(now()->toIso8601String(), 'Clôture et retour d\'expérience enregistré.');
            $event->update([
                'status' => 'closed',
                'closed_at' => now(),
                'contained_at' => $event->contained_at ?? now(),
                'debrief' => $data['debrief'],
                'lessons_actions' => $data['lessons_actions'] ?? null,
                'plan_revision_requested' => $procedure !== null,
                'aspects_flagged' => $flagged,
                'timeline' => $timeline,
            ]);
        });

        return response()->json($event->fresh($this->relations()));
    }

    /**
     * @return array{at: string, by: string|null, text: string}
     */
    private function entry(string $at, string $text): array
    {
        return ['at' => $at, 'by' => auth()->user()?->name, 'text' => $text];
    }
}
