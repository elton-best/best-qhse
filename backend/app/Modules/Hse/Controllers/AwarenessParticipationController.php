<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Models\AwarenessParticipant;
use App\Modules\Hse\Services\AwarenessProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Espace du participant : un salarié suit uniquement les campagnes auxquelles il est inscrit et en garde l'attestation.
 * Les participants extérieurs passent par un lien personnel (AwarenessPublicController).
 */
class AwarenessParticipationController extends Controller
{
    private function mine(Request $request, int $campaignId): AwarenessParticipant
    {
        abort_unless($request->user(), 401);

        return AwarenessParticipant::query()->withoutGlobalScopes()
            ->where('campaign_id', $campaignId)->where('user_id', $request->user()->id)->where('enterprise_id', $request->user()->enterprise_id)->firstOrFail();
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user(), 401);
        $rows = AwarenessParticipant::query()->withoutGlobalScopes()->with(['campaign' => fn ($q) => $q->withoutGlobalScopes()])
            ->where('user_id', $request->user()->id)->where('enterprise_id', $request->user()->enterprise_id)->latest('id')->get()
            ->map(fn (AwarenessParticipant $p) => [
                'campaign_id' => $p->campaign_id, 'title' => $p->campaign->title, 'ref' => $p->campaign->ref, 'status' => $p->campaign->status,
                'end_date' => $p->campaign->end_date?->toDateString(), 'completed_at' => $p->completed_at?->toIso8601String(), 'attestation_number' => $p->attestation_number,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, int $campaignId): JsonResponse
    {
        return response()->json(['data' => app(AwarenessProgressService::class)->contentFor($this->mine($request, $campaignId))]);
    }

    public function read(Request $request, int $campaignId, int $materialId): JsonResponse
    {
        $participant = app(AwarenessProgressService::class)->markRead($this->mine($request, $campaignId), $materialId);

        return response()->json(['data' => ['completed' => $participant->completed_at !== null, 'attestation_number' => $participant->attestation_number]]);
    }

    public function quiz(Request $request, int $campaignId, int $materialId): JsonResponse
    {
        $data = $request->validate(['answers' => 'required|array', 'answers.*' => 'nullable|integer|min:0']);
        $result = app(AwarenessProgressService::class)->submitQuiz($this->mine($request, $campaignId), $materialId, $data['answers']);

        return response()->json(['data' => [
            'score' => $result['score'], 'passed' => $result['passed'], 'correct' => $result['correct'], 'total' => $result['total'],
            'completed' => $result['participant']->completed_at !== null, 'attestation_number' => $result['participant']->attestation_number,
        ]]);
    }

    public function attestation(Request $request, int $campaignId): Response
    {
        $participant = $this->mine($request, $campaignId);

        return app(AwarenessProgressService::class)->attestation($participant)->download("attestation-{$participant->attestation_number}.pdf");
    }
}
