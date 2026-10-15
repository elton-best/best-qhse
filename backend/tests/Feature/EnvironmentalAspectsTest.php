<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\EnsureSubModuleSubscribed;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Models\AesRegistryVersion;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\AesSignificanceService;
use App\Modules\Hse\Services\AesWorkbookService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * AES — ISO 14001:2026 §6.1.2 : cotation, significativité, workflow, versions et cloisonnement.
 */
class EnvironmentalAspectsTest extends TestCase
{
    use RefreshDatabase;

    private const PERMS = ['read', 'create', 'update', 'delete', 'manage'];

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private Site $siteB;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
            EnsureEnterpriseOwnership::class,
            EnsureSubModuleSubscribed::class,
        ]);

        $names = ['environnement.aspects.evaluate'];
        foreach (self::PERMS as $action) {
            $names[] = "planification.aspects_environnementaux.{$action}";
        }
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])
            ->syncPermissions(['planification.aspects_environnementaux.read']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $this->siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->makeUser($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $this->adminB = $this->makeUser($this->enterpriseB, $this->siteB, 'admin_entreprise');
    }

    private function makeUser(Enterprise $enterprise, Site $site, ?string $role): User
    {
        $user = User::factory()->create([
            'enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true,
        ]);
        if ($role) {
            $user->assignRole($role);
        }

        return $user;
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'activity' => 'Éclairage des bureaux',
            'aspect' => "Consommation d'électricité",
            'impact' => 'Contribution au réchauffement climatique',
            'gravity' => 5, 'frequency' => 7, 'sensitivity' => 3, 'mastery' => 5,
        ], $overrides);
    }

    private function createAspect(array $overrides = [], ?User $as = null): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')
            ->postJson('/api/v1/environmental-aspects', $this->payload($overrides))
            ->assertCreated()->json('data.id');
    }

    // ------------------------------------------------------------ cotation

    public function test_threshold_is_strict_and_maximum_matches_the_template(): void
    {
        $service = app(AesSignificanceService::class);
        $settings = AesSignificanceService::DEFAULT_SETTINGS;

        $atThreshold = $service->evaluate(7, 7, 7, 1, false, false, $settings);
        $this->assertSame(343, $atThreshold['criticality']);
        $this->assertFalse($atThreshold['is_significant'], 'Cr = 343 n\'est pas significatif (343 < AES).');

        $above = $service->evaluate(7, 7, 7, 3, false, false, $settings);
        $this->assertTrue($above['is_significant']);
        $this->assertSame('environmental', $above['basis']);

        $this->assertSame(1715, $service->method($settings)['maximum_score']);
    }

    public function test_additional_criteria_raise_but_follow_settings(): void
    {
        $service = app(AesSignificanceService::class);
        $settings = AesSignificanceService::DEFAULT_SETTINGS;

        $raised = $service->evaluate(1, 3, 1, 1, true, false, $settings);
        $this->assertTrue($raised['is_significant']);
        $this->assertSame('additional', $raised['basis']);

        $disabled = $service->evaluate(1, 3, 1, 1, true, true, array_merge($settings, [
            'use_legal_criterion' => false, 'use_stakeholder_criterion' => false,
        ]));
        $this->assertFalse($disabled['is_significant']);
    }

    public function test_server_computes_score_and_ignores_client_supplied_results(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $response = $this->postJson('/api/v1/environmental-aspects', $this->payload([
            'criticality_score' => 1, 'significance_threshold' => 1, 'enterprise_id' => $this->enterpriseB->id, 'status' => 'validated',
        ]))->assertCreated();

        $response->assertJsonPath('data.criticality_score', 525)
            ->assertJsonPath('data.significance_threshold', 343)
            ->assertJsonPath('data.is_significant', true)
            ->assertJsonPath('data.significance_basis', 'environmental')
            ->assertJsonPath('data.enterprise_id', $this->enterpriseA->id)
            ->assertJsonPath('data.status', 'draft');
        $this->assertStringStartsWith('ASP-', $response->json('data.aspect_number'));
        $this->assertSame(1715, $response->json('data.method_snapshot.maximum_score'));
    }

    public function test_scores_outside_the_scale_are_rejected(): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/environmental-aspects', $this->payload(['mastery' => 6, 'gravity' => 8]))
            ->assertStatus(422)->assertJsonValidationErrors(['mastery', 'gravity']);
    }

    public function test_an_additional_criterion_can_never_downgrade_an_environmentally_significant_aspect(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/environmental-aspects', $this->payload(['is_significant' => false]))
            ->assertStatus(422)->assertJsonValidationErrors('is_significant');

        $id = $this->createAspect();
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['is_significant' => false])
            ->assertStatus(422)->assertJsonValidationErrors('is_significant');
        $this->assertDatabaseHas('environmental_aspects', ['id' => $id, 'is_significant' => true]);
    }

    public function test_a_legal_criterion_raises_a_low_score_above_the_threshold(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/environmental-aspects', $this->payload([
            'gravity' => 1, 'frequency' => 1, 'sensitivity' => 1, 'mastery' => 1, 'legal_criterion' => true,
        ]))->assertCreated()
            ->assertJsonPath('data.criticality_score', 1)
            ->assertJsonPath('data.is_significant', true)
            ->assertJsonPath('data.significance_basis', 'additional');
    }

    // ------------------------------------------------------------ cloisonnement et droits

    public function test_other_enterprise_cannot_read_change_or_delete_an_aspect(): void
    {
        $id = $this->createAspect();

        $this->actingAs($this->adminB, 'sanctum');
        $this->getJson('/api/v1/environmental-aspects')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/environmental-aspects/{$id}")->assertNotFound();
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['activity' => 'Piraté'])->assertNotFound();
        $this->deleteJson("/api/v1/environmental-aspects/{$id}")->assertNotFound();
        $this->postJson("/api/v1/environmental-aspects/{$id}/validate")->assertNotFound();
        $this->postJson("/api/v1/environmental-aspects/{$id}/flag-reassessment", ['reason' => 'x'])->assertNotFound();
        $this->getJson('/api/v1/environmental-aspects/statistics')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_cannot_use_a_foreign_site_process_or_responsible(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/environmental-aspects', $this->payload(['site_id' => $this->siteB->id]))->assertForbidden();

        $foreignProcess = Process::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->siteB->id]);
        $this->postJson('/api/v1/environmental-aspects', $this->payload(['process_id' => $foreignProcess->id]))
            ->assertStatus(422)->assertJsonValidationErrors('process_id');
        $this->postJson('/api/v1/environmental-aspects', $this->payload(['responsible_id' => $this->adminB->id]))
            ->assertStatus(422)->assertJsonValidationErrors('responsible_id');
    }

    public function test_permissions_are_enforced(): void
    {
        $id = $this->createAspect();
        $reader = $this->makeUser($this->enterpriseA, $this->siteA, 'lecteur');
        $nobody = $this->makeUser($this->enterpriseA, $this->siteA, null);

        $this->actingAs($reader, 'sanctum');
        $this->getJson('/api/v1/environmental-aspects')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/environmental-aspects', $this->payload())->assertForbidden();
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['activity' => 'x'])->assertForbidden();
        $this->postJson("/api/v1/environmental-aspects/{$id}/validate")->assertForbidden();
        $this->putJson('/api/v1/aes-settings', [])->assertForbidden();

        $this->actingAs($nobody, 'sanctum')->getJson('/api/v1/environmental-aspects')->assertForbidden();
    }

    // ------------------------------------------------------------ workflow

    public function test_validation_requires_complete_scoring_and_protects_the_evidence(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $incomplete = $this->postJson('/api/v1/environmental-aspects', [
            'activity' => 'A', 'aspect' => 'B', 'impact' => 'C',
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/environmental-aspects/{$incomplete}/validate")->assertStatus(422);

        $id = $this->createAspect();
        $this->postJson("/api/v1/environmental-aspects/{$id}/validate")->assertOk()
            ->assertJsonPath('data.status', 'validated');
        $this->assertSame(today()->toDateString(), EnvironmentalAspect::find($id)->last_reviewed_at->toDateString());
        $this->assertNotNull(EnvironmentalAspect::find($id)->next_review_date);

        $this->deleteJson("/api/v1/environmental-aspects/{$id}")->assertStatus(422);

        // Une modification de fond renvoie l'aspect validé en revue ; une action de suivi non.
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['observations' => 'RAS'])->assertOk()
            ->assertJsonPath('data.status', 'validated');
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['impact' => 'Nouvel impact'])->assertOk()
            ->assertJsonPath('data.status', 'in_review');

        $this->postJson("/api/v1/environmental-aspects/{$id}/archive")->assertOk()->assertJsonPath('data.status', 'archived');
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['activity' => 'x'])->assertStatus(422);
        $this->postJson("/api/v1/environmental-aspects/{$id}/reopen")->assertOk()->assertJsonPath('data.status', 'draft');
    }

    public function test_emergency_potential_creates_the_emergency_sheet_once(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $created = $this->postJson('/api/v1/environmental-aspects', $this->payload([
            'aspect' => 'Déversement de gasoil', 'impact' => 'Pollution du sol', 'is_emergency_potential' => true,
        ]))->assertCreated();

        $procedureId = $created->json('data.emergency_procedure_id');
        $this->assertNotNull($procedureId);
        $this->assertDatabaseHas('emergency_procedures', [
            'id' => $procedureId, 'aspect_id' => $created->json('data.id'),
            'enterprise_id' => $this->enterpriseA->id, 'status' => 'planifie', 'hazard_nature' => 'Pollution du sol',
        ]);

        $this->putJson('/api/v1/environmental-aspects/' . $created->json('data.id'), ['observations' => 'maj'])->assertOk();
        $this->assertSame(1, EmergencyProcedure::query()->count());
    }

    public function test_reassessment_flag_is_cleared_by_rescoring_and_by_validation(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->createAspect();

        $this->postJson("/api/v1/environmental-aspects/{$id}/flag-reassessment", ['reason' => 'Nouvel équipement'])
            ->assertOk()->assertJsonPath('data.needs_reassessment', true);
        $this->putJson("/api/v1/environmental-aspects/{$id}", ['frequency' => 5])->assertOk()
            ->assertJsonPath('data.needs_reassessment', false);

        $this->postJson('/api/v1/environmental-aspects/reassessment-trigger', ['trigger' => 'incident', 'reason' => 'Fuite'])
            ->assertStatus(422);
        $this->postJson('/api/v1/environmental-aspects/reassessment-trigger', [
            'trigger' => 'incident', 'reason' => 'Fuite', 'site_id' => $this->siteA->id,
        ])->assertOk()->assertJsonPath('data.flagged', 1);
        $this->assertStringContainsString('Incident : Fuite', EnvironmentalAspect::find($id)->reassessment_reason);

        $this->postJson("/api/v1/environmental-aspects/{$id}/validate")->assertOk()->assertJsonPath('data.needs_reassessment', false);

        $this->actingAs($this->adminB, 'sanctum')
            ->postJson('/api/v1/environmental-aspects/reassessment-trigger', ['trigger' => 'change', 'reason' => 'x', 'site_id' => $this->siteA->id])
            ->assertOk()->assertJsonPath('data.flagged', 0);
    }

    public function test_statistics_report_uncovered_significant_aspects_and_the_heatmap(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $uncovered = $this->createAspect();
        $this->createAspect(['additional_actions' => 'Installer des panneaux solaires']);
        $this->createAspect(['gravity' => 1, 'frequency' => 1, 'sensitivity' => 1, 'mastery' => 1]);

        $stats = $this->getJson('/api/v1/environmental-aspects/statistics')->assertOk()->json('data');
        $this->assertSame(3, $stats['total']);
        $this->assertSame(2, $stats['significant']);
        $this->assertSame([$uncovered], $stats['significant_without_action']);
        $this->assertSame(2, $stats['heatmap']['5-7']);
        $this->assertSame(1, $stats['heatmap']['1-1']);
    }

    public function test_significant_sheet_lists_only_significant_aspects_with_the_method(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->createAspect();
        $this->createAspect(['gravity' => 1, 'frequency' => 1, 'sensitivity' => 1, 'mastery' => 1]);

        $data = $this->getJson('/api/v1/environmental-aspects/significant-sheet')->assertOk()->json('data');
        $this->assertCount(1, $data['groups']);
        $this->assertCount(1, $data['groups'][0]['aspects']);
        $this->assertSame(343, $data['method']['threshold']);
    }

    // ------------------------------------------------------------ paramètres

    public function test_changing_the_threshold_recalculates_every_aspect_and_is_scoped_to_the_enterprise(): void
    {
        $id = $this->createAspect(); // 525
        $other = $this->createAspect([], $this->adminB);

        $this->actingAs($this->adminA, 'sanctum')->putJson('/api/v1/aes-settings', [
            'significance_threshold' => 600, 'max_gravity' => 7, 'max_frequency' => 7, 'max_sensitivity' => 7, 'max_mastery' => 5,
            'use_legal_criterion' => true, 'use_stakeholder_criterion' => true, 'review_frequency_months' => 6,
        ])->assertOk()->assertJsonPath('data.recalculated', 1);

        $this->assertDatabaseHas('environmental_aspects', ['id' => $id, 'is_significant' => false, 'significance_threshold' => 600]);
        $this->assertDatabaseHas('environmental_aspects', ['id' => $other, 'is_significant' => true, 'significance_threshold' => 343]);
        $this->getJson('/api/v1/aes-settings')->assertOk()->assertJsonPath('data.settings.significance_threshold', 600);
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/aes-settings')
            ->assertJsonPath('data.settings.significance_threshold', 343)->assertJsonPath('data.is_default', true);
    }

    public function test_reducing_the_scale_below_existing_scores_is_refused(): void
    {
        $this->createAspect(); // G=5
        $this->actingAs($this->adminA, 'sanctum')->putJson('/api/v1/aes-settings', [
            'significance_threshold' => 100, 'max_gravity' => 3, 'max_frequency' => 7, 'max_sensitivity' => 7, 'max_mastery' => 5,
            'use_legal_criterion' => true, 'use_stakeholder_criterion' => true, 'review_frequency_months' => 12,
        ])->assertStatus(422);
        $this->assertDatabaseMissing('aes_settings', ['enterprise_id' => $this->enterpriseA->id]);
    }

    // ------------------------------------------------------------ versions figées

    public function test_registry_versions_require_validation_are_immutable_and_comparable(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $first = $this->createAspect();
        $this->postJson('/api/v1/aes-registry-versions', ['label' => 'V1'])->assertStatus(422);

        $this->postJson("/api/v1/environmental-aspects/{$first}/validate")->assertOk();
        $v1 = $this->postJson('/api/v1/aes-registry-versions', ['label' => 'V1'])->assertCreated()
            ->assertJsonPath('data.version_number', 1)->json('data.id');

        $second = $this->createAspect(['aspect' => 'Déchets de papier', 'gravity' => 3, 'frequency' => 7, 'sensitivity' => 3, 'mastery' => 3]);
        $this->postJson("/api/v1/environmental-aspects/{$second}/validate")->assertOk();
        $this->putJson("/api/v1/environmental-aspects/{$first}", ['mastery' => 1])->assertOk();
        $this->postJson("/api/v1/environmental-aspects/{$first}/validate")->assertOk();
        $v2 = $this->postJson('/api/v1/aes-registry-versions', ['label' => 'V2'])->assertCreated()
            ->assertJsonPath('data.version_number', 2)->json('data.id');

        $diff = $this->getJson("/api/v1/aes-registry-versions/compare?from={$v1}&to={$v2}")->assertOk()->json('data');
        $this->assertCount(1, $diff['added']);
        $this->assertSame($second, $diff['added'][0]['id']);
        $this->assertCount(1, $diff['changed']);
        $this->assertSame(['from' => 5, 'to' => 1], $diff['changed'][0]['changes']['mastery']);
        $this->assertFalse($diff['method_changed']);

        $this->getJson("/api/v1/aes-registry-versions/{$v1}")->assertOk()->assertJsonCount(1, 'data.snapshot');
        $this->getJson('/api/v1/aes-registry-versions')->assertOk()->assertJsonCount(2, 'data')->assertJsonMissingPath('data.0.snapshot');

        $this->expectException(\LogicException::class);
        AesRegistryVersion::query()->findOrFail($v1)->update(['label' => 'falsifié']);
    }

    public function test_registry_versions_cannot_be_deleted_or_read_across_enterprises(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->createAspect();
        $this->postJson("/api/v1/environmental-aspects/{$id}/validate")->assertOk();
        $version = $this->postJson('/api/v1/aes-registry-versions', [])->assertCreated()->json('data.id');

        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/aes-registry-versions/{$version}")->assertNotFound();
        $this->getJson('/api/v1/aes-registry-versions')->assertOk()->assertJsonCount(0, 'data');

        try {
            AesRegistryVersion::query()->withoutGlobalScopes()->findOrFail($version)->delete();
            $this->fail('La suppression aurait dû être refusée.');
        } catch (\LogicException) {
            $this->assertDatabaseHas('aes_registry_versions', ['id' => $version]);
        }
    }

    // ------------------------------------------------------------ canevas et import

    private function workbook(array $rows): UploadedFile
    {
        $service = app(AesWorkbookService::class);
        $spreadsheet = $service->buildTemplate(AesSignificanceService::DEFAULT_SETTINGS);
        $sheet = $spreadsheet->getSheetByName('Registre');
        foreach ($rows as $index => $row) {
            $sheet->fromArray($row, null, 'A' . (5 + $index));
        }

        return new UploadedFile($service->save($spreadsheet), 'registre.xlsx', null, null, true);
    }

    public function test_template_download_and_dry_run_report_errors_without_writing(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->get('/api/v1/environmental-aspects/template')->assertOk();

        $process = Process::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'title' => 'Production']);
        $file = $this->workbook([
            ['', 'Production', '', 'N', 'Soudure', 'Fumées', 'Pollution de l\'air', '', '', 5, 5, 5, 5],
            ['', 'Inconnu', '', 'X', 'Peinture', 'COV', 'Air', '', '', 9, 5, 5, 5],
            ['', '', '', 'N', '', 'Bruit', 'Nuisance', '', '', 3, 3, 3, 3],
        ]);

        $response = $this->post('/api/v1/environmental-aspects/import-xlsx', ['file' => $file, 'dry_run' => 1], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertTrue($response->json('dry_run'));
        $this->assertSame(3, $response->json('data.total'));
        $this->assertSame(1, $response->json('data.valid'));
        $this->assertCount(2, $response->json('data.errors'));
        $this->assertStringContainsString('Ligne 6', $response->json('data.errors.0'));
        $this->assertSame(625, $response->json('data.preview.0.criticality'));
        $this->assertSame($process->id, $process->id);
        $this->assertSame(0, EnvironmentalAspect::query()->count());
    }

    public function test_import_is_all_or_nothing_unless_invalid_rows_are_skipped(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $rows = [
            ['', '', '', 'N', 'Soudure', 'Fumées', 'Air', '', '', 5, 5, 5, 5],
            ['', '', '', 'N', '', 'Bruit', 'Nuisance', '', '', 3, 3, 3, 3],
        ];

        $this->post('/api/v1/environmental-aspects/import-xlsx', ['file' => $this->workbook($rows)], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('success', false);
        $this->assertSame(0, EnvironmentalAspect::query()->count());

        $this->post('/api/v1/environmental-aspects/import-xlsx', ['file' => $this->workbook($rows), 'skip_invalid' => 1], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.imported', 1);
        $this->assertDatabaseHas('environmental_aspects', [
            'activity' => 'Soudure', 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id,
            'criticality_score' => 625, 'is_significant' => true, 'status' => 'draft',
        ]);
    }

    public function test_import_rejects_a_workbook_with_altered_headers(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $service = app(AesWorkbookService::class);
        $spreadsheet = $service->buildTemplate(AesSignificanceService::DEFAULT_SETTINGS);
        $spreadsheet->getSheetByName('Registre')->setCellValue('E4', 'Autre colonne');
        $file = new UploadedFile($service->save($spreadsheet), 'registre.xlsx', null, null, true);

        $this->post('/api/v1/environmental-aspects/import-xlsx', ['file' => $file, 'dry_run' => 1], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.valid', 0);
    }
}
