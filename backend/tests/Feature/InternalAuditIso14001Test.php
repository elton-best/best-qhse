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
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Processes\Models\Process;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Audits internes — ISO 14001:2026 §9.2, ISO 19011 (M15).
 */
class InternalAuditIso14001Test extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private User $admin;

    private User $auditor;

    private User $pilot;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class, ForceSignatureUpload::class, EnsureEnterpriseOwnership::class]);

        $names = ['audits.read', 'audits.create', 'audits.update', 'audits.manage', 'audits.delete'];
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        $role = Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        $role->syncPermissions($names);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->admin = $this->user($this->enterpriseA, $this->siteA)->assignRole($role);
        $this->auditor = $this->user($this->enterpriseA, $this->siteA);
        $this->pilot = $this->user($this->enterpriseA, $this->siteA);
        $this->adminB = $this->user($this->enterpriseB, $siteB)->assignRole($role);
    }

    private function user(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
    }

    private function process(string $title, ?int $pilotId = null): Process
    {
        return Process::withoutGlobalScopes()->create([
            'ref' => 'PRC-'.uniqid(), 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'title' => $title, 'type' => 'operational',
            'status' => 'active', 'purpose' => 'Finalité du processus', 'pilot_id' => $pilotId ?? $this->pilot->id,
        ]);
    }

    private function auditPayload(array $overrides = []): array
    {
        return array_merge([
            'site_id' => $this->siteA->id, 'type' => 'internal', 'title' => 'Audit environnement', 'planned_date' => now()->addMonth()->toDateString(),
            'lead_auditor_id' => $this->auditor->id, 'assigned_to' => $this->auditor->id, 'objectives' => 'Vérifier la conformité au SME',
            'reference_documents' => 'ISO 14001:2026',
        ], $overrides);
    }

    // ---------------------------------------------------------------- indépendance (M15-03)

    public function test_an_auditor_who_pilots_an_audited_process_is_refused(): void
    {
        $process = $this->process('Peinture');
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload(['lead_auditor_id' => $this->pilot->id, 'assigned_to' => $this->pilot->id, 'process_ids' => [$process->id]]))
            ->assertStatus(422)->assertJsonPath('code', 'AUDITOR_NOT_INDEPENDENT')->assertJsonPath('conflicts.0.user_id', $this->pilot->id);
        $this->assertDatabaseCount('audits', 0);
    }

    public function test_an_auditor_cannot_also_be_an_auditee(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload(['auditor_ids' => [$this->auditor->id], 'auditee_ids' => [$this->auditor->id]]))
            ->assertStatus(422)->assertJsonPath('code', 'AUDITOR_NOT_INDEPENDENT');
    }

    public function test_an_independent_team_can_create_the_audit(): void
    {
        $process = $this->process('Peinture');
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload(['process_ids' => [$process->id], 'auditee_ids' => [$this->pilot->id]]))->assertCreated();
    }

    public function test_the_audit_cannot_reference_another_enterprises_site_users_or_processes(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload(['lead_auditor_id' => $this->adminB->id, 'assigned_to' => $this->adminB->id]))
            ->assertStatus(422)->assertJsonValidationErrors(['lead_auditor_id']);
        $this->postJson('/api/v1/audits', $this->auditPayload(['site_id' => $this->adminB->site_id]))->assertStatus(422)->assertJsonValidationErrors(['site_id']);
        $this->postJson('/api/v1/audits', $this->auditPayload(['process_ids' => [999999]]))->assertStatus(422);
    }

    public function test_eligible_auditors_flag_conflicts_and_qualification(): void
    {
        $process = $this->process('Peinture');
        $jobId = DB::table('job_descriptions')->insertGetId(['ref' => 'FDP-1', 'site_id' => $this->siteA->id, 'job_title' => 'Auditeur interne', 'mission' => 'Auditer le SME', 'created_at' => now(), 'updated_at' => now()]);
        $requiseId = DB::table('competences_requises')->insertGetId([
            'job_description_id' => $jobId, 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'competence_type' => 'technique', 'competence_name' => 'Audit interne ISO 14001',
            'level_required' => 'avance', 'priority' => 'obligatoire', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('competences_acquises')->insert([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'user_id' => $this->auditor->id, 'competence_requise_id' => $requiseId,
            'level_acquired' => 'avance', 'acquired_date' => now()->subYear(), 'status' => 'active', 'acquisition_method' => 'formation', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $rows = collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/audits/eligible-auditors?'.http_build_query(['process_ids' => [$process->id]]))->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($rows[$this->auditor->id]['qualified']);
        $this->assertTrue($rows[$this->auditor->id]['independent']);
        $this->assertFalse($rows[$this->pilot->id]['independent']);
        $this->assertFalse($rows[$this->pilot->id]['qualified']);
        $this->assertArrayNotHasKey($this->adminB->id, $rows->all());
    }

    public function test_the_independence_preview_rejects_foreign_users(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits/check-independence', ['lead_auditor_id' => $this->adminB->id])->assertStatus(422);
        $this->postJson('/api/v1/audits/check-independence', ['lead_auditor_id' => $this->auditor->id])->assertOk()->assertJsonPath('data.independent', true);
    }

    // ---------------------------------------------------------------- programme (M15-01)

    public function test_program_proposals_rank_processes_by_environmental_importance_and_previous_results(): void
    {
        $risky = $this->process('Peinture');
        $calm = $this->process('Bureau');
        EnvironmentalAspect::withoutGlobalScopes()->create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'process_id' => $risky->id, 'aspect_number' => 'A1', 'activity' => 'Peinture',
            'aspect' => 'Émission de COV', 'impact' => 'Pollution de l\'air', 'status' => 'active', 'is_significant' => true, 'needs_reassessment' => true,
        ]);
        $auditId = DB::table('audits')->insertGetId(['ref' => 'AUD-OLD', 'site_id' => $this->siteA->id, 'lead_auditor_id' => $this->auditor->id, 'title' => 'Ancien', 'planned_date' => now()->subMonths(14), 'status' => 'completed', 'actual_date' => now()->subMonths(14), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('audit_process')->insert(['audit_id' => $auditId, 'process_id' => $calm->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('audit_findings')->insert([
            'ref' => 'FND-1', 'audit_id' => $auditId, 'detected_by' => $this->auditor->id, 'detected_at' => now(), 'type' => 'nc_major', 'process_id' => $risky->id, 'title' => 'NC ouverte', 'description' => 'Déversement non maîtrisé', 'severity' => 'high',
            'priority' => 1, 'status' => 'open', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $rows = $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/audit-programs/proposals?site_id='.$this->siteA->id)->assertOk()->json('data');
        $this->assertSame('Peinture', $rows[0]['process']);
        $this->assertSame('high', $rows[0]['priority']);
        $this->assertSame('biannual', $rows[0]['suggested_frequency']);
        $this->assertNotEmpty(array_filter($rows[0]['reasons'], fn ($r) => str_contains($r, 'significatif')));
        $this->assertNotEmpty(array_filter($rows[0]['reasons'], fn ($r) => str_contains($r, 'non-conformité')));
        $calmRow = collect($rows)->firstWhere('process', 'Bureau');
        $this->assertNotNull($calmRow['last_audited_at']);
        $this->assertNotEmpty(array_filter($calmRow['reasons'], fn ($r) => str_contains($r, 'mois')));

        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/audit-programs/proposals?site_id='.$this->siteA->id)->assertForbidden();
    }

    // ---------------------------------------------------------------- liste de contrôle (M15-04)

    public function test_the_iso_14001_checklist_uses_the_environmental_clauses(): void
    {
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/audits/iso-clauses')->assertOk()->assertJsonFragment(['clause' => '6.1.2'])->assertJsonFragment(['clause' => '8.2']);
        $audit = $this->postJson('/api/v1/audits', $this->auditPayload())->assertCreated()->json('id');

        $checklist = $this->postJson("/api/v1/audits/{$audit}/generate-checklist", ['norm' => 'ISO 14001:2015', 'iso_clauses' => ['6.1.2', '8.2'], 'include_process_risks' => false])
            ->assertOk()->json('checklist');
        $this->assertSame(['6.1.2', '6.1.2', '8.2', '8.2'], array_column($checklist, 'clause_iso'));
        $this->assertStringContainsString('aspects environnementaux', $checklist[0]['question']);
    }

    // ---------------------------------------------------------------- constats et preuves (M15-05)

    public function test_findings_are_classified_conforming_strength_observation_or_nonconformity(): void
    {
        $audit = $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload())->assertCreated()->json('id');
        $this->postJson("/api/v1/audits/{$audit}/start", ['actual_date' => now()->toDateString()]);

        foreach (['conforming', 'good_practice', 'observation'] as $type) {
            $this->postJson("/api/v1/audits/{$audit}/finding", ['type' => $type, 'title' => "Constat {$type}", 'description' => 'Constat relevé sur le terrain.'])->assertSuccessful();
        }
        $this->postJson("/api/v1/audits/{$audit}/finding", ['type' => 'nc_minor', 'title' => 'NC', 'description' => 'Aucune consigne affichée.'])->assertStatus(422)->assertJsonValidationErrors(['severity', 'priority']);
        $this->postJson("/api/v1/audits/{$audit}/finding", ['type' => 'nc_minor', 'title' => 'NC', 'description' => 'Aucune consigne affichée.', 'severity' => 'medium', 'priority' => 2])->assertSuccessful();

        $this->assertSame(['conforming', 'good_practice', 'observation', 'nc_minor'], AuditFinding::query()->where('audit_id', $audit)->orderBy('id')->pluck('type')->all());
        $this->assertSame(1, AuditFinding::query()->where('audit_id', $audit)->where('nc_created', true)->count(), 'seule la non-conformité ouvre une fiche');
    }

    public function test_field_evidence_is_attached_privately_and_isolated_by_enterprise(): void
    {
        Storage::fake('local');
        $audit = $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload())->assertCreated()->json('id');
        $this->postJson("/api/v1/audits/{$audit}/start", ['actual_date' => now()->toDateString()]);
        $finding = $this->postJson("/api/v1/audits/{$audit}/finding", ['type' => 'observation', 'title' => 'Obs', 'description' => 'Stockage de produits sans rétention.', 'severity' => 'low', 'priority' => 3])->assertSuccessful()->json('id');

        $this->post("/api/v1/audits/{$audit}/findings/{$finding}/evidence", ['file' => UploadedFile::fake()->image('stockage.jpg'), 'label' => 'Photo du stockage'], ['Accept' => 'application/json'])->assertCreated()->assertJsonPath('data.count', 1);
        $this->post("/api/v1/audits/{$audit}/findings/{$finding}/evidence", ['file' => UploadedFile::fake()->create('virus.exe', 10)], ['Accept' => 'application/json'])->assertStatus(422);
        $this->get("/api/v1/audits/{$audit}/findings/{$finding}/evidence/0")->assertOk();
        $this->get("/api/v1/audits/{$audit}/findings/{$finding}/evidence/5")->assertNotFound();
        $this->actingAs($this->adminB, 'sanctum')->get("/api/v1/audits/{$audit}/findings/{$finding}/evidence/0")->assertNotFound();
        $this->post("/api/v1/audits/{$audit}/findings/{$finding}/evidence", ['file' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertNotFound();
    }

    public function test_the_report_circuit_moves_the_audit_through_draft_and_approved_statuses(): void
    {
        $audit = $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/audits', $this->auditPayload())->assertCreated()->json('id');
        $this->postJson("/api/v1/audits/{$audit}/start", ['actual_date' => now()->toDateString()])->assertOk();

        $this->postJson("/api/v1/audits/{$audit}/status", ['status' => 'report_draft'])->assertOk();
        $this->assertDatabaseHas('audits', ['id' => $audit, 'status' => 'report_draft']);
        $this->postJson("/api/v1/audits/{$audit}/approve")->assertOk()->assertJsonPath('data.status', 'report_approved');
    }
}
