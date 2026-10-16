<?php

namespace App\Modules\Evaluation\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Evaluation\Models\Audit;
use App\Modules\Evaluation\Models\AuditFinding;
use App\Modules\Evaluation\Services\AuditEnvironmentalService;
use App\Modules\Evaluation\Services\AuditIndependenceService;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Appui à la préparation et à la conduite des audits internes (ISO 14001:2026 §9.2, ISO 19011) :
 * propositions de programme, choix d'auditeurs indépendants, articles de la norme, preuves de terrain.
 */
class AuditFieldworkController extends Controller
{
    use ScopesToUserTenant;

    private const EVIDENCE_DISK = 'local';

    /**
     * Sujets d'audit proposés pour le programme d'un site (M15-01).
     */
    public function proposals(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['site_id' => 'nullable|integer', 'year' => 'nullable|integer|min:2020|max:2100']);
        $site = $this->resolveSite($request, $data['site_id'] ?? null);

        return response()->json(['data' => app(AuditEnvironmentalService::class)->proposals((int) $site->enterprise_id, (int) $site->id, (int) ($data['year'] ?? date('Y')))]);
    }

    /**
     * Articles de la norme pour lesquels une liste de contrôle peut être générée (M15-04).
     */
    public function clauses(): JsonResponse
    {
        return response()->json(['data' => collect(AuditEnvironmentalService::CLAUSES)->map(fn (array $questions, string $clause) => ['clause' => $clause, 'questions' => count($questions)])->values()]);
    }

    /**
     * Auditeurs possibles : qualifiés d'après la matrice de compétences (avertissement) et sans conflit d'intérêt (blocage) (M15-03).
     */
    public function eligibleAuditors(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate([
            'site_id' => 'nullable|integer', 'process_ids' => 'nullable|array', 'process_ids.*' => 'integer', 'auditee_ids' => 'nullable|array', 'auditee_ids.*' => 'integer',
        ]);
        $site = $this->resolveSite($request, $data['site_id'] ?? null);
        $enterpriseId = (int) $site->enterprise_id;

        $qualified = DB::table('competences_acquises as ca')->join('competences_requises as cr', 'cr.id', '=', 'ca.competence_requise_id')
            ->where('ca.enterprise_id', $enterpriseId)->whereIn('ca.status', ['active', 'pending_renewal'])->where('cr.competence_name', 'ilike', '%audit%')
            ->where(fn ($q) => $q->whereNull('ca.expiry_date')->orWhere('ca.expiry_date', '>=', today()))
            ->pluck('ca.user_id')->map(fn ($id) => (int) $id)->all();

        $independence = app(AuditIndependenceService::class);
        $users = User::query()->where('enterprise_id', $enterpriseId)->where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']);
        $rows = $users->map(function (User $user) use ($data, $qualified, $independence) {
            $conflicts = $independence->conflicts($user->id, [], $data['auditee_ids'] ?? [], $data['process_ids'] ?? []);

            return [
                'id' => $user->id, 'name' => $user->name, 'qualified' => in_array($user->id, $qualified, true),
                'independent' => $conflicts === [], 'conflicts' => array_column($conflicts, 'reason'),
            ];
        });

        return response()->json(['data' => $rows->sortBy([['independent', 'desc'], ['qualified', 'desc'], ['name', 'asc']])->values()]);
    }

    /**
     * Contrôle d'indépendance avant l'enregistrement du plan d'audit.
     */
    public function checkIndependence(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate([
            'lead_auditor_id' => 'required|integer', 'auditor_ids' => 'nullable|array', 'auditor_ids.*' => 'integer',
            'auditee_ids' => 'nullable|array', 'auditee_ids.*' => 'integer', 'process_ids' => 'nullable|array', 'process_ids.*' => 'integer',
        ]);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $ids = array_merge([$data['lead_auditor_id']], $data['auditor_ids'] ?? [], $data['auditee_ids'] ?? []);
        abort_if(User::query()->whereIn('id', $ids)->where('enterprise_id', $enterpriseId)->count() !== count(array_unique($ids)), 422, 'Utilisateur introuvable pour votre entreprise.');

        $conflicts = app(AuditIndependenceService::class)->conflicts($data['lead_auditor_id'], $data['auditor_ids'] ?? [], $data['auditee_ids'] ?? [], $data['process_ids'] ?? []);

        return response()->json(['data' => ['independent' => $conflicts === [], 'conflicts' => $conflicts]]);
    }

    /**
     * Preuve de terrain (photo, document, notes d'entretien) jointe à un constat (M15-05).
     */
    public function addEvidence(Request $request, int $auditId, int $findingId): JsonResponse
    {
        $this->assertTenant($request);
        $audit = Audit::query()->findOrFail($auditId);
        abort_if(in_array($audit->status, ['completed', 'cancelled'], true), 422, 'Cet audit est clôturé : les preuves ne se modifient plus.');
        $finding = AuditFinding::query()->where('audit_id', $audit->id)->findOrFail($findingId);
        $request->validate(['file' => 'required|file|mimes:jpg,jpeg,png,pdf,docx,txt|max:8192', 'label' => 'nullable|string|max:255']);

        $file = $request->file('file');
        $path = $file->store("audit-evidence/{$audit->id}", self::EVIDENCE_DISK);
        $attachments = $finding->attachments ?? [];
        $attachments[] = ['path' => $path, 'name' => $file->getClientOriginalName(), 'label' => $request->input('label'), 'at' => now()->toIso8601String(), 'by' => $request->user()->id];
        $finding->update(['attachments' => $attachments]);

        return response()->json(['data' => ['count' => count($attachments)]], 201);
    }

    public function evidence(Request $request, int $auditId, int $findingId, int $index): StreamedResponse
    {
        $this->assertTenant($request);
        $audit = Audit::query()->findOrFail($auditId);
        $finding = AuditFinding::query()->where('audit_id', $audit->id)->findOrFail($findingId);
        $item = ($finding->attachments ?? [])[$index] ?? null;
        abort_unless($item && Storage::disk(self::EVIDENCE_DISK)->exists($item['path']), 404, 'Preuve introuvable.');

        return Storage::disk(self::EVIDENCE_DISK)->download($item['path'], $item['name']);
    }
}
