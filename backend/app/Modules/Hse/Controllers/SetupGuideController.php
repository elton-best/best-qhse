<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Services\CertificationReadinessService;
use App\Modules\Hse\Services\SetupGuideService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Assistant de démarrage (T-01) et score de préparation à la certification (T-03).
 */
class SetupGuideController extends Controller
{
    use ScopesToUserTenant;

    private function site(Request $request): Site
    {
        $this->assertTenant($request);

        return $this->resolveSite($request, $request->filled('site_id') ? $request->integer('site_id') : null);
    }

    public function status(Request $request): JsonResponse
    {
        $site = $this->site($request);
        $steps = app(SetupGuideService::class)->status((int) $site->enterprise_id, (int) $site->id);
        $done = count(array_filter($steps, fn ($s) => $s['state'] === 'done'));

        return response()->json(['data' => [
            'site' => ['id' => $site->id, 'name' => $site->name], 'steps' => $steps, 'done' => $done, 'total' => count($steps),
            'sectors' => collect(config('setup_templates.sectors'))->map(fn ($s, $key) => ['key' => $key, 'label' => $s['label']])->values(),
        ]]);
    }

    private function assertManager(Request $request): void
    {
        abort_unless($request->user()->isEnterpriseAdmin(), 403, 'Seule la direction ou un responsable peut utiliser l\'assistant.');
    }

    public function apply(Request $request, string $step): JsonResponse
    {
        abort_unless(array_key_exists($step, SetupGuideService::STEPS), 404, 'Étape inconnue.');
        $this->assertManager($request);
        $data = $request->validate(['sector' => 'required|string']);
        $site = $this->site($request);
        $created = app(SetupGuideService::class)->apply($site, $step, $data['sector'], $request->user());

        return response()->json(['data' => ['created' => $created]], 201);
    }

    public function skip(Request $request, string $step): JsonResponse
    {
        abort_unless(array_key_exists($step, SetupGuideService::STEPS), 404, 'Étape inconnue.');
        $this->assertManager($request);
        $data = $request->validate(['skipped' => 'required|boolean']);
        $site = $this->site($request);
        app(SetupGuideService::class)->skip((int) $site->enterprise_id, (int) $site->id, $step, (bool) $data['skipped'], $request->user()->id);

        return response()->json(['data' => ['skipped' => (bool) $data['skipped']]]);
    }

    /**
     * Score de préparation à l'audit de certification, par article de la norme.
     */
    public function readiness(Request $request): JsonResponse
    {
        $site = $this->site($request);

        return response()->json(['data' => ['site' => ['id' => $site->id, 'name' => $site->name]] + app(CertificationReadinessService::class)->compute((int) $site->enterprise_id, (int) $site->id)]);
    }
}
