<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Http\Middleware\SecurityAuditMiddleware;
use App\Http\Middleware\ForceSessionTimeout;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Processes\Models\OrderReview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderReviewApiTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterprise;

    private Site $site;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            CheckSubscriptionStatus::class,
            ForceCompanySetup::class,
            ForcePasswordChange::class,
            ForceSignatureUpload::class,
            EnsureEnterpriseOwnership::class,
            SecurityAuditMiddleware::class,
            ForceSessionTimeout::class,
        ]);

        $this->enterprise = Enterprise::factory()->create();
        $this->site = Site::factory()->create(['enterprise_id' => $this->enterprise->id]);
        $this->user = User::factory()->create([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'user_type' => 'company',
            'is_active' => true,
        ]);
    }

    private function makeReview(array $attributes = []): OrderReview
    {
        return OrderReview::create(array_merge([
            'enterprise_id' => $this->enterprise->id,
            'site_id' => $this->site->id,
            'title' => 'Commande client 2026-001',
            'customer_name' => 'Client A',
            'engagement_type' => 'commande',
            'status' => 'draft',
        ], $attributes));
    }

    private function completeChecklist(): array
    {
        return [
            'requirements_stated' => true,
            'requirements_implied' => true,
            'requirements_org' => true,
            'requirements_legal' => true,
            'differences_previous' => false,
        ];
    }

    public function test_store_creates_review_from_react_payload(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/order-reviews', [
            'title' => 'Contrat de maintenance 2026',
            'client' => 'Client B',
            'engagement_type' => 'Contrat',
            'status' => 'Brouillon',
            'requirements_stated' => 'Oui',
            'requirements_implied' => 'Non',
            'requirements_org' => 'Oui',
            'requirements_legal' => 'Oui',
            'differences_previous' => 'Non',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', 'draft');
        $response->assertJsonPath('engagement_type', 'contrat');
        $response->assertJsonPath('customer_name', 'Client B');
        $this->assertTrue($response->json('requirements_stated'));
        $this->assertFalse($response->json('requirements_implied'));
        $response->assertJsonPath('site_id', $this->site->id);
        $this->assertStringStartsWith('RVE-', (string) $response->json('ref'));
    }

    public function test_french_status_labels_are_normalized(): void
    {
        $review = $this->makeReview();

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", ['status' => 'En revue'])
            ->assertOk()
            ->assertJsonPath('status', 'in_review');

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", ['status' => 'Écarts à lever'])
            ->assertOk()
            ->assertJsonPath('status', 'blocked');

        $this->assertSame('blocked', $review->fresh()->status);
    }

    public function test_validation_requires_the_five_checklist_points(): void
    {
        $review = $this->makeReview();

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", ['status' => 'Validée'])
            ->assertStatus(422)
            ->assertJsonPath('errors.checklist.0', 'requirements_stated');

        $this->assertSame('draft', $review->fresh()->status);
    }

    public function test_validation_is_blocked_while_differences_are_unresolved(): void
    {
        $review = $this->makeReview(array_merge($this->completeChecklist(), [
            'differences_previous' => true,
            'differences_detail' => 'La demande antérieure prévoyait un délai de 10 jours.',
            'differences_resolved' => false,
        ]));

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", ['status' => 'Validée'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Engagement bloqué : des écarts avec une demande antérieure restent à résoudre avant validation (8.2.3).');

        $this->assertNull($review->fresh()->validated_at);
    }

    public function test_validation_succeeds_after_differences_are_resolved(): void
    {
        $review = $this->makeReview(array_merge($this->completeChecklist(), [
            'differences_previous' => true,
            'differences_resolved' => false,
        ]));

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", [
                'differences_resolved' => 'Oui',
                'resolution_notes' => 'Délai ajusté avec le client.',
                'status' => 'Validée',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'validated');

        $review->refresh();
        $this->assertTrue($review->differences_resolved);
        $this->assertNotNull($review->validated_at);
        $this->assertSame($this->user->id, $review->validated_by);
    }

    public function test_validation_with_resolution_comment_unblocks_and_records_resolution(): void
    {
        $review = $this->makeReview(array_merge($this->completeChecklist(), [
            'differences_previous' => true,
            'differences_resolved' => false,
        ]));

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", [
                'status' => 'Validée',
                'validation_comment' => 'Écart résolu : délai renégocié avec le client.',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'validated')
            ->assertJsonPath('differences_resolved', true);

        $this->assertSame('Écart résolu : délai renégocié avec le client.', $review->fresh()->resolution_notes);
    }

    public function test_index_only_returns_reviews_of_the_enterprise(): void
    {
        $this->makeReview(['title' => 'Revue interne']);

        $otherEnterprise = Enterprise::factory()->create();
        $otherSite = Site::factory()->create(['enterprise_id' => $otherEnterprise->id]);
        OrderReview::create([
            'enterprise_id' => $otherEnterprise->id,
            'site_id' => $otherSite->id,
            'title' => 'Revue autre entreprise',
            'status' => 'draft',
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/order-reviews')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Revue interne', $response->json('data.0.title'));
    }

    public function test_amendments_are_recorded_and_notified(): void
    {
        $review = $this->makeReview(array_merge($this->completeChecklist(), ['status' => 'validated']));

        $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/order-reviews/{$review->id}", [
                'amendments' => 'Avenant n°1 : quantité portée à 500 unités.',
                'amendment_notified' => 'Oui',
                'amendment_notified_to' => 'Client A — service achats',
            ])
            ->assertOk()
            ->assertJsonPath('amendment_notified', true)
            ->assertJsonPath('amendment_notified_to', 'Client A — service achats');
    }
}
