<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Taux de sensibilisation par site et par campagne (M9-05).
 */
class AwarenessOverviewController extends Controller
{
    use ScopesToUserTenant;

    public function overview(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $sites = Site::query()->where('enterprise_id', $enterpriseId)->pluck('name', 'id');
        if ($request->filled('site_id')) {
            $sites = $sites->only([(int) $this->resolveSite($request, $request->integer('site_id'))->id]);
        }

        $campaigns = DB::table('awareness_campaigns as c')->whereNull('c.deleted_at')->where('c.enterprise_id', $enterpriseId)->whereIn('c.site_id', $sites->keys())
            ->whereIn('c.status', ['active', 'closed'])
            ->leftJoin('awareness_participants as p', 'p.campaign_id', '=', 'c.id')
            ->groupBy('c.id', 'c.ref', 'c.title', 'c.site_id', 'c.status', 'c.end_date')
            ->get(['c.id', 'c.ref', 'c.title', 'c.site_id', 'c.status', 'c.end_date', DB::raw('count(p.id) as participants'), DB::raw('count(p.completed_at) as completed')]);

        $bySite = $sites->map(function (string $name, int $siteId) use ($campaigns, $enterpriseId) {
            $rows = $campaigns->where('site_id', $siteId);
            $participants = (int) $rows->sum('participants');
            $completed = (int) $rows->sum('completed');
            $talks = DB::table('awareness_talks')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->whereDate('held_on', '>=', today()->subDays(90));

            return [
                'site_id' => $siteId, 'site' => $name, 'campaigns' => $rows->count(), 'participants' => $participants, 'completed' => $completed,
                'rate' => $participants === 0 ? null : round($completed / $participants * 100, 1),
                'talks_90d' => (clone $talks)->count(),
            ];
        })->values();

        return response()->json(['data' => [
            'by_site' => $bySite,
            'campaigns' => $campaigns->map(fn ($c) => [
                'id' => $c->id, 'ref' => $c->ref, 'title' => $c->title, 'status' => $c->status, 'end_date' => $c->end_date,
                'participants' => (int) $c->participants, 'completed' => (int) $c->completed,
                'rate' => (int) $c->participants === 0 ? null : round($c->completed / $c->participants * 100, 1),
            ])->values(),
        ]]);
    }
}
