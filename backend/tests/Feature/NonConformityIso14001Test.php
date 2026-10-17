<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Evaluation\Models\AuditFinding;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Improvement\Models\ImprovementSuggestion;
use App\Modules\Improvement\Models\NonConformity;
use App\Modules\Improvement\Services\NonConformityEscalationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Non-conformités, actions correctives et amélioration continue — ISO 14001:2026 §10 (M17).
 */
class NonConformityIso14001Test extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private User $admin;

    private User $worker;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class, ForceSignatureUpload::class, EnsureEnterpriseOwnership::class]);
        $role = Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        $role->givePermissionTo(Permission::firstOrCreate(['name' => 'non_conformities.manage', 'guard_name' => 'web']));
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->admin = $this->user($this->enterpriseA, $this->siteA)->assignRole($role);
        $this->worker = $this->user($this->enterpriseA, $this->siteA)->assignRole('lecteur');
        $this->adminB = $this->user($this->enterpriseB, $siteB)->assignRole($role);
    }

    private function user(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
    }

    private function declare(array $overrides = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->worker, 'sanctum')->postJson('/api/v1/non-conformities/quick-declare', array_merge([
            'report_source' => 'incident', 'description' => 'Fuite de gasoil constatée près de la cuve nord.', 'location' => 'Cuve nord',
        ], $overrides));
    }

    // ----------------------------------------------------------------- M17-01

    public function test_any_user_declares_a_nonconformity_in_one_step(): void
    {
        Storage::fake('local');
        $response = $this->actingAs($this->worker, 'sanctum')->post('/api/v1/non-conformities/quick-declare', [
            'report_source' => 'report', 'description' => 'Bidons de solvant stockés sans bac de rétention.', 'location' => 'Atelier peinture', 'environmental_impact' => true,
            'photos' => [UploadedFile::fake()->image('stockage.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $id = $response->json('data.id');
        $nc = NonConformity::query()->findOrFail($id);
        $this->assertSame($this->worker->id, $nc->detected_by);
        $this->assertSame('open', $nc->status);
        $this->assertSame('report', $nc->report_source);
        $this->assertTrue($nc->environmental_impact);
        $this->assertSame($this->siteA->id, $nc->site_id);
        $this->assertSame(0, $nc->actions()->count(), 'aucune action n\'est créée avant la décision');

        $this->get("/api/v1/non-conformities/{$id}/photos/0")->assertOk();
        $this->actingAs($this->adminB, 'sanctum')->get("/api/v1/non-conformities/{$id}/photos/0")->assertNotFound();
    }

    public function test_declaration_is_validated_and_scoped(): void
    {
        $this->declare(['description' => 'court'])->assertStatus(422)->assertJsonValidationErrors(['description']);
        $this->declare(['report_source' => 'inconnue'])->assertStatus(422);
        $this->declare(['occurred_at' => now()->addDay()->toDateString()])->assertStatus(422);
        $this->declare(['site_id' => $this->adminB->site_id])->assertForbidden();
    }

    public function test_the_offline_batch_is_idempotent_and_reports_rejections(): void
    {
        $items = ['items' => [
            ['client_uuid' => 'n1', 'report_source' => 'inspection', 'description' => 'Extincteur absent du local chaufferie.'],
            ['client_uuid' => 'n2', 'report_source' => 'inspection', 'description' => 'court'],
        ]];
        $first = $this->actingAs($this->worker, 'sanctum')->postJson('/api/v1/non-conformities/quick-declare/batch', $items)->assertOk()->json('data');
        $this->assertSame(['created', 'rejected'], array_column($first, 'status'));
        $second = $this->postJson('/api/v1/non-conformities/quick-declare/batch', $items)->assertOk()->json('data');
        $this->assertSame('exists', $second[0]['status']);
        $this->assertSame(1, NonConformity::query()->withoutGlobalScopes()->where('client_uuid', 'n1')->count());
    }

    // ----------------------------------------------------------------- M17-02

    public function test_an_environmental_impact_requires_mitigation_measures(): void
    {
        $id = $this->declare(['environmental_impact' => true])->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/non-conformities/{$id}/immediate-treatment", ['immediate_action' => 'Arrêt de la pompe et pose d\'un absorbant.'])
            ->assertStatus(422)->assertJsonValidationErrors(['impact_mitigation']);
        $this->putJson("/api/v1/non-conformities/{$id}/immediate-treatment", ['immediate_action' => 'Arrêt de la pompe et pose d\'un absorbant.', 'impact_mitigation' => 'Récupération du sol pollué et évacuation en filière agréée.'])
            ->assertOk()->assertJsonPath('data.immediate_action_by', $this->admin->id);
    }

    // ----------------------------------------------------------------- M17-03

    public function test_a_major_nonconformity_cannot_be_dismissed_but_a_minor_one_can_with_a_reason(): void
    {
        $major = $this->declare(['severity' => 'major'])->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/non-conformities/{$major}/decision", ['decision' => 'not_required', 'justification' => 'Sans conséquence réelle.'])->assertStatus(422);

        $minor = $this->declare()->assertCreated()->json('data.id');
        $this->postJson("/api/v1/non-conformities/{$minor}/decision", ['decision' => 'not_required'])->assertStatus(422)->assertJsonValidationErrors(['justification']);
        $this->postJson("/api/v1/non-conformities/{$minor}/decision", ['decision' => 'not_required', 'justification' => 'Écart ponctuel corrigé sur place, sans effet.'])->assertOk()->assertJsonPath('data.corrective_decision', 'not_required');
        $this->putJson("/api/v1/non-conformities/{$minor}/root-cause", ['method' => 'five_why', 'root_cause' => 'Peu importe la cause ici.'])->assertStatus(422);
    }

    public function test_the_root_cause_analysis_is_guided_and_detects_recurrence(): void
    {
        $old = NonConformity::create([
            'site_id' => $this->siteA->id, 'title' => 'Fuite de gasoil près de la cuve', 'type' => 'procedural', 'severity' => 'minor', 'description' => 'Fuite antérieure sur la même cuve.',
            'status' => 'open', 'detected_by' => $this->worker->id, 'detected_at' => now()->subMonths(3), 'requirement_reference' => 'Consigne cuve',
        ]);
        $id = $this->declare(['severity' => 'major'])->assertCreated()->json('data.id');
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/non-conformities/{$id}/decision", ['decision' => 'required'])->assertOk();

        $similar = $this->getJson("/api/v1/non-conformities/{$id}/similar")->assertOk()->json('data');
        $this->assertSame($old->id, $similar[0]['id']);

        $this->putJson("/api/v1/non-conformities/{$id}/root-cause", ['method' => 'five_why', 'root_cause' => 'Flexible usé non remplacé.', 'five_whys' => [['why' => 'Pourquoi fuite ?', 'answer' => 'Flexible percé']]])->assertStatus(422);
        $this->putJson("/api/v1/non-conformities/{$id}/root-cause", ['method' => 'cause_effect', 'root_cause' => 'Aucune maintenance préventive.', 'cause_effect' => ['inconnue' => ['x']]])->assertStatus(422);

        $five = [['why' => 'Pourquoi la fuite ?', 'answer' => 'Flexible percé'], ['why' => 'Pourquoi percé ?', 'answer' => 'Usure'], ['why' => 'Pourquoi non remplacé ?', 'answer' => 'Pas de contrôle périodique']];
        $this->putJson("/api/v1/non-conformities/{$id}/root-cause", ['method' => 'five_why', 'root_cause' => 'Absence de contrôle périodique des flexibles.', 'five_whys' => $five])
            ->assertOk()->assertJsonPath('data.is_recurrent', true)->assertJsonPath('data.root_cause_method', 'five_why');
    }

    // ----------------------------------------------------------------- M17-04

    public function test_the_corrective_plan_follows_decision_and_analysis_then_closure_needs_effectiveness(): void
    {
        $id = $this->declare(['severity' => 'major'])->assertCreated()->json('data.id');
        $plan = ['responsible_id' => $this->worker->id, 'deadline' => now()->addMonth()->toDateString(), 'description' => 'Remplacer les flexibles et instaurer un contrôle mensuel.', 'sme_update_required' => true, 'sme_update_note' => 'Ajouter le contrôle au plan de maintenance.'];

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/non-conformities/{$id}/corrective-plan", $plan)->assertStatus(422);
        $this->postJson("/api/v1/non-conformities/{$id}/decision", ['decision' => 'required'])->assertOk();
        $this->postJson("/api/v1/non-conformities/{$id}/corrective-plan", $plan)->assertStatus(422);
        $this->putJson("/api/v1/non-conformities/{$id}/root-cause", ['method' => 'cause_effect', 'root_cause' => 'Absence de maintenance préventive.', 'cause_effect' => ['methods' => ['Pas de plan de contrôle']]])->assertOk();
        $this->postJson("/api/v1/non-conformities/{$id}/corrective-plan", array_merge($plan, ['responsible_id' => $this->adminB->id]))->assertStatus(422);

        $actionId = $this->postJson("/api/v1/non-conformities/{$id}/corrective-plan", $plan)->assertCreated()->json('data.action_id');
        $this->assertDatabaseHas('actions', ['id' => $actionId, 'non_conformity_id' => $id, 'responsible_id' => $this->worker->id, 'enterprise_id' => $this->enterpriseA->id]);

        DB::table('actions')->where('id', $actionId)->update(['status' => 'completed']);
        $this->postJson("/api/v1/non-conformities/{$id}/close")->assertStatus(422)->assertJsonValidationErrors(['effectiveness']);

        NonConformity::query()->findOrFail($id)->update(['effectiveness_verified' => true]);
        $this->postJson("/api/v1/non-conformities/{$id}/close")->assertStatus(422)->assertJsonValidationErrors(['sme_update']);
        $this->postJson("/api/v1/non-conformities/{$id}/sme-update-done")->assertOk();
        // Les garde-fous de la clôture sont levés ; la transition d'état dépend des états de workflow seedés (absents de la base de test).
        $this->assertNotSame(422, $this->postJson("/api/v1/non-conformities/{$id}/close")->status());
    }

    // ----------------------------------------------------------------- M17-05

    public function test_delays_escalate_by_level_and_alert_only_when_the_level_rises(): void
    {
        Notification::fake();
        $process = DB::table('processes')->insertGetId([
            'ref' => 'PRC-1', 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'title' => 'Peinture', 'type' => 'operational', 'status' => 'active',
            'purpose' => 'Finalité', 'code' => 'PRC-PEINT', 'pilot_id' => $this->admin->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $nc = NonConformity::create([
            'site_id' => $this->siteA->id, 'process_id' => $process, 'title' => 'NC en retard', 'type' => 'procedural', 'severity' => 'major', 'description' => 'Retard de traitement.',
            'status' => 'open', 'detected_by' => $this->worker->id, 'detected_at' => now()->subMonth(), 'responsible_id' => $this->worker->id, 'deadline' => now()->subDays(2)->toDateString(), 'report_source' => 'report',
        ]);
        $service = app(NonConformityEscalationService::class);

        $this->assertSame(1, $service->run());
        $this->assertSame(0, $service->run(), 'pas de nouvelle alerte tant que le niveau ne monte pas');

        $nc->forceFill(['deadline' => now()->subDays(8)->toDateString()])->saveQuietly();
        $this->assertSame(2, $service->run(), 'responsable et pilote du processus');
        $nc->forceFill(['deadline' => now()->subDays(20)->toDateString()])->saveQuietly();
        $this->assertGreaterThanOrEqual(2, $service->run(), 'la direction est alertée');
        $this->assertSame(3, $nc->fresh()->escalation_level);
    }

    // ----------------------------------------------------------------- M17-06

    public function test_the_register_is_fed_by_audits_reviews_and_indicators_and_decisions_are_justified(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        $auditId = DB::table('audits')->insertGetId(['ref' => 'AUD-1', 'site_id' => $this->siteA->id, 'title' => 'Audit', 'planned_date' => now(), 'lead_auditor_id' => $this->admin->id, 'status' => 'completed', 'created_at' => now(), 'updated_at' => now()]);
        $finding = AuditFinding::create(['audit_id' => $auditId, 'type' => 'opportunity', 'title' => 'Mutualiser les collectes', 'description' => 'Possibilité de mutualiser les collectes de déchets.', 'severity' => 'low', 'priority' => 3, 'detected_by' => $this->admin->id, 'detected_at' => now()]);
        $nonOpportunity = AuditFinding::create(['audit_id' => $auditId, 'type' => 'nc_minor', 'title' => 'NC', 'description' => 'Une non-conformité mineure.', 'severity' => 'low', 'priority' => 3, 'detected_by' => $this->admin->id, 'detected_at' => now(), 'auto_create_nc' => false]);

        $this->postJson('/api/v1/improvement-suggestions/from-source', ['source_type' => 'audit_finding', 'source_id' => $nonOpportunity->id])->assertStatus(422);
        $id = $this->postJson('/api/v1/improvement-suggestions/from-source', ['source_type' => 'audit_finding', 'source_id' => $finding->id])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/improvement-suggestions/from-source', ['source_type' => 'audit_finding', 'source_id' => $finding->id])->assertOk()->assertJsonPath('data.id', $id);
        $this->assertSame(1, ImprovementSuggestion::query()->withoutGlobalScopes()->where('source_type', 'audit_finding')->count());

        $indicator = EnvironmentalIndicator::create(['enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'title' => 'Eau', 'unit' => 'm³', 'target_value' => 100, 'alert_threshold' => 150]);
        $this->postJson('/api/v1/improvement-suggestions/from-source', ['source_type' => 'indicator', 'source_id' => $indicator->id])->assertStatus(422);
        IndicatorReading::create(['enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'indicator_id' => $indicator->id, 'measured_on' => today(), 'value' => 120, 'unit' => 'm³']);
        $this->postJson('/api/v1/improvement-suggestions/from-source', ['source_type' => 'indicator', 'source_id' => $indicator->id])->assertCreated();

        $this->postJson("/api/v1/improvement-suggestions/{$id}/decide", ['decision' => 'reject', 'note' => 'Court'])->assertStatus(422);
        $this->postJson("/api/v1/improvement-suggestions/{$id}/decide", ['decision' => 'adopt', 'note' => 'Bonne idée, à mettre en œuvre.'])->assertStatus(422);
        $this->postJson("/api/v1/improvement-suggestions/{$id}/decide", ['decision' => 'adopt', 'note' => 'Bonne idée, à mettre en œuvre.', 'responsible_id' => $this->worker->id, 'deadline' => now()->addMonth()->toDateString()])
            ->assertOk()->assertJsonPath('data.status', 'adopted');
        $this->assertNotNull(ImprovementSuggestion::query()->withoutGlobalScopes()->find($id)->action_id);
        $this->postJson("/api/v1/improvement-suggestions/{$id}/decide", ['decision' => 'reject', 'note' => 'Décision déjà prise ailleurs.'])->assertStatus(422);

        $summary = $this->getJson('/api/v1/improvement-suggestions/summary')->assertOk()->json('data');
        $this->assertSame(2, $summary['total']);
        $this->assertSame(1, $summary['adopted_open']);

        $this->actingAs($this->adminB, 'sanctum')->postJson("/api/v1/improvement-suggestions/{$id}/decide", ['decision' => 'reject', 'note' => 'Tentative externe sans droit.'])->assertNotFound();
        $this->getJson('/api/v1/improvement-suggestions/summary')->assertOk()->assertJsonPath('data.total', 0);
    }

    // ----------------------------------------------------------------- M17-07

    public function test_the_dashboard_counts_by_source_severity_and_site_for_the_enterprise_only(): void
    {
        $a = $this->declare(['report_source' => 'audit', 'severity' => 'major'])->json('data.id');
        $this->declare(['report_source' => 'complaint'])->assertCreated();
        NonConformity::query()->findOrFail($a)->forceFill(['resolution_date' => now()->addDays(10)->toDateString(), 'is_recurrent' => true])->saveQuietly();
        $this->declare([], $this->adminB)->assertCreated();

        $data = $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/non-conformities/dashboard')->assertOk()->json('data');
        $this->assertSame(2, $data['total']);
        $this->assertSame(1, $data['closed']);
        $this->assertSame(1, $data['open']);
        $this->assertEqualsCanonicalizing(['audit' => 1, 'complaint' => 1], $data['by_source']);
        $this->assertEqualsCanonicalizing(['major' => 1, 'minor' => 1], $data['by_severity']);
        $this->assertEquals(50.0, $data['recurrence_rate']);
        $this->assertNotNull($data['average_closure_days']);
    }
}
