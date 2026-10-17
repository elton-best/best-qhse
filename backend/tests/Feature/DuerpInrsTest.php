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
use App\Modules\Hse\Models\Duerp;
use App\Modules\Hse\Models\DuerpDanger;
use App\Modules\Hse\Models\DuerpRiskFamily;
use App\Modules\Hse\Models\DuerpScoringScale;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * DUERP — Code du travail R.4121-1 à R.4121-4, méthode INRS, ISO 45001 §6.1.2.
 */
class DuerpInrsTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private User $adminA;

    private User $approverA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class,
        ]);

        $all = array_map(fn ($a) => "sst.duerp.{$a}", ['read', 'create', 'update', 'delete', 'export', 'approve']);
        foreach ($all as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($all);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions(['sst.duerp.read']);

        foreach ([1 => 'Faible', 2 => 'Moyenne', 3 => 'Grave', 4 => 'Très grave'] as $level => $label) {
            DuerpScoringScale::create(['enterprise_id' => null, 'scale_type' => 'gravity', 'level' => $level, 'label' => $label, 'score_value' => $level, 'is_active' => true]);
            DuerpScoringScale::create(['enterprise_id' => null, 'scale_type' => 'frequency', 'level' => $level, 'label' => $label, 'score_value' => $level, 'is_active' => true]);
        }
        foreach ([1 => 'Bonne', 2 => 'Moyenne', 3 => 'Faible ou absente'] as $level => $label) {
            DuerpScoringScale::create(['enterprise_id' => null, 'scale_type' => 'maitrise', 'level' => $level, 'label' => $label, 'score_value' => $level, 'is_active' => true]);
        }
        DuerpRiskFamily::withoutGlobalScopes()->firstOrCreate(['enterprise_id' => null, 'code' => 'INRS_01'], ['name' => 'Chute de plain-pied', 'is_active' => true, 'order_num' => 1]);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->user($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $this->approverA = $this->user($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $this->adminB = $this->user($this->enterpriseB, $siteB, 'admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site, string $role): User
    {
        $user = User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    private function duerp(?User $as = null, array $overrides = []): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/duerp', $overrides)->assertCreated()->json('data.id');
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function danger(int $duerpId, array $overrides = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$duerpId}/dangers", array_merge([
            'work_unit' => 'Atelier', 'inrs_family' => 'Chute de plain-pied', 'dangerous_situation' => 'Sol glissant près du poste de lavage',
            'identified_risks' => 'Chute et blessures', 'gravity' => 2, 'frequency' => 2, 'mitigation_level' => 1,
        ], $overrides));
    }

    private function unit(int $duerpId, string $name = 'Atelier'): int
    {
        return $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/duerp-work-units', ['name' => $name, 'duerp_id' => $duerpId, 'headcount' => 5])
            ->assertCreated()->json('data.id');
    }

    /** Document complet et conforme, prêt à être soumis. */
    private function readyDuerp(): int
    {
        $id = $this->duerp(null, ['participants' => [['name' => 'Awa', 'role' => 'Déléguée du personnel']]]);
        $unit = $this->unit($id);
        $this->danger($id, ['work_unit_id' => $unit, 'work_unit' => null])->assertCreated();

        return $id;
    }

    public function test_a_duerp_can_be_created_without_an_explicit_evaluation_date(): void
    {
        $id = $this->duerp();
        $duerp = Duerp::query()->findOrFail($id);
        $this->assertSame(today()->toDateString(), $duerp->evaluation_date->toDateString());
        $this->assertSame(today()->addYear()->toDateString(), $duerp->next_evaluation_date->toDateString());
        $this->assertSame('draft', $duerp->workflow_status);
        $this->assertFalse($duerp->is_current);
    }

    public function test_a_site_has_one_duerp_and_new_versions_go_through_revision(): void
    {
        $this->duerp();
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/duerp', [])->assertStatus(422);
    }

    public function test_an_evaluation_in_the_future_is_refused(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/duerp', ['evaluation_date' => today()->addDay()->toDateString()])
            ->assertStatus(422)->assertJsonValidationErrors(['evaluation_date']);
    }

    public function test_risk_scores_follow_the_enterprise_scales_and_levels_are_validated(): void
    {
        $id = $this->duerp();
        $this->danger($id, ['gravity' => 4, 'frequency' => 3, 'mitigation_level' => 2])->assertCreated()
            ->assertJsonPath('data.raw_risk_score', 12)->assertJsonPath('data.assessed_risk_score', 24)->assertJsonPath('data.assessed_risk_level', 'Moyen');
        $this->danger($id, ['gravity' => 4, 'frequency' => 4, 'mitigation_level' => 3])->assertCreated()
            ->assertJsonPath('data.assessed_risk_score', 48)->assertJsonPath('data.assessed_risk_level', 'Significatif');
        $this->danger($id, ['gravity' => 9])->assertStatus(422)->assertJsonValidationErrors(['gravity']);
        $this->danger($id, ['dangerous_situation' => ''])->assertStatus(422)->assertJsonValidationErrors(['dangerous_situation']);
    }

    public function test_the_residual_risk_cannot_exceed_the_assessed_risk(): void
    {
        $id = $this->duerp();
        $this->danger($id, ['gravity' => 2, 'frequency' => 2, 'mitigation_level' => 1, 'residual_gravity' => 4, 'residual_frequency' => 4])
            ->assertStatus(422)->assertJsonValidationErrors(['residual_gravity']);
        $this->danger($id, ['gravity' => 3, 'frequency' => 3, 'mitigation_level' => 2, 'residual_gravity' => 3, 'residual_frequency' => 1, 'residual_mitigation_level' => 1])
            ->assertCreated()->assertJsonPath('data.residual_risk_score', 3);
    }

    public function test_dangers_are_updated_by_their_own_id_not_the_documents(): void
    {
        $id = $this->duerp();
        $first = $this->danger($id)->json('data.id');
        $second = $this->danger($id, ['dangerous_situation' => 'Stockage en hauteur non arrimé'])->json('data.id');
        while ($second === $id) {
            $first = $second;
            $second = $this->danger($id, ['dangerous_situation' => 'Stockage en hauteur non arrimé (bis)'])->json('data.id');
        }
        $this->assertNotSame($id, $second);

        $this->putJson("/api/v1/duerp/{$id}/dangers/{$second}", ['observations' => 'Revu avec le chef d\'atelier'])->assertOk();
        $this->assertSame('Revu avec le chef d\'atelier', DuerpDanger::query()->find($second)->observations);
        $this->assertNull(DuerpDanger::query()->find($first)->observations);

        $this->deleteJson("/api/v1/duerp/{$id}/dangers/{$second}")->assertOk();
        $this->assertNotNull(DuerpDanger::query()->find($first));
        $this->assertNull(DuerpDanger::query()->find($second));
    }

    public function test_other_enterprises_cannot_read_or_link_anything(): void
    {
        $id = $this->readyDuerp();
        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/duerp/{$id}")->assertNotFound();
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/duerp')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->adminB, 'sanctum')->postJson("/api/v1/duerp/{$id}/dangers", ['gravity' => 1])->assertNotFound();

        $foreignUnit = $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/duerp-work-units', ['name' => 'Chez B', 'site_id' => $this->adminB->site_id])->assertCreated()->json('data.id');
        $this->danger($id, ['work_unit_id' => $foreignUnit], $this->adminA)->assertStatus(422)->assertJsonValidationErrors(['work_unit_id']);
        $this->danger($id, ['responsible_id' => $this->adminB->id], $this->adminA)->assertStatus(422)->assertJsonValidationErrors(['responsible_id']);
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/duerp-work-units', ['name' => 'X', 'site_id' => $this->adminB->site_id])->assertForbidden();
        $this->actingAs($this->adminA, 'sanctum')->deleteJson("/api/v1/duerp-work-units/{$foreignUnit}")->assertNotFound();
    }

    public function test_submission_is_blocked_until_the_document_is_conform(): void
    {
        $id = $this->duerp(null, ['next_evaluation_date' => today()->addMonths(18)->toDateString()]);
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertStatus(422)->assertJsonValidationErrors(['conformity']);

        $report = $this->getJson("/api/v1/duerp/{$id}/conformity")->assertOk()->json('data');
        $this->assertFalse($report['ready']);
        $codes = collect($report['checks'])->where('ok', false)->pluck('code')->all();
        $this->assertContains('next_evaluation', $codes);
        $this->assertContains('dangers_present', $codes);
    }

    public function test_a_significant_risk_needs_an_action_plan_before_submission(): void
    {
        $id = $this->duerp(null, ['participants' => [['name' => 'Awa']]]);
        $unit = $this->unit($id);
        $this->danger($id, ['work_unit_id' => $unit, 'gravity' => 4, 'frequency' => 4, 'mitigation_level' => 3])->assertCreated();

        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertStatus(422);
        $this->assertContains('significant_plan', collect($this->getJson("/api/v1/duerp/{$id}/conformity")->json('data.checks'))->where('ok', false)->pluck('code')->all());

        $dangerId = DuerpDanger::query()->where('duerp_id', $id)->value('id');
        $this->putJson("/api/v1/duerp/{$id}/dangers/{$dangerId}", [
            'prevention_actions' => 'Installer un revêtement antidérapant', 'responsible_name' => 'Chef d\'atelier', 'deadline' => today()->addMonth()->toDateString(),
        ])->assertOk();
        $this->postJson("/api/v1/duerp/{$id}/submit")->assertOk()->assertJsonPath('data.workflow_status', 'submitted_by_rq');
    }

    public function test_the_approver_cannot_be_the_submitter_and_a_reader_cannot_approve(): void
    {
        $id = $this->readyDuerp();
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertOk();

        $this->postJson("/api/v1/duerp/{$id}/approve")->assertForbidden();
        $reader = $this->user($this->enterpriseA, $this->siteA, 'lecteur');
        $this->actingAs($reader, 'sanctum')->postJson("/api/v1/duerp/{$id}/approve")->assertForbidden();

        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$id}/approve")->assertOk()->assertJsonPath('data.workflow_status', 'approved_by_ceo');
        $this->assertTrue(Duerp::query()->find($id)->is_current);
    }

    public function test_a_rejection_needs_a_reason_and_returns_the_draft(): void
    {
        $id = $this->readyDuerp();
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertOk();
        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$id}/reject", [])->assertStatus(422);
        $this->postJson("/api/v1/duerp/{$id}/reject", ['comment' => 'Unités de travail à préciser'])->assertOk()->assertJsonPath('data.workflow_status', 'draft');
    }

    public function test_a_submitted_or_approved_document_is_frozen_except_for_action_follow_up(): void
    {
        $id = $this->readyDuerp();
        $dangerId = DuerpDanger::query()->where('duerp_id', $id)->value('id');
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertOk();
        $this->danger($id)->assertStatus(422);
        $this->putJson("/api/v1/duerp/{$id}/dangers/{$dangerId}", ['observations' => 'x'])->assertStatus(422);

        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$id}/approve")->assertOk();
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/duerp/{$id}/dangers/{$dangerId}", ['gravity' => 4])->assertStatus(422);
        $this->putJson("/api/v1/duerp/{$id}/dangers/{$dangerId}", ['action_status' => 'realise'])->assertStatus(422)->assertJsonValidationErrors(['action_done_at']);
        $this->putJson("/api/v1/duerp/{$id}/dangers/{$dangerId}", [
            'action_status' => 'realise', 'action_done_at' => today()->toDateString(), 'residual_gravity' => 1, 'residual_frequency' => 1, 'residual_mitigation_level' => 1,
        ])->assertOk()->assertJsonPath('data.residual_risk_score', 1)->assertJsonPath('data.gravity', 2);
        $this->deleteJson("/api/v1/duerp/{$id}")->assertStatus(422);
        $this->putJson("/api/v1/duerp/{$id}", ['title' => 'Autre'])->assertStatus(422);
    }

    public function test_a_new_version_keeps_the_previous_one_and_becomes_current_on_approval(): void
    {
        $id = $this->readyDuerp();
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertOk();
        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$id}/approve")->assertOk();

        $this->postJson("/api/v1/duerp/{$id}/revise", [])->assertStatus(422)->assertJsonValidationErrors(['revision_reason']);
        $newId = $this->postJson("/api/v1/duerp/{$id}/revise", ['revision_reason' => 'annual'])->assertCreated()->assertJsonPath('data.version', '2.0')->json('data.id');
        $this->postJson("/api/v1/duerp/{$id}/revise", ['revision_reason' => 'annual'])->assertStatus(422);

        $this->assertSame(DuerpDanger::query()->where('duerp_id', $id)->count(), DuerpDanger::query()->where('duerp_id', $newId)->count());
        $this->assertSame($id, Duerp::query()->find($newId)->previous_version_id);
        $this->assertTrue(Duerp::query()->find($id)->is_current);

        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$newId}/submit")->assertOk();
        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$newId}/approve")->assertOk();
        $this->assertFalse(Duerp::query()->find($id)->is_current);
        $this->assertTrue(Duerp::query()->find($newId)->is_current);
        $this->getJson("/api/v1/duerp/{$id}/versions")->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_an_accident_flags_the_line_and_forces_a_review_before_resubmission(): void
    {
        $id = $this->readyDuerp();
        $dangerId = DuerpDanger::query()->where('duerp_id', $id)->value('id');
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/duerp/{$id}/submit")->assertOk();
        $this->actingAs($this->approverA, 'sanctum')->postJson("/api/v1/duerp/{$id}/approve")->assertOk();

        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/work-accidents', [
            'type' => 'accident_avec_arret', 'accident_date' => today()->toDateString(), 'circumstances' => 'Chute sur sol glissant',
            'duerp_danger_id' => $dangerId, 'lost_days_count' => 3,
        ])->assertCreated();

        $this->assertTrue((bool) DuerpDanger::query()->find($dangerId)->needs_review);
        $this->assertTrue((bool) Duerp::query()->find($id)->update_required);
        $this->assertSame(2, DuerpDanger::query()->find($dangerId)->gravity, 'l\'évaluation approuvée ne change pas en silence');

        $newId = $this->postJson("/api/v1/duerp/{$id}/revise", ['revision_reason' => 'accident'])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/duerp/{$newId}/submit")->assertStatus(422);
        $copied = DuerpDanger::query()->where('duerp_id', $newId)->value('id');
        $this->putJson("/api/v1/duerp/{$newId}/dangers/{$copied}", ['confirm_reviewed' => true, 'gravity' => 3])->assertOk();
        $this->postJson("/api/v1/duerp/{$newId}/submit")->assertOk();
    }

    public function test_an_accident_cannot_point_to_another_enterprises_risk(): void
    {
        $id = $this->readyDuerp();
        $dangerId = DuerpDanger::query()->where('duerp_id', $id)->value('id');
        $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/work-accidents', [
            'type' => 'presqu_accident', 'accident_date' => today()->toDateString(), 'circumstances' => 'Glissade évitée', 'duerp_danger_id' => $dangerId,
        ])->assertStatus(422)->assertJsonValidationErrors(['duerp_danger_id']);
    }

    public function test_scales_cannot_drop_levels_already_used_by_evaluated_risks(): void
    {
        $this->danger($this->duerp(), ['gravity' => 4])->assertCreated();
        $scale = fn (int $max) => array_map(fn ($l) => ['level' => $l, 'label' => "N{$l}", 'score_value' => $l], range(1, $max));
        $this->putJson('/api/v1/duerp-scoring-scales', ['gravity' => $scale(3), 'frequency' => $scale(4), 'maitrise' => $scale(3)])->assertStatus(422);
        $this->putJson('/api/v1/duerp-scoring-scales', ['gravity' => $scale(5), 'frequency' => $scale(4), 'maitrise' => $scale(3)])->assertOk();
        $this->getJson('/api/v1/duerp-scoring-scales')->assertOk()->assertJsonPath('is_custom', true);
    }

    public function test_a_custom_risk_family_hides_the_platform_family_it_replaces(): void
    {
        $before = $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/duerp-risk-families')->json('data');
        $this->assertContains('INRS_01', array_column($before, 'code'));
        $globalId = DuerpRiskFamily::withoutGlobalScopes()->whereNull('enterprise_id')->where('code', 'INRS_01')->value('id');

        $this->putJson("/api/v1/duerp-risk-families/{$globalId}", ['name' => 'Chutes de plain-pied (atelier)'])->assertOk();
        $after = $this->getJson('/api/v1/duerp-risk-families')->json('data');
        $this->assertCount(count($before), $after);
        $this->assertContains('Chutes de plain-pied (atelier)', array_column($after, 'name'));

        $other = $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/duerp-risk-families')->json('data');
        $this->assertNotContains('Chutes de plain-pied (atelier)', array_column($other, 'name'));
    }

    public function test_the_export_carries_the_document_metadata_and_assessed_columns(): void
    {
        $id = $this->readyDuerp();
        $response = $this->actingAs($this->adminA, 'sanctum')->get("/api/v1/duerp/export-xlsx?duerp_id={$id}");
        $response->assertOk();
        $this->assertStringContainsString('spreadsheetml', (string) $response->headers->get('content-type'));
        $this->actingAs($this->adminB, 'sanctum')->get("/api/v1/duerp/export-xlsx?duerp_id={$id}")->assertNotFound();
    }
}
