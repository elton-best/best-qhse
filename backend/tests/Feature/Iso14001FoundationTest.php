<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\EnsureSubModuleSubscribed;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\ApplicationScope;
use App\Models\Enterprise;
use App\Models\Objective;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Models\AesRegistryVersion;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Models\ManagementChange;
use App\Modules\Hse\Services\HseExportService;
use App\Notifications\SiteEventNotification;
use App\Services\ScopeReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Notification;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class Iso14001FoundationTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterprise;

    private Site $site;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([CheckSubscriptionStatus::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class, ForceCompanySetup::class, ForcePasswordChange::class, ForceSignatureUpload::class]);
        Notification::fake([SiteEventNotification::class]);
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web']);
        $this->enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $this->enterprise->id]);
        $this->admin = $this->user($this->enterprise, $this->site);
        $this->admin->assignRole('admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'is_active' => true, 'user_type' => 'company']);
    }

    private function scope(): ApplicationScope
    {
        return ApplicationScope::create(['enterprise_id' => $this->enterprise->id, 'site_id' => $this->site->id, 'scope_definition' => 'Fabrication et services du site', 'is_current' => true, 'version' => '1.0', 'metadata' => ['internal_note' => 'Confidentiel']]);
    }

    private function objective(): Objective
    {
        return Objective::create(['site_id' => $this->site->id, 'title' => 'Réduire la consommation d’eau', 'type' => 'environmental', 'target_value' => 20, 'unit' => '%', 'deadline' => today()->addMonths(6), 'responsible_id' => $this->admin->id]);
    }

    private function communication(Objective $objective, User $recipient): int
    {
        return $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/objectives/{$objective->id}/communications", ['recipient_ids' => [$recipient->id], 'content_locale' => 'fr'])->assertCreated()->json('data.id');
    }

    public function test_private_iso_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/leadership-reviews?site_id='.$this->site->id)->assertUnauthorized();
    }

    public function test_m1_05_publication_is_a_snapshot_with_no_internal_data_and_can_be_revoked(): void
    {
        $scope = $this->scope();
        $published = $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/application-scopes/{$scope->id}/publications", ['expires_at' => now()->addDays(3)->toISOString()])->assertCreated();
        $token = basename($published->json('data.path'));
        $scope->update(['scope_definition' => 'Nouvelle version privée']);

        $this->getJson('/api/v1/public/scopes/'.$token)->assertOk()->assertJsonPath('data.scope_definition', 'Fabrication et services du site')->assertJsonMissingPath('data.metadata')->assertJsonMissingPath('data.created_by')->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseMissing('scope_publications', ['token_hash' => $token]);
        $this->deleteJson("/api/v1/application-scopes/{$scope->id}/publications/".$published->json('data.id'))->assertOk();
        $this->getJson('/api/v1/public/scopes/'.$token)->assertNotFound();
    }

    public function test_m1_05_expired_links_are_refused_and_expiry_must_be_in_the_future(): void
    {
        $scope = $this->scope();
        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/application-scopes/{$scope->id}/publications", ['expires_at' => now()->subDay()->toISOString()])->assertUnprocessable()->assertJsonValidationErrors('expires_at');
        $published = $this->postJson("/api/v1/application-scopes/{$scope->id}/publications", ['expires_at' => now()->addHour()->toISOString()])->assertCreated();
        $this->travel(2)->hours();

        $this->getJson('/api/v1/public/scopes/'.basename($published->json('data.path')))->assertNotFound();
    }

    public function test_m1_05_other_tenants_and_readers_cannot_publish_a_scope(): void
    {
        $scope = $this->scope();
        $reader = $this->user($this->enterprise, $this->site);
        $this->actingAs($reader, 'sanctum')->postJson("/api/v1/application-scopes/{$scope->id}/publications", ['expires_at' => now()->addDay()->toISOString()])->assertForbidden();
        $foreignEnterprise = Enterprise::factory()->create();
        $foreign = $this->user($foreignEnterprise, Site::factory()->create(['enterprise_id' => $foreignEnterprise->id]));
        $foreign->assignRole('admin_entreprise');

        $this->actingAs($foreign, 'sanctum')->getJson("/api/v1/application-scopes/{$scope->id}/publications")->assertNotFound();
        $this->assertDatabaseCount('scope_publications', 0);
    }

    public function test_m1_06_review_defaults_to_annual_and_completion_resets_the_due_date(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 16)->startOfDay());
        $scope = $this->scope();
        $this->assertSame('2027-10-16', $scope->next_review_date->toDateString());
        $scope->update(['review_required_at' => now(), 'review_reason' => 'Changement majeur']);

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/application-scopes/{$scope->id}/review", ['action' => 'complete', 'review_frequency_months' => 6, 'reason' => 'Périmètre confirmé'])->assertOk();
        $this->assertDatabaseHas('application_scopes', ['id' => $scope->id, 'next_review_date' => '2027-04-16', 'review_required_at' => null, 'review_reason' => null]);
        $this->assertDatabaseHas('activity_log', ['description' => 'scope_review_completed', 'subject_id' => $scope->id]);
    }

    public function test_m1_06_due_reviews_notify_responsible_users_without_daily_duplicates(): void
    {
        $scope = $this->scope();
        $scope->update(['next_review_date' => today()->subDay()]);
        $service = app(ScopeReviewService::class);

        $this->assertSame(1, $service->sendReminders());
        $this->assertSame(0, $service->sendReminders());
        Notification::assertSentTo($this->admin, SiteEventNotification::class, fn ($n) => $n->type === 'scope_review_due');
    }

    public function test_m1_06_due_reminders_are_visible_in_the_users_notification_feed(): void
    {
        Notification::swap(new ChannelManager($this->app));
        $scope = $this->scope();
        $scope->update(['next_review_date' => today()->subDay()]);
        app(ScopeReviewService::class)->sendReminders();

        $response = $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/notifications?unread_only=1')->assertOk()
            ->assertJsonPath('data.0.data.type', 'scope_review_due');
        $id = $response->json('data.0.id');
        $this->postJson("/api/v1/notifications/$id/read")->assertOk();
        $this->assertDatabaseHas('notifications', ['id' => $id, 'notifiable_id' => $this->admin->id]);
        $this->getJson('/api/v1/notifications?unread_only=1')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_m1_06_approved_changes_require_a_scope_review(): void
    {
        $this->admin->givePermissionTo(Permission::firstOrCreate(['name' => 'planification.changements.approve', 'guard_name' => 'web']));
        $scope = $this->scope();
        $change = ManagementChange::create(['enterprise_id' => $this->enterprise->id, 'site_id' => $this->site->id, 'title' => 'Nouvelle activité', 'change_type' => 'new_process', 'status' => 'awaiting_approval']);

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/management-changes/{$change->id}/decision", ['decision' => 'approve'])->assertOk();
        $this->assertNotNull($scope->fresh()->review_required_at);
        $this->assertStringContainsString('Nouvelle activité', $scope->fresh()->review_reason);
    }

    public function test_m3_04_requires_nine_justified_answers_and_keeps_completed_reviews(): void
    {
        $payload = ['site_id' => $this->site->id, 'year' => 2026, 'status' => 'completed', 'answers' => ['a' => ['status' => 'yes', 'justification' => 'Rapport de direction']]];
        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/leadership-reviews', $payload)->assertUnprocessable()->assertJsonValidationErrors('answers.b');
        $payload['answers'] = array_fill_keys(range('a', 'i'), ['status' => 'yes', 'justification' => 'Preuve de décision et de suivi']);

        $this->postJson('/api/v1/leadership-reviews', $payload)->assertOk()->assertJsonPath('data.status', 'completed');
        $this->postJson('/api/v1/leadership-reviews', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('leadership_reviews', 1);
        $this->assertDatabaseHas('leadership_reviews', ['site_id' => $this->site->id, 'year' => 2026, 'reviewed_by' => $this->admin->id]);
    }

    public function test_m3_04_reader_cannot_complete_the_directions_checklist(): void
    {
        $reader = $this->user($this->enterprise, $this->site);

        $this->actingAs($reader, 'sanctum')->postJson('/api/v1/leadership-reviews', ['site_id' => $this->site->id])->assertForbidden();
        $this->assertDatabaseCount('leadership_reviews', 0);
    }

    public function test_m4_06_one_aspect_can_cover_multiple_similar_activities_with_shared_characteristics(): void
    {
        $permission = Permission::firstOrCreate(['name' => 'planification.aspects_environnementaux.create', 'guard_name' => 'web']);
        $this->admin->givePermissionTo($permission);
        $payload = ['site_id' => $this->site->id, 'activity' => 'Ateliers de découpe', 'aspect' => 'Déchets de métal', 'impact' => 'Consommation de ressources', 'group_label' => 'Découpe', 'group_members' => ['Atelier A', 'Atelier B'], 'group_characteristics' => 'Même matière, même procédé et mêmes mesures de maîtrise'];

        $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/environmental-aspects', $payload)->assertCreated()->assertJsonPath('data.group_members', ['Atelier A', 'Atelier B']);
        $this->postJson('/api/v1/environmental-aspects', array_merge($payload, ['group_characteristics' => null]))->assertUnprocessable()->assertJsonValidationErrors('group_characteristics');
        $this->assertDatabaseCount('environmental_aspects', 1);
    }

    public function test_m4_06_grouping_is_kept_in_frozen_versions_and_excel_exports(): void
    {
        $aspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterprise->id, 'site_id' => $this->site->id,
            'activity' => 'Ateliers', 'aspect' => 'Déchets de métal', 'impact' => 'Ressources',
            'group_label' => 'Découpe', 'group_members' => ['Atelier A', 'Atelier B'],
            'group_characteristics' => 'Même procédé et mêmes mesures de maîtrise',
            'gravity' => 5, 'frequency' => 7, 'sensitivity' => 3, 'mastery' => 5, 'status' => 'validated',
        ]);
        $this->admin->givePermissionTo(Permission::firstOrCreate(['name' => 'environnement.aspects.evaluate', 'guard_name' => 'web']));
        $response = $this->actingAs($this->admin, 'sanctum')->postJson('/api/v1/aes-registry-versions', ['site_id' => $this->site->id])->assertCreated();
        $version = AesRegistryVersion::findOrFail($response->json('data.id'));
        $this->assertSame(['Atelier A', 'Atelier B'], $version->snapshot[0]['group_members']);
        $aspect->update(['group_members' => ['Atelier C', 'Atelier D']]);
        $this->assertSame(['Atelier A', 'Atelier B'], $version->fresh()->snapshot[0]['group_members']);

        $path = app(HseExportService::class)->exportEnvironmentalAspectsXlsx($this->enterprise->id, ['site_id' => $this->site->id]);
        try {
            $sheet = IOFactory::load($path)->getActiveSheet();
            $this->assertSame('Découpe', $sheet->getCell('R5')->getValue());
            $this->assertSame("Atelier C\nAtelier D", $sheet->getCell('S5')->getValue());
        } finally {
            unlink($path);
        }
    }

    public function test_m6_05_examples_are_suggestions_and_do_not_create_risks(): void
    {
        $this->actingAs($this->admin, 'sanctum')->getJson('/api/v1/risks-opportunities/examples')->assertOk()->assertJsonPath('data.0.type', 'opportunite')->assertJsonStructure(['data' => [['title' => ['fr', 'en'], 'description' => ['fr', 'en']]]]);
        $this->assertDatabaseCount('process_risks_opportunities', 0);
    }

    public function test_m7_07_distribution_freezes_the_objective_and_each_recipient_acknowledges_once(): void
    {
        $objective = $this->objective();
        $recipient = $this->user($this->enterprise, $this->site);
        $id = $this->communication($objective, $recipient);
        Notification::assertSentTo($recipient, SiteEventNotification::class, fn ($n) => $n->type === 'objective_communicated');
        $objective->update(['title' => 'Objectif révisé']);
        $this->actingAs($recipient, 'sanctum')->getJson('/api/v1/objective-communications/inbox?site_id='.$this->site->id)->assertOk()->assertJsonPath('data.0.snapshot.title', 'Réduire la consommation d’eau');

        $first = $this->postJson("/api/v1/objective-communications/$id/acknowledge")->assertOk()->json('data.acknowledged_at');
        $this->travel(2)->hours();
        $this->postJson("/api/v1/objective-communications/$id/acknowledge")->assertOk()->assertJsonPath('data.acknowledged_at', $first);
        $this->assertDatabaseHas('objective_communication_receipts', ['communication_id' => $id, 'user_id' => $recipient->id, 'acknowledged_at' => $first]);
    }

    public function test_m7_07_an_unselected_user_cannot_acknowledge_for_a_recipient(): void
    {
        $objective = $this->objective();
        $recipient = $this->user($this->enterprise, $this->site);
        $id = $this->communication($objective, $recipient);

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/objective-communications/$id/acknowledge")->assertNotFound();
        $this->assertDatabaseHas('objective_communication_receipts', ['communication_id' => $id, 'acknowledged_at' => null]);
    }

    public function test_m7_07_foreign_recipients_are_refused_atomically(): void
    {
        $objective = $this->objective();
        $foreignEnterprise = Enterprise::factory()->create();
        $foreign = $this->user($foreignEnterprise, Site::factory()->create(['enterprise_id' => $foreignEnterprise->id]));

        $this->actingAs($this->admin, 'sanctum')->postJson("/api/v1/objectives/{$objective->id}/communications", ['recipient_ids' => [$foreign->id]])->assertUnprocessable()->assertJsonValidationErrors('recipient_ids');
        $this->assertDatabaseCount('objective_communications', 0);
        Notification::assertNotSentTo($foreign, SiteEventNotification::class);
    }
}
