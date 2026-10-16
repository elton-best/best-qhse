<?php

namespace App\Modules\Leadership\Controllers;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LeadershipReviewController extends Controller
{
    use ScopesToUserTenant;

    public const COMMITMENTS = [
        'a' => ['fr' => 'Assumer la responsabilité de l’efficacité du SME.', 'en' => 'Be accountable for EMS effectiveness.'],
        'b' => ['fr' => 'Aligner la politique et les objectifs environnementaux sur le contexte et la stratégie.', 'en' => 'Align environmental policy and objectives with context and strategy.'],
        'c' => ['fr' => 'Intégrer les exigences du SME dans les processus métiers.', 'en' => 'Integrate EMS requirements into business processes.'],
        'd' => ['fr' => 'Mettre à disposition les ressources nécessaires.', 'en' => 'Make the necessary resources available.'],
        'e' => ['fr' => 'Communiquer l’importance d’un management environnemental efficace et conforme.', 'en' => 'Communicate the importance of effective, conforming environmental management.'],
        'f' => ['fr' => 'Veiller à l’atteinte des résultats attendus du SME.', 'en' => 'Ensure the EMS achieves its intended outcomes.'],
        'g' => ['fr' => 'Orienter et soutenir les personnes contribuant à l’efficacité du SME.', 'en' => 'Direct and support people contributing to EMS effectiveness.'],
        'h' => ['fr' => 'Promouvoir l’amélioration continue.', 'en' => 'Promote continual improvement.'],
        'i' => ['fr' => 'Soutenir les autres responsables dans leur rôle de leadership.', 'en' => 'Support other managers in their leadership roles.'],
    ];

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['site_id' => 'required|integer']);
        $site = $this->resolveSite($request, $data['site_id']);
        $reviews = DB::table('leadership_reviews')->where('site_id', $site->id)->orderByDesc('year')->get()->map(function ($review) {
            $review->answers = json_decode($review->answers, true, 512, JSON_THROW_ON_ERROR);

            return $review;
        });

        return response()->json(['data' => ['commitments' => self::COMMITMENTS, 'reviews' => $reviews, 'can_manage' => $this->canManage($request)]]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        abort_unless($this->canManage($request), 403, 'La direction ou un responsable autorisé doit renseigner cette revue.');
        $rules = ['site_id' => 'required|integer', 'year' => 'required|integer|between:2000,2100', 'status' => 'required|in:draft,completed', 'answers' => 'required|array:a,b,c,d,e,f,g,h,i'];
        foreach (array_keys(self::COMMITMENTS) as $code) {
            $required = $request->input('status') === 'completed' ? 'required' : 'nullable';
            $rules["answers.$code"] = "$required|array:status,justification";
            $rules["answers.$code.status"] = "$required|in:yes,partial,no";
            $rules["answers.$code.justification"] = "$required|string|max:5000";
        }
        $data = $request->validate($rules);
        $site = $this->resolveSite($request, $data['site_id']);
        $record = DB::transaction(function () use ($site, $data, $request) {
            DB::table('sites')->where('id', $site->id)->lockForUpdate()->first();
            $existing = DB::table('leadership_reviews')->where('site_id', $site->id)->where('year', $data['year'])->lockForUpdate()->first();
            abort_if($existing?->status === 'completed', 422, 'Cette revue annuelle est finalisée et conservée comme preuve.');
            $values = [
                'enterprise_id' => $site->enterprise_id, 'answers' => json_encode($data['answers'], JSON_THROW_ON_ERROR),
                'status' => $data['status'], 'reviewed_by' => $request->user()->id,
                'completed_at' => $data['status'] === 'completed' ? now() : null, 'updated_at' => now(),
            ];
            DB::table('leadership_reviews')->updateOrInsert(['site_id' => $site->id, 'year' => $data['year']], $values + ['created_at' => $existing?->created_at ?? now()]);

            return DB::table('leadership_reviews')->where('site_id', $site->id)->where('year', $data['year'])->first();
        });
        $record->answers = json_decode($record->answers, true, 512, JSON_THROW_ON_ERROR);

        return response()->json(['data' => $record]);
    }

    private function canManage(Request $request): bool
    {
        return PermissionHelper::isAdmin($request->user()) || PermissionHelper::can($request->user(), 'leadership.roles_responsabilites.fiche_responsabilite.update');
    }
}
