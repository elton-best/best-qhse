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
use App\Modules\Hse\Models\EmergencyEvent;
use App\Modules\Hse\Models\EmergencyProcedure;
use App\Modules\Hse\Models\EmergencyResource;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Notifications\SiteEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Préparation et réponse aux situations d'urgence — ISO 14001:2026 §8.2.
 */
class EmergencyPreparednessTest extends TestCase
{
    use RefreshDatabase;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    private Site $siteA;

    private Site $siteB;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class, EnsureSubModuleSubscribed::class,
        ]);

        $names = array_map(fn ($a) => "environnement.urgences.{$a}", ['read', 'create', 'update', 'delete']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions(['environnement.urgences.read']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $this->siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id, 'is_headquarter' => true]);
        $this->siteB = Site::factory()->create(['enterprise_id' => $this->enterpriseB->id, 'is_headquarter' => true]);
        $this->adminA = $this->user($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $this->adminB = $this->user($this->enterpriseB, $this->siteB, 'admin_entreprise');
    }

    private function user(Enterprise $enterprise, Site $site, ?string $role): User
    {
        $user = User::factory()->create(['enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true]);
        if ($role) {
            $user->assignRole($role);
        }

        return $user;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function scenario(array $overrides = [], ?User $as = null): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/emergency-procedures', array_merge([
            'emergency_type' => 'Déversement', 'title' => 'Déversement de gasoil',
        ], $overrides))->assertCreated()->json('data.id');
    }

    // ------------------------------------------------------------ scénarios (M13-01, M13-02)

    public function test_a_scenario_can_start_as_a_draft_but_is_ready_only_with_a_complete_plan(): void
    {
        $id = $this->scenario(['hazard_nature' => 'Pollution du sol', 'neighbour_risk' => 'Dépôt de carburant voisin']);
        $this->assertDatabaseHas('emergency_procedures', ['id' => $id, 'status' => 'planifie', 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id]);

        $this->putJson("/api/v1/emergency-procedures/{$id}", ['status' => 'operationnel'])
            ->assertStatus(422)->assertJsonValidationErrors(['measures', 'responsible_id']);

        $this->putJson("/api/v1/emergency-procedures/{$id}", [
            'status' => 'operationnel', 'measures' => 'Arrêt de la pompe, confinement, kit anti-déversement', 'responsible_id' => $this->adminA->id,
            'prevention_actions' => 'Rétention sous la cuve', 'evacuation_routes' => 'Sortie nord', 'assembly_points' => 'Parking visiteurs',
        ])->assertOk()->assertJsonPath('data.status', 'operationnel');
    }

    public function test_foreign_sites_and_responsibles_are_refused(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/emergency-procedures', ['emergency_type' => 'x', 'title' => 'y', 'site_id' => $this->siteB->id])->assertForbidden();
        $this->postJson('/api/v1/emergency-procedures', ['emergency_type' => 'x', 'title' => 'y', 'responsible_id' => $this->adminB->id])
            ->assertStatus(422)->assertJsonValidationErrors('responsible_id');
    }

    public function test_other_enterprise_cannot_reach_scenarios_or_their_registers(): void
    {
        $id = $this->scenario();
        $contact = $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/emergency-contacts', ['title' => 'Pompiers', 'phone' => '118'])->json('id');

        $this->actingAs($this->adminB, 'sanctum');
        $this->getJson('/api/v1/emergency-procedures')->assertOk()->assertJsonCount(0, 'data.data');
        $this->getJson("/api/v1/emergency-procedures/{$id}")->assertNotFound();
        $this->putJson("/api/v1/emergency-procedures/{$id}", ['title' => 'Piraté'])->assertNotFound();
        $this->deleteJson("/api/v1/emergency-procedures/{$id}")->assertNotFound();
        $this->assertNotNull($contact, 'contact créé');
        $this->getJson("/api/v1/emergency-contacts/{$contact}")->assertNotFound();
        $this->postJson('/api/v1/emergency-exercises', ['title' => 'Exercice', 'procedure_id' => $id])->assertStatus(422)->assertJsonValidationErrors('procedure_id');
        $this->getJson('/api/v1/emergency/overview')->assertOk()->assertJsonPath('data.scenarios.total', 0);
    }

    public function test_an_aspect_with_emergency_potential_feeds_the_scenario_list(): void
    {
        $aspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'activity' => 'Stockage', 'aspect' => 'Fuite de gasoil', 'impact' => 'Sol',
            'is_emergency_potential' => true,
        ]);
        $procedure = EmergencyProcedure::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'aspect_id' => $aspect->id,
            'emergency_type' => 'À définir', 'title' => 'Urgence — Fuite de gasoil', 'status' => 'planifie',
        ]);

        $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/emergency-procedures')
            ->assertOk()->assertJsonPath('data.data.0.id', $procedure->id)->assertJsonPath('data.data.0.aspect.aspect', 'Fuite de gasoil');
    }

    public function test_permissions_are_enforced(): void
    {
        $id = $this->scenario();
        $reader = $this->user($this->enterpriseA, $this->siteA, 'lecteur');
        $this->actingAs($reader, 'sanctum');

        $this->getJson('/api/v1/emergency-procedures')->assertOk();
        $this->getJson('/api/v1/emergency-contacts')->assertOk();
        $this->postJson('/api/v1/emergency-procedures', ['emergency_type' => 'x', 'title' => 'y'])->assertForbidden();
        $this->postJson('/api/v1/emergency-events', ['title' => 'Incendie'])->assertForbidden();
        $this->deleteJson("/api/v1/emergency-procedures/{$id}")->assertForbidden();
    }

    // ------------------------------------------------------------ annuaire (M13-03)

    public function test_contacts_require_a_dialable_phone_and_can_be_filtered(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/emergency-contacts', ['title' => 'Pompiers', 'phone' => 'pas un numéro'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->postJson('/api/v1/emergency-contacts', ['title' => 'Pompiers', 'phone' => '+229 21 30 00 18', 'category' => 'fire_brigade', 'available_24h' => true])->assertCreated();
        $this->postJson('/api/v1/emergency-contacts', ['title' => 'Voisin entrepôt', 'phone' => '97 00 00 00', 'category' => 'neighbour'])->assertCreated();

        $this->getJson('/api/v1/emergency-contacts?category=fire_brigade')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Pompiers');
        $this->get('/api/v1/emergency-contacts/template')->assertOk();
    }

    // ------------------------------------------------------------ moyens (M13-04)

    public function test_resources_compute_their_next_check_and_flag_overdue_ones(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $due = $this->postJson('/api/v1/emergency-resources', [
            'title' => 'Extincteur CO2 atelier', 'resource_type' => 'extinguisher', 'last_check_date' => now()->subDays(400)->toDateString(), 'check_frequency_days' => 365,
        ])->assertCreated();
        $this->assertTrue($due->json('is_overdue'));
        $this->assertSame(now()->subDays(35)->toDateString(), substr($due->json('next_check_date'), 0, 10));

        $fresh = $this->postJson('/api/v1/emergency-resources', ['title' => 'Kit anti-déversement', 'last_check_date' => now()->toDateString(), 'check_frequency_days' => 180, 'status' => 'to_check'])->assertCreated();
        $this->assertFalse($fresh->json('is_overdue'));

        $this->putJson('/api/v1/emergency-resources/'.$due->json('id'), ['last_check_date' => now()->toDateString()])->assertOk()
            ->assertJsonPath('is_overdue', false);
        $this->postJson('/api/v1/emergency-resources', ['title' => 'Futur', 'last_check_date' => now()->addDay()->toDateString()])->assertStatus(422);
    }

    public function test_reminders_fire_at_the_milestones_for_resources_and_drills(): void
    {
        Notification::fake();
        $this->actingAs($this->adminA, 'sanctum');
        foreach ([30, 7, 0, 12] as $days) {
            EmergencyResource::create([
                'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'title' => "Moyen J{$days}",
                'next_check_date' => now()->addDays($days)->toDateString(), 'responsible_id' => $this->adminA->id,
            ]);
        }
        EmergencyProcedure::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'emergency_type' => 'Incendie', 'title' => 'Incendie atelier',
            'next_drill_date' => now()->addDays(30)->toDateString(), 'responsible_id' => $this->adminA->id,
        ]);

        $this->artisan('emergency:check-reminders')->assertSuccessful();
        Notification::assertSentToTimes($this->adminA, SiteEventNotification::class, 4); // 3 moyens + 1 exercice
        Notification::assertSentTo($this->adminA, SiteEventNotification::class, fn ($n) => $n->type === 'emergency_drill_due');
    }

    // ------------------------------------------------------------ exercices (M13-05)

    public function test_an_exercise_needs_a_scenario_and_findings_to_be_closed(): void
    {
        $procedure = $this->scenario(['measures' => 'Plan défini', 'responsible_id' => $this->adminA->id, 'status' => 'operationnel']);
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/emergency-exercises', ['title' => 'Exercice sans scénario'])->assertStatus(422)->assertJsonValidationErrors('procedure_id');

        $id = $this->postJson('/api/v1/emergency-exercises', ['title' => 'Évacuation semestrielle', 'procedure_id' => $procedure, 'exercise_type' => 'evacuation', 'planned_date' => now()->addWeek()->toDateString()])
            ->assertCreated()->json('id');

        $this->postJson("/api/v1/emergency-exercises/{$id}/complete", ['performed_date' => now()->toDateString(), 'findings' => 'court'])->assertStatus(422)->assertJsonValidationErrors('findings');
        $this->postJson("/api/v1/emergency-exercises/{$id}/complete", ['performed_date' => now()->addDay()->toDateString(), 'findings' => 'Constats détaillés de l\'exercice.'])->assertStatus(422);

        $next = now()->addMonths(6)->toDateString();
        $this->postJson("/api/v1/emergency-exercises/{$id}/complete", [
            'performed_date' => now()->toDateString(), 'findings' => 'Point de rassemblement atteint en 4 minutes ; alarme inaudible au magasin.',
            'participants_count' => 28, 'actions_required' => 'Installer une sirène au magasin', 'next_drill_date' => $next,
        ])->assertOk()->assertJsonPath('status', 'done');

        $procedureRow = EmergencyProcedure::find($procedure);
        $this->assertSame('teste', $procedureRow->status);
        $this->assertSame(now()->toDateString(), $procedureRow->last_drill_date->toDateString());
        $this->assertSame($next, $procedureRow->next_drill_date->toDateString());

        $this->putJson("/api/v1/emergency-exercises/{$id}", ['title' => 'Modifié'])->assertStatus(422);
        $this->postJson("/api/v1/emergency-exercises/{$id}/complete", ['performed_date' => now()->toDateString(), 'findings' => 'Deuxième clôture impossible.'])->assertStatus(422);
    }

    public function test_an_exercise_never_validates_an_incomplete_plan_and_can_be_cancelled(): void
    {
        $draft = $this->scenario();
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->postJson('/api/v1/emergency-exercises', ['title' => 'Test prématuré', 'procedure_id' => $draft])->assertCreated()->json('id');
        $this->postJson("/api/v1/emergency-exercises/{$id}/complete", ['performed_date' => now()->toDateString(), 'findings' => 'Exercice mené sur un plan incomplet.'])->assertOk();
        $this->assertSame('planifie', EmergencyProcedure::find($draft)->status);

        $other = $this->postJson('/api/v1/emergency-exercises', ['title' => 'À annuler', 'procedure_id' => $draft])->json('id');
        $this->postJson("/api/v1/emergency-exercises/{$other}/cancel")->assertOk()->assertJsonPath('status', 'cancelled');
        $this->postJson("/api/v1/emergency-exercises/{$other}/cancel")->assertStatus(422);
    }

    // ------------------------------------------------------------ événements réels (M13-06)

    public function test_declaring_an_event_starts_a_timeline_and_alerts_the_administrators(): void
    {
        Notification::fake();
        $secondAdmin = $this->user($this->enterpriseA, $this->siteA, 'admin_entreprise');
        $procedure = $this->scenario(['measures' => 'Plan', 'responsible_id' => $this->adminA->id, 'status' => 'operationnel']);

        $response = $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/emergency-events', [
            'title' => 'Fuite de gasoil au dépôt', 'procedure_id' => $procedure, 'severity' => 'major', 'description' => 'Cuve percée',
        ])->assertCreated();

        $this->assertSame('ongoing', $response->json('status'));
        $this->assertSame($this->adminA->id, $response->json('declared_by'));
        $this->assertCount(1, $response->json('timeline'));
        $this->assertStringStartsWith('URG-', $response->json('ref'));
        Notification::assertSentTo($secondAdmin, SiteEventNotification::class, fn ($n) => $n->type === 'emergency_declared');
        Notification::assertNotSentTo($this->adminA, SiteEventNotification::class);

        $this->postJson('/api/v1/emergency-events', ['title' => 'x', 'declared_at' => now()->addHour()->toDateTimeString()])->assertStatus(422);
        $this->postJson('/api/v1/emergency-events', ['title' => 'x', 'status' => 'closed', 'closed_at' => now()->toDateTimeString()])->assertCreated()->assertJsonPath('status', 'ongoing');
    }

    public function test_the_timeline_stays_chronological_and_containment_is_recorded(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->postJson('/api/v1/emergency-events', ['title' => 'Incendie de palettes', 'severity' => 'major', 'declared_at' => now()->subHour()->toDateTimeString()])->json('id');

        $this->postJson("/api/v1/emergency-events/{$id}/timeline", ['text' => 'Trop tôt', 'at' => now()->subHours(2)->toDateTimeString()])->assertStatus(422);
        $this->postJson("/api/v1/emergency-events/{$id}/timeline", ['text' => 'Alerte donnée aux pompiers', 'at' => now()->subMinutes(5)->toDateTimeString()])->assertOk();
        $timeline = $this->postJson("/api/v1/emergency-events/{$id}/timeline", ['text' => 'Évacuation terminée', 'at' => now()->subMinutes(3)->toDateTimeString()])->json('timeline');
        $this->assertSame(
            ['Déclaration de la situation d\'urgence.', 'Alerte donnée aux pompiers', 'Évacuation terminée'],
            collect($timeline)->sortBy('at')->pluck('text')->values()->all(),
        );
        $this->assertSame(array_column($timeline, 'at'), collect($timeline)->sortBy('at')->pluck('at')->values()->all());

        $this->postJson("/api/v1/emergency-events/{$id}/contain")->assertOk()->assertJsonPath('status', 'contained');
        $this->postJson("/api/v1/emergency-events/{$id}/contain")->assertStatus(422);
    }

    public function test_closing_requires_a_debrief_then_revises_the_plan_and_flags_the_aspects(): void
    {
        $aspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'activity' => 'Dépôt', 'aspect' => 'Déversement de gasoil', 'impact' => 'Sol',
            'is_emergency_potential' => true,
        ]);
        $procedure = EmergencyProcedure::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'aspect_id' => $aspect->id, 'emergency_type' => 'Déversement',
            'title' => 'Déversement de gasoil', 'measures' => 'Plan', 'responsible_id' => $this->adminA->id, 'status' => 'teste',
        ]);
        $aspect->forceFill(['emergency_procedure_id' => $procedure->id])->save();

        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->postJson('/api/v1/emergency-events', ['title' => 'Déversement réel', 'procedure_id' => $procedure->id, 'severity' => 'critical'])->json('id');

        $this->postJson("/api/v1/emergency-events/{$id}/close", ['debrief' => 'trop court'])->assertStatus(422)->assertJsonValidationErrors('debrief');
        $closed = $this->postJson("/api/v1/emergency-events/{$id}/close", [
            'debrief' => 'Le kit anti-déversement était incomplet et la rétention insuffisante.', 'lessons_actions' => 'Compléter le kit ; agrandir la rétention',
        ])->assertOk();

        $this->assertSame('closed', $closed->json('status'));
        $this->assertTrue($closed->json('plan_revision_requested'));
        $this->assertSame(1, $closed->json('aspects_flagged'));
        $this->assertSame('a_reviser', EmergencyProcedure::find($procedure->id)->status);
        $this->assertStringContainsString('URG-', EmergencyProcedure::find($procedure->id)->review_reason);
        $flagged = EnvironmentalAspect::find($aspect->id);
        $this->assertTrue($flagged->needs_reassessment);
        $this->assertStringContainsString('Situation d\'urgence réelle', $flagged->reassessment_reason);

        // Enregistrement figé : ni modification, ni suppression, ni nouvelle entrée de chronologie.
        $this->putJson("/api/v1/emergency-events/{$id}", ['title' => 'Falsifié'])->assertStatus(422);
        $this->deleteJson("/api/v1/emergency-events/{$id}")->assertStatus(422);
        $this->postJson("/api/v1/emergency-events/{$id}/timeline", ['text' => 'Ajout tardif'])->assertStatus(422);
        $this->postJson("/api/v1/emergency-events/{$id}/close", ['debrief' => 'Deuxième retour d\'expérience impossible.'])->assertStatus(422);
        $this->assertSame('closed', EmergencyEvent::find($id)->status);
    }

    public function test_a_scenario_linked_to_real_events_cannot_be_deleted(): void
    {
        $procedure = $this->scenario();
        $this->actingAs($this->adminA, 'sanctum')->postJson('/api/v1/emergency-events', ['title' => 'Alerte', 'procedure_id' => $procedure])->assertCreated();
        $this->deleteJson("/api/v1/emergency-procedures/{$procedure}")->assertStatus(422);
        $this->assertNotNull(EmergencyProcedure::find($procedure));
    }

    // ------------------------------------------------------------ vue d'ensemble

    public function test_the_overview_summarises_readiness_resources_exercises_and_events(): void
    {
        $ready = $this->scenario(['measures' => 'Plan', 'responsible_id' => $this->adminA->id, 'status' => 'operationnel']);
        $this->scenario(['title' => 'Brouillon']);
        $this->actingAs($this->adminA, 'sanctum');
        $this->postJson('/api/v1/emergency-contacts', ['title' => 'Pompiers', 'phone' => '118', 'available_24h' => true])->assertCreated();
        $this->postJson('/api/v1/emergency-resources', ['title' => 'Extincteur', 'last_check_date' => now()->subDays(500)->toDateString(), 'check_frequency_days' => 365])->assertCreated();
        $this->postJson('/api/v1/emergency-exercises', ['title' => 'Exercice', 'procedure_id' => $ready, 'planned_date' => now()->subDay()->toDateString()])->assertCreated();
        $this->postJson('/api/v1/emergency-events', ['title' => 'Alerte'])->assertCreated();

        $data = $this->getJson('/api/v1/emergency/overview')->assertOk()->json('data');
        $this->assertSame(2, $data['scenarios']['total']);
        $this->assertSame(1, $data['scenarios']['ready']);
        $this->assertSame(1, $data['scenarios']['to_complete']);
        $this->assertSame([$ready], $data['scenarios']['without_recent_drill']);
        $this->assertSame(1, $data['contacts']['available_24h']);
        $this->assertSame(1, $data['resources']['overdue']);
        $this->assertSame(1, $data['exercises']['overdue']);
        $this->assertSame(1, $data['events']['ongoing']);
    }
}
