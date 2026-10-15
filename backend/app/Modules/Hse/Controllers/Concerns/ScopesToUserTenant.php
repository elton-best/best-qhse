<?php

namespace App\Modules\Hse\Controllers\Concerns;

use App\Modules\Enterprise\Models\Site;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Règles de périmètre communes : l'entreprise et le site viennent de l'utilisateur
 * authentifié, jamais du seul identifiant envoyé par le navigateur.
 */
trait ScopesToUserTenant
{
    /**
     * Refuse tout appel sans périmètre d'entreprise (hors super administrateur).
     */
    protected function assertTenant(Request $request): void
    {
        $user = $request->user();
        abort_unless($user !== null, 401);
        if (! $user->isSuperAdmin()) {
            abort_unless($user->enterprise_id, 403, "Aucune entreprise n'est associée à votre compte.");
        }
    }

    /**
     * Site de rattachement : toujours un site de l'entreprise de l'utilisateur ;
     * un utilisateur rattaché à un site (non administrateur) est limité à ce site.
     */
    protected function resolveSite(Request $request, ?int $requestedSiteId): Site
    {
        $user = $request->user();
        $siteId = $requestedSiteId ?? $user->site_id;
        if (empty($siteId)) {
            abort(response()->json([
                'message' => 'Le site est obligatoire.',
                'errors' => ['site_id' => ['Le site est obligatoire.']],
            ], 422));
        }

        $query = Site::query()->whereKey($siteId);
        if (! $user->isSuperAdmin()) {
            $query->where('enterprise_id', $user->enterprise_id);
            if (! $user->isEnterpriseAdmin() && $user->site_id) {
                $query->where('id', $user->site_id);
            }
        }

        $site = $query->first();
        abort_unless($site, 403, 'Site non autorisé pour votre compte.');

        return $site;
    }

    /**
     * Vérifie que des identifiants (utilisateur, processus…) appartiennent à l'entreprise.
     *
     * @param  array<string, array{table: string, column: string}>  $targets  champ => cible
     * @param  array<string, mixed>  $data
     */
    protected function assertOwnedByEnterprise(array $targets, array $data, int $enterpriseId): void
    {
        $errors = [];
        foreach ($targets as $field => $target) {
            if (empty($data[$field])) {
                continue;
            }
            $owned = DB::table($target['table'])
                ->where('id', $data[$field])
                ->where($target['column'], $enterpriseId)
                ->exists();
            if (! $owned) {
                $errors[$field] = ['La valeur sélectionnée est introuvable pour votre entreprise.'];
            }
        }

        if ($errors !== []) {
            abort(response()->json(['message' => 'Référence invalide.', 'errors' => $errors], 422));
        }
    }
}
