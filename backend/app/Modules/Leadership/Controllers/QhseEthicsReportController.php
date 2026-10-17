<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Modules\Leadership\Models\QhseEthicsReport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class QhseEthicsReportController extends Controller
{
    private const CATEGORIES = [
        'ethique',
        'conflit_interets',
        'harcelement',
        'discrimination',
        'fraude',
        'qualite',
        'autre',
    ];

    private const STATUSES = [
        'received',
        'investigating',
        'action_taken',
        'closed',
        'rejected',
    ];

    public function mine(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'data' => QhseEthicsReport::query()
                ->where('enterprise_id', $user->enterprise_id)
                ->where('reporter_user_id', $user->id)
                ->latest()
                ->get()
                ->map(fn (QhseEthicsReport $report) => $this->reporterData($report)),
        ]);
    }

    public function index(Request $request)
    {
        $this->authorizeReportManagement($request);
        $user = $request->user();
        $query = QhseEthicsReport::query()
            ->where('enterprise_id', $user->enterprise_id)
            ->with(['site:id,name', 'reporter:id,name,email', 'handledBy:id,name']);

        if ($request->filled('site_id')) {
            $site = $this->assertSiteAccess($request, (int) $request->input('site_id'));
            $query->where('site_id', $site->id);
        } elseif (!$user->isEnterpriseAdmin() && !$user->isSuperAdmin()) {
            abort_unless($user->site_id, 403);
            $query->where('site_id', $user->site_id);
        }

        return response()->json([
            'data' => $query->latest()->limit(200)->get()->map(fn (QhseEthicsReport $report) => $this->managerData($report)),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        abort_unless($user->enterprise_id, 403, 'Un compte rattaché à une entreprise est requis.');

        $validated = $request->validate([
            'site_id' => [
                'nullable',
                Rule::exists('sites', 'id')->where(fn ($query) => $query->where('enterprise_id', $user->enterprise_id)),
            ],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'subject' => 'required|string|min:5|max:180',
            'description' => 'required|string|min:20|max:10000',
            'incident_date' => 'nullable|date|before_or_equal:today',
            'is_anonymous' => 'required|boolean',
        ]);

        $siteId = (int) ($validated['site_id'] ?? $user->site_id);
        $site = $this->assertSiteAccess($request, $siteId);
        $trackingCode = Str::random(48);
        $isAnonymous = (bool) $validated['is_anonymous'];

        $report = DB::transaction(function () use ($user, $site, $validated, $trackingCode, $isAnonymous) {
            $report = QhseEthicsReport::query()->create([
                'id' => (string) Str::uuid(),
                'enterprise_id' => $user->enterprise_id,
                'site_id' => $site->id,
                'reporter_user_id' => $isAnonymous ? null : $user->id,
                'tracking_token_hash' => hash('sha256', $trackingCode),
                'category' => $validated['category'],
                'subject' => $validated['subject'],
                'description' => $validated['description'],
                'incident_date' => $validated['incident_date'] ?? null,
                'is_anonymous' => $isAnonymous,
                'status' => 'received',
            ]);

            $report->events()->create([
                'actor_user_id' => $isAnonymous ? null : $user->id,
                'event_type' => 'submitted',
                'to_status' => 'received',
                'notes' => null,
            ]);

            return $report;
        });

        return response()->json([
            ...$this->reporterData($report),
            'tracking_code' => $trackingCode,
            'message' => 'Signalement confidentiel enregistré. Conservez le code de suivi : il ne sera affiché qu’une seule fois.',
        ], 201);
    }

    public function track(Request $request)
    {
        $validated = $request->validate([
            'tracking_code' => 'required|string|min:32|max:80',
        ]);
        $report = QhseEthicsReport::query()
            ->where('tracking_token_hash', hash('sha256', $validated['tracking_code']))
            ->firstOrFail();

        return response()->json($this->reporterData($report));
    }

    public function update(Request $request, QhseEthicsReport $qhseEthicsReport)
    {
        $this->authorizeReportManagement($request);
        $this->assertReportSiteAccess($request, $qhseEthicsReport);
        $validated = $request->validate([
            'status' => ['required', Rule::in(self::STATUSES)],
            'handling_notes' => 'required|string|min:10|max:5000',
            'public_update' => 'nullable|string|max:2000',
        ]);

        DB::transaction(function () use ($request, $qhseEthicsReport, $validated): void {
            $report = QhseEthicsReport::query()->whereKey($qhseEthicsReport->id)->lockForUpdate()->firstOrFail();
            $fromStatus = $report->status;
            $report->forceFill([
                'status' => $validated['status'],
                'handling_notes' => $validated['handling_notes'],
                'public_update' => $validated['public_update'] ?? null,
                'handled_by_user_id' => $request->user()->id,
                'handled_at' => now(),
            ])->save();
            $report->events()->create([
                'actor_user_id' => $request->user()->id,
                'event_type' => 'status_updated',
                'from_status' => $fromStatus,
                'to_status' => $report->status,
                'notes' => $validated['handling_notes'],
            ]);
        });

        return response()->json($this->managerData(
            $qhseEthicsReport->fresh()->load(['site:id,name', 'reporter:id,name,email', 'handledBy:id,name'])
        ));
    }

    private function authorizeReportManagement(Request $request): void
    {
        abort_unless($request->user()?->can('leadership.ethics_reports.manage'), 403);
    }

    private function assertSiteAccess(Request $request, int $siteId): Site
    {
        $user = $request->user();
        abort_unless($siteId > 0, 422, 'Le site du signalement est obligatoire.');
        $site = Site::query()->findOrFail($siteId);

        if (!$user->isSuperAdmin()) {
            abort_unless((int) $site->enterprise_id === (int) $user->enterprise_id, 403);
            if (!$user->isEnterpriseAdmin()) {
                abort_unless((int) $site->id === (int) $user->site_id, 403);
            }
        }

        return $site;
    }

    private function assertReportSiteAccess(Request $request, QhseEthicsReport $report): void
    {
        abort_unless((int) $report->enterprise_id === (int) $request->user()->enterprise_id, 404);
        $this->assertSiteAccess($request, (int) $report->site_id);
    }

    private function reporterData(QhseEthicsReport $report): array
    {
        return [
            'id' => $report->id,
            'category' => $report->category,
            'subject' => $report->subject,
            'status' => $report->status,
            'public_update' => $report->public_update,
            'is_anonymous' => (bool) $report->is_anonymous,
            'submitted_at' => $report->created_at?->toISOString(),
            'updated_at' => $report->updated_at?->toISOString(),
        ];
    }

    private function managerData(QhseEthicsReport $report): array
    {
        return [
            ...$this->reporterData($report),
            'site' => $report->site?->name,
            'description' => $report->description,
            'incident_date' => $report->incident_date?->toDateString(),
            'handling_notes' => $report->handling_notes,
            'handled_at' => $report->handled_at?->toISOString(),
            'handled_by' => $report->handledBy?->name,
            'reporter' => $report->is_anonymous ? null : [
                'name' => $report->reporter?->name,
                'email' => $report->reporter?->email,
            ],
        ];
    }
}
