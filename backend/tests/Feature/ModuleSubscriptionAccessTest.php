<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\EnterpriseSubscription;
use App\Models\Norm;
use App\Models\Offer;
use App\Models\Site;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Les modules ISO 14001 / ISO 50001 ne sont accessibles que si l'offre et les normes choisies
 * du site les incluent (contrôle côté serveur, indépendant du menu).
 */
class ModuleSubscriptionAccessTest extends TestCase
{
    use RefreshDatabase;

    private const PERMISSIONS = [
        'planification.aspects_environnementaux.read', 'planification.situation_energetique_reference.read',
        'planification.ipe.read', 'energie.ipe.read', 'environnement.urgences.read', 'environnement.obligations.read',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class,
        ]);

        foreach (self::PERMISSIONS as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions(self::PERMISSIONS);

        $moduleId = DB::table('modules')->insertGetId([
            'name' => 'Planification', 'code' => 'planification', 'iso_point' => '6', 'is_common' => false,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (['aspects_environnementaux', 'situation_energetique_reference', 'ipe', 'urgences_environnementales', 'preparation_reponse_urgences_sst', 'obligations_conformite'] as $code) {
            DB::table('sub_modules')->insert([
                'module_id' => $moduleId, 'name' => $code, 'code' => $code, 'is_common' => $code === 'obligations_conformite',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    /**
     * Catalogue réel : chaque sous-module est lié à sa norme (sinon il serait traité comme commun).
     */
    private function catalogNorm(string $code): Norm
    {
        return Norm::query()->where('code', $code)->first() ?? tap(Norm::factory()->create(['code' => $code, 'name' => $code, 'status' => 'published']), function (Norm $norm) {
            $links = ['ISO-14001' => ['aspects_environnementaux', 'urgences_environnementales'], 'ISO-45001' => ['preparation_reponse_urgences_sst'], 'ISO-50001' => ['situation_energetique_reference', 'ipe']][$norm->code] ?? [];
            foreach ($links as $subModule) {
                DB::table('norm_sub_module')->insert([
                    'norm_id' => $norm->id, 'sub_module_id' => DB::table('sub_modules')->where('code', $subModule)->value('id'),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            DB::table('norm_module')->insert([
                'norm_id' => $norm->id, 'module_id' => DB::table('modules')->value('id'), 'created_at' => now(), 'updated_at' => now(),
            ]);
        });
    }

    /**
     * @param  array<int, string>  $normCodes
     */
    private function enterpriseWithNorms(array $normCodes): User
    {
        $enterprise = Enterprise::factory()->create();
        $site = Site::factory()->create(['enterprise_id' => $enterprise->id, 'is_headquarter' => true]);
        $offer = Offer::factory()->create();
        foreach ($normCodes as $code) {
            $offer->norms()->attach($this->catalogNorm($code)->id);
        }
        EnterpriseSubscription::factory()->create([
            'offer_id' => $offer->id, 'site_id' => $site->id, 'is_active' => true, 'is_trial' => false,
            'start_date' => now()->subDay(), 'expiration_date' => now()->addMonth(), 'status' => 'active',
        ]);

        $user = User::factory()->create([
            'enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true,
        ]);
        $user->assignRole('admin_entreprise');

        return $user;
    }

    public function test_environment_modules_follow_the_chosen_norm(): void
    {
        $environment = $this->enterpriseWithNorms(['ISO-14001']);
        $quality = $this->enterpriseWithNorms(['ISO-9001']);

        $this->actingAs($environment, 'sanctum')->getJson('/api/v1/environmental-aspects')->assertOk();

        $this->actingAs($quality, 'sanctum')->getJson('/api/v1/environmental-aspects')
            ->assertForbidden()
            ->assertJsonPath('code', 'MODULE_NOT_IN_OFFER')
            ->assertJsonPath('module', 'aspects_environnementaux');
    }

    public function test_energy_modules_are_closed_without_the_energy_norm(): void
    {
        $energy = $this->enterpriseWithNorms(['ISO-50001']);
        $environment = $this->enterpriseWithNorms(['ISO-14001']);

        $this->actingAs($energy, 'sanctum');
        $this->getJson('/api/v1/energy-baselines')->assertOk();
        $this->getJson('/api/v1/ipe')->assertOk();
        $this->getJson('/api/v1/environmental-aspects')->assertForbidden();

        $this->actingAs($environment, 'sanctum');
        $this->getJson('/api/v1/energy-baselines')->assertForbidden()->assertJsonPath('code', 'MODULE_NOT_IN_OFFER');
        $this->postJson('/api/v1/energy-baselines', ['title' => 'x'])->assertForbidden();
        $this->getJson('/api/v1/ipe')->assertForbidden();
    }

    public function test_an_integrated_offer_opens_the_modules_of_every_chosen_norm(): void
    {
        $integrated = $this->enterpriseWithNorms(['ISO-14001', 'ISO-50001']);
        $this->actingAs($integrated, 'sanctum');
        $this->getJson('/api/v1/environmental-aspects')->assertOk();
        $this->getJson('/api/v1/ipe')->assertOk();
        $this->getJson('/api/v1/energy-baselines')->assertOk();
    }

    public function test_an_expired_subscription_closes_the_modules(): void
    {
        $user = $this->enterpriseWithNorms(['ISO-14001']);
        $user->site->getActiveSubscriptions()->each->update(['expiration_date' => now()->subDay(), 'status' => 'expired', 'is_active' => false]);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/environmental-aspects')->assertForbidden();
    }

    public function test_site_scope_cannot_be_used_to_borrow_another_enterprises_subscription(): void
    {
        $with = $this->enterpriseWithNorms(['ISO-14001']);
        $without = $this->enterpriseWithNorms(['ISO-9001']);

        $this->actingAs($without, 'sanctum')
            ->getJson('/api/v1/environmental-aspects?site_id='.$with->site_id)
            ->assertForbidden();
    }

    public function test_emergency_modules_open_with_either_the_environment_or_the_ohs_norm(): void
    {
        $this->actingAs($this->enterpriseWithNorms(['ISO-14001']), 'sanctum')->getJson('/api/v1/emergency-procedures')->assertOk();
        $this->actingAs($this->enterpriseWithNorms(['ISO-45001']), 'sanctum')->getJson('/api/v1/emergency-procedures')->assertOk();
        $this->actingAs($this->enterpriseWithNorms(['ISO-9001']), 'sanctum')->getJson('/api/v1/emergency-procedures')
            ->assertForbidden()->assertJsonPath('code', 'MODULE_NOT_IN_OFFER')
            ->assertJsonPath('module', 'urgences_environnementales|preparation_reponse_urgences_sst');
    }

    public function test_the_compliance_register_is_common_to_every_norm(): void
    {
        foreach (['ISO-9001', 'ISO-14001', 'ISO-50001'] as $norm) {
            $this->actingAs($this->enterpriseWithNorms([$norm]), 'sanctum')->getJson('/api/v1/compliance-obligations')->assertOk();
        }
    }
}
