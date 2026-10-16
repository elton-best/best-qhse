<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Http\Middleware\SecurityAuditMiddleware;
use App\Http\Middleware\ForceSessionTimeout;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Leadership\Models\CultureCommitment;
use App\Modules\Leadership\Models\EthicsReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CultureEthicsApiTest extends TestCase
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

    public function test_store_creates_culture_commitment_from_react_payload(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/culture-commitments', [
            'title' => 'Charte des valeurs QHSE',
            'type' => 'Charte',
            'status' => 'Active',
            'description' => 'Intégrité, transparence, respect des personnes.',
            'pilot_id' => $this->user->id,
            'review_frequency_months' => 12,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('type', 'charte');
        $response->assertJsonPath('status', 'active');
        $response->assertJsonPath('owner_id', $this->user->id);
        $this->assertSame($this->enterprise->id, $response->json('enterprise_id'));
    }

    public function test_anonymous_report_never_exposes_reporter_identity(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/ethics-reports', [
            'title' => 'Pression signalée sur les délais de contrôle.',
            'is_anonymous' => 'Oui',
            'reporter_name' => 'Jean Dupont',
            'category' => 'Qualité',
            'channel' => 'Web',
            'status' => 'Reçu',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('is_anonymous', true);
        $response->assertJsonPath('category', 'qualite');
        $response->assertJsonPath('status', 'received');
        $this->assertArrayNotHasKey('reporter_name', $response->json());
        $this->assertArrayNotHasKey('reporter_email', $response->json());

        // Le contenu du signalement reste disponible pour le traitement.
        $this->assertDatabaseHas('ethics_reports', [
            'description' => 'Pression signalée sur les délais de contrôle.',
            'is_anonymous' => true,
            'reporter_name' => null,
        ]);
    }

    public function test_named_report_keeps_reporter_identity(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/ethics-reports', [
            'title' => 'Conflit d’intérêts dans l’attribution fournisseur.',
            'is_anonymous' => 'Non',
            'reporter_name' => 'Marie Martin',
            'reporter_email' => 'marie@example.com',
            'category' => 'Conflit d’intérêts',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('is_anonymous', false);
        $response->assertJsonPath('reporter_name', 'Marie Martin');
        $response->assertJsonPath('category', 'conflit_interets');
    }

    public function test_report_handling_workflow_stamps_dates_and_handler(): void
    {
        $report = EthicsReport::create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'description' => 'Signalement test.',
            'is_anonymous' => true,
            'status' => 'received',
            'received_at' => now(),
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/ethics-reports/{$report->id}", ['status' => 'En traitement'])
            ->assertOk()
            ->assertJsonPath('status', 'in_progress');

        $report->refresh();
        $this->assertNotNull($report->acknowledged_at);
        $this->assertSame($this->user->id, $report->handled_by);

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/ethics-reports/{$report->id}", [
                'status' => 'Traité',
                'resolution' => 'Mesures correctives appliquées et vérifiées.',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'resolved');

        $report->refresh();
        $this->assertSame('Mesures correctives appliquées et vérifiées.', $report->resolution);
        $this->assertNotNull($report->closed_at);
    }

    public function test_indexes_are_scoped_to_the_enterprise(): void
    {
        CultureCommitment::create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'title' => 'Engagement interne',
            'type' => 'engagement',
            'status' => 'active',
        ]);

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        CultureCommitment::create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'title' => 'Engagement autre entreprise',
            'type' => 'engagement',
            'status' => 'active',
        ]);
        EthicsReport::create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'description' => 'Signalement autre entreprise.',
            'is_anonymous' => true,
            'status' => 'received',
            'received_at' => now(),
        ]);

        $commitments = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/culture-commitments')->assertOk();
        $this->assertCount(1, $commitments->json('data'));

        $reports = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/ethics-reports')->assertOk();
        $this->assertCount(0, $reports->json('data'));
    }
}
