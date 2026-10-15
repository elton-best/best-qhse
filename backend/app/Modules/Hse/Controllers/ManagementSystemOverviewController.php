<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\Site;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pilotage d'un système de management intégré : briques communes (comptées une seule fois)
 * et indicateurs propres à chaque norme, sur le périmètre de l'utilisateur.
 */
class ManagementSystemOverviewController extends Controller
{
    private const CLOSED = ['closed', 'completed', 'verified', 'cancelled', 'archived', 'done', 'clos', 'cloture', 'cloturee', 'terminee'];

    public function overview(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null, 401);
        abort_unless($user->isSuperAdmin() || $user->enterprise_id, 403, "Aucune entreprise n'est associée à votre compte.");

        $siteIds = $this->accessibleSiteIds($request);
        $count = fn (string $table, ?callable $where = null): int => $this->count($table, $siteIds, $where);
        $open = fn ($query) => $query->whereNotIn('status', self::CLOSED);

        return response()->json(['success' => true, 'data' => [
            'sites' => $siteIds,
            'common' => [
                'processes' => $count('processes'),
                'risks' => $count('risks'),
                'objectives' => $count('objectives'),
                'actions_open' => $count('actions', $open),
                'audits' => $count('audits'),
                'non_conformities_open' => $count('non_conformities', $open),
                'documents' => $count('documents'),
                'management_reviews' => $count('management_reviews'),
            ],
            'norms' => [
                'ISO 14001' => [
                    'aes_total' => $count('environmental_aspects', fn ($q) => $q->where('status', '!=', 'archived')),
                    'aes_significant' => $count('environmental_aspects', fn ($q) => $q->where('status', '!=', 'archived')->where('is_significant', true)),
                    'aes_to_reassess' => $count('environmental_aspects', fn ($q) => $q->where('needs_reassessment', true)->where('status', '!=', 'archived')),
                    'emergency_procedures' => $count('emergency_procedures'),
                    'obligations_non_compliant' => $count('obligations_conformite_environnementales', fn ($q) => $q->where('statut_conformite', 'non_conforme')),
                ],
                'ISO 50001' => [
                    'ipe' => $count('ipe'),
                    'objectives_open' => $count('energy_objectives', fn ($q) => $q->whereNotIn('status', ['achieved', 'missed', 'cancelled'])),
                    'monitoring_action_required' => $count('energy_monitoring_records', fn ($q) => $q->where('status', 'action_required')),
                    'compliance_non_compliant' => $count('energy_compliance_evaluations', fn ($q) => $q->where('result', 'non_compliant')),
                ],
                'ISO 45001' => [
                    'duerp' => $count('duerp'),
                ],
            ],
        ]]);
    }

    /**
     * @return array<int, int>
     */
    private function accessibleSiteIds(Request $request): array
    {
        $user = $request->user();
        $query = Site::query()->when(! $user->isSuperAdmin(), fn ($q) => $q->where('enterprise_id', $user->enterprise_id));
        if (! $user->isSuperAdmin() && ! $user->isEnterpriseAdmin() && $user->site_id) {
            $query->where('id', $user->site_id);
        }
        if ($request->filled('site_id')) {
            $query->where('id', $request->integer('site_id'));
        }

        return $query->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * @param  array<int, int>  $siteIds
     */
    private function count(string $table, array $siteIds, ?callable $where = null): int
    {
        if ($siteIds === [] || ! Schema::hasTable($table)) {
            return 0;
        }

        $query = DB::table($table)->whereIn('site_id', $siteIds);
        if (Schema::hasColumn($table, 'deleted_at')) {
            $query->whereNull('deleted_at');
        }
        if ($where) {
            $where($query);
        }

        return $query->count();
    }
}
