<?php

namespace Tests\Feature;

use App\Console\Commands\CheckComplianceExpirations;
use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\EnsureSubModuleSubscribed;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Models\ComplianceEvaluation;
use App\Modules\Hse\Models\ComplianceObligationText;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Improvement\Models\NonConformity;
use App\Notifications\SiteEventNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Registre de conformité unifié — ISO 14001:2026 §6.1.3 et §9.1.2.
 */
class ComplianceRegisterTest extends TestCase
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

        $names = array_map(fn ($a) => "environnement.obligations.{$a}", ['read', 'create', 'update', 'delete']);
        foreach ($names as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions($names);
        Role::firstOrCreate(['name' => 'lecteur', 'guard_name' => 'web'])->syncPermissions(['environnement.obligations.read']);

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
    private function create(array $overrides = [], ?User $as = null): int
    {
        return $this->actingAs($as ?? $this->adminA, 'sanctum')->postJson('/api/v1/compliance-obligations', array_merge([
            'aspect_name' => 'Déchets', 'regulatory_reference' => 'Décret n° 2024-123 sur les déchets',
            'title' => 'Gestion des déchets', 'evaluation_frequency' => 'quarterly',
        ], $overrides))->assertCreated()->json('data.id');
    }

    private function qualify(int $id, bool $applicable = true): void
    {
        $this->postJson("/api/v1/compliance-obligations/{$id}/applicability", [
            'is_applicable' => $applicable, 'justification' => 'Activité de production concernée par le texte.',
        ])->assertOk();
    }

    // ------------------------------------------------------------ registre et cloisonnement

    public function test_create_keeps_the_historical_contract_and_scopes_to_the_users_site(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $response = $this->postJson('/api/v1/compliance-obligations', [
            'aspect_name' => 'Eau', 'regulatory_reference' => 'Arrêté sur les rejets', 'source_type' => 'permit',
            'permit_number' => 'PERM-77', 'expiry_date' => now()->addMonths(6)->toDateString(), 'authority' => 'Ministère',
        ])->assertCreated();

        $this->assertStringStartsWith('OBL-', $response->json('data.ref'));
        $this->assertSame('permit', $response->json('data.source_type'));
        $this->assertSame($this->siteA->id, $response->json('data.site_id'));
        $this->assertDatabaseHas('compliance_obligation_texts', ['id' => $response->json('data.id'), 'enterprise_id' => $this->enterpriseA->id]);

        $this->getJson('/api/v1/compliance-obligations')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.permit_number', 'PERM-77');
    }

    public function test_references_stay_unique_across_enterprises(): void
    {
        $a = $this->create();
        $b = $this->create(['aspect_name' => 'Autre'], $this->adminB);
        $this->assertNotSame(
            ComplianceObligationText::withoutGlobalScopes()->find($a)->ref,
            ComplianceObligationText::withoutGlobalScopes()->find($b)->ref,
        );
    }

    public function test_other_enterprise_cannot_see_or_change_an_obligation(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminB, 'sanctum');

        $this->getJson('/api/v1/compliance-obligations')->assertOk()->assertJsonPath('meta.total', 0);
        $this->putJson("/api/v1/compliance-obligations/{$id}", ['comments' => 'x'])->assertNotFound();
        $this->deleteJson("/api/v1/compliance-obligations/{$id}")->assertNotFound();
        $this->postJson("/api/v1/compliance-obligations/{$id}/applicability", ['is_applicable' => true, 'justification' => 'Justification'])->assertNotFound();
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'x'])->assertNotFound();
        $this->getJson("/api/v1/compliance-obligations/{$id}/evaluations")->assertNotFound();
        $this->getJson('/api/v1/compliance-obligations/dashboard')->assertOk()->assertJsonPath('data.total', 0);
    }

    public function test_cannot_create_on_a_foreign_site_or_with_foreign_references(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $base = ['aspect_name' => 'Air', 'regulatory_reference' => 'Texte'];

        $this->postJson('/api/v1/compliance-obligations', $base + ['site_id' => $this->siteB->id])->assertForbidden();
        $this->postJson('/api/v1/compliance-obligations', $base + ['responsible_id' => $this->adminB->id])
            ->assertStatus(422)->assertJsonValidationErrors('responsible_id');

        $foreignAspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->siteB->id, 'activity' => 'a', 'aspect' => 'b', 'impact' => 'c',
        ]);
        $this->postJson('/api/v1/compliance-obligations', $base + ['environmental_aspect_ids' => [$foreignAspect->id]])
            ->assertStatus(422)->assertJsonValidationErrors('environmental_aspect_ids');
        $this->assertSame(0, ComplianceObligationText::query()->count());
    }

    public function test_permissions_are_enforced(): void
    {
        $id = $this->create();
        $reader = $this->user($this->enterpriseA, $this->siteA, 'lecteur');
        $this->actingAs($reader, 'sanctum');

        $this->getJson('/api/v1/compliance-obligations')->assertOk();
        $this->getJson('/api/v1/compliance-obligations/dashboard')->assertOk();
        $this->postJson('/api/v1/compliance-obligations', ['aspect_name' => 'x', 'regulatory_reference' => 'y'])->assertForbidden();
        $this->postJson("/api/v1/compliance-obligations/{$id}/applicability", ['is_applicable' => true, 'justification' => 'Justification'])->assertForbidden();
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'x'])->assertForbidden();
    }

    public function test_obligations_link_to_environmental_aspects_of_the_enterprise(): void
    {
        $aspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'activity' => 'Stockage', 'aspect' => 'Fuite', 'impact' => 'Sol',
        ]);
        $this->actingAs($this->adminA, 'sanctum');
        $response = $this->postJson('/api/v1/compliance-obligations', [
            'aspect_name' => 'Sol', 'regulatory_reference' => 'Texte', 'environmental_aspect_ids' => [$aspect->id],
        ])->assertCreated();

        $this->assertSame($aspect->id, $response->json('data.environmental_aspects.0.id'));
    }

    // ------------------------------------------------------------ applicabilité

    public function test_applicability_requires_a_justification_and_blocks_evaluation_when_false(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');

        $this->postJson("/api/v1/compliance-obligations/{$id}/applicability", ['is_applicable' => false])->assertStatus(422)->assertJsonValidationErrors('justification');
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'preuve'])
            ->assertStatus(422); // applicabilité non déterminée

        $this->qualify($id, false);
        $this->assertDatabaseHas('compliance_obligation_texts', ['id' => $id, 'is_applicable' => false, 'compliance_status' => 'not_applicable', 'applicability_decided_by' => $this->adminA->id]);
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'preuve'])->assertStatus(422);

        $this->qualify($id, true);
        $this->assertDatabaseHas('compliance_obligation_texts', ['id' => $id, 'compliance_status' => 'not_evaluated']);
    }

    // ------------------------------------------------------------ évaluations

    public function test_a_compliant_evaluation_needs_evidence_and_schedules_the_next_one(): void
    {
        $id = $this->create(['evaluation_frequency' => 'quarterly']);
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);

        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant'])->assertStatus(422);

        $date = now()->subDays(2)->toDateString();
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", [
            'result' => 'compliant', 'evaluated_at' => $date, 'evidence' => 'Bordereaux de suivi des déchets 2026', 'method' => 'Revue documentaire',
        ])->assertCreated()->assertJsonPath('data.obligation.compliance_status', 'compliant');

        $text = ComplianceObligationText::find($id);
        $this->assertSame($date, $text->last_evaluation_date->toDateString());
        $this->assertSame(now()->subDays(2)->addMonthsNoOverflow(3)->toDateString(), $text->next_evaluation_date->toDateString());
        $this->getJson("/api/v1/compliance-obligations/{$id}/evaluations")->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_evaluation_dates_in_the_future_are_refused(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'x', 'evaluated_at' => now()->addDay()->toDateString()])
            ->assertStatus(422)->assertJsonValidationErrors('evaluated_at');
    }

    public function test_evaluation_history_is_append_only(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'partial', 'comment' => 'Reste le registre des déchets'])->assertCreated();

        $evaluation = ComplianceEvaluation::query()->firstOrFail();
        $this->expectException(\LogicException::class);
        $evaluation->update(['result' => 'compliant']);
    }

    public function test_evaluations_cannot_be_deleted(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'partial'])->assertCreated();

        try {
            ComplianceEvaluation::query()->firstOrFail()->delete();
            $this->fail('La suppression aurait dû être refusée.');
        } catch (\LogicException) {
            $this->assertSame(1, ComplianceEvaluation::query()->count());
        }
    }

    public function test_an_external_evaluation_must_name_the_external_body(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);

        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'Rapport de contrôle', 'external' => true])
            ->assertStatus(422)->assertJsonValidationErrors('external_body');
        $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", ['result' => 'compliant', 'evidence' => 'Rapport de contrôle', 'external' => true, 'external_body' => 'Bureau Veritas'])
            ->assertCreated()->assertJsonPath('data.evaluation.external_body', 'Bureau Veritas');
    }

    public function test_evidence_files_are_stored_privately_and_scoped_to_the_enterprise(): void
    {
        Storage::fake('local');
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);

        $evaluationId = $this->post("/api/v1/compliance-obligations/{$id}/evaluations", [
            'result' => 'compliant', 'evidence_file' => UploadedFile::fake()->create('rapport.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.evaluation.id');

        $this->get("/api/v1/compliance-evaluations/{$evaluationId}/evidence")->assertOk();
        $this->actingAs($this->adminB, 'sanctum')->get("/api/v1/compliance-evaluations/{$evaluationId}/evidence", ['Accept' => 'application/json'])->assertNotFound();
    }

    public function test_a_non_compliant_result_opens_a_nonconformity(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);

        $response = $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", [
            'result' => 'non_compliant', 'comment' => 'Aucun registre de déchets dangereux',
        ])->assertCreated();

        $this->assertSame('nc_opened', $response->json('data.evaluation.gap_status'));
        $nc = NonConformity::query()->findOrFail($response->json('data.evaluation.nonconformity_id'));
        $this->assertSame('non_conformity', $nc->finding_type);
        $this->assertSame('open', $nc->status);
        $this->assertSame('legal', $nc->type);
        $this->assertSame($this->siteA->id, (int) $nc->site_id);
        $this->assertStringContainsString('Aucun registre', $nc->description);
        $this->assertDatabaseHas('compliance_obligation_texts', ['id' => $id, 'compliance_status' => 'non_compliant']);
    }

    public function test_an_already_corrected_gap_is_recorded_as_a_treated_gap(): void
    {
        $id = $this->create();
        $this->actingAs($this->adminA, 'sanctum');
        $this->qualify($id);

        $response = $this->postJson("/api/v1/compliance-obligations/{$id}/evaluations", [
            'result' => 'non_compliant', 'gap_already_treated' => true, 'comment' => 'Corrigé le jour même',
        ])->assertCreated();

        $this->assertSame('gap_treated', $response->json('data.evaluation.gap_status'));
        $nc = NonConformity::query()->findOrFail($response->json('data.evaluation.nonconformity_id'));
        $this->assertSame('gap', $nc->finding_type);
        $this->assertSame('resolved', $nc->status);
    }

    // ------------------------------------------------------------ veille, accords

    public function test_a_new_text_requires_an_impact_analysis_and_notifies_the_owner(): void
    {
        Notification::fake();
        $this->actingAs($this->adminA, 'sanctum');
        $response = $this->postJson('/api/v1/compliance-obligations', [
            'aspect_name' => 'Air', 'regulatory_reference' => 'Nouvel arrêté qualité de l\'air', 'regulatory_change_status' => 'new',
            'responsible_id' => $this->adminA->id,
        ])->assertCreated();

        $this->assertSame('to_analyze', $response->json('data.analysis_status'));
        Notification::assertSentTo($this->adminA, SiteEventNotification::class, fn ($n) => $n->type === 'compliance_analysis_required');

        $existing = $this->postJson('/api/v1/compliance-obligations', ['aspect_name' => 'Air', 'regulatory_reference' => 'Ancien texte', 'regulatory_change_status' => 'existing'])->json('data');
        $this->assertSame('analyzed', $existing['analysis_status']);
    }

    public function test_completing_the_analysis_flags_the_linked_aspects_for_reassessment(): void
    {
        $aspect = EnvironmentalAspect::create([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'activity' => 'Peinture', 'aspect' => 'COV', 'impact' => 'Air',
        ]);
        $this->actingAs($this->adminA, 'sanctum');
        $id = $this->create(['regulatory_change_status' => 'modified', 'environmental_aspect_ids' => [$aspect->id]]);

        $this->postJson("/api/v1/compliance-obligations/{$id}/analysis", ['note' => 'court'])->assertStatus(422);
        $this->postJson("/api/v1/compliance-obligations/{$id}/analysis", ['note' => 'Les seuils de COV baissent : revoir la cotation des aspects de peinture.'])
            ->assertOk()->assertJsonPath('data.aspects_flagged', 1)->assertJsonPath('data.obligation.analysis_status', 'analyzed');

        $this->assertTrue(EnvironmentalAspect::find($aspect->id)->needs_reassessment);
        $this->assertStringContainsString('Nouvelle obligation', EnvironmentalAspect::find($aspect->id)->reassessment_reason);
    }

    public function test_an_agreement_with_a_regulator_becomes_a_tracked_obligation(): void
    {
        $parent = $this->create(['source_type' => 'permit', 'authority' => 'Direction de l\'environnement']);
        $this->actingAs($this->adminA, 'sanctum');

        $response = $this->postJson("/api/v1/compliance-obligations/{$parent}/agreement-plan", [
            'title' => 'Plan de mise en conformité des rejets', 'actions' => [
                ['title' => 'Installer un bassin de rétention', 'due_date' => now()->addMonths(3)->toDateString()],
                ['title' => 'Mesurer les rejets chaque mois'],
            ],
        ])->assertCreated();

        $child = ComplianceObligationText::query()->with('actions')->findOrFail($response->json('data.id'));
        $this->assertSame('agreement', $child->source_type);
        $this->assertSame($parent, $child->agreement_parent_id);
        $this->assertTrue($child->is_applicable);
        $this->assertCount(2, $child->actions);
        $this->assertSame('Direction de l\'environnement', $child->authority);
        $this->actingAs($this->adminB, 'sanctum')->postJson("/api/v1/compliance-obligations/{$parent}/agreement-plan", ['title' => 'x', 'actions' => [['title' => 'y']]])->assertNotFound();
    }

    // ------------------------------------------------------------ échéances et tableau de bord

    public function test_expirations_are_bucketed_and_alerts_fire_only_at_the_milestones(): void
    {
        Notification::fake();
        $responsible = $this->adminA;
        foreach ([90, 30, 7, 45, -3] as $offset) {
            $this->create(['source_type' => 'licence', 'title' => "Licence J{$offset}", 'expiry_date' => now()->addDays($offset)->toDateString(), 'responsible_id' => $responsible->id]);
        }
        $this->actingAs($this->adminA, 'sanctum');

        $rows = collect($this->getJson('/api/v1/compliance-obligations/expirations')->assertOk()->json('data'))->keyBy('title');
        $this->assertSame('expired', $rows['Licence J-3']['bucket']);
        $this->assertSame('d7', $rows['Licence J7']['bucket']);
        $this->assertSame('d30', $rows['Licence J30']['bucket']);
        $this->assertSame('d90', $rows['Licence J45']['bucket']);
        $this->assertSame('d90', $rows['Licence J90']['bucket']);

        $this->artisan(CheckComplianceExpirations::class)->assertSuccessful();
        Notification::assertSentToTimes($responsible, SiteEventNotification::class, 3);
        Notification::assertSentTo($responsible, SiteEventNotification::class, fn ($n) => $n->type === 'compliance_expiry' && $n->data['days_left'] === 30);
    }

    public function test_the_dashboard_summarises_compliance_per_site_and_domain(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $compliant = $this->create(['aspect_name' => 'Déchets']);
        $failing = $this->create(['aspect_name' => 'Eau']);
        $untouched = $this->create(['aspect_name' => 'Eau', 'regulatory_reference' => 'Autre']);
        $excluded = $this->create(['aspect_name' => 'Bruit']);
        $unqualified = $this->create(['aspect_name' => 'Air']);

        foreach ([$compliant, $failing, $untouched] as $id) {
            $this->qualify($id);
        }
        $this->qualify($excluded, false);
        $this->postJson("/api/v1/compliance-obligations/{$compliant}/evaluations", ['result' => 'compliant', 'evidence' => 'Preuve'])->assertCreated();
        $this->postJson("/api/v1/compliance-obligations/{$failing}/evaluations", ['result' => 'non_compliant'])->assertCreated();

        $data = $this->getJson('/api/v1/compliance-obligations/dashboard')->assertOk()->json('data');
        $this->assertSame(5, $data['total']);
        $this->assertSame(3, $data['applicable']);
        $this->assertSame(1, $data['not_applicable']);
        $this->assertSame(1, $data['to_qualify']);
        $this->assertSame(2, $data['evaluated']);
        $this->assertSame(50, $data['compliance_rate']);
        $this->assertSame([$untouched], collect($data['never_evaluated'])->pluck('id')->all());
        $eau = collect($data['by_domain'])->firstWhere('name', 'Eau');
        $this->assertSame(2, $eau['total']);
        $this->assertSame(1, $eau['non_compliant']);
        $this->assertNotContains($unqualified, collect($data['never_evaluated'])->pluck('id')->all());
    }

    public function test_themes_are_scoped_to_the_enterprise_and_sites_are_checked(): void
    {
        $this->actingAs($this->adminA, 'sanctum');
        $theme = $this->postJson('/api/v1/compliance-obligation-aspects', ['name' => 'Déchets'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/compliance-obligation-aspects', ['name' => 'Eau', 'site_id' => $this->siteB->id])->assertForbidden();

        $this->actingAs($this->adminB, 'sanctum');
        $this->getJson('/api/v1/compliance-obligation-aspects')->assertOk()->assertJsonCount(0, 'data');
        $this->putJson("/api/v1/compliance-obligation-aspects/{$theme}", ['name' => 'Piraté'])->assertNotFound();
    }

    public function test_the_legacy_command_copies_old_registers_once_without_deleting_them(): void
    {
        DB::table('obligations_conformite_environnementales')->insert([
            'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id, 'type' => 'reglementaire', 'reference' => 'REF-1',
            'titre' => 'Rejets atmosphériques', 'statut_conformite' => 'non_conforme', 'periodicite_controle' => 'trimestriel',
            'date_prochain_controle' => '2026-12-01', 'autorite_competente' => 'Ministère', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('compliance_requirements')->insert([
            'enterprise_id' => $this->enterpriseB->id, 'site_id' => $this->siteB->id, 'requirement_type' => 'permis', 'title' => 'Permis de rejet',
            'compliance_status' => 'compliant', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->artisan('compliance:migrate-legacy', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame(0, ComplianceObligationText::withoutGlobalScopes()->count());

        $this->artisan('compliance:migrate-legacy')->assertSuccessful();
        $this->artisan('compliance:migrate-legacy')->assertSuccessful();

        $this->assertSame(2, ComplianceObligationText::withoutGlobalScopes()->count());
        $this->assertDatabaseHas('compliance_obligation_texts', [
            'legacy_table' => 'obligations_conformite_environnementales', 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $this->siteA->id,
            'title' => 'Rejets atmosphériques', 'compliance_status' => 'non_compliant', 'evaluation_frequency' => 'quarterly', 'source_type' => 'law',
            'authority' => 'Ministère',
        ]);
        $this->assertDatabaseHas('compliance_obligation_texts', ['legacy_table' => 'compliance_requirements', 'enterprise_id' => $this->enterpriseB->id, 'source_type' => 'permit']);
        $this->assertNull(ComplianceObligationText::withoutGlobalScopes()->where('legacy_table', 'compliance_requirements')->first()->is_applicable);
        $this->assertSame(1, DB::table('obligations_conformite_environnementales')->count());

        $this->actingAs($this->adminA, 'sanctum')->getJson('/api/v1/compliance-obligations')->assertOk()->assertJsonPath('meta.total', 1);
    }
}
