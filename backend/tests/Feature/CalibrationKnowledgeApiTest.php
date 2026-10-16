<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Http\Middleware\ForceSessionTimeout;
use App\Http\Middleware\SecurityAuditMiddleware;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Support\Models\CalibrationPlan;
use App\Modules\Support\Models\Equipement;
use App\Modules\Support\Models\OrganizationalKnowledge;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalibrationKnowledgeApiTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterprise;

    private Site $site;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
            EnsureEnterpriseOwnership::class,
            SecurityAuditMiddleware::class,
            ForceSessionTimeout::class,
        ]);

        $this->enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $this->enterprise->id]);
        $this->user = User::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);
    }

    public function test_store_creates_calibration_plan_linked_to_equipements(): void
    {
        $equipment = Equipement::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
        ]);

        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/calibration-plans', [
            'title' => 'Pied à coulisse numérique',
            'equipment_id' => $equipment->id,
            'frequency' => '12 mois',
            'next_calibration_date' => now()->addMonth()->toDateString(),
            'status' => 'Valide',
            'reference_standard' => 'Bloc étalon 1-100 mm',
            'reference_standard_documented' => 'Oui',
            'protected_against_adjustment' => 'Oui',
            'usage_fitness' => 'Mesures externes de pièces usinées',
            'pilot_id' => $this->user->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'valid');
        $response->assertJsonPath('responsible_user_id', $this->user->id);
        $response->assertJsonPath('reference_standard_documented', true);
        $response->assertJsonPath('equipment.id', $equipment->id);
        $this->assertSame($this->enterprise->id, $response->json('enterprise_id'));
    }

    public function test_conforming_calibration_record_updates_plan_and_computes_next_date(): void
    {
        $plan = $this->makePlan('12 mois');

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/calibration-plans/{$plan->id}/records", [
                'performed_date' => '2026-10-01',
                'conformity_status' => 'conforming',
                'certificate_number' => 'CERT-2026-001',
                'cost' => 145.5,
            ]);

        $response->assertCreated();
        $response->assertJsonPath('conformity_status', 'conforming');

        $plan->refresh();
        $this->assertSame('2026-10-01', $plan->last_calibration_date->toDateString());
        $this->assertSame('2027-10-01', $plan->next_calibration_date->toDateString());
        $this->assertSame('valid', $plan->status);
    }

    public function test_non_conforming_calibration_requires_impact_analysis_and_suspends_equipment(): void
    {
        $plan = $this->makePlan('6 mois');

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/calibration-plans/{$plan->id}/records", [
                'performed_date' => '2026-10-01',
                'conformity_status' => 'non_conforming',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.impact_analysis.0', 'Analyse d\'impact obligatoire en cas d\'étalonnage non conforme.');

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/calibration-plans/{$plan->id}/records", [
                'performed_date' => '2026-10-01',
                'conformity_status' => 'non_conforming',
                'impact_analysis' => 'Mesures des 15 derniers jours re-contrôlées : aucun écart produit.',
                'impact_assessed' => true,
            ])
            ->assertCreated();

        $plan->refresh();
        $this->assertSame('suspended', $plan->status);
        $this->assertDatabaseHas('calibration_records', [
            'calibration_plan_id' => $plan->id,
            'conformity_status' => 'non_conforming',
            'impact_assessed' => true,
        ]);
        $this->assertSame('2027-04-01', $plan->next_calibration_date->toDateString());
    }

    public function test_knowledge_entry_flags_critical_single_holder(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/organizational-knowledges', [
            'title' => 'Réglage des fours de traitement thermique',
            'category' => 'Expérience',
            'description' => 'Savoir-faire détenu suite à 20 ans de pratique.',
            'pilot_id' => $this->user->id,
            'is_critical' => 'Oui',
            'single_holder' => 'Oui',
            'status' => 'Active',
            'review_frequency_months' => 12,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('category', 'experience');
        $response->assertJsonPath('status', 'active');
        $response->assertJsonPath('holder_id', $this->user->id);
        $response->assertJsonPath('single_holder_alert', true);
        $this->assertStringStartsWith('KNO-', (string) $response->json('ref'));
    }

    public function test_knowledge_index_is_scoped_to_the_enterprise(): void
    {
        OrganizationalKnowledge::create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'title' => 'Méthode interne de contrôle',
            'category' => 'methodes',
            'status' => 'active',
        ]);

        $otherEnterprise = Enterprise::factory()->create();
        OrganizationalKnowledge::create([
            'enterprise_id' => $otherEnterprise->id,
            'title' => 'Savoir autre entreprise',
            'category' => 'methodes',
            'status' => 'active',
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/organizational-knowledges')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $response->assertJsonPath('data.0.title', 'Méthode interne de contrôle');
    }

    private function makePlan(string $frequency): CalibrationPlan
    {
        return CalibrationPlan::create([
            'enterprise_id' => $this->enterprise->id,
            'frequency' => $frequency,
            'next_calibration_date' => now()->addMonth()->toDateString(),
            'status' => 'due',
        ]);
    }
}
