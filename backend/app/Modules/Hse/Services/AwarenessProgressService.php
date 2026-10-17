<?php

namespace App\Modules\Hse\Services;

use App\Models\Enterprise;
use App\Modules\Hse\Models\AwarenessCampaign;
use App\Modules\Hse\Models\AwarenessMaterial;
use App\Modules\Hse\Models\AwarenessParticipant;
use App\Modules\Hse\Models\AwarenessReceipt;
use App\Modules\Hse\Models\EnvironmentalAspect;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Carbon;

/**
 * Parcours d'un participant : accusés de lecture, quiz corrigés côté serveur, achèvement et attestation (ISO 14001 §7.3).
 */
class AwarenessProgressService
{
    /**
     * Contenu de la campagne tel que le voit un participant (sans les bonnes réponses).
     *
     * @return array<string, mixed>
     */
    public function contentFor(AwarenessParticipant $participant): array
    {
        $campaign = $participant->campaign()->withoutGlobalScopes()->firstOrFail();
        $done = $participant->receipts()->where('passed', true)->pluck('material_id')->unique()->all();
        $aspects = EnvironmentalAspect::query()->withoutGlobalScopes()->where('enterprise_id', $campaign->enterprise_id)
            ->whereIn('id', $campaign->aspect_ids ?? [])->get(['id', 'aspect_number', 'aspect', 'impact']);

        return [
            'campaign' => [
                'id' => $campaign->id, 'ref' => $campaign->ref, 'title' => $campaign->title, 'objective' => $campaign->objective,
                'status' => $campaign->status, 'start_date' => $campaign->start_date?->toDateString(), 'end_date' => $campaign->end_date?->toDateString(),
            ],
            'topics' => AwarenessCampaign::TOPICS,
            'aspects' => $aspects,
            'materials' => $campaign->materials()->withoutGlobalScopes()->get()->map(fn (AwarenessMaterial $m) => $m->forParticipant() + ['done' => in_array($m->id, $done, true)])->all(),
            'completed_at' => $participant->completed_at?->toIso8601String(),
            'attestation_number' => $participant->attestation_number,
        ];
    }

    private function assertOpen(AwarenessCampaign $campaign): void
    {
        abort_unless($campaign->status === 'active', 422, 'Cette campagne n\'est pas ouverte.');
        abort_if($campaign->end_date !== null && $campaign->end_date->endOfDay()->isPast(), 422, 'Cette campagne est terminée.');
        abort_if($campaign->start_date !== null && $campaign->start_date->isFuture(), 422, 'Cette campagne n\'a pas encore commencé.');
    }

    private function materialOf(AwarenessParticipant $participant, int $materialId): AwarenessMaterial
    {
        return AwarenessMaterial::query()->withoutGlobalScopes()->where('campaign_id', $participant->campaign_id)->findOrFail($materialId);
    }

    public function markRead(AwarenessParticipant $participant, int $materialId): AwarenessParticipant
    {
        $campaign = $participant->campaign()->withoutGlobalScopes()->firstOrFail();
        $this->assertOpen($campaign);
        $material = $this->materialOf($participant, $materialId);
        abort_if($material->type === 'quiz', 422, 'Un quiz se valide en répondant aux questions.');

        if (! $participant->receipts()->where('material_id', $material->id)->where('passed', true)->exists()) {
            AwarenessReceipt::create(['enterprise_id' => $participant->enterprise_id, 'participant_id' => $participant->id, 'material_id' => $material->id, 'read_at' => now(), 'passed' => true]);
        }

        return $this->refreshCompletion($participant);
    }

    /**
     * @param  array<int, int|string|null>  $answers  indice de la réponse choisie pour chaque question
     * @return array{score: int, passed: bool, correct: int, total: int, participant: AwarenessParticipant}
     */
    public function submitQuiz(AwarenessParticipant $participant, int $materialId, array $answers): array
    {
        $campaign = $participant->campaign()->withoutGlobalScopes()->firstOrFail();
        $this->assertOpen($campaign);
        $material = $this->materialOf($participant, $materialId);
        abort_unless($material->type === 'quiz', 422, 'Ce support n\'est pas un quiz.');

        $questions = $material->questions ?? [];
        abort_if(count($answers) !== count($questions), 422, 'Répondez à toutes les questions.');
        $correct = 0;
        foreach ($questions as $index => $question) {
            if (isset($answers[$index]) && (int) $answers[$index] === (int) ($question['correct'] ?? -1)) {
                $correct++;
            }
        }
        $total = count($questions);
        $score = $total === 0 ? 0 : (int) round($correct / $total * 100);
        $passed = $score >= $material->pass_mark;

        AwarenessReceipt::create(['enterprise_id' => $participant->enterprise_id, 'participant_id' => $participant->id, 'material_id' => $material->id, 'read_at' => now(), 'quiz_score' => $score, 'passed' => $passed]);

        return ['score' => $score, 'passed' => $passed, 'correct' => $correct, 'total' => $total, 'participant' => $this->refreshCompletion($participant)];
    }

    public function refreshCompletion(AwarenessParticipant $participant): AwarenessParticipant
    {
        if ($participant->completed_at !== null) {
            return $participant;
        }
        $materialIds = AwarenessMaterial::query()->withoutGlobalScopes()->where('campaign_id', $participant->campaign_id)->pluck('id');
        $done = $participant->receipts()->where('passed', true)->whereIn('material_id', $materialIds)->distinct()->count('material_id');
        if ($materialIds->isNotEmpty() && $done >= $materialIds->count()) {
            $participant->forceFill([
                'completed_at' => now(),
                'attestation_number' => 'ATT-'.now()->format('Y').'-'.str_pad((string) $participant->id, 6, '0', STR_PAD_LEFT),
            ])->save();
        }

        return $participant->refresh();
    }

    /**
     * Attestation de sensibilisation (PDF) : délivrée seulement une fois tous les supports validés.
     */
    public function attestation(AwarenessParticipant $participant): \Barryvdh\DomPDF\PDF
    {
        abort_if($participant->completed_at === null, 422, 'L\'attestation est délivrée après validation de tous les supports.');
        $campaign = $participant->campaign()->withoutGlobalScopes()->firstOrFail();
        $enterprise = Enterprise::query()->find($campaign->enterprise_id);
        $e = fn (?string $value) => htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
        $topics = collect(AwarenessCampaign::TOPICS)->map(fn (string $label) => '<li>'.$e($label).'</li>')->implode('');

        $html = '<html><body style="font-family: DejaVu Sans, sans-serif; padding: 40px;">'
            .'<h1 style="text-align:center">Attestation de sensibilisation</h1>'
            .'<p style="text-align:center">'.$e($enterprise?->name).'</p>'
            .'<p>Il est attesté que <strong>'.$e($participant->displayName()).'</strong>'.($participant->organization ? ' ('.$e($participant->organization).')' : '')
            .' a pris connaissance des supports de la campagne « <strong>'.$e($campaign->title).'</strong> » ('.$e($campaign->ref).') et validé les contrôles associés.</p>'
            .'<p>Cette sensibilisation porte sur :</p><ul>'.$topics.'</ul>'
            .'<p>Délivrée le '.Carbon::parse($participant->completed_at)->format('d/m/Y').' — N° '.$e($participant->attestation_number).'</p>'
            .'</body></html>';

        return Pdf::loadHTML($html)->setPaper('a4', 'portrait');
    }
}
