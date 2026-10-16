<?php

namespace Tests\Feature\Api;

use Tests\TestCase;
use App\Models\User;
use App\Models\DocumentTypeConfiguration;
use App\Models\Enterprise;
use App\Models\Site;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;

class DocumentTypeConfigurationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Enterprise $enterprise;
    private Site $site;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureMfaStepUp::class,
            \App\Http\Middleware\CheckSubscriptionStatus::class,
            \App\Http\Middleware\ForceCompanySetup::class,
            'mfa.stepup',
            'check.subscription',
            'force.company',
        ]);
        
        $this->enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $this->enterprise->id]);
        
        $this->user = User::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id
        ]);
        
        foreach (['support.documents.read', 'support.documents.configure_nomenclature'] as $name) {
            Permission::findOrCreate($name, 'web');
        }
        $this->user->givePermissionTo(['support.documents.read', 'support.documents.configure_nomenclature']);
        
        Sanctum::actingAs($this->user);
    }

    /** @test */
    public function it_lists_configurations()
    {
        DocumentTypeConfiguration::factory()->count(3)->create([
            'enterprise_id' => $this->enterprise->id
        ]);

        $response = $this->getJson('/api/v1/document-type-configurations');

        if ($response->status() !== 200) {
            dump($response->json());
            dump($response->status());
        }

        $response->assertStatus(200)
                 ->assertJsonStructure(['data']);
    }

    /** @test */
    public function it_shows_configuration()
    {
        $config = DocumentTypeConfiguration::factory()->create([
            'enterprise_id' => $this->enterprise->id
        ]);

        $response = $this->getJson("/api/v1/document-type-configurations/{$config->id}");

        $response->assertStatus(200)
                 ->assertJsonPath('data.id', $config->id);
    }

    /** @test */
    public function it_previews_code_with_modern_schema_payload()
    {
        $response = $this->postJson('/api/v1/document-type-configurations/preview-code', [
            'type_code' => 'PRC',
            'code_structure' => [
                ['part_type' => 'type_code', 'order' => 1],
                ['part_type' => 'year', 'order' => 2],
                ['part_type' => 'sequence', 'order' => 3, 'length' => 3, 'sequence_scope' => 'by_type_year'],
            ],
            'year' => 2026,
            'month' => 5,
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.preview', fn ($value) => is_string($value) && str_contains($value, 'PRC'));
    }

    /** @test */
    public function it_gets_visibility_stats()
    {
        DocumentTypeConfiguration::factory()->count(5)->create([
            'enterprise_id' => $this->enterprise->id,
            'is_active' => true
        ]);

        $response = $this->getJson('/api/v1/document-type-configurations/visibility-stats');

        $response->assertStatus(200)
                 ->assertJsonStructure(['data' => ['total', 'by_scope', 'by_status']]);
    }

    /** @test */
    public function it_applies_advanced_filters()
    {
        DocumentTypeConfiguration::factory()->count(10)->create([
            'enterprise_id' => $this->enterprise->id,
            'is_active' => true
        ]);

        $response = $this->getJson('/api/v1/document-type-configurations/advanced-filters?is_active=true');

        $response->assertStatus(200)
                 ->assertJsonStructure(['data']);
    }

    /** @test */
    public function it_requires_authentication()
    {
        Sanctum::actingAs(User::factory()->create(), []);

        $response = $this->getJson('/api/v1/document-type-configurations');

        $response->assertStatus(403);
    }

    /** @test */
    public function it_gets_available_sites_for_sharing()
    {
        $config = DocumentTypeConfiguration::factory()->create([
            'enterprise_id' => $this->enterprise->id
        ]);

        Site::factory()->count(3)->create(['enterprise_id' => $this->enterprise->id]);

        $response = $this->getJson("/api/v1/document-type-configurations/{$config->id}/available-sites-for-sharing");

        $response->assertStatus(200)
                 ->assertJsonStructure(['data']);
    }

    /** @test */
    public function it_filters_by_scope()
    {
        DocumentTypeConfiguration::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => null,
            'scope' => 'enterprise'
        ]);

        DocumentTypeConfiguration::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'scope' => 'site'
        ]);

        $response = $this->getJson('/api/v1/document-type-configurations?scope=site');

        $response->assertStatus(200);
    }

    /** @test */
    public function it_filters_by_active_status()
    {
        DocumentTypeConfiguration::factory()->count(3)->create([
            'enterprise_id' => $this->enterprise->id,
            'is_active' => true
        ]);

        DocumentTypeConfiguration::factory()->count(2)->create([
            'enterprise_id' => $this->enterprise->id,
            'is_active' => false
        ]);

        $response = $this->getJson('/api/v1/document-type-configurations?is_active=true');

        $response->assertStatus(200);
    }


    /** @test */
    public function it_keeps_legacy_configurations_read_only()
    {
        $config = DocumentTypeConfiguration::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'name' => 'Original',
            'is_active' => true,
        ]);
        $url = '/api/v1/document-type-configurations';

        $this->postJson($url, ['type_code' => 'TEST', 'type_label' => 'Test'])->assertStatus(409);
        $this->putJson("{$url}/{$config->id}", ['type_label' => 'Updated'])->assertStatus(409);
        $this->deleteJson("{$url}/{$config->id}")->assertStatus(409);
        $this->postJson("{$url}/{$config->id}/toggle-active")->assertStatus(409);
        $this->postJson("{$url}/{$config->id}/duplicate", ['type_code' => 'DUP', 'type_label' => 'Dup'])->assertStatus(409);
        $this->postJson("{$url}/{$config->id}/share-with-sites", ['site_ids' => [$this->site->id]])->assertStatus(409);

        $this->assertDatabaseHas('document_type_configurations', [
            'id' => $config->id,
            'name' => 'Original',
            'is_active' => true,
            'deleted_at' => null,
        ]);
    }
}
