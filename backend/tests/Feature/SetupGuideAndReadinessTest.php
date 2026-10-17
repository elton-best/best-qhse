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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Assistant de démarrage (T-01) et score de préparation à la certification (T-03).
 */
class SetupGuideAndReadinessTest extends TestCase
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
        $admin = Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->admin = $this->user($this->enterpriseA, $this->siteA)->assignRole($admin);
        $this->worker = $this->user($this->enterpriseA, $this->siteA)->assignRole('lecteur');
        $this->adminB = $this->user($this->enterpriseB, $siteB)->assignRole($admin);
    }

    private function user(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
    }

    /** @return array<string, array<string, mixed>> */
    private function steps(): array
    {
        return collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/setup-guide')->assertOk()->json('data.steps'))->keyBy('key')->all();
    }

    public function test_the_guide_lists_eight_steps_with_their_real_state(): void
    {
        $data = $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/setup-guide')->assertOk()->json('data');
        $this->assertCount(8, $data['steps']);
        $this->assertCount(6, $data['sectors']);
        $steps = collect($data['steps'])->keyBy('key');
        $this->assertSame('done', $steps['organisation']['state']);
        foreach (['scope', 'context', 'stakeholders', 'policy', 'aspects', 'obligations', 'actions'] as $key) {
            $this->assertSame('todo', $steps[$key]['state'], $key);
            $this->assertTrue($steps[$key]['can_apply']);
        }
    }

    public function test_applying_the_sector_example_creates_reviewable_drafts_once(): void
    {
        $this->actingAs($this->admin, 'sanctum');
        foreach (['scope' => 1, 'context' => 1, 'stakeholders' => 5, 'policy' => 1, 'aspects' => 4, 'obligations' => 3, 'actions' => 4] as $step => $expected) {
            $this->postJson("/api/v1/setup-guide/{$step}/apply", ['sector' => 'industrie'])->assertCreated()->assertJsonPath('data.created', $expected);
        }
        $steps = $this->steps();
        foreach (['scope', 'context', 'stakeholders', 'policy', 'aspects', 'obligations', 'actions'] as $key) {
            $this->assertSame('done', $steps[$key]['state'], $key);
            $this->assertSame('industrie', $steps[$key]['applied_sector']);
        }

        $this->assertDatabaseHas('qhse_policies', ['enterprise_id' => $this->enterpriseA->id, 'status' => 'draft', 'validated_by_direction_at' => null]);
        $this->assertSame(4, DB::table('environmental_aspects')->where('enterprise_id', $this->enterpriseA->id)->where('status', 'draft')->count());
        $this->assertSame(['A001', 'A002', 'A003', 'A004'], DB::table('environmental_aspects')->orderBy('id')->pluck('aspect_number')->all());
        $this->assertSame(3, DB::table('compliance_obligation_texts')->where('analysis_status', 'to_analyze')->whereNull('is_applicable')->count());
        $this->postJson('/api/v1/setup-guide/aspects/apply', ['sector' => 'industrie'])->assertStatus(422);
    }

    public function test_unknown_sector_or_step_and_non_managers_are_refused(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/setup-guide/aspects/apply', ['sector' => 'inconnu'])->assertStatus(422);
        $this->postJson('/api/v1/setup-guide/inconnue/apply', ['sector' => 'industrie'])->assertNotFound();
        $this->postJson('/api/v1/setup-guide/organisation/apply', ['sector' => 'industrie'])->assertStatus(422);
        $this->actingAs($this->worker, 'sanctum')->postJson('/api/v1/setup-guide/aspects/apply', ['sector' => 'industrie'])->assertForbidden();
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/setup-guide/aspects/apply?site_id='.$this->adminB->site_id, ['sector' => 'industrie'])->assertForbidden();
    }

    public function test_a_step_can_be_skipped_and_resumed_later(): void
    {
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/setup-guide/policy/skip', ['skipped' => true])->assertOk();
        $this->assertSame('skipped', $this->steps()['policy']['state']);
        $this->postJson('/api/v1/setup-guide/policy/skip', ['skipped' => false])->assertOk();
        $this->assertSame('todo', $this->steps()['policy']['state']);
    }

    public function test_the_readiness_score_rises_as_the_system_is_completed_and_flags_what_is_missing(): void
    {
        $empty = $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/certification-readiness')->assertOk()->json('data');
        $this->assertLessThan(30, $empty['score'], 'un système vide est loin de la certification');
        $byClause = fn (array $data) => collect($data['clauses'])->keyBy('clause');
        $this->assertSame('missing', $byClause($empty)['9.3']['status']);
        $this->assertSame('missing', $byClause($empty)['5.2']['status']);
        $this->assertNotEmpty(array_filter($empty['gaps'], fn ($g) => $g['clause'] === '9.3' && $g['fix'] === 'revue-direction'));

        foreach (['scope', 'context', 'stakeholders', 'policy', 'aspects', 'obligations'] as $step) {
            $this->postJson("/api/v1/setup-guide/{$step}/apply", ['sector' => 'services'])->assertCreated();
        }
        $draft = $this->getJson('/api/v1/certification-readiness')->assertOk()->json('data');
        $this->assertGreaterThan($empty['score'], $draft['score']);
        $this->assertSame('compliant', $byClause($draft)['4.2']['status']);
        $this->assertSame('compliant', $byClause($draft)['4.3']['status']);
        $this->assertSame('to_complete', $byClause($draft)['5.2']['status'], 'politique non validée');
        $this->assertSame('to_complete', $byClause($draft)['6.1.2']['status'], 'aspects en brouillon');
        $this->assertSame('to_complete', $byClause($draft)['6.1.3']['status'], 'obligations non qualifiées');

        DB::table('qhse_policies')->where('enterprise_id', $this->enterpriseA->id)->update(['validated_by_direction_at' => now()]);
        $validated = $this->getJson('/api/v1/certification-readiness')->assertOk()->json('data');
        $this->assertSame('compliant', $byClause($validated)['5.2']['status']);
        $this->assertGreaterThan($draft['score'], $validated['score']);
        $this->assertSame($validated['counts']['compliant'] + $validated['counts']['to_complete'] + $validated['counts']['missing'], count($validated['clauses']));
    }

    public function test_the_score_never_counts_another_enterprises_data(): void
    {
        $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/setup-guide/stakeholders/apply', ['sector' => 'btp'])->assertCreated();
        $this->postJson('/api/v1/setup-guide/policy/apply', ['sector' => 'btp'])->assertCreated();

        $forA = collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/certification-readiness')->json('data.clauses'))->keyBy('clause');
        $this->assertSame('missing', $forA['4.2']['status']);
        $this->assertSame('missing', $forA['5.2']['status']);
        $this->getJson('/api/v1/certification-readiness?site_id='.$this->adminB->site_id)->assertForbidden();
    }

    public function test_the_audit_and_review_evidence_turn_their_articles_green(): void
    {
        $leadId = $this->admin->id;
        $audit = DB::table('audits')->insertGetId(['ref' => 'AUD-1', 'site_id' => $this->siteA->id, 'title' => 'Audit', 'planned_date' => now()->subMonth(), 'actual_date' => now()->subMonth(), 'lead_auditor_id' => $leadId, 'status' => 'completed', 'created_at' => now(), 'updated_at' => now()]);
        $review = DB::table('management_reviews')->insertGetId(['ref' => 'MR-T-1', 'site_id' => $this->siteA->id, 'chairman_id' => $leadId, 'planned_date' => now(), 'title' => 'Revue', 'status' => 'completed', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('management_review_records')->insert(['enterprise_id' => $this->enterpriseA->id, 'review_id' => $review, 'snapshot' => '{}', 'sha256' => str_repeat('a', 64), 'signed_by' => $leadId, 'signed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);

        $clauses = collect($this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/certification-readiness')->json('data.clauses'))->keyBy('clause');
        $this->assertSame('compliant', $clauses['9.2']['status']);
        $this->assertSame('compliant', $clauses['9.3']['status']);
        $this->assertNotNull($audit);
    }
}
