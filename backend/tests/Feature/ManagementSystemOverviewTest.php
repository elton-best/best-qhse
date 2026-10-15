<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckSubscriptionStatus;
use App\Http\Middleware\EnsureEnterpriseOwnership;
use App\Http\Middleware\ForceCompanySetup;
use App\Http\Middleware\ForcePasswordChange;
use App\Http\Middleware\ForceSignatureUpload;
use App\Models\Enterprise;
use App\Models\Site;
use App\Models\User;
use App\Modules\Hse\Models\EnvironmentalAspect;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ManagementSystemOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware([
            CheckSubscriptionStatus::class, ForceCompanySetup::class, ForcePasswordChange::class,
            ForceSignatureUpload::class, EnsureEnterpriseOwnership::class,
        ]);
    }

    private function userFor(Enterprise $enterprise, Site $site): User
    {
        return User::factory()->create([
            'enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'user_type' => 'company', 'is_active' => true,
        ]);
    }

    public function test_overview_counts_only_the_users_enterprise_and_separates_norm_specific_figures(): void
    {
        $a = Enterprise::factory()->create();
        $b = Enterprise::factory()->create();
        $siteA = Site::factory()->create(['enterprise_id' => $a->id]);
        $siteB = Site::factory()->create(['enterprise_id' => $b->id]);

        foreach ([[$a, $siteA, 5], [$a, $siteA, 1], [$b, $siteB, 7]] as [$enterprise, $site, $gravity]) {
            EnvironmentalAspect::create([
                'enterprise_id' => $enterprise->id, 'site_id' => $site->id, 'activity' => 'x', 'aspect' => 'y', 'impact' => 'z',
                'gravity' => $gravity, 'frequency' => 7, 'sensitivity' => 7, 'mastery' => 5, 'status' => 'validated',
            ]);
        }

        $data = $this->actingAs($this->userFor($a, $siteA), 'sanctum')
            ->getJson('/api/v1/management-system/overview')->assertOk()->json('data');

        $this->assertSame([$siteA->id], $data['sites']);
        $this->assertSame(2, $data['norms']['ISO 14001']['aes_total']);
        $this->assertSame(1, $data['norms']['ISO 14001']['aes_significant']);
        $this->assertSame(0, $data['norms']['ISO 50001']['ipe']);
        $this->assertArrayHasKey('processes', $data['common']);

        $other = $this->actingAs($this->userFor($b, $siteB), 'sanctum')
            ->getJson('/api/v1/management-system/overview')->json('data');
        $this->assertSame(1, $other['norms']['ISO 14001']['aes_total']);
    }

    public function test_site_filter_cannot_reach_a_site_of_another_enterprise(): void
    {
        $a = Enterprise::factory()->create();
        $b = Enterprise::factory()->create();
        $siteA = Site::factory()->create(['enterprise_id' => $a->id]);
        $siteB = Site::factory()->create(['enterprise_id' => $b->id]);

        $data = $this->actingAs($this->userFor($a, $siteA), 'sanctum')
            ->getJson('/api/v1/management-system/overview?site_id=' . $siteB->id)->assertOk()->json('data');

        $this->assertSame([], $data['sites']);
        $this->assertSame(0, $data['norms']['ISO 14001']['aes_total']);
    }
}
