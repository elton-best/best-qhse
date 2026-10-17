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

class ProcessIsoCoverageTest extends TestCase
{
    use RefreshDatabase;

    public function test_iso_clause_coverage_create_update_and_duplicate_validation_match_storage(): void
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
            'ref' => 'ISO-COVERAGE-' . uniqid(),
            'site_id' => $site->id,
            'title' => 'Pilotage qualité',
            'type' => 'management',
            'pilot_id' => $user->id,
            'purpose' => 'Piloter le système qualité.',
            'normes_iso' => ['9001'],
        ]);
        $payload = [
            'norme' => '9001',
            'version' => '2026',
            'clause_number' => '4.1',
            'clause_title' => 'Compréhension de l’organisme et de son contexte',
            'coverage_level' => 'full',
            'coverage_percentage' => 100,
            'conformity_status' => 'amelioration',
            'evidence' => ['CTX-001'],
        ];

        $created = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/processes/{$process->id}/iso-coverage", $payload)
            ->assertCreated()
            ->assertJsonPath('data.attributes.conformity_status', 'amelioration')
            ->assertJsonPath('data.attributes.version', '2026');

        $coverageId = $created->json('data.id');
        $this->postJson("/api/v1/processes/{$process->id}/iso-coverage", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('clause_number');

        $this->putJson(
            "/api/v1/processes/{$process->id}/iso-coverage/{$coverageId}",
            ['conformity_status' => 'non_applicable', 'coverage_percentage' => 75],
        )
            ->assertOk()
            ->assertJsonPath('data.attributes.conformity_status', 'non_applicable')
            ->assertJsonPath('data.attributes.coverage_percentage', 75);
    }
}
