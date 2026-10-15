<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\EnsureSubModuleSubscribed;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Ipe;
use App\Models\Site;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Sections ISO 50001 : CRUD, cloisonnement par entreprise, permissions et règles de calcul.
 */
class EnergyManagementTest extends TestCase
{
    use RefreshDatabase;

    private const PERMISSION_PREFIXES = [
        'planification.situation_energetique_reference',
        'planification.collecte_donnees_energetiques',
        'planification.objectifs_cibles_energetiques',
        'realisation.conception_energetique',
        'realisation.achats_energie',
        'realisation.achats_equipements_energetiques',
        'evaluation.surveillance_performance_energetique',
        'evaluation.conformite_energetique',
        'evaluation.audit_energetique',
    ];

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

        $role = Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        foreach (self::PERMISSION_PREFIXES as $prefix) {
            foreach (['read', 'create', 'update', 'delete'] as $action) {
                Permission::firstOrCreate(['name' => "{$prefix}.{$action}", 'guard_name' => 'web']);
            }
            $role->givePermissionTo(["{$prefix}.read", "{$prefix}.create", "{$prefix}.update", "{$prefix}.delete"]);
        }

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $this->siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->makeUser($this->enterpriseA, $this->siteA, $role);
        $this->adminB = $this->makeUser($this->enterpriseB, $this->siteB, $role);
    }

    private function makeUser(Enterprise $enterprise, Site $site, ?Role $role): User
    {
        $user = User::factory()->create([
            'enterprise_id' => $enterprise->id,
            'site_id' => $site->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);
        if ($role) {
            $user->assignRole($role);
        }

        return $user;
    }

    /**
     * @return array<string, array{0: string, 1: array<string, mixed>, 2: string, 3: array<string, mixed>}>
     */
    public static function resources(): array
    {
        return [
            'situation de référence' => ['energy-baselines', [
                'title' => 'SER 2025', 'energy_source' => 'Électricité', 'period_start' => '2025-01-01',
                'period_end' => '2025-12-31', 'baseline_consumption' => 12500.5, 'unit' => 'kWh',
            ], 'SER', ['unit' => 'MWh']],
            'collecte des données' => ['energy-data-collection-plans', [
                'title' => 'Relevé compteur général', 'data_point' => 'Index compteur principal', 'frequency' => 'monthly',
            ], 'PCD', ['frequency' => 'weekly']],
            'objectifs et cibles' => ['energy-objectives', [
                'title' => 'Réduire la consommation de 10 %', 'objective_type' => 'target', 'target_value' => 90,
                'baseline_value' => 100, 'unit' => '%',
            ], 'OBE', ['progress_percent' => 40]],
            'conception énergétique' => ['energy-design-reviews', [
                'title' => 'Nouvelle chaîne de froid', 'design_stage' => 'concept',
            ], 'CEN', ['design_stage' => 'review']],
            "achats d'énergie" => ['energy-purchases', [
                'title' => 'Contrat électricité 2026', 'energy_type' => 'Électricité', 'quantity' => 1000, 'unit_price' => 85,
            ], 'AEN', ['supplier_name' => 'SBEE']],
            "achats d'équipements" => ['energy-equipment-purchases', [
                'title' => 'Climatiseurs inverter', 'efficiency_class' => 'A++',
            ], 'AEQ', ['efficiency_class' => 'A+++']],
            'surveillance' => ['energy-monitoring-records', [
                'title' => 'Janvier 2026', 'period_start' => '2026-01-01', 'period_end' => '2026-01-31', 'measured_value' => 1100,
            ], 'SUR', ['analysis' => 'Dépassement lié à la canicule']],
            'conformité énergétique' => ['energy-compliance-evaluations', [
                'title' => 'Code de l\'énergie', 'legal_requirement' => 'Audit énergétique obligatoire',
            ], 'CEV', ['result' => 'compliant']],
            'audit énergétique interne' => ['energy-internal-audits', [
                'title' => 'Audit SMÉ 2026', 'planned_date' => '2026-06-15',
            ], 'AUE', ['nonconformities_count' => 2]],
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $change
     */
    #[DataProvider('resources')]
    public function test_crud_cycle_sets_reference_and_server_side_scope(string $uri, array $payload, string $prefix, array $change): void
    {
        $this->actingAs($this->adminA, 'sanctum');

        $created = $this->postJson("/api/v1/{$uri}", array_merge($payload, [
            'enterprise_id' => $this->enterpriseB->id, // doit être ignoré
        ]))->assertCreated();

        $id = $created->json('id');
        $this->assertStringStartsWith("{$prefix}-" . date('Y') . '-', $created->json('ref'));
        $this->assertSame($this->enterpriseA->id, $created->json('enterprise_id'));
        $this->assertSame($this->siteA->id, $created->json('site_id'));

        $this->getJson("/api/v1/{$uri}")->assertOk()->assertJsonPath('data.0.id', $id);
        $this->getJson("/api/v1/{$uri}/{$id}")->assertOk()->assertJsonPath('title', $payload['title']);

        $this->putJson("/api/v1/{$uri}/{$id}", $change)->assertOk();
        $this->assertDatabaseHas(
            (new (match ($uri) {
                'energy-baselines' => \App\Modules\Hse\Models\EnergyBaseline::class,
                'energy-data-collection-plans' => \App\Modules\Hse\Models\EnergyDataCollectionPlan::class,
                'energy-objectives' => \App\Modules\Hse\Models\EnergyObjective::class,
                'energy-design-reviews' => \App\Modules\Hse\Models\EnergyDesignReview::class,
                'energy-purchases' => \App\Modules\Hse\Models\EnergyPurchase::class,
                'energy-equipment-purchases' => \App\Modules\Hse\Models\EnergyEquipmentPurchase::class,
                'energy-monitoring-records' => \App\Modules\Hse\Models\EnergyMonitoringRecord::class,
                'energy-compliance-evaluations' => \App\Modules\Hse\Models\EnergyComplianceEvaluation::class,
                'energy-internal-audits' => \App\Modules\Hse\Models\EnergyInternalAudit::class,
            }))->getTable(),
            array_merge(['id' => $id], array_filter($change, fn ($v) => is_string($v) || is_int($v))),
        );

        $this->deleteJson("/api/v1/{$uri}/{$id}")->assertOk();
        $this->getJson("/api/v1/{$uri}/{$id}")->assertNotFound();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('resources')]
    public function test_other_enterprise_cannot_read_change_or_delete_records(string $uri, array $payload): void
    {
        $id = $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/{$uri}", $payload)->assertCreated()->json('id');

        $this->actingAs($this->adminB, 'sanctum');
        $this->getJson("/api/v1/{$uri}")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/{$uri}/{$id}")->assertNotFound();
        $this->putJson("/api/v1/{$uri}/{$id}", ['title' => 'Piraté'])->assertNotFound();
        $this->deleteJson("/api/v1/{$uri}/{$id}")->assertNotFound();

        $this->actingAs($this->adminA, 'sanctum')->getJson("/api/v1/{$uri}/{$id}")->assertOk()
            ->assertJsonPath('title', $payload['title']);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('resources')]
    public function test_cannot_create_on_a_site_of_another_enterprise(string $uri, array $payload): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson("/api/v1/{$uri}", array_merge($payload, ['site_id' => $this->siteB->id]))
            ->assertForbidden();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('resources')]
    public function test_requires_permissions(string $uri, array $payload): void
    {
        $reader = $this->makeUser($this->enterpriseA, $this->siteA, null);
        $this->actingAs($reader, 'sanctum');

        $this->getJson("/api/v1/{$uri}")->assertForbidden();
        $this->postJson("/api/v1/{$uri}", $payload)->assertForbidden();
    }

    public function test_responsible_must_belong_to_the_same_enterprise(): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/energy-design-reviews', [
                'title' => 'Projet',
                'responsible_id' => $this->adminB->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('responsible_id');

        $this->postJson('/api/v1/energy-design-reviews', [
            'title' => 'Projet',
            'responsible_id' => $this->adminA->id,
        ])->assertCreated()->assertJsonPath('responsible.id', $this->adminA->id);
    }

    public function test_ipe_of_another_enterprise_cannot_be_linked(): void
    {
        $foreignIpe = Ipe::create([
            'enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->siteB->id, 'nom' => 'IPE B',
            'formule_calcul' => 'kWh/t', 'unite' => 'kWh/t', 'periodicite' => 'mensuel',
        ]);

        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/energy-objectives', ['title' => 'Objectif', 'ipe_id' => $foreignIpe->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ipe_id');
    }

    public function test_existing_ipe_endpoints_are_isolated_between_enterprises(): void
    {
        $ipe = Ipe::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'nom' => 'IPE A',
            'formule_calcul' => 'kWh/t', 'unite' => 'kWh/t', 'periodicite' => 'mensuel',
        ]);

        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/ipe/{$ipe->id}")->assertNotFound();
        $this->actingAs($this->adminA, 'sanctum')->getJson("/api/v1/ipe/{$ipe->id}")->assertOk();
    }

    public function test_ipe_update_cannot_move_it_to_another_enterprise_and_values_are_isolated(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $created = $this->postJson('/api/v1/ipe', [
            'site_id' => $this->siteA->id, 'nom' => 'kWh/tonne', 'formule_calcul' => 'kWh / t', 'unite' => 'kWh/t',
            'periodicite' => 'mensuel',
        ])->assertCreated();
        $id = $created->json('id');

        $this->putJson("/api/v1/ipe/{$id}", [
            'enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->siteB->id, 'objectif_cible' => 80, 'nom' => 'kWh par tonne',
        ])->assertOk();
        $this->assertDatabaseHas('ipe', [
            'id' => $id, 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id,
            'nom' => 'kWh par tonne',
        ]);

        $this->postJson("/api/v1/ipe/{$id}/valeurs", [
            'periode_debut' => '2026-01-01', 'periode_fin' => '2026-01-31', 'valeur' => 95,
        ])->assertCreated();
        $this->getJson("/api/v1/ipe/{$id}/valeurs")->assertOk()->assertJsonCount(1);
        $this->getJson("/api/v1/ipe/{$id}/tendance")->assertOk()->assertJsonCount(1);

        $this->actingAs($this->adminB, 'sanctum');
        $this->getJson("/api/v1/ipe/{$id}/valeurs")->assertNotFound();
        $this->getJson("/api/v1/ipe/{$id}/tendance")->assertNotFound();
        $this->postJson("/api/v1/ipe/{$id}/valeurs", [
            'periode_debut' => '2026-02-01', 'periode_fin' => '2026-02-28', 'valeur' => 1,
        ])->assertNotFound();
    }

    public function test_ipe_cannot_be_created_on_a_site_of_another_enterprise(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/ipe', [
            'site_id' => $this->siteB->id, 'nom' => 'X', 'formule_calcul' => 'a/b', 'unite' => 'u', 'periodicite' => 'mensuel',
        ])->assertStatus(422)->assertJsonValidationErrors('site_id');
    }

    public function test_monitoring_computes_deviation_and_updates_it(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $created = $this->postJson('/api/v1/energy-monitoring-records', [
            'title' => 'Février', 'period_start' => '2026-02-01', 'period_end' => '2026-02-28',
            'planned_value' => 1000, 'measured_value' => 1100,
        ])->assertCreated();

        $this->assertEquals(100, $created->json('deviation'));
        $this->assertEquals(10, $created->json('deviation_percent'));

        $this->putJson('/api/v1/energy-monitoring-records/' . $created->json('id'), ['measured_value' => 900])
            ->assertOk()
            ->assertJsonPath('deviation', '-100.000')
            ->assertJsonPath('deviation_percent', '-10.00');
    }

    public function test_monitoring_rejects_inverted_period(): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/energy-monitoring-records', [
                'title' => 'Période inversée', 'period_start' => '2026-03-31', 'period_end' => '2026-03-01', 'measured_value' => 5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('period_end');
    }

    public function test_purchase_total_is_computed_from_quantity_and_unit_price(): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/energy-purchases', [
                'title' => 'Gaz', 'energy_type' => 'Gaz', 'quantity' => 20, 'unit_price' => 12.5,
            ])
            ->assertCreated()
            ->assertJsonPath('total_amount', '250.00');
    }

    public function test_baseline_validation_records_the_validator(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->postJson('/api/v1/energy-baselines', [
            'title' => 'SER', 'energy_source' => 'Gaz', 'period_start' => '2025-01-01', 'period_end' => '2025-12-31',
            'baseline_consumption' => 10, 'unit' => 'kWh',
        ])->assertCreated()->json('id');

        $this->putJson("/api/v1/energy-baselines/{$id}", ['status' => 'validated'])
            ->assertOk()
            ->assertJsonPath('status', 'validated');

        $this->assertDatabaseHas('energy_baselines', ['id' => $id, 'validated_by' => $this->adminA->id]);
    }

    public function test_achieved_objective_is_forced_to_full_progress(): void
    {
        $this->actingAs($this->adminA, 'sanctum')
            ->postJson('/api/v1/energy-objectives', ['title' => 'Atteint', 'status' => 'achieved', 'progress_percent' => 20])
            ->assertCreated()
            ->assertJsonPath('progress_percent', 100);
    }

    public function test_template_export_and_import_roundtrip(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->get('/api/v1/energy-purchases/template')->assertOk();

        $sheet = new Spreadsheet();
        $active = $sheet->getActiveSheet();
        $active->setCellValue('A1', 'MODELE');
        $active->fromArray(['Titre', 'Type d\'énergie'], null, 'A3');
        $active->fromArray([['Achat importé', 'Solaire'], ['', ''], ['Sans type', '']], null, 'A4');
        $path = tempnam(sys_get_temp_dir(), 'imp_') . '.xlsx';
        (new Xlsx($sheet))->save($path);

        $response = $this->post('/api/v1/energy-purchases/import-xlsx', [
            'file' => new UploadedFile($path, 'import.xlsx', null, null, true),
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame(1, $response->json('data.imported'));
        $this->assertNotEmpty($response->json('data.errors'));
        $this->assertDatabaseHas('energy_purchases', ['title' => 'Achat importé', 'enterprise_id' => $this->enterpriseA->id]);

        $this->get('/api/v1/energy-purchases/export-xlsx')->assertOk();
    }
}
