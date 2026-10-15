<?php

namespace App\Http\Middleware;

use App\Models\SubModule;
use App\Services\Context\SiteContextService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Réserve une route aux organismes dont l'abonnement actif (offre → normes → sous-modules)
 * inclut le sous-module demandé. Les droits de l'utilisateur restent contrôlés par les
 * permissions de la route ; ce middleware ne traite que l'offre et les normes choisies.
 */
class EnsureSubModuleSubscribed
{
    public function __construct(private readonly SiteContextService $siteContext) {}

    public function handle(Request $request, Closure $next, string $subModuleCode): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Non authentifié.'], 401);
        }
        if ($user->isSuperAdmin()) {
            return $next($request);
        }

        $site = $this->siteContext->resolveForRequest($request);
        if (! $site) {
            return response()->json(['success' => false, 'code' => 'SITE_NOT_FOUND', 'message' => 'Site introuvable ou non autorisé.'], 403);
        }

        $subModule = SubModule::query()->where('code', $subModuleCode)->first();
        $subscriptions = $site->getActiveSubscriptions();
        $included = $subModule && $subscriptions->contains(fn ($subscription) => $subscription->canAccessSubModule($subModule->id));

        if (! $included) {
            return response()->json([
                'success' => false,
                'code' => 'MODULE_NOT_IN_OFFER',
                'message' => "Ce module n'est pas inclus dans votre offre ou dans les normes choisies pour ce site.",
                'module' => $subModuleCode,
            ], 403);
        }

        return $next($request);
    }
}
