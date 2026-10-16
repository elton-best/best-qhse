<?php

namespace App\Modules\Leadership\Controllers;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\ApplicationScope;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Services\ScopeReviewService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ScopePublicationController extends Controller
{
    use ScopesToUserTenant;

    public function index(Request $request, int $id): JsonResponse
    {
        $scope = $this->scope($request, $id);

        return response()->json(['data' => [
            'publications' => DB::table('scope_publications')->where('application_scope_id', $scope->id)
                ->orderByDesc('id')->get(['id', 'expires_at', 'revoked_at', 'created_at']),
            'review' => $scope->only(['review_frequency_months', 'last_reviewed_at', 'next_review_date', 'review_required_at', 'review_reason']),
            'can_manage' => $this->canManage($request),
        ]]);
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $scope = $this->scope($request, $id, true);
        $data = $request->validate(['expires_at' => 'required|date|after:now|before_or_equal:'.now()->addYear()->toDateTimeString()]);
        abort_if(! trim((string) ($scope->scope_definition ?: $scope->scope)), 422, 'Enregistrez la définition du périmètre avant publication.');
        $token = Str::random(64);
        $snapshot = $scope->only([
            'version', 'scope_definition', 'scope', 'products_services', 'organizational_units', 'locations',
            'scope_exclusions', 'exclusions', 'exclusions_justification', 'applicable_norms',
            'norm_exclusions', 'norm_exclusions_justifications',
        ]);
        $snapshot['processes'] = collect($scope->processes ?? [])->filter(fn ($process) => is_array($process))->map(fn ($process) => ['name' => $process['name'] ?? '', 'type' => $process['type'] ?? ''])->values()->all();
        $snapshot['enterprise_name'] = $scope->site?->enterprise?->name;
        $snapshot['site_name'] = $scope->site?->name;
        $snapshot['published_at'] = now()->toISOString();
        $publicationId = DB::table('scope_publications')->insertGetId([
            'application_scope_id' => $scope->id, 'created_by' => $request->user()->id,
            'token_hash' => hash('sha256', $token), 'snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR),
            'expires_at' => Carbon::parse($data['expires_at'])->utc(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['data' => ['id' => $publicationId, 'path' => '/perimetre-public/'.$token, 'expires_at' => $data['expires_at']]], 201);
    }

    public function revoke(Request $request, int $id, int $publication): JsonResponse
    {
        $scope = $this->scope($request, $id, true);
        $record = DB::table('scope_publications')->where('application_scope_id', $scope->id)->where('id', $publication)->first();
        abort_unless($record, 404);
        DB::table('scope_publications')->where('id', $record->id)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Publication révoquée.']);
    }

    public function publicShow(string $token): JsonResponse
    {
        $publication = DB::table('scope_publications as p')->join('application_scopes as s', 's.id', '=', 'p.application_scope_id')
            ->whereNull('s.deleted_at')->where('p.token_hash', hash('sha256', $token))
            ->whereNull('p.revoked_at')->where('p.expires_at', '>', now())->first(['p.snapshot', 'p.expires_at']);
        abort_unless($publication, 404, 'Ce lien a expiré ou a été révoqué.');

        return response()->json(['data' => json_decode($publication->snapshot, true, 512, JSON_THROW_ON_ERROR) + ['expires_at' => $publication->expires_at]])
            ->header('Cache-Control', 'private, no-store')->header('X-Robots-Tag', 'noindex, nofollow');
    }

    public function review(Request $request, int $id): JsonResponse
    {
        $scope = $this->scope($request, $id, true);
        $data = $request->validate([
            'review_frequency_months' => 'required|integer|between:1,60',
            'action' => 'required|in:configure,complete,request',
            'reason' => 'required_if:action,request,complete|nullable|string|max:2000',
        ]);
        app(ScopeReviewService::class)->updateReview($scope, $data, $request->user()->id);

        return response()->json(['message' => 'Suivi de revue enregistré.']);
    }

    private function scope(Request $request, int $id, bool $manage = false): ApplicationScope
    {
        $this->assertTenant($request);
        $query = ApplicationScope::query();
        $user = $request->user();
        if (! $user->isSuperAdmin()) {
            $query->whereHas('site', function ($sites) use ($user) {
                $sites->where('enterprise_id', $user->enterprise_id);
                if (! $user->isEnterpriseAdmin() && $user->site_id) {
                    $sites->whereKey($user->site_id);
                }
            });
        }
        $scope = $query->findOrFail($id);
        $this->resolveSite($request, (int) $scope->site_id);
        if ($manage) {
            abort_unless($this->canManage($request), 403);
        }

        return $scope;
    }

    private function canManage(Request $request): bool
    {
        return PermissionHelper::isAdmin($request->user()) || PermissionHelper::can($request->user(), 'contexte.domaine_application.update');
    }
}
