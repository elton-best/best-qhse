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
use App\Modules\Planning\Models\Opportunity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OpportunityRegisterTest extends TestCase
{
    use RefreshDatabase;

    public function test_opportunities_use_their_own_register_and_require_effective_action_evidence_to_close(): void
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
            'ref' => 'OPP-REGISTER-' . uniqid(),
            'site_id' => $site->id,
            'title' => 'Processus opportunités',
            'type' => 'management',
            'pilot_id' => $user->id,
            'purpose' => 'Tester le registre séparé des opportunités.',
            'normes_iso' => ['9001'],
        ]);
        $otherSite = Site::factory()->create(['enterprise_id' => $enterprise->id]);
        $otherProcess = Process::query()->create([
            'ref' => 'OPP-REGISTER-OTHER-' . uniqid(),
            'site_id' => $otherSite->id,
            'title' => 'Autre processus',
            'type' => 'management',
            'pilot_id' => $user->id,
            'purpose' => 'Vérifier le filtrage du registre par site.',
            'normes_iso' => ['9001'],
        ]);
        Opportunity::query()->create([
            'process_id' => $otherProcess->id,
            'site_id' => $otherSite->id,
            'enterprise_id' => $enterprise->id,
            'title' => 'Opportunité hors périmètre',
            'description' => 'Cette opportunité ne doit pas apparaître dans le site demandé.',
            'status' => 'identified',
            'quality_status' => 'identifie',
            'source_category' => 'autre',
            'assessment_method' => 'qualitative',
            'probabilite' => 2,
            'gravite' => 2,
            'criticite' => 4,
            'niveau' => 'moyen',
        ]);

        $created = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/opportunities', [
                'process_id' => $process->id,
                'title' => 'Réduire le délai de réponse',
                'description' => 'Automatiser le traitement des demandes clients.',
                'source_category' => 'marche',
                'source_detail' => 'Les retours clients montrent une attente de délai plus court.',
                'assessment_method' => 'qualitative',
                'desired_effect' => 'Réduire le délai moyen de réponse.',
                'opportunity_decision' => 'retain',
                'decision_rationale' => 'Les données de satisfaction justifient un projet pilote.',
                'probabilite' => 3,
                'gravite' => 4,
                'status' => 'identifie',
                'planned_actions' => [[
                    'title' => 'Automatiser le tri des demandes',
                    'action_type' => 'control',
                    'deadline' => now()->addDays(10)->toDateString(),
                ]],
            ])
            ->assertCreated()
            ->assertJsonPath('data.attributes.status', 'identifie')
            ->assertJsonPath('data.attributes.criticite', 12);

        $opportunityId = $created->json('data.id');
        $action = $created->json('data.attributes.planned_actions.0');

        $this->getJson("/api/v1/risks-opportunities?site_id={$site->id}&type=risque")
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/opportunities?site_id={$site->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.attributes.opportunity_decision', 'retain');

        $this->putJson("/api/v1/opportunities/{$opportunityId}", [
            'status' => 'cloture',
            'effectiveness_result' => 'efficace',
            'effectiveness_review' => 'Le projet pilote confirme la réduction mesurée du délai.',
            'effectiveness_review_date' => now()->toDateString(),
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('planned_actions.0.effectiveness_result');

        $this->putJson("/api/v1/opportunities/{$opportunityId}", [
            'status' => 'cloture',
            'effectiveness_result' => 'efficace',
            'effectiveness_review' => 'Le projet pilote confirme la réduction mesurée du délai.',
            'effectiveness_review_date' => now()->toDateString(),
            'planned_actions' => [[
                'id' => $action['id'],
                'title' => 'Automatiser le tri des demandes',
                'action_type' => 'control',
                'deadline' => now()->addDays(10)->toDateString(),
                'implementation_status' => 'completed',
                'effectiveness_result' => 'efficace',
                'effectiveness_review' => 'Le délai observé est inférieur à la cible.',
                'effectiveness_review_date' => now()->toDateString(),
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.attributes.status', 'cloture')
            ->assertJsonPath('data.attributes.effectiveness_reviewed_by', $user->id)
            ->assertJsonPath('data.attributes.planned_actions.0.effectiveness_reviewed_by', $user->id);

        $this->postJson('/api/v1/opportunities', [
            'process_id' => $process->id,
            'title' => 'Ne pas lancer le projet pilote',
            'description' => 'Le coût prévu dépasse le bénéfice attendu.',
            'source_category' => 'marche',
            'source_detail' => 'L’analyse des coûts et bénéfices ne justifie pas le lancement.',
            'assessment_method' => 'quantitative',
            'desired_effect' => 'Réduire les dépenses non justifiées.',
            'opportunity_decision' => 'reject',
            'decision_rationale' => 'Le bénéfice mesuré est inférieur au seuil approuvé.',
            'probabilite' => 2,
            'gravite' => 2,
            'status' => 'cloture',
        ])
            ->assertCreated()
            ->assertJsonPath('data.attributes.status', 'cloture')
            ->assertJsonPath('data.attributes.planned_actions', []);
    }
}
