<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\EnsureSubModuleSubscribed;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use App\Modules\Hse\Services\MonitoringAlertService;
use App\Notifications\SiteEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Performance environnementale et surveillance — ISO 14001:2026 §9.1.1.
 */
class EnvironmentalPerformanceTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class,
        ]);
        $names = array_map(fn ($a) => "evaluation.performance_environnementale.{$a}", ['read', 'create', 'update', 'delete']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions([$names[0]]);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->user($this->enterpriseA, $siteA, 'admin_entreprise');
        $this->adminB = $this->user($this->enterpriseB, $siteB, 'admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site, string $role): User
    {
        $user = User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function indicator(array $overrides = [], ?User $as = null): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/environmental-indicators', array_merge([
            'title' => 'Consommation d\'eau', 'unit' => 'm³', 'frequency' => 'monthly', 'threshold_direction' => 'max',
            'target_value' => 100, 'alert_threshold' => 150,
        ], $overrides))->assertCreated()->json('id');
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function reading(int $indicatorId, float $value, string $date, array $overrides = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/indicator-readings', array_merge([
            'indicator_id' => $indicatorId, 'value' => $value, 'measured_on' => $date,
        ], $overrides));
    }

    private function instrument(array $overrides = []): int
    {
        return $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/monitoring-instruments', array_merge([
            'title' => 'Compteur d\'eau général', 'instrument_type' => 'meter', 'last_calibration_date' => today()->subMonths(2)->toDateString(), 'calibration_frequency_days' => 365,
        ], $overrides))->assertCreated()->json('id');
    }

    // ------------------------------------------------------------------ instruments (M14-05)

    public function test_an_instrument_computes_its_next_calibration_and_validity(): void
    {
        $id = $this->instrument();
        $instrument = MonitoringInstrument::query()->findOrFail($id);
        $this->assertSame(today()->subMonths(2)->addDays(365)->toDateString(), $instrument->next_calibration_date->toDateString());
        $this->assertTrue($instrument->isValidOn(today()));

        $expired = $this->instrument(['title' => 'Balance', 'last_calibration_date' => today()->subDays(400)->toDateString()]);
        $this->getJson('/api/v1/monitoring-instruments')->assertOk()
            ->assertJsonPath('data.0.validity', 'expired')->assertJsonPath('data.1.validity', 'valid');
        $this->assertNotSame($id, $expired);
    }

    public function test_a_failed_calibration_puts_the_instrument_out_of_service_and_lists_readings_to_review(): void
    {
        $instrumentId = $this->instrument();
        $indicator = $this->indicator();
        $this->reading($indicator, 80, today()->subDays(10)->toDateString(), ['instrument_id' => $instrumentId])->assertCreated();

        $this->postJson("/api/v1/monitoring-instruments/{$instrumentId}/calibrations", ['calibrated_on' => today()->toDateString(), 'result' => 'pass'])
            ->assertStatus(422)->assertJsonValidationErrors(['certificate_ref']);
        $this->postJson("/api/v1/monitoring-instruments/{$instrumentId}/calibrations", ['calibrated_on' => today()->toDateString(), 'result' => 'fail'])
            ->assertOk()->assertJsonPath('readings_to_review', 1)->assertJsonPath('data.status', 'out_of_service');

        $this->postJson("/api/v1/monitoring-instruments/{$instrumentId}/calibrations", ['calibrated_on' => today()->toDateString(), 'result' => 'pass', 'certificate_ref' => 'CERT-42'])
            ->assertOk()->assertJsonPath('data.status', 'in_service');
        $this->getJson("/api/v1/monitoring-instruments/{$instrumentId}")->assertOk()->assertJsonCount(2, 'calibrations');
    }

    public function test_instruments_are_isolated_between_enterprises(): void
    {
        $id = $this->instrument();
        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/monitoring-instruments/{$id}")->assertNotFound();
        $this->postJson("/api/v1/monitoring-instruments/{$id}/calibrations", ['calibrated_on' => today()->toDateString(), 'result' => 'fail'])->assertNotFound();
    }

    // ------------------------------------------------------------------ indicateurs (M14-01, M14-02)

    public function test_an_indicator_can_only_link_to_the_enterprises_own_records(): void
    {
        $foreignAspect = EnvironmentalAspect::withoutGlobalScopes()->create([
            'enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->adminB->site_id, 'aspect_number' => 'B-1', 'activity' => 'x', 'aspect' => 'y', 'impact' => 'z', 'status' => 'active',
        ]);
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/environmental-indicators', ['title' => 'X', 'unit' => 'kg', 'aspect_id' => $foreignAspect->id])
            ->assertStatus(422)->assertJsonValidationErrors(['aspect_id']);
        $this->postJson('/api/v1/environmental-indicators', ['title' => 'X', 'unit' => 'kg', 'objective_id' => 999999])->assertStatus(422);
    }

    public function test_the_library_activates_indicators_once_and_rejects_unknown_codes(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/environmental-indicator-library/activate', ['codes' => ['water_consumption', 'waste_recovery_rate']])
            ->assertCreated()->assertJsonPath('created', 2);
        $this->postJson('/api/v1/environmental-indicator-library/activate', ['codes' => ['water_consumption']])->assertCreated()->assertJsonPath('created', 0);
        $this->postJson('/api/v1/environmental-indicator-library/activate', ['codes' => ['inconnu']])->assertStatus(422);

        $library = $this->getJson('/api/v1/environmental-indicator-library')->assertOk()->json('data');
        $this->assertCount(13, $library);
        $this->assertTrue(collect($library)->firstWhere('code', 'water_consumption')['activated']);
        $this->assertSame('min', EnvironmentalIndicator::query()->where('library_code', 'waste_recovery_rate')->value('threshold_direction'));
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/environmental-indicators')->assertJsonCount(0, 'data');
    }

    // ------------------------------------------------------------------ relevés (M14-03, M14-04)

    public function test_plausibility_checks_refuse_wrong_unit_negative_future_and_over_100_percent(): void
    {
        $id = $this->indicator();
        $this->reading($id, 50, today()->toDateString(), ['unit' => 'L'])->assertStatus(422)->assertJsonPath('code', 'UNIT_MISMATCH');
        $this->reading($id, -5, today()->toDateString())->assertStatus(422)->assertJsonPath('code', 'NEGATIVE_VALUE');
        $this->reading($id, 5, today()->addDay()->toDateString())->assertStatus(422);
        $percent = $this->indicator(['title' => 'Taux', 'unit' => '%']);
        $this->reading($percent, 120, today()->toDateString())->assertStatus(422)->assertJsonPath('code', 'PERCENT_RANGE');
        $this->reading($id, 80, today()->toDateString(), ['unit' => 'M³'])->assertCreated();
    }

    public function test_a_duplicate_needs_confirmation_and_is_flagged(): void
    {
        $id = $this->indicator();
        $this->reading($id, 80, today()->toDateString())->assertCreated();
        $this->reading($id, 82, today()->toDateString())->assertStatus(422)->assertJsonPath('code', 'DUPLICATE')->assertJsonPath('needs_confirmation', true);
        $this->reading($id, 82, today()->toDateString(), ['confirm_duplicate' => true])->assertCreated()->assertJsonPath('data.flags.0', 'duplicate_confirmed');
    }

    public function test_an_outlier_needs_confirmation_after_enough_history(): void
    {
        $id = $this->indicator();
        foreach ([100, 102, 98, 101, 99, 100] as $i => $v) {
            $this->reading($id, $v, today()->subDays(60 - $i * 5)->toDateString())->assertCreated();
        }
        $this->reading($id, 10000, today()->toDateString())->assertStatus(422)->assertJsonPath('code', 'OUTLIER');
        $this->reading($id, 10000, today()->toDateString(), ['confirm_outlier' => true])->assertCreated()->assertJsonPath('data.flags.0', 'outlier_confirmed');
    }

    public function test_a_reading_with_an_instrument_out_of_validity_is_flagged_and_foreign_instruments_are_refused(): void
    {
        $indicator = $this->indicator();
        $expired = $this->instrument(['last_calibration_date' => today()->subDays(500)->toDateString()]);
        $valid = $this->instrument(['title' => 'Compteur neuf']);

        $this->reading($indicator, 80, today()->toDateString(), ['instrument_id' => $expired])->assertCreated()
            ->assertJsonPath('data.instrument_valid', false)->assertJsonPath('data.flags.0', 'instrument_out_of_validity');
        $this->reading($indicator, 85, today()->subDay()->toDateString(), ['instrument_id' => $valid])->assertCreated()->assertJsonPath('data.instrument_valid', true);

        $foreign = $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/monitoring-instruments', ['title' => 'Chez B'])->assertCreated()->json('id');
        $this->reading($indicator, 70, today()->subDays(2)->toDateString(), ['instrument_id' => $foreign], $this->adminA)->assertStatus(422)->assertJsonPath('code', 'INSTRUMENT_UNKNOWN');
    }

    public function test_a_reading_is_immutable_and_corrected_by_a_new_one(): void
    {
        $id = $this->indicator();
        $first = $this->reading($id, 80, today()->toDateString())->assertCreated()->json('data.id');

        $this->expectException(\LogicException::class);
        try {
            IndicatorReading::query()->findOrFail($first)->update(['value' => 1]);
        } finally {
            $this->postJson("/api/v1/indicator-readings/{$first}/correct", ['value' => 90])->assertStatus(422)->assertJsonValidationErrors(['correction_reason']);
            $new = $this->postJson("/api/v1/indicator-readings/{$first}/correct", ['value' => 90, 'correction_reason' => 'Erreur de saisie'])->assertCreated()->json('data.id');
            $this->assertNotNull(IndicatorReading::query()->find($first)->superseded_by_id);
            $this->postJson("/api/v1/indicator-readings/{$first}/correct", ['value' => 95, 'correction_reason' => 'Autre erreur'])->assertStatus(422);
            $this->getJson('/api/v1/indicator-readings?indicator_id='.$id)->assertJsonCount(1, 'data');
            $this->getJson('/api/v1/indicator-readings?include_superseded=1&indicator_id='.$id)->assertJsonCount(2, 'data');
            $this->assertSame($first, IndicatorReading::query()->find($new)->supersedes_id);
        }
    }

    public function test_the_offline_batch_is_idempotent_and_reports_rejected_rows(): void
    {
        $id = $this->indicator();
        $payload = ['readings' => [
            ['indicator_id' => $id, 'client_uuid' => 'a1', 'value' => 80, 'measured_on' => today()->subDays(3)->toDateString()],
            ['indicator_id' => $id, 'client_uuid' => 'a2', 'value' => -4, 'measured_on' => today()->subDays(2)->toDateString()],
            ['indicator_id' => 999999, 'client_uuid' => 'a3', 'value' => 4],
        ]];
        $first = $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/indicator-readings/batch', $payload)->assertOk()->json('data');
        $this->assertSame(['created', 'rejected', 'rejected'], array_column($first, 'status'));
        $this->assertSame('NEGATIVE_VALUE', $first[1]['code']);

        $second = $this->postJson('/api/v1/indicator-readings/batch', $payload)->assertOk()->json('data');
        $this->assertSame('exists', $second[0]['status']);
        $this->assertSame(1, IndicatorReading::query()->count());
    }

    public function test_evidence_is_stored_privately_and_downloadable_only_by_its_enterprise(): void
    {
        Storage::fake('local');
        $id = $this->indicator();
        $response = $this->actingAs($this->adminA, 'sanctum')->post('/api/v1/indicator-readings', [
            'indicator_id' => $id, 'value' => 80, 'measured_on' => today()->toDateString(),
            'evidence' => UploadedFile::fake()->create('facture.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $readingId = $response->json('data.id');

        $this->get("/api/v1/indicator-readings/{$readingId}/evidence")->assertOk();
        $this->actingAs($this->adminB, 'sanctum')->get("/api/v1/indicator-readings/{$readingId}/evidence")->assertNotFound();
        $this->actingAs($this->adminA, 'sanctum')->post('/api/v1/indicator-readings', [
            'indicator_id' => $id, 'value' => 81, 'measured_on' => today()->subDay()->toDateString(), 'evidence' => UploadedFile::fake()->create('virus.exe', 10),
        ], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_the_import_creates_valid_rows_and_reports_the_rejected_ones(): void
    {
        $id = $this->indicator();
        $ref = EnvironmentalIndicator::query()->findOrFail($id)->ref;
        $sheet = new Spreadsheet;
        $sheet->getActiveSheet()->fromArray([
            ['Indicateur', 'Date', 'Valeur', 'Unité', 'Instrument', 'Quantité', 'Note'],
            [$ref, today()->subDays(5)->toDateString(), '80,5', 'm³', null, null, 'Facture de janvier'],
            [$ref, today()->subDays(4)->toDateString(), 'abc', 'm³', null, null, null],
            ['IEN-INCONNU', today()->subDays(3)->toDateString(), 10, 'm³', null, null, null],
            [$ref, today()->subDays(2)->toDateString(), 12, 'kg', null, null, null],
        ]);
        $path = tempnam(sys_get_temp_dir(), 'rd').'.xlsx';
        (new Xlsx($sheet))->save($path);

        $result = $this->actingAs($this->adminA, 'sanctum')->post('/api/v1/indicator-readings/import-xlsx', ['file' => new UploadedFile($path, 'releves.xlsx', null, null, true)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('created', 1)->json('rejected');
        $this->assertSame([3, 4, 5], array_column($result, 'row'));
        $this->assertSame(80.5, IndicatorReading::query()->first()->value);
    }

    // ------------------------------------------------------------------ analyse (M14-06 à M14-08)

    public function test_the_analysis_reports_trend_comparison_and_threshold_state(): void
    {
        $id = $this->indicator(['target_value' => 100, 'alert_threshold' => 150, 'normalization' => 'per_employee']);
        foreach ([60, 65, 70, 120, 130, 160] as $i => $v) {
            $this->reading($id, $v, today()->subDays(50 - $i * 5)->toDateString(), ['activity_quantity' => 10])->assertCreated();
        }

        $analysis = $this->getJson("/api/v1/environmental-indicators/{$id}/analysis")->assertOk()->json('data');
        $this->assertSame(6, $analysis['count']);
        $this->assertSame('up', $analysis['trend']);
        $this->assertSame('alert', $analysis['threshold_state']);
        $this->assertEquals(16.0, $analysis['series'][5]['normalized']);
        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/environmental-indicators/{$id}/analysis")->assertNotFound();
    }

    public function test_an_action_is_created_in_one_click_only_when_the_alert_threshold_is_exceeded(): void
    {
        $id = $this->indicator();
        $this->reading($id, 80, today()->subDay()->toDateString())->assertCreated();
        $this->postJson("/api/v1/environmental-indicators/{$id}/actions")->assertStatus(422);

        $this->reading($id, 180, today()->toDateString())->assertCreated();
        $action = $this->postJson("/api/v1/environmental-indicators/{$id}/actions")->assertCreated()->json('data');
        $this->assertDatabaseHas('actions', ['id' => $action['id'], 'enterprise_id' => $this->enterpriseA->id, 'source_type' => 'environmental_indicator', 'source_id' => $id, 'status' => 'planned']);
    }

    public function test_an_indicator_with_readings_cannot_be_deleted(): void
    {
        $id = $this->indicator();
        $this->reading($id, 80, today()->toDateString())->assertCreated();
        $this->deleteJson("/api/v1/environmental-indicators/{$id}")->assertStatus(422);
        $empty = $this->indicator(['title' => 'Vide']);
        $this->deleteJson("/api/v1/environmental-indicators/{$empty}")->assertOk();
    }

    public function test_the_overview_and_report_are_scoped_to_the_enterprise(): void
    {
        $id = $this->indicator();
        $this->reading($id, 180, today()->toDateString())->assertCreated();
        $overview = $this->getJson('/api/v1/performance/overview')->assertOk()->json('data');
        $this->assertSame(1, $overview['indicators']['active']);
        $this->assertSame(1, $overview['indicators']['by_state']['alert']);
        $this->assertSame(0, $overview['indicators']['readings_overdue']);

        $report = $this->getJson('/api/v1/performance/report')->assertOk()->json('data');
        $this->assertCount(1, $report['alerts']);
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/performance/overview')->assertOk()->assertJsonPath('data.indicators.active', 0);
        $this->getJson('/api/v1/performance/report')->assertOk()->assertJsonCount(0, 'data.indicators');
    }

    public function test_calibration_reminders_go_to_the_responsible(): void
    {
        Notification::fake();
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->instrument(['last_calibration_date' => today()->subDays(365 - 7)->toDateString(), 'responsible_id' => $this->adminA->id]);
        $this->assertNotNull($id);

        $sent = app(MonitoringAlertService::class)->alertDue();
        $this->assertSame(1, $sent);
        Notification::assertSentTo($this->adminA, SiteEventNotification::class);
    }

    public function test_a_reader_cannot_record_readings(): void
    {
        $id = $this->indicator();
        $reader = $this->user($this->enterpriseA, $this->adminA->site, 'lecteur');
        $this->reading($id, 10, today()->toDateString(), [], $reader)->assertForbidden();
        $this->actingAs($reader, 'sanctum')->getJson('/api/v1/indicator-readings')->assertOk();
    }
}
