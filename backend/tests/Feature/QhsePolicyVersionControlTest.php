<?php

namespace Tests\Feature;

use App\Models\Enterprise;
use App\Models\QhsePolicy;
use App\Models\Site;
use App\Models\User;
use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class QhsePolicyVersionControlTest extends TestCase
{
    use RefreshDatabase;

    private Site $site;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            EnsureEnterpriseOwnership::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
        ]);

        $enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $enterprise->id]);
        $this->user = User::factory()->create([
            'enterprise_id' => $enterprise->id,
            'site_id' => $this->site->id,
            'user_type' => 'company',
            'role' => 'admin_entreprise',
            'is_active' => true,
        ]);

        $role = Role::query()->firstOrCreate([
            'name' => 'policy-version-test-admin',
            'guard_name' => 'web',
        ]);
        $permissions = collect([
            'leadership.politique.read',
            'leadership.politique.create',
            'leadership.politique.update',
            'leadership.politique.delete',
            'leadership.politique.validate',
            'leadership.ethics_reports.manage',
        ])->map(fn (string $name) => Permission::query()->firstOrCreate([
            'name' => $name,
            'guard_name' => 'web',
        ]));
        $role->syncPermissions($permissions);
        $this->user->syncRoles([$role]);
    }

    public function test_saving_a_new_policy_keeps_the_published_version_current(): void
    {
        $published = $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '1.0',
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/qhse-policies', [
                'site_id' => $this->site->id,
                'mission' => 'Répondre aux besoins des clients',
                'vision' => 'Devenir une référence qualité',
                'quality_policy' => 'Améliorer durablement la qualité.',
                'ethics_charter' => 'Agir avec intégrité et prévenir les conflits d’intérêts.',
                'effective_date' => '2026-10-20',
            ])
            ->assertCreated()
            ->assertJsonPath('is_current', false)
            ->assertJsonPath('status', 'draft')
            ->assertJsonPath('ethics_charter', 'Agir avec intégrité et prévenir les conflits d’intérêts.');

        $this->assertDatabaseHas('qhse_policies', [
            'id' => $published->id,
            'status' => 'validated',
            'is_current' => true,
        ]);
        $this->assertDatabaseHas('qhse_policies', [
            'id' => $response->json('id'),
            'ethics_charter' => 'Agir avec intégrité et prévenir les conflits d’intérêts.',
        ]);
        $this->assertSame(
            $response->json('id'),
            $this->getJson('/api/v1/qhse-policies/current?site_id='.$this->site->id)
                ->assertOk()
                ->json('id'),
        );
    }

    public function test_editing_a_published_policy_creates_one_draft_and_leaves_the_source_unchanged(): void
    {
        $published = $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '2.0',
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/qhse-policies/{$published->id}", [
                'mission' => 'Nouvelle mission qualité',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.is_current', false)
            ->assertJsonPath('data.version', '2.1');

        $this->putJson("/api/v1/qhse-policies/{$published->id}", [
            'mission' => 'Mission révisée',
        ])->assertOk();

        $this->assertDatabaseCount('qhse_policies', 2);
        $this->assertDatabaseHas('qhse_policies', [
            'id' => $published->id,
            'mission' => 'Répondre aux besoins des clients',
            'status' => 'validated',
            'is_current' => true,
        ]);
        $this->assertDatabaseHas('qhse_policies', [
            'based_on_policy_id' => $published->id,
            'mission' => 'Mission révisée',
            'status' => 'draft',
            'is_current' => false,
        ]);
    }

    public function test_validation_records_the_approver_and_replaces_the_active_version(): void
    {
        $previous = $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '1.0',
        ]);
        $draft = $this->makePolicy([
            'status' => 'draft',
            'is_current' => false,
            'version' => '2.0',
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/qhse-policies/{$draft->id}/submit")
            ->assertOk()
            ->assertJsonPath('status', 'en_revision');

        $this->postJson("/api/v1/qhse-policies/{$draft->id}/validate")
            ->assertOk()
            ->assertJsonPath('status', 'validated')
            ->assertJsonPath('is_current', true)
            ->assertJsonPath('validated_by_user_id', $this->user->id);

        $this->assertDatabaseHas('qhse_policies', [
            'id' => $previous->id,
            'is_current' => false,
        ]);
        $this->assertDatabaseHas('qhse_policies', [
            'id' => $draft->id,
            'is_current' => true,
            'validated_by_user_id' => $this->user->id,
        ]);
        $this->assertDatabaseHas('qhse_policy_acknowledgements', [
            'qhse_policy_id' => $draft->id,
            'user_id' => $this->user->id,
        ]);
    }

    public function test_published_policy_quiz_records_a_read_receipt_only_after_a_pass(): void
    {
        Notification::fake();
        $policy = $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '1.0',
        ]);
        $answers = [
            'mission' => 'Répondre aux besoins des clients',
            'quality_policy' => 'Améliorer durablement la qualité.',
            'commitment' => 'Respecter les exigences applicables.',
        ];

        $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/qhse-policies/published?site_id='.$this->site->id)
            ->assertOk()
            ->assertJsonPath('policy.id', $policy->id)
            ->assertJsonMissingPath('quiz.0.correct_answer');

        $this->postJson("/api/v1/qhse-policies/{$policy->id}/acknowledge", [
            'answers' => array_fill_keys(array_keys($answers), 'réponse incorrecte'),
        ])->assertOk()
            ->assertJsonPath('quiz_passed', false)
            ->assertJsonPath('acknowledged_at', null);

        $passed = $this->postJson("/api/v1/qhse-policies/{$policy->id}/acknowledge", [
            'answers' => $answers,
        ])->assertOk()
            ->assertJsonPath('quiz_passed', true)
            ->assertJsonPath('quiz_score', 100);
        $this->assertNotEmpty($passed->json('acknowledged_at'));

        $this->assertDatabaseHas('qhse_policy_acknowledgements', [
            'qhse_policy_id' => $policy->id,
            'user_id' => $this->user->id,
            'quiz_score' => 100,
            'quiz_passed' => true,
        ]);
    }

    public function test_a_stale_revision_cannot_replace_a_newer_published_policy(): void
    {
        $base = $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '1.0',
        ]);
        $staleDraft = $this->makePolicy([
            'based_on_policy_id' => $base->id,
            'status' => 'draft',
            'is_current' => false,
            'version' => '1.1',
        ]);
        $base->update(['is_current' => false]);
        $this->makePolicy([
            'status' => 'validated',
            'is_current' => true,
            'version' => '2.0',
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/qhse-policies/{$staleDraft->id}/submit")
            ->assertOk();

        $this->postJson("/api/v1/qhse-policies/{$staleDraft->id}/validate")
            ->assertStatus(409)
            ->assertJsonPath('message', 'Cette révision est fondée sur une version qui n’est plus publiée. Créez un nouveau brouillon depuis la version courante.');

        $this->assertDatabaseHas('qhse_policies', [
            'id' => $staleDraft->id,
            'status' => 'en_revision',
            'is_current' => false,
        ]);
    }

    public function test_acknowledgement_report_is_not_created_for_a_draft_policy(): void
    {
        $draft = $this->makePolicy([
            'status' => 'draft',
            'is_current' => false,
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/v1/qhse-policies/{$draft->id}/acknowledgements")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Le suivi de diffusion est disponible uniquement pour la politique publiée courante.');

        $this->assertDatabaseMissing('qhse_policy_acknowledgements', [
            'qhse_policy_id' => $draft->id,
        ]);
    }

    public function test_anonymous_ethics_report_can_be_tracked_and_handled_confidentially(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/ethics-reports', [
                'site_id' => $this->site->id,
                'category' => 'ethique',
                'subject' => 'Conflit d’intérêts à examiner',
                'description' => 'Un fournisseur semble avoir un lien non déclaré avec un décideur.',
                'is_anonymous' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('is_anonymous', true)
            ->assertJsonPath('status', 'received');

        $reportId = $response->json('id');
        $trackingCode = $response->json('tracking_code');
        $this->assertNotEmpty($trackingCode);
        $this->assertDatabaseHas('qhse_ethics_reports', [
            'id' => $reportId,
            'reporter_user_id' => null,
            'is_anonymous' => true,
            'status' => 'received',
        ]);
        $this->assertDatabaseMissing('qhse_ethics_reports', [
            'id' => $reportId,
            'tracking_token_hash' => $trackingCode,
        ]);

        $this->patchJson("/api/v1/ethics-reports/{$reportId}", [
            'status' => 'investigating',
            'handling_notes' => 'Vérifier les déclarations fournisseur et les achats récents.',
            'public_update' => 'Votre signalement est en cours d’examen.',
        ])->assertOk()
            ->assertJsonPath('status', 'investigating')
            ->assertJsonPath('handling_notes', 'Vérifier les déclarations fournisseur et les achats récents.');

        $this->postJson('/api/v1/ethics-reports/track', [
            'tracking_code' => $trackingCode,
        ])->assertOk()
            ->assertJsonPath('status', 'investigating')
            ->assertJsonPath('public_update', 'Votre signalement est en cours d’examen.')
            ->assertJsonMissingPath('description')
            ->assertJsonMissingPath('handling_notes');
        $this->assertDatabaseHas('qhse_ethics_report_events', [
            'report_id' => $reportId,
            'event_type' => 'status_updated',
            'from_status' => 'received',
            'to_status' => 'investigating',
        ]);
    }

    public function test_only_report_managers_can_read_confidential_report_details(): void
    {
        $reporter = User::factory()->create([
            'enterprise_id' => $this->site->enterprise_id,
            'site_id' => $this->site->id,
            'user_type' => 'company',
            'role' => 'contributeur',
            'is_active' => true,
        ]);

        $report = $this->actingAs($reporter, 'sanctum')
            ->postJson('/api/v1/ethics-reports', [
                'site_id' => $this->site->id,
                'category' => 'qualite',
                'subject' => 'Risque client signalé',
                'description' => 'Une anomalie pourrait affecter un lot déjà expédié.',
                'is_anonymous' => false,
            ])
            ->assertCreated()
            ->json();

        $this->actingAs($reporter, 'sanctum')
            ->getJson('/api/v1/ethics-reports')
            ->assertForbidden();

        $this->getJson('/api/v1/ethics-reports/mine')
            ->assertOk()
            ->assertJsonPath('data.0.id', $report['id'])
            ->assertJsonMissingPath('data.0.description')
            ->assertJsonMissingPath('data.0.handling_notes');

        $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/ethics-reports?site_id='.$this->site->id)
            ->assertOk()
            ->assertJsonPath('data.0.description', 'Une anomalie pourrait affecter un lot déjà expédié.');
    }

    public function test_culture_survey_publishes_only_site_averages_after_five_unattributed_answers(): void
    {
        $answers = [
            'quality_integration' => 4,
            'speak_up_safety' => 3,
            'management_listening' => 5,
            'role_clarity' => 4,
            'change_communication' => 2,
        ];

        for ($index = 0; $index < 4; $index++) {
            $this->actingAs($this->user, 'sanctum')
                ->postJson('/api/v1/qhse-culture-survey', [
                    'site_id' => $this->site->id,
                    ...$answers,
                ])
                ->assertCreated()
                ->assertJsonPath('recorded_with_user_identity', false);
        }

        $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/qhse-culture-survey/summary?site_id='.$this->site->id)
            ->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonMissingPath('response_count')
            ->assertJsonMissingPath('averages');

        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/qhse-culture-survey', [
                'site_id' => $this->site->id,
                ...$answers,
            ])
            ->assertCreated();

        $this->assertDatabaseCount('qhse_culture_survey_aggregates', 1);
        $this->assertDatabaseHas('qhse_culture_survey_aggregates', [
            'site_id' => $this->site->id,
            'response_count' => 5,
            'quality_integration_sum' => 20,
        ]);
        $this->getJson('/api/v1/qhse-culture-survey/summary?site_id='.$this->site->id)
            ->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('response_count', 5)
            ->assertJsonPath('averages.quality_integration', 4)
            ->assertJsonMissingPath('user_id')
            ->assertJsonMissingPath('responses');
    }

    private function makePolicy(array $overrides = []): QhsePolicy
    {
        return QhsePolicy::query()->create([
            'enterprise_id' => $this->site->enterprise_id,
            'site_id' => $this->site->id,
            'version' => '1.0',
            'is_current' => false,
            'status' => 'draft',
            'mission' => 'Répondre aux besoins des clients',
            'vision' => 'Devenir une référence qualité',
            'quality_policy' => 'Améliorer durablement la qualité.',
            'commitments' => ['Respecter les exigences applicables.'],
            'effective_date' => '2026-10-20',
            ...$overrides,
        ]);
    }
}
