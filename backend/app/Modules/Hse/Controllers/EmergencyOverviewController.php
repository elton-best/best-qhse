<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EmergencyContact;
use App\Modules\Hse\Models\EmergencyEvent;
use App\Modules\Hse\Models\EmergencyExercise;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EmergencyResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Vue d'ensemble de la préparation aux situations d'urgence (ISO 14001 §8.2).
 */
class EmergencyOverviewController extends Controller
{
    use ScopesToUserTenant;

    public function overview(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $site = fn ($query) => $request->filled('site_id') ? $query->where('site_id', $request->integer('site_id')) : $query;

        $procedures = $site(EmergencyProcedure::query())->get();
        $resources = $site(EmergencyResource::query())->get();
        $exercises = $site(EmergencyExercise::query())->get();
        $events = $site(EmergencyEvent::query())->get();
        $yearAgo = today()->subYear();

        return response()->json(['success' => true, 'data' => [
            'scenarios' => [
                'total' => $procedures->count(),
                'ready' => $procedures->whereIn('status', ['operationnel', 'teste'])->count(),
                'to_complete' => $procedures->where('status', 'planifie')->count(),
                'to_revise' => $procedures->where('status', 'a_reviser')->count(),
                'from_aspects' => $procedures->whereNotNull('aspect_id')->count(),
                // Un plan jamais testé, ou testé il y a plus d'un an, doit faire l'objet d'un exercice.
                'without_recent_drill' => $procedures->whereIn('status', ['operationnel', 'teste'])
                    ->filter(fn ($p) => ! $p->last_drill_date || $p->last_drill_date->lt($yearAgo))->pluck('id')->values(),
            ],
            'contacts' => ['total' => $site(EmergencyContact::query())->count(), 'available_24h' => $site(EmergencyContact::query())->where('available_24h', true)->count()],
            'resources' => [
                'total' => $resources->count(),
                'overdue' => $resources->filter(fn ($r) => $r->is_overdue)->count(),
                'defective' => $resources->whereIn('status', ['defective', 'to_check'])->count(),
                'due_in_30_days' => $resources->filter(fn ($r) => $r->next_check_date && $r->next_check_date->betweenIncluded(today(), today()->addDays(30)))->count(),
            ],
            'exercises' => [
                'planned' => $exercises->where('status', 'planned')->count(),
                'done_last_12_months' => $exercises->where('status', 'done')->filter(fn ($e) => $e->performed_date && $e->performed_date->gte($yearAgo))->count(),
                'overdue' => $exercises->where('status', 'planned')->filter(fn ($e) => $e->planned_date && $e->planned_date->lt(today()))->count(),
            ],
            'events' => [
                'ongoing' => $events->whereIn('status', ['ongoing', 'contained'])->count(),
                'closed_last_12_months' => $events->where('status', 'closed')->filter(fn ($e) => $e->closed_at && $e->closed_at->gte($yearAgo))->count(),
                'awaiting_debrief' => $events->where('status', 'contained')->count(),
            ],
        ]]);
    }
}
