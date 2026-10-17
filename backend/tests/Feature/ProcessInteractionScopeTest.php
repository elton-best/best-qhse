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

class ProcessInteractionScopeTest extends TestCase
{
    use RefreshDatabase;

    private Site $site;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            EnsureEnterpriseOwnership::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
        ]);

        $enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $enterprise->id]);
        $this->user = User::factory()->create([
            'enterprise_id' => $enterprise->id,
            'site_id' => $this->site->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);
    }

    public function test_interaction_must_link_distinct_processes_on_the_authorized_site(): void
    {
        $processes = collect(['Fournisseur', 'Processus interne', 'Client'])
            ->map(fn (string $title) => $this->createProcess($this->site, $title));
        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        $outsideProcess = $this->createProcess($otherSite, 'Processus externe');

        $payload = [
            'supplier_process_id' => $processes[0]->id,
            'self_process_id' => $processes[1]->id,
            'client_process_id' => $outsideProcess->id,
        ];

        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/process-interactions', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('processes');

        $this->assertDatabaseCount('process_interactions', 0);

        $payload['client_process_id'] = $processes[2]->id;
        $this->postJson('/api/v1/process-interactions', $payload)
            ->assertCreated();
    }

    public function test_process_interaction_list_is_scoped_to_the_users_site(): void
    {
        $processes = collect(['Fournisseur', 'Processus interne', 'Client'])
            ->map(fn (string $title) => $this->createProcess($this->site, $title));
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/process-interactions', [
                'supplier_process_id' => $processes[0]->id,
                'self_process_id' => $processes[1]->id,
                'client_process_id' => $processes[2]->id,
            ])
            ->assertCreated();

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        $otherUser = User::factory()->create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);

        $this->actingAs($otherUser, 'sanctum')
            ->getJson('/api/v1/process-interactions')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    private function createProcess(Site $site, string $title): Process
    {
        return Process::query()->create([
            'ref' => 'TEST-' . str()->slug($title) . '-' . uniqid(),
            'site_id' => $site->id,
            'title' => $title,
            'type' => 'operational',
            'pilot_id' => $this->user->id,
            'purpose' => "Assurer le processus {$title}.",
        ]);
    }
}
