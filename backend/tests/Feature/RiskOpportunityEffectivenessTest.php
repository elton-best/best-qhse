<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RiskOpportunityEffectivenessTest extends TestCase
{
    use RefreshDatabase;

    public function test_risk_cannot_be_closed_without_a_dated_effective_review_and_evidence(): void
    {
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            EnsureEnterpriseOwnership::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
        ]);

        $enterprise = Enterprise::factory()->create();
        $site = Site::factory()->create(['enterprise_id' => $enterprise->id]);
        $user = User::factory()->create([
            'enterprise_id' => $enterprise->id,
            'site_id' => $site->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);
        $process = Process::query()->create([
            'ref' => 'RO-EFFECTIVENESS-' . uniqid(),
            'site_id' => $site->id,
            'title' => 'Processus de test',
            'type' => 'management',
            'pilot_id' => $user->id,
            'purpose' => 'Tester la validation de l’efficacité.',
            'normes_iso' => ['9001'],
        ]);

        $created = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/processes/{$process->id}/risks-opportunities", [
                'type' => 'risque',
                'title' => 'Risque de test',
                'source_category' => 'processus',
                'source_detail' => 'Test du processus de clôture.',
                'assessment_method' => 'qualitative',
                'proportionality_rationale' => 'Impact modéré à réduire.',
                'continuity_plan' => 'Utiliser le processus de secours.',
                'continuity_indicator' => 'Délai de reprise',
                'strategie' => 'reduire',
                'planned_actions' => [[
                    'title' => 'Former les utilisateurs',
                    'deadline' => now()->addDays(10)->toDateString(),
                ]],
                'probabilite' => 2,
                'gravite' => 3,
            ])
            ->assertCreated();

        $riskId = $created->json('data.id');
        $actionId = $created->json('data.planned_actions.0.id');
        $this->putJson("/api/v1/risks-opportunities/{$riskId}", [
            'planned_actions' => [[
                'id' => $actionId,
                'title' => 'Former les utilisateurs',
                'deadline' => now()->addDays(10)->toDateString(),
                'implementation_status' => 'completed',
                'effectiveness_result' => 'efficace',
            ]],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('planned_actions.0.effectiveness_review');

        $this->putJson("/api/v1/risks-opportunities/{$riskId}", [
            'status' => 'cloture',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('effectiveness_result');

        $this->putJson("/api/v1/risks-opportunities/{$riskId}", [
            'status' => 'cloture',
            'effectiveness_result' => 'efficace',
            'effectiveness_review' => 'Le délai de reprise mesuré respecte la cible.',
            'effectiveness_review_date' => now()->toDateString(),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('planned_actions.0.effectiveness_result');

        $this->putJson("/api/v1/risks-opportunities/{$riskId}", [
            'status' => 'cloture',
            'effectiveness_result' => 'efficace',
            'effectiveness_review' => 'Le délai de reprise mesuré respecte la cible.',
            'effectiveness_review_date' => now()->toDateString(),
            'planned_actions' => [[
                'id' => $actionId,
                'title' => 'Former les utilisateurs',
                'deadline' => now()->addDays(10)->toDateString(),
                'implementation_status' => 'completed',
                'effectiveness_result' => 'efficace',
                'effectiveness_review' => 'Les utilisateurs ont réussi le test de compétence.',
                'effectiveness_review_date' => now()->toDateString(),
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.effectiveness_result', 'efficace')
            ->assertJsonPath('data.effectiveness_reviewed_by', $user->id)
            ->assertJsonPath('data.planned_actions.0.effectiveness_result', 'efficace')
            ->assertJsonPath('data.planned_actions.0.effectiveness_reviewed_by', $user->id);
    }
}
