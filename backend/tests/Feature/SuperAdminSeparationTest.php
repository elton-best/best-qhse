<?php

namespace Tests\Feature;

use App\Models\Enterprise;
use App\Models\SecurityAuditLog;
use App\Models\Site;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Le super administrateur pilote la plateforme ; il n'a pas l'interface ni l'accès d'une entreprise.
 */
class SuperAdminSeparationTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $companyAdmin;

    private Enterprise $enterpriseA;

    private Enterprise $enterpriseB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            \App\Http\Middleware\EnsureMfaStepUp::class,
            \App\Http\Middleware\CheckSubscriptionStatus::class,
            \App\Http\Middleware\ForceCompanySetup::class,
            \App\Http\Middleware\ForceSignatureUpload::class,
            \App\Http\Middleware\EnsureEnterpriseOwnership::class,
        ]);

        foreach (['dashboard.read', 'enterprises.read', 'security_audit.read'] as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web'])
            ->syncPermissions(['dashboard.read', 'enterprises.read', 'security_audit.read']);
        Role::firstOrCreate(['name' => 'admin_entreprise', 'guard_name' => 'web'])->syncPermissions(['security_audit.read']);

        $this->enterpriseA = Enterprise::factory()->create();
        $this->enterpriseB = Enterprise::factory()->create();
        $siteA = Site::factory()->create(['enterprise_id' => $this->enterpriseA->id]);

        $this->superAdmin = User::factory()->create(['user_type' => 'super_admin', 'enterprise_id' => null, 'site_id' => null, 'is_active' => true, 'must_change_password' => false]);
        $this->superAdmin->assignRole('super_admin');
        $this->companyAdmin = User::factory()->create(['user_type' => 'company', 'enterprise_id' => $this->enterpriseA->id, 'site_id' => $siteA->id, 'is_active' => true]);
        $this->companyAdmin->assignRole('admin_entreprise');

        foreach ([[$this->enterpriseA, 'login_success'], [$this->enterpriseB, 'login_failed']] as [$enterprise, $action]) {
            SecurityAuditLog::create([
                'enterprise_id' => $enterprise->id, 'event_type' => 'authentication', 'action' => $action,
                'ip_address' => '127.0.0.1', 'risk_level' => 'low', 'status' => 'logged',
            ]);
        }
    }

    public function test_super_admin_reads_the_platform_wide_security_log_and_can_filter_by_enterprise(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum');

        $this->getJson('/api/v1/superadmin/audit-logs')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/v1/superadmin/audit-logs?enterprise_id=' . $this->enterpriseB->id)
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.action', 'login_failed');
        $this->getJson('/api/v1/superadmin/audit-logs/stats')->assertOk()->assertJsonPath('total_events', 2);
    }

    public function test_a_company_administrator_cannot_use_the_platform_administration(): void
    {
        $this->actingAs($this->companyAdmin, 'sanctum');

        foreach (['audit-logs', 'audit-logs/stats', 'stats', 'enterprises', 'norms', 'offers', 'subscriptions', 'users', 'settings', 'sessions'] as $path) {
            $this->getJson("/api/v1/superadmin/{$path}")->assertForbidden();
        }
        $this->postJson('/api/v1/superadmin/enterprises/' . $this->enterpriseB->id . '/approve')->assertForbidden();
    }

    public function test_the_company_security_log_stays_limited_to_the_users_enterprise(): void
    {
        $this->actingAs($this->companyAdmin, 'sanctum')
            ->getJson('/api/v1/security-audit-logs')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/security-audit-logs?enterprise_id=' . $this->enterpriseB->id)->assertForbidden();
    }

    public function test_the_server_password_policy_requires_upper_lower_and_digit(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum');

        foreach (['abcdefgh1', 'ABCDEFGH1', 'Abcdefgh', 'Ab1defg'] as $weak) {
            $this->putJson('/api/v1/auth/profile', ['password' => $weak, 'password_confirmation' => $weak])
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        $this->putJson('/api/v1/auth/profile', ['password' => 'Motdepasse2026', 'password_confirmation' => 'Motdepasse2026'])->assertOk();
    }

    public function test_a_first_login_password_must_be_replaced_before_any_platform_action(): void
    {
        $this->superAdmin->forceFill(['must_change_password' => true, 'password' => Hash::make('Initial#2026pw')])->save();
        $this->actingAs($this->superAdmin, 'sanctum');

        $this->getJson('/api/v1/superadmin/stats')->assertStatus(423)->assertJsonPath('code', 'PASSWORD_CHANGE_REQUIRED');

        $this->putJson('/api/v1/auth/profile', ['password' => 'Nouveau#Motdepasse2026', 'password_confirmation' => 'autre'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertTrue((bool) $this->superAdmin->fresh()->must_change_password);

        $this->putJson('/api/v1/auth/profile', ['password' => 'Nouveau#Motdepasse2026', 'password_confirmation' => 'Nouveau#Motdepasse2026'])->assertOk();
        $this->assertFalse((bool) $this->superAdmin->fresh()->must_change_password);
        $this->getJson('/api/v1/superadmin/stats')->assertOk();
    }
}
