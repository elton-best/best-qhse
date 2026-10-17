<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\ApplicationScope;
use App\Models\Context;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\Stakeholder;
use App\Models\User;
use App\Notifications\ContextReviewDueNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ContextClimateAssessmentTest extends TestCase
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
    }

    public function test_swot_issue_requires_a_climate_relevance_decision(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload([
                'id' => 'issue-1',
                'text' => 'Dépendance à une ressource sensible au climat',
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('swot_weaknesses.culture.favorable.0.climate_change_relevant');
        $this->assertDatabaseCount('contexts', 0);
    }

    public function test_negative_climate_assessment_requires_a_rationale(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload([
                'id' => 'issue-1',
                'text' => 'Dépendance à une ressource',
                'climate_change_relevant' => false,
                'climate_change_rationale' => '',
            ]));

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('swot_weaknesses.culture.favorable.0.climate_change_rationale');
        $this->assertDatabaseCount('contexts', 0);
    }

    public function test_swot_issue_with_documented_climate_assessment_is_persisted(): void
    {
        $issue = [
            'id' => 'issue-1',
            'text' => 'Dépendance à une ressource sensible au climat',
            'climate_change_relevant' => false,
            'climate_change_rationale' => 'La ressource n’est pas utilisée sur ce site.',
        ];

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload($issue));

        $response->assertOk();
        $context = Context::query()->where('site_id', $this->site->id)->firstOrFail();
        $this->assertSame($issue['text'], json_decode($context->swot_weaknesses, true)['culture']['favorable'][0]['text']);
        $this->assertFalse(json_decode($context->swot_weaknesses, true)['culture']['favorable'][0]['climate_change_relevant']);
        $this->assertSame(
            $issue['climate_change_rationale'],
            json_decode($context->swot_weaknesses, true)['culture']['favorable'][0]['climate_change_rationale'],
        );
    }

    public function test_stakeholder_climate_expectations_are_saved(): void
    {
        $expectations = 'Prévoir la continuité des livraisons pendant les épisodes de chaleur.';

        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/stakeholders', [
                'site_id' => $this->site->id,
                'type' => 'client',
                'name' => 'Clients grands comptes',
                'climate_expectations' => $expectations,
            ]);

        $response->assertOk();
        $this->assertDatabaseHas('stakeholders', [
            'site_id' => $this->site->id,
            'name' => 'Clients grands comptes',
            'climate_expectations' => $expectations,
        ]);
    }

    public function test_context_review_is_snapshotted_and_schedules_the_next_review(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload([
                'id' => 'issue-1',
                'text' => 'Dépendance à une ressource sensible au climat',
                'climate_change_relevant' => true,
                'climate_change_rationale' => '',
            ]))
            ->assertOk();

        $context = Context::query()->where('site_id', $this->site->id)->firstOrFail();
        $this->assertNotNull($context->next_review_at);

        $this->postJson("/api/v1/contexts/{$context->id}/reviews", [
            'summary' => 'Révision annuelle : aucun changement majeur identifié.',
        ])->assertCreated()
            ->assertJsonPath('data.summary', 'Révision annuelle : aucun changement majeur identifié.');

        $context->refresh();
        $this->assertNotNull($context->last_reviewed_at);
        $this->assertNotNull($context->next_review_at);
        $this->assertDatabaseHas('context_reviews', [
            'context_id' => $context->id,
            'reviewer_user_id' => $this->user->id,
            'summary' => 'Révision annuelle : aucun changement majeur identifié.',
        ]);

        $this->getJson("/api/v1/contexts/{$context->id}/reviews")
            ->assertOk()
            ->assertJsonPath('data.0.summary', 'Révision annuelle : aucun changement majeur identifié.');
    }

    public function test_context_endpoints_do_not_expose_or_change_another_enterprises_context(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload([
                'id' => 'issue-1',
                'text' => 'Dépendance à une ressource sensible au climat',
                'climate_change_relevant' => true,
                'climate_change_rationale' => '',
            ]))
            ->assertOk();
        $context = Context::query()->where('site_id', $this->site->id)->firstOrFail();

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        $otherUser = User::factory()->create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);

        $this->actingAs($otherUser, 'sanctum')
            ->getJson('/api/v1/contexts')
            ->assertOk()
            ->assertJsonMissing(['id' => $context->id]);
        $this->getJson("/api/v1/contexts/{$context->id}")
            ->assertForbidden();
        $this->putJson("/api/v1/contexts/{$context->id}", ['title' => 'Modification interdite'])
            ->assertForbidden();
        $this->getJson("/api/v1/contexts/{$context->id}/reviews")
            ->assertForbidden();

        $this->assertDatabaseMissing('contexts', [
            'id' => $context->id,
            'title' => 'Modification interdite',
        ]);
    }

    public function test_due_context_review_reminder_is_sent_once_per_week(): void
    {
        Notification::fake();
        $this->site->update(['manager_id' => $this->user->id]);

        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/contexts', $this->contextPayload([
                'id' => 'issue-1',
                'text' => 'Dépendance à une ressource sensible au climat',
                'climate_change_relevant' => true,
                'climate_change_rationale' => '',
            ]))
            ->assertOk();
        $context = Context::query()->where('site_id', $this->site->id)->firstOrFail();
        $context->forceFill([
            'next_review_at' => today()->toDateString(),
            'last_review_reminder_at' => null,
        ])->save();

        $this->artisan('contexts:check-review-reminders')->assertExitCode(0);
        $this->artisan('contexts:check-review-reminders')->assertExitCode(0);

        $this->assertCount(
            1,
            Notification::sent($this->user, ContextReviewDueNotification::class),
        );
        $this->assertNotNull($context->fresh()->last_review_reminder_at);
    }

    public function test_application_scope_rejects_exclusions_without_a_justification(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/application-scopes', [
                'site_id' => $this->site->id,
                'objective' => 'Définir le système de management',
                'scope' => 'Activités de production et de livraison',
                'scope_exclusions' => 'Conception et développement',
                'exclusions_justification' => '',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('exclusions_justification');

        $this->assertDatabaseCount('application_scopes', 0);
    }

    public function test_application_scope_rejects_an_unjustified_normative_exclusion(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/application-scopes', [
                'site_id' => $this->site->id,
                'objective' => 'Définir le système de management',
                'scope' => 'Activités de production et de livraison',
                'norm_exclusions' => ['9001' => ['8.3']],
                'norm_exclusions_justifications' => [],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('norm_exclusions_justifications.9001');
    }

    public function test_scope_is_saved_as_a_draft_and_publication_requires_an_impact_assessment(): void
    {
        $payload = [
            'site_id' => $this->site->id,
            'version' => '1.0',
            'objective' => 'Définir le système de management',
            'scope' => 'Activités de fabrication et de livraison',
            'norm_exclusions' => ['9001' => ['8.3']],
            'norm_exclusions_justifications' => [
                '9001' => 'Aucune conception n’est réalisée sur ce site.',
            ],
            'metadata' => [
                'scope_effective_date' => '2026-10-15',
                'scope_impact_assessment' => [
                    'reviewed' => false,
                    'rationale' => '',
                ],
            ],
        ];

        $draftResponse = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/application-scopes', $payload)
            ->assertOk()
            ->assertJsonPath('data.is_current', false)
            ->assertJsonPath('data.status', 'draft');
        $draftId = $draftResponse->json('data.id');

        $this->authorizeScopePublication();
        $this->postJson("/api/v1/application-scopes/{$draftId}/publish")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('metadata.scope_impact_assessment');

        $payload['metadata']['scope_impact_assessment'] = [
            'reviewed' => true,
            'rationale' => 'La non-applicabilité ne réduit ni conformité ni satisfaction client.',
        ];
        $payload['products_services'] = ['Produit fabriqué'];

        $this->putJson("/api/v1/application-scopes/{$draftId}", $payload)
            ->assertOk()
            ->assertJsonPath('data.is_current', false)
            ->assertJsonPath('data.status', 'draft');

        $this->postJson("/api/v1/application-scopes/{$draftId}/publish")
            ->assertOk()
            ->assertJsonPath('data.is_current', true)
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.effective_date', '2026-10-15');

        $this->assertDatabaseHas('application_scopes', [
            'id' => $draftId,
            'published_by' => $this->user->id,
            'is_current' => true,
            'status' => 'published',
        ]);
    }

    public function test_editing_a_published_scope_creates_a_new_version_without_changing_the_current_one(): void
    {
        $this->authorizeScopePublication();
        $original = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/application-scopes', [
                'site_id' => $this->site->id,
                'version' => '1.0',
                'objective' => 'Définir le système de management',
                'scope' => 'Fabrication et livraison',
                'products_services' => ['Produit fabriqué'],
                'metadata' => ['scope_effective_date' => '2026-10-15'],
            ])
            ->assertOk()
            ->json('data.id');

        $this->postJson("/api/v1/application-scopes/{$original}/publish")->assertOk();

        $draftResponse = $this->putJson("/api/v1/application-scopes/{$original}", [
            'site_id' => $this->site->id,
            'version' => '1.0',
            'objective' => 'Définir le système de management',
            'scope' => 'Fabrication, livraison et installation',
            'products_services' => ['Produit fabriqué', 'Installation'],
            'metadata' => ['scope_effective_date' => '2026-11-01'],
        ])->assertOk()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.version', '1.1')
            ->assertJsonPath('data.is_current', false);

        $this->assertNotSame($original, $draftResponse->json('data.id'));
        $this->assertDatabaseHas('application_scopes', [
            'id' => $original,
            'status' => 'published',
            'is_current' => true,
            'scope' => 'Fabrication et livraison',
        ]);
    }

    private function authorizeScopePublication(): void
    {
        $role = Role::query()->firstOrCreate([
            'name' => 'admin_entreprise',
            'guard_name' => 'web',
        ]);
        $this->user->syncRoles([$role]);
    }

    public function test_application_scope_is_isolated_between_enterprises(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/application-scopes', [
                'site_id' => $this->site->id,
                'objective' => 'Définir le système de management',
                'scope' => 'Activités de production et de livraison',
            ])
            ->assertOk();
        $scope = ApplicationScope::query()->where('site_id', $this->site->id)->firstOrFail();

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        $otherUser = User::factory()->create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);

        $this->actingAs($otherUser, 'sanctum')
            ->getJson('/api/v1/application-scopes')
            ->assertOk()
            ->assertJsonMissing(['id' => $scope->id]);
        $this->getJson("/api/v1/application-scopes/{$scope->id}")
            ->assertForbidden();
        $this->putJson("/api/v1/application-scopes/{$scope->id}", ['scope' => 'Autre périmètre'])
            ->assertForbidden();
    }

    public function test_stakeholder_records_are_isolated_between_enterprises(): void
    {
        $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/stakeholders', [
                'site_id' => $this->site->id,
                'type' => 'client',
                'name' => 'Clients grands comptes',
                'climate_expectations' => 'Maintenir la continuité des livraisons.',
            ])
            ->assertOk();
        $stakeholder = Stakeholder::query()->where('site_id', $this->site->id)->firstOrFail();

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        $otherUser = User::factory()->create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);

        $this->actingAs($otherUser, 'sanctum')
            ->getJson('/api/v1/stakeholders')
            ->assertOk()
            ->assertJsonMissing(['id' => $stakeholder->id]);
        $this->getJson("/api/v1/stakeholders/{$stakeholder->id}")
            ->assertForbidden();
        $this->putJson("/api/v1/stakeholders/{$stakeholder->id}", ['name' => 'Modification interdite'])
            ->assertForbidden();
    }

    private function contextPayload(array $issue): array
    {
        return [
            'site_id' => $this->site->id,
            'type' => 'swot_pestel',
            'title' => 'Analyse SWOT/PESTEL',
            'category' => 'other',
            'description' => 'Analyse du contexte de l’organisme',
            'review_frequency_months' => 12,
            'swot_weaknesses' => json_encode([
                'culture' => ['favorable' => [$issue], 'unfavorable' => []],
            ]),
            'swot_opportunities' => json_encode((object) []),
        ];
    }
}
