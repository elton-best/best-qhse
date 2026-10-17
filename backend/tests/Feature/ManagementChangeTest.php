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
use App\Modules\Hse\Models\EnvironmentalAspect;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Gestion des changements — ISO 14001:2026 §6.3 et §8.1.
 */
class ManagementChangeTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class,
        ]);

        $names = array_map(fn ($a) => "planification.changements.{$a}", ['read', 'create', 'update', 'delete', 'approve']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions(['planification.changements.read']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->user($this->enterpriseA, $siteA, 'admin_entreprise');
        $this->adminB = $this->user($this->enterpriseB, $siteB, 'admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site, string $role): User
    {
        $user = User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
        $user->assignRole($role);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function change(array $overrides = [], ?User $as = null): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/management-changes', array_merge([
            'title' => 'Nouvelle ligne de peinture', 'change_type' => 'new_process', 'responsible_id' => $this->adminA->id,
        ], $overrides))->assertCreated()->json('id');
    }

    /**
     * @param  array<string, bool>  $impacted
     * @return array<string, array{impacted: bool, note: string}>
     */
    private function analysis(array $impacted = []): array
    {
        $result = [];
        foreach (['aspects', 'obligations', 'risks', 'competences', 'documents', 'emergencies', 'suppliers'] as $key) {
            $is = $impacted[$key] ?? false;
            $result[$key] = ['impacted' => $is, 'note' => $is ? 'Impact identifié sur ce périmètre.' : ''];
        }

        return $result;
    }

    private function aspect(Enterprise $enterprise): EnvironmentalAspect
    {
        $site = Site::query()->where('enterprise_id', $enterprise->id)->first();

        return EnvironmentalAspect::withoutGlobalScopes()->create([
            'enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'aspect_number' => 'A-'.$enterprise->id,
            'activity' => 'Peinture', 'aspect' => 'Émission de COV', 'impact' => 'Pollution de l\'air', 'status' => 'active',
        ]);
    }

    public function test_a_change_is_created_in_the_callers_scope_and_isolated_from_other_enterprises(): void
    {
        $id = $this->change();
        $this->assertDatabaseHas('management_changes', ['id' => $id, 'enterprise_id' => $this->enterpriseA->id, 'status' => 'requested']);

        $this->actingAs($this->adminB, 'sanctum')->getJson("/api/v1/management-changes/{$id}")->assertNotFound();
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/management-changes')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->adminB, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $this->analysis()])->assertNotFound();
    }

    public function test_a_responsible_from_another_enterprise_is_refused(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/management-changes', [
            'title' => 'X', 'change_type' => 'new_process', 'responsible_id' => $this->adminB->id,
        ])->assertStatus(422);
    }

    public function test_a_temporary_change_needs_an_end_date_and_an_unplanned_one_needs_consequences(): void
    {
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/management-changes', [
            'title' => 'Chantier', 'change_type' => 'new_site', 'duration' => 'temporary',
        ])->assertStatus(422)->assertJsonValidationErrors(['planned_end_date']);

        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/management-changes', [
            'title' => 'Panne', 'change_type' => 'new_equipment', 'is_planned' => false,
        ])->assertStatus(422)->assertJsonValidationErrors(['unplanned_consequences', 'mitigation_measures']);
    }

    public function test_submission_requires_every_dimension_to_be_answered_and_justified(): void
    {
        $id = $this->change();
        $partial = ['aspects' => ['impacted' => true, 'note' => '']];
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $partial])->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertStatus(422)->assertJsonValidationErrors(['impact_analysis.aspects', 'impact_analysis.obligations']);

        $this->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => ['inconnue' => ['impacted' => true]]])->assertStatus(422);
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertStatus(422);
    }

    public function test_a_foreign_aspect_cannot_be_linked(): void
    {
        $id = $this->change();
        $foreign = $this->aspect($this->enterpriseB);
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", [
            'impact_analysis' => $this->analysis(), 'affected_aspect_ids' => [$foreign->id],
        ])->assertStatus(422);
    }

    public function test_approval_generates_one_task_per_impacted_dimension_and_flags_aspects(): void
    {
        $aspect = $this->aspect($this->enterpriseA);
        $id = $this->change();
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", [
            'impact_analysis' => $this->analysis(['aspects' => true, 'documents' => true]),
            'affected_aspect_ids' => [$aspect->id],
            'resources_requested' => ['financial' => '2 000 000 FCFA'],
        ])->assertOk()->assertJsonPath('status', 'in_analysis');
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertOk()->assertJsonPath('status', 'awaiting_approval');

        $this->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'approve'])
            ->assertStatus(422)->assertJsonValidationErrors(['resources_decision']);

        $this->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'approve', 'resources_decision' => 'granted'])
            ->assertOk()->assertJsonPath('status', 'implementing');

        $this->assertDatabaseCount('management_change_tasks', 2);
        $this->assertDatabaseHas('management_change_tasks', ['change_id' => $id, 'dimension' => 'aspects', 'enterprise_id' => $this->enterpriseA->id]);
        $this->assertTrue((bool) EnvironmentalAspect::withoutGlobalScopes()->find($aspect->id)->needs_reassessment);
    }

    public function test_a_rejection_must_be_justified_and_creates_no_task(): void
    {
        $id = $this->change();
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $this->analysis(['risks' => true])])->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertOk();

        $this->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'reject'])->assertStatus(422)->assertJsonValidationErrors(['note']);
        $this->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'reject', 'note' => 'Budget indisponible cette année.'])
            ->assertOk()->assertJsonPath('status', 'rejected');
        $this->assertDatabaseCount('management_change_tasks', 0);
    }

    public function test_tasks_close_the_change_then_review_closes_the_file(): void
    {
        $id = $this->change();
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $this->analysis(['risks' => true, 'suppliers' => true])])->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'approve'])->assertOk();

        $taskIds = $this->getJson('/api/v1/management-change-tasks')->assertOk()->json('data.*.id');
        $this->assertCount(2, $taskIds);

        $this->postJson("/api/v1/management-changes/{$id}/review", ['result' => 'effective', 'note' => 'Tout est en place.'])->assertStatus(422);
        $this->postJson("/api/v1/management-change-tasks/{$taskIds[0]}/complete", [])->assertStatus(422);
        $this->postJson("/api/v1/management-change-tasks/{$taskIds[0]}/complete", ['note' => 'Registre des risques mis à jour.'])->assertOk()->assertJsonPath('status', 'implementing');
        $this->postJson("/api/v1/management-change-tasks/{$taskIds[1]}/complete", ['note' => 'Fournisseurs informés.'])->assertOk()->assertJsonPath('status', 'implemented');

        $this->postJson("/api/v1/management-changes/{$id}/review", ['result' => 'effective', 'note' => 'Impacts maîtrisés après un mois.'])
            ->assertOk()->assertJsonPath('status', 'closed');
        $this->deleteJson("/api/v1/management-changes/{$id}")->assertStatus(422);
        $this->putJson("/api/v1/management-changes/{$id}", ['title' => 'Modifié'])->assertStatus(422);
    }

    public function test_an_unplanned_change_is_regularised_without_approval(): void
    {
        $id = $this->change([
            'title' => 'Remplacement en urgence d\'un fournisseur', 'change_type' => 'personnel_supplier', 'is_planned' => false,
            'unplanned_consequences' => 'Rupture d\'approvisionnement constatée sur site.',
            'mitigation_measures' => 'Contrôle renforcé à la réception des produits.',
        ]);
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $this->analysis(['suppliers' => true])])->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertOk()->assertJsonPath('status', 'implementing');
        $this->assertDatabaseCount('management_change_tasks', 1);
    }

    public function test_a_reader_cannot_decide_and_a_task_of_another_enterprise_is_unreachable(): void
    {
        $id = $this->change();
        $this->actingAs($this->adminA, 'sanctum')->putJson("/api/v1/management-changes/{$id}/analysis", ['impact_analysis' => $this->analysis(['risks' => true])])->assertOk();
        $this->postJson("/api/v1/management-changes/{$id}/submit")->assertOk();

        $reader = $this->user($this->enterpriseA, $this->adminA->site, 'lecteur');
        $this->actingAs($reader, 'sanctum')->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'approve'])->assertForbidden();

        $this->actingAs($this->adminA, 'sanctum')->postJson("/api/v1/management-changes/{$id}/decision", ['decision' => 'approve'])->assertOk();
        $taskId = $this->getJson('/api/v1/management-change-tasks')->json('data.0.id');
        $this->actingAs($this->adminB, 'sanctum')->postJson("/api/v1/management-change-tasks/{$taskId}/complete", ['note' => 'Tentative'])->assertNotFound();
    }

    public function test_the_period_summary_feeds_management_review(): void
    {
        $this->change();
        $this->change(['title' => 'Autre', 'change_type' => 'new_site']);

        $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/management-changes/period-summary')
            ->assertOk()->assertJsonPath('data.total', 2)->assertJsonPath('data.by_status.requested', 2);
        $this->actingAs($this->adminB, 'sanctum')->getJson('/api/v1/management-changes/period-summary')
            ->assertOk()->assertJsonPath('data.total', 0);
    }
}
