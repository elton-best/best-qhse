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
use App\Modules\Evaluation\Models\ManagementReview;
use App\Modules\Evaluation\Models\ManagementReviewRecord;
use App\Modules\Evaluation\Services\ManagementReviewReminderService;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Notifications\SiteEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Revue de direction — ISO 14001:2026 §9.3 (M16).
 */
class ManagementReviewIso14001Test extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private User $admin;

    private User $owner;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class, ForceSignatureUpload::class, EnsureEnterpriseOwnership::class]);

        $names = array_map(fn ($a) => "evaluation.revue_direction.{$a}", ['read', 'create', 'update', 'delete', 'validate', 'export']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        $role = Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        $role->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions([$names[0]]);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->admin = $this->user($this->enterpriseA, $this->siteA)->assignRole($role);
        $this->owner = $this->user($this->enterpriseA, $this->siteA);
        $this->adminB = $this->user($this->enterpriseB, $siteB)->assignRole($role);
    }

    private function user(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
    }

    private function review(array $overrides = []): int
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/management-reviews', array_merge([
            'site_id' => $this->siteA->id, 'title' => 'Revue 2026', 'scheduled_date' => now()->addWeek()->toDateString(), 'year' => (int) date('Y'), 'chairman_id' => $this->admin->id,
        ], $overrides))->assertSuccessful()->json('data.id');
    }

    private function decision(int $id, string $type, array $overrides = [])
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/decisions", array_merge([
            'output_type' => $type, 'text' => 'Décision de la direction sur ce point.', 'responsible_id' => $this->owner->id, 'due_date' => now()->addMonth()->toDateString(),
        ], $overrides));
    }

    /** Revue prête à signer : dossier, réunion, conclusions et les cinq sorties traitées. */
    private function readyReview(): int
    {
        $id = $this->review();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/dossier")->assertOk();
        $this->postJson("/api/v1/management-reviews/{$id}/sessions", ['held_on' => now()->toDateString(), 'attendees' => ['Direction', 'RQ'], 'notes' => 'Examen du dossier d\'entrée.'])->assertCreated();
        $conclusion = ['assessment' => 'adequate', 'comment' => 'Le système reste adapté à nos activités.'];
        $this->putJson("/api/v1/management-reviews/{$id}/conclusions", ['suitability' => $conclusion, 'adequacy' => $conclusion, 'effectiveness' => $conclusion])->assertOk();
        foreach (['improvement', 'system_changes_resources', 'objectives_not_met', 'integration', 'strategic'] as $type) {
            $this->decision($id, $type)->assertCreated();
        }

        return $id;
    }

    // ----------------------------------------------------------------- isolation

    public function test_reviews_are_isolated_between_enterprises(): void
    {
        $id = $this->review();
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/management-reviews')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/management-reviews/{$id}")->assertStatus(404);
        $this->postJson("/api/v1/management-reviews/{$id}/dossier")->assertNotFound();
        $this->getJson("/api/v1/management-reviews/{$id}/workspace")->assertNotFound();
        $this->postJson('/api/v1/management-reviews', ['site_id' => $this->siteA->id, 'title' => 'Intrusion'])->assertStatus(422)->assertJsonValidationErrors(['site_id']);
    }

    // ----------------------------------------------------------------- planification (M16-01)

    public function test_the_schedule_flags_a_review_that_is_overdue_and_clears_when_one_is_planned(): void
    {
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/management-reviews/schedule')->assertOk()->assertJsonPath('data.state', 'never_done');

        ManagementReview::query()->create(['site_id' => $this->siteA->id, 'title' => 'Ancienne', 'status' => 'completed', 'chairman_id' => $this->admin->id, 'planned_date' => now()->subMonths(14)->toDateString(), 'actual_date' => now()->subMonths(14)->toDateString(), 'year' => 2025]);
        $this->getJson('/api/v1/management-reviews/schedule')->assertOk()->assertJsonPath('data.state', 'overdue');

        $this->review();
        $this->getJson('/api/v1/management-reviews/schedule')->assertOk()->assertJsonPath('data.state', 'planned')->assertJsonCount(1, 'data.planned');
    }

    public function test_the_reminder_goes_to_the_direction_only_when_nothing_is_planned(): void
    {
        Notification::fake();
        ManagementReview::query()->create(['site_id' => $this->siteA->id, 'title' => 'Ancienne', 'status' => 'completed', 'chairman_id' => $this->admin->id, 'planned_date' => now()->subMonths(14)->toDateString(), 'actual_date' => now()->subMonths(13)->toDateString(), 'year' => 2025]);
        $this->assertGreaterThanOrEqual(1, app(ManagementReviewReminderService::class)->remind());
        Notification::assertSentTo($this->admin, SiteEventNotification::class);
        Notification::assertNotSentTo($this->adminB, SiteEventNotification::class);
    }

    // ----------------------------------------------------------------- dossier d'entrée (M16-02)

    public function test_the_input_dossier_is_built_from_the_real_data_of_the_site(): void
    {
        $id = $this->review();
        EnvironmentalAspect::withoutGlobalScopes()->create(['enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'aspect_number' => 'A1', 'activity' => 'x', 'aspect' => 'COV', 'impact' => 'air', 'status' => 'active', 'is_significant' => true, 'needs_reassessment' => true]);
        DB::table('objectives')->insert([
            ['ref' => 'OBJ-1', 'title' => 'Réduire les déchets', 'status' => 'achieved', 'site_id' => $this->siteA->id, 'created_at' => now(), 'updated_at' => now()],
            ['ref' => 'OBJ-2', 'title' => 'Réduire l\'eau', 'status' => 'in_progress', 'site_id' => $this->siteA->id, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $dossier = $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/dossier")->assertOk()->json('data');
        foreach (['previous_actions', 'changes', 'objectives', 'trends', 'resources', 'communications', 'improvement'] as $section) {
            $this->assertArrayHasKey($section, $dossier);
        }
        $this->assertSame(1, $dossier['changes']['significant_aspects']['total']);
        $this->assertSame(1, $dossier['changes']['significant_aspects']['to_reassess']);
        $this->assertSame(2, $dossier['objectives']['total']);
        $this->assertSame(1, $dossier['objectives']['not_achieved']);
        $this->assertEquals(50.0, $dossier['objectives']['rate']);
        $this->assertSame('Réduire l\'eau', $dossier['objectives']['not_achieved_items'][0]['title']);
        $this->assertSame($dossier['generated_at'], ManagementReview::query()->find($id)->input_data['iso_14001_9_3_2']['generated_at']);
    }

    public function test_the_dossier_follows_up_the_decisions_of_the_previous_review(): void
    {
        $previous = $this->readyReview();
        $this->postJson("/api/v1/management-reviews/{$previous}/sign")->assertCreated();

        $next = $this->review(['title' => 'Revue suivante']);
        $dossier = $this->postJson("/api/v1/management-reviews/{$next}/dossier")->assertOk()->json('data.previous_actions');
        $this->assertSame($previous, $dossier['previous_review']['id']);
        $this->assertCount(5, $dossier['items']);
        $this->assertSame(5, $dossier['open']);
    }

    // ----------------------------------------------------------------- sorties (M16-03, M16-04)

    public function test_a_decision_becomes_a_tracked_action_with_owner_and_deadline(): void
    {
        $id = $this->review();
        $this->decision($id, 'improvement', ['responsible_id' => null])->assertStatus(422)->assertJsonValidationErrors(['responsible_id']);
        $this->decision($id, 'improvement', ['responsible_id' => $this->adminB->id])->assertStatus(422);
        $this->decision($id, 'inconnu')->assertStatus(422);

        $actionRef = $this->decision($id, 'improvement')->assertCreated()->json('data.action.ref');
        $this->assertDatabaseHas('actions', ['ref' => $actionRef, 'enterprise_id' => $this->enterpriseA->id, 'responsible_id' => $this->owner->id, 'source' => 'management_review', 'status' => 'planned']);
    }

    public function test_a_not_applicable_output_needs_a_reason_but_creates_no_action(): void
    {
        $id = $this->review();
        $this->decision($id, 'strategic', ['not_applicable' => true, 'text' => 'Court', 'responsible_id' => null, 'due_date' => null])->assertStatus(422);
        $this->decision($id, 'strategic', ['not_applicable' => true, 'text' => 'Aucune implication stratégique cette année.', 'responsible_id' => null, 'due_date' => null])->assertCreated()->assertJsonPath('data.action_id', null);
        $this->assertDatabaseCount('actions', 0);
    }

    public function test_conclusions_need_the_three_assessments_with_a_comment(): void
    {
        $id = $this->review();
        $this->actingAs($this->admin, 'sanctum')->putJson("/api/v1/management-reviews/{$id}/conclusions", ['suitability' => ['assessment' => 'adequate', 'comment' => 'Adapté au contexte.']])
            ->assertStatus(422)->assertJsonValidationErrors(['adequacy', 'effectiveness']);
    }

    // ----------------------------------------------------------------- signature (M16-05)

    public function test_signature_is_refused_until_every_output_is_addressed(): void
    {
        $id = $this->review();
        $response = $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/sign")->assertStatus(422);
        $this->assertGreaterThanOrEqual(7, count($response->json('errors.readiness')));
        $this->assertDatabaseCount('management_review_records', 0);
    }

    public function test_unmet_objectives_require_a_real_action(): void
    {
        $id = $this->review();
        DB::table('objectives')->insert(['ref' => 'OBJ-9', 'title' => 'Objectif manqué', 'status' => 'in_progress', 'site_id' => $this->siteA->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/dossier")->assertOk();
        $this->postJson("/api/v1/management-reviews/{$id}/sessions", ['held_on' => now()->toDateString(), 'notes' => 'Examen du dossier d\'entrée.'])->assertCreated();
        $ok = ['assessment' => 'partly', 'comment' => 'Efficacité partielle, voir les objectifs.'];
        $this->putJson("/api/v1/management-reviews/{$id}/conclusions", ['suitability' => $ok, 'adequacy' => $ok, 'effectiveness' => $ok])->assertOk();
        foreach (['improvement', 'system_changes_resources', 'integration', 'strategic'] as $type) {
            $this->decision($id, $type)->assertCreated();
        }
        $this->decision($id, 'objectives_not_met', ['not_applicable' => true, 'text' => 'Nous estimons ne rien devoir faire.', 'responsible_id' => null, 'due_date' => null])->assertCreated();

        $this->postJson("/api/v1/management-reviews/{$id}/sign")->assertStatus(422)->assertJsonFragment(['Des objectifs ne sont pas atteints : décidez d\'au moins une action.']);
    }

    public function test_signing_seals_the_record_and_freezes_the_review(): void
    {
        $id = $this->readyReview();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/sign")->assertCreated()->assertJsonStructure(['data' => ['signed_at', 'sha256']]);

        $review = ManagementReview::query()->find($id);
        $this->assertSame('completed', $review->status);
        $this->assertSame($this->admin->id, $review->validated_by_ceo_user_id);

        $workspace = $this->getJson("/api/v1/management-reviews/{$id}/workspace")->assertOk()->json('data');
        $this->assertTrue($workspace['record']['intact']);
        $this->assertSame([], $workspace['readiness']);

        $this->postJson("/api/v1/management-reviews/{$id}/sign")->assertStatus(422);
        $this->postJson("/api/v1/management-reviews/{$id}/dossier")->assertStatus(422);
        $this->decision($id, 'improvement')->assertStatus(422);
        $this->putJson("/api/v1/management-reviews/{$id}", ['title' => 'Modifiée'])->assertStatus(422);
        $this->deleteJson("/api/v1/management-reviews/{$id}")->assertStatus(422);
        $this->postJson("/api/v1/management-reviews/{$id}/open")->assertStatus(422);
    }

    public function test_the_signed_record_is_immutable_and_tampering_is_detected(): void
    {
        $id = $this->readyReview();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/sign")->assertCreated();
        $record = ManagementReviewRecord::query()->where('review_id', $id)->firstOrFail();
        $this->assertTrue($record->integrityIsIntact());

        DB::table('management_review_records')->where('id', $record->id)->update(['snapshot' => json_encode(array_merge($record->snapshot, ['conclusions' => ['suitability' => ['assessment' => 'inadequate', 'comment' => 'falsifié']]]))]);
        $this->assertFalse($record->fresh()->integrityIsIntact());
        $this->expectException(\LogicException::class);
        $record->fresh()->update(['sha256' => str_repeat('0', 64)]);
    }

    public function test_only_the_direction_or_the_chairman_can_sign(): void
    {
        $id = $this->readyReview();
        $reader = $this->user($this->enterpriseA, $this->siteA)->assignRole('lecteur');
        $this->actingAs($reader, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/sign")->assertForbidden();
        $this->actingAs($this->owner, 'sanctum')->postJson("/api/v1/management-reviews/{$id}/sign")->assertForbidden();
    }
}
