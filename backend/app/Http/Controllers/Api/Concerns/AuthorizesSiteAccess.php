<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Modules\Enterprise\Models\Site;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

trait AuthorizesSiteAccess
{
    protected function scopeToUserSites(Request $request, Builder $query): void
    {
        $user = $request->user();
        abort_unless($user, 401);

        if ($request->filled('site_id')) {
            $this->assertSiteAccess($request, (int) $request->input('site_id'));
            return;
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        if ($user->isEnterpriseAdmin()) {
            $query->whereHas('site', fn ($sites) => $sites->where('enterprise_id', $user->enterprise_id));
            return;
        }

        if (!$user->site_id) {
            $query->whereRaw('1 = 0');
            return;
        }

        $query->where('site_id', $user->site_id);
    }

    protected function assertSiteAccess(Request $request, int $siteId): Site
    {
        $user = $request->user();
        abort_unless($user, 401);

        $site = Site::query()->findOrFail($siteId);
        if ($user->isSuperAdmin()) {
            return $site;
        }

        if ($user->isEnterpriseAdmin()) {
            abort_unless(
                (int) $site->enterprise_id === (int) $user->enterprise_id,
                403,
                'Accès refusé : le site appartient à une autre entreprise.',
            );

            return $site;
        }

        abort_unless(
            (int) $site->id === (int) $user->site_id,
            403,
            'Accès refusé : le site appartient à un autre utilisateur.',
        );

        return $site;
    }
}
