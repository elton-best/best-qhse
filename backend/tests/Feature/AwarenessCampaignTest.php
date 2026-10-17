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
use App\Modules\Hse\Models\AwarenessParticipant;
use App\Modules\Hse\Models\AwarenessReceipt;
use App\Modules\Hse\Models\AwarenessTalk;
use App\Notifications\SiteEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Sensibilisation — ISO 14001:2026 §7.3 (M9-04 à M9-06).
 */
class AwarenessCampaignTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private User $adminA;

    private User $workerA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class,
        ]);
        $names = array_map(fn ($a) => "support.campagnes_sensibilisation.{$a}", ['read', 'create', 'update', 'delete']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->user($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $this->workerA = $this->user($this->enterpriseA, $this->siteA, 'lecteur');
        $this->adminB = $this->user($this->enterpriseB, $siteB, 'admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site, string $role): User
    {
        $user = User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    private function campaign(array $overrides = []): int
    {
        return $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/awareness-campaigns', array_merge(['title' => 'Sensibilisation environnement 2026'], $overrides))
            ->assertCreated()->json('id');
    }

    private function material(int $campaignId, string $topic, string $type = 'sheet', array $overrides = [])
    {
        $base = match ($type) {
            'sheet' => ['body' => 'Contenu de la fiche.'],
            'video' => ['url' => 'https://example.org/video'],
            'quiz' => ['questions' => [['question' => 'Quel est le tri correct ?', 'options' => ['Bac vert', 'Bac jaune'], 'correct' => 1], ['question' => 'Qui contacter ?', 'options' => ['Le référent', 'Personne'], 'correct' => 0]]],
        };

        return $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-campaigns/{$campaignId}/materials", array_merge(['topic' => $topic, 'type' => $type, 'title' => "Support {$topic}"], $base, $overrides));
    }

    /** Campagne prête : un support par point de 7.3, dont un quiz. */
    private function readyCampaign(): int
    {
        $id = $this->campaign();
        $this->material($id, 'policy')->assertCreated();
        $this->material($id, 'significant_aspects')->assertCreated();
        $this->material($id, 'contribution', 'video')->assertCreated();
        $this->material($id, 'consequences', 'quiz')->assertCreated();

        return $id;
    }

    private function active(): int
    {
        $id = $this->readyCampaign();
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-campaigns/{$id}/activate")->assertOk();

        return $id;
    }

    public function test_links_must_belong_to_the_enterprise(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/awareness-campaigns', ['title' => 'X', 'audience' => 'selected', 'selected_user_ids' => [$this->adminB->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['selected_user_ids']);
        $this->postJson('/api/v1/awareness-campaigns', ['title' => 'X', 'audience' => 'selected'])->assertStatus(422)->assertJsonValidationErrors(['selected_user_ids']);
        $id = $this->campaign();
        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/awareness-campaigns/{$id}")->assertNotFound();
    }

    public function test_material_validation(): void
    {
        $id = $this->campaign();
        $this->material($id, 'policy', 'sheet', ['body' => ''])->assertStatus(422)->assertJsonValidationErrors(['body']);
        $this->material($id, 'policy', 'video', ['url' => 'http://insecure.test/v'])->assertStatus(422);
        $this->material($id, 'policy', 'quiz', ['questions' => [['question' => 'Q ?', 'options' => ['A', 'B'], 'correct' => 5]]])->assertStatus(422);
        $this->material($id, 'inconnu')->assertStatus(422);
    }

    public function test_activation_requires_the_four_points_of_clause_7_3(): void
    {
        $id = $this->campaign();
        $this->material($id, 'policy')->assertCreated();
        $this->material($id, 'consequences')->assertCreated();

        $response = $this->postJson("/api/v1/awareness-campaigns/{$id}/activate")->assertStatus(422);
        $this->assertCount(2, $response->json('errors.materials'));
        $this->assertDatabaseHas('awareness_campaigns', ['id' => $id, 'status' => 'draft']);
    }

    public function test_activation_enrols_the_site_staff_notifies_them_and_locks_the_content(): void
    {
        Notification::fake();
        $id = $this->readyCampaign();
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-campaigns/{$id}/activate")->assertOk()->assertJsonPath('status', 'active');

        $this->assertSame(2, AwarenessParticipant::query()->withoutGlobalScopes()->where('campaign_id', $id)->count());
        Notification::assertSentTo($this->workerA, SiteEventNotification::class);
        $this->material($id, 'policy')->assertStatus(422);
        $this->putJson("/api/v1/awareness-campaigns/{$id}", ['title' => 'Renommée'])->assertStatus(422);
        $this->deleteJson("/api/v1/awareness-campaigns/{$id}")->assertStatus(422);
    }

    public function test_a_participant_sees_the_content_without_quiz_answers_and_earns_an_attestation(): void
    {
        $id = $this->active();
        $this->actingAs($this->workerA, 'sanctum');

        $content = $this->getJson("/api/v1/awareness/my/{$id}")->assertOk()->json('data');
        $this->assertStringNotContainsString('"correct"', json_encode($content));
        $materials = collect($content['materials'])->keyBy('topic');
        $this->getJson("/api/v1/awareness/my/{$id}/attestation")->assertStatus(422);

        foreach (['policy', 'significant_aspects', 'contribution'] as $topic) {
            $this->postJson("/api/v1/awareness/my/{$id}/materials/{$materials[$topic]['id']}/read")->assertOk()->assertJsonPath('data.completed', false);
        }
        $quiz = $materials['consequences']['id'];
        $this->postJson("/api/v1/awareness/my/{$id}/materials/{$quiz}/read")->assertStatus(422);
        $this->postJson("/api/v1/awareness/my/{$id}/materials/{$quiz}/quiz", ['answers' => [0, 1]])->assertOk()->assertJsonPath('data.passed', false)->assertJsonPath('data.score', 0)->assertJsonPath('data.completed', false);
        $this->postJson("/api/v1/awareness/my/{$id}/materials/{$quiz}/quiz", ['answers' => [1]])->assertStatus(422);
        $done = $this->postJson("/api/v1/awareness/my/{$id}/materials/{$quiz}/quiz", ['answers' => [1, 0]])->assertOk()->assertJsonPath('data.passed', true)->assertJsonPath('data.completed', true)->json('data');

        $this->assertStringStartsWith('ATT-', $done['attestation_number']);
        $pdf = $this->get("/api/v1/awareness/my/{$id}/attestation")->assertOk();
        $this->assertStringContainsString('pdf', (string) $pdf->headers->get('content-type'));
        $this->getJson('/api/v1/awareness/my')->assertOk()->assertJsonPath('data.0.attestation_number', $done['attestation_number']);
    }

    public function test_only_enrolled_users_of_the_enterprise_can_take_part(): void
    {
        $id = $this->active();
        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/awareness/my/{$id}")->assertNotFound();
        $outsider = $this->user($this->enterpriseA, Site::factory()->create(['enterprise_id' => $this->enterpriseA->id]), 'lecteur');
        $this->actingAs($outsider, 'sanctum')->getJson("/api/v1/awareness/my/{$id}")->assertNotFound();
    }

    public function test_receipts_are_immutable_and_a_closed_campaign_accepts_no_more_reading(): void
    {
        $id = $this->active();
        $this->actingAs($this->workerA, 'sanctum');
        $material = $this->getJson("/api/v1/awareness/my/{$id}")->json('data.materials.0.id');
        $this->postJson("/api/v1/awareness/my/{$id}/materials/{$material}/read")->assertOk();
        $this->postJson("/api/v1/awareness/my/{$id}/materials/{$material}/read")->assertOk();
        $this->assertSame(1, AwarenessReceipt::query()->withoutGlobalScopes()->count());

        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-campaigns/{$id}/close")->assertOk();
        $this->actingAs($this->workerA, 'sanctum')->postJson("/api/v1/awareness/my/{$id}/materials/{$material}/read")->assertStatus(422);

        $this->expectException(\LogicException::class);
        AwarenessReceipt::query()->withoutGlobalScopes()->first()->update(['passed' => false]);
    }

    public function test_an_external_worker_gets_a_personal_limited_link_and_an_attestation(): void
    {
        $id = $this->active();
        $draft = $this->campaign(['title' => 'Brouillon']);
        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-campaigns/{$draft}/invitations", ['name' => 'Koffi'])->assertStatus(422);

        $link = $this->postJson("/api/v1/awareness-campaigns/{$id}/invitations", ['name' => 'Koffi Sous-traitant', 'organization' => 'Entreprise ABC'])->assertCreated()->json('data.link');
        $token = basename($link);
        $this->assertSame(48, strlen($token));
        $this->assertDatabaseMissing('awareness_participants', ['token_hash' => $token]);
        $this->assertDatabaseHas('awareness_participants', ['token_hash' => hash('sha256', $token), 'kind' => 'external', 'organization' => 'Entreprise ABC']);

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/public/awareness/'.str_repeat('x', 48))->assertNotFound();
        $content = $this->getJson("/api/v1/public/awareness/{$token}")->assertOk()->assertJsonPath('data.participant.name', 'Koffi Sous-traitant')->json('data');
        $this->assertStringNotContainsString('"correct"', json_encode($content));
        $this->assertArrayNotHasKey('enterprise_id', $content['campaign']);

        foreach ($content['materials'] as $material) {
            if ($material['type'] === 'quiz') {
                $this->postJson("/api/v1/public/awareness/{$token}/materials/{$material['id']}/quiz", ['answers' => [1, 0]])->assertOk();
            } else {
                $this->postJson("/api/v1/public/awareness/{$token}/materials/{$material['id']}/read")->assertOk();
            }
        }
        $this->get("/api/v1/public/awareness/{$token}/attestation")->assertOk();
    }

    public function test_the_overview_gives_the_awareness_rate_per_site(): void
    {
        $id = $this->active();
        $this->actingAs($this->workerA, 'sanctum');
        $content = $this->getJson("/api/v1/awareness/my/{$id}")->json('data.materials');
        foreach ($content as $material) {
            $material['type'] === 'quiz'
                ? $this->postJson("/api/v1/awareness/my/{$id}/materials/{$material['id']}/quiz", ['answers' => [1, 0]])->assertOk()
                : $this->postJson("/api/v1/awareness/my/{$id}/materials/{$material['id']}/read")->assertOk();
        }

        $overview = $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/awareness/overview')->assertOk()->json('data');
        $this->assertSame(2, $overview['by_site'][0]['participants']);
        $this->assertSame(1, $overview['by_site'][0]['completed']);
        $this->assertEquals(50.0, $overview['by_site'][0]['rate']);
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/awareness/overview')->assertOk()->assertJsonCount(0, 'data.campaigns');
    }

    // ------------------------------------------------------------------ causeries

    private function talk(array $overrides = []): int
    {
        return $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/awareness-talks', array_merge(['title' => 'Tri des déchets', 'held_on' => today()->toDateString(), 'topic' => 'significant_aspects'], $overrides))
            ->assertCreated()->json('id');
    }

    public function test_a_talk_is_signed_by_qr_code_once_per_person(): void
    {
        $id = $this->talk();
        $qr = $this->get("/api/v1/awareness-talks/{$id}/qr")->assertOk();
        $this->assertStringContainsString('svg', (string) $qr->headers->get('content-type'));
        $this->assertStringContainsString('<svg', $qr->getContent());

        $token = AwarenessTalk::query()->withoutGlobalScopes()->findOrFail($id)->qr_token;
        $this->actingAs($this->workerA, 'sanctum')->postJson('/api/v1/awareness-talks/sign', ['token' => $token])->assertCreated()->assertJsonPath('data.already_signed', false);
        $this->postJson('/api/v1/awareness-talks/sign', ['token' => $token])->assertOk()->assertJsonPath('data.already_signed', true);
        $this->actingAs($this->adminB, 'sanctum')->postJson('/api/v1/awareness-talks/sign', ['token' => $token])->assertNotFound();

        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/awareness-talks/{$id}/attendees", ['name' => 'Visiteur extérieur', 'organization' => 'ABC'])->assertCreated();
        $this->getJson("/api/v1/awareness-talks/{$id}")->assertOk()->assertJsonCount(2, 'attendances')->assertJsonMissingPath('qr_token');
        $this->deleteJson("/api/v1/awareness-talks/{$id}")->assertStatus(422);
    }

    public function test_a_closed_or_future_talk_refuses_signatures(): void
    {
        $closed = $this->talk();
        $future = $this->talk(['title' => 'Demain', 'held_on' => today()->addDay()->toDateString()]);
        $this->postJson("/api/v1/awareness-talks/{$closed}/close")->assertOk();
        $tokens = AwarenessTalk::query()->withoutGlobalScopes()->pluck('qr_token', 'id');

        $this->actingAs($this->workerA, 'sanctum')->postJson('/api/v1/awareness-talks/sign', ['token' => $tokens[$closed]])->assertStatus(422);
        $this->postJson('/api/v1/awareness-talks/sign', ['token' => $tokens[$future]])->assertStatus(422);
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/awareness-talks/{$closed}", ['title' => 'Modifiée'])->assertStatus(422);
    }
}
