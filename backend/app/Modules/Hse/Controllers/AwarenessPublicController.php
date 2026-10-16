<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Models\AwarenessParticipant;
use App\Modules\Hse\Services\AwarenessProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Accès d'une personne extérieure invitée (sous-traitant…) : lien personnel, contenu de sa seule campagne, attestation.
 * Aucune autre donnée de l'entreprise n'est accessible par ce lien.
 */
class AwarenessPublicController extends Controller
{
    private function participant(string $token): AwarenessParticipant
    {
        return AwarenessParticipant::query()->withoutGlobalScopes()
            ->where('token_hash', AwarenessParticipant::hashToken($token))->where('kind', 'external')->firstOrFail();
    }

    public function show(string $token): JsonResponse
    {
        $participant = $this->participant($token);

        return response()->json(['data' => app(AwarenessProgressService::class)->contentFor($participant) + ['participant' => ['name' => $participant->external_name, 'organization' => $participant->organization]]]);
    }

    public function read(string $token, int $materialId): JsonResponse
    {
        $participant = app(AwarenessProgressService::class)->markRead($this->participant($token), $materialId);

        return response()->json(['data' => ['completed' => $participant->completed_at !== null, 'attestation_number' => $participant->attestation_number]]);
    }

    public function quiz(Request $request, string $token, int $materialId): JsonResponse
    {
        $data = $request->validate(['answers' => 'required|array', 'answers.*' => 'nullable|integer|min:0']);
        $result = app(AwarenessProgressService::class)->submitQuiz($this->participant($token), $materialId, $data['answers']);

        return response()->json(['data' => [
            'score' => $result['score'], 'passed' => $result['passed'], 'correct' => $result['correct'], 'total' => $result['total'],
            'completed' => $result['participant']->completed_at !== null, 'attestation_number' => $result['participant']->attestation_number,
        ]]);
    }

    public function attestation(string $token): Response
    {
        $participant = $this->participant($token);

        return app(AwarenessProgressService::class)->attestation($participant)->download("attestation-{$participant->attestation_number}.pdf");
    }
}
