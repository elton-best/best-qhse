<?php

namespace App\Modules\Improvement\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreActionRequest;
use App\Http\Requests\UpdateActionRequest;
use App\Http\Requests\UpdateActionProgressRequest;
use App\Helpers\PermissionHelper;
use App\Models\Action;
use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use App\Services\ActionService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ActionController extends Controller
{
    public function __construct(protected ActionService $service)
    {
    }

    /**
     * Présente une action pour l'API en évitant les chargements directs des
     * relations `responsible / process / site` du modèle (imports manquants
     * côté modèle) : hydratation manuelle via les alias App\Models\*.
     * Expose les alias attendus par les frontends : `reference` (= ref),
     * `due_date` (= deadline).
     */
    private array $presentCache = ['processes' => [], 'sites' => [], 'users' => []];

    private function presentAction(Action $action): array
    {
        $action->loadMissing(['workflowState', 'planAction']);

        $process = null;
        if ($action->process_id) {
            $pid = (int) $action->process_id;
            if (!array_key_exists($pid, $this->presentCache['processes'])) {
                $found = Process::query()->find($pid, ['id', 'title', 'code']);
                $this->presentCache['processes'][$pid] = $found;
            }
            if ($this->presentCache['processes'][$pid]) {
                $p = $this->presentCache['processes'][$pid];
                $process = ['id' => $p->id, 'title' => $p->title, 'code' => $p->code];
            }
        }

        $site = null;
        if ($action->site_id) {
            $sid = (int) $action->site_id;
            if (!array_key_exists($sid, $this->presentCache['sites'])) {
                $this->presentCache['sites'][$sid] = Site::query()->find($sid, ['id', 'name']);
            }
            if ($this->presentCache['sites'][$sid]) {
                $s = $this->presentCache['sites'][$sid];
                $site = ['id' => $s->id, 'name' => $s->name];
            }
        }

        $responsible = null;
        if ($action->responsible_id) {
            $rid = (int) $action->responsible_id;
            if (!array_key_exists($rid, $this->presentCache['users'])) {
                $this->presentCache['users'][$rid] = User::query()->find($rid, ['id', 'name', 'email']);
            }
            if ($this->presentCache['users'][$rid]) {
                $u = $this->presentCache['users'][$rid];
                $responsible = ['id' => $u->id, 'name' => $u->name, 'email' => $u->email];
            }
        }

        $data = $action->attributesToArray();
        $data['reference'] = $action->ref;
        $data['due_date'] = $action->deadline?->format('Y-m-d');
        $data['process'] = $process;
        $data['site'] = $site;
        $data['responsible'] = $responsible;
        $data['workflow_state'] = $action->workflowState?->only(['id', 'code', 'label', 'color']);
        $data['plan_action'] = $action->planAction?->only(['id', 'ref', 'title']);

        return $data;
    }

    /**
     * Menu "Mes actions" sur le tableau de bord (RT-13 / REQ-8.7-03).
     * Retourne les actions de l'utilisateur connecté triées par échéance
     * avec filtres par statut et métriques récapitulatives.
     *
     * Forme de réponse : `data` contient `stats` (format dashboard :
     * total_assigned/open_count/in_progress_count/overdue_count/due_soon_count/
     * completed_count), `actions`, `by_process` et `pagination`, pour être
     * consommée telle quelle par le frontend React. `counts` (format historique)
     * est conservé pour compatibilité.
     */
    public function myActions(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Utilisateur non authentifié'], 401);
        }

        $query = Action::query()
            ->where('responsible_id', (int) $user->id);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('process_id')) {
            $query->where('process_id', $request->integer('process_id'));
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->string('priority'));
        }

        $perPage = max(1, min(100, $request->integer('per_page', 25)));
        $actions = $query->orderByRaw("CASE WHEN status IN ('completed', 'verified', 'cancelled') THEN 1 ELSE 0 END")
            ->orderByRaw('CASE WHEN deadline IS NULL THEN 1 ELSE 0 END')
            ->orderBy('deadline', 'asc')
            ->paginate($perPage);

        $items = $actions->getCollection()->map(fn (Action $action) => $this->presentAction($action))->values();

        $base = Action::where('responsible_id', $user->id);
        $open = fn () => Action::where('responsible_id', $user->id)
            ->whereNotIn('status', ['completed', 'verified', 'closed', 'cancelled']);
        $today = now()->startOfDay();

        $stats = [
            'total_assigned' => (clone $base)->count(),
            'open_count' => $open()->count(),
            'in_progress_count' => $open()->where('status', 'in_progress')->count(),
            'overdue_count' => $open()->whereNotNull('deadline')->whereDate('deadline', '<', $today)->count(),
            'due_soon_count' => $open()
                ->whereDate('deadline', '>=', $today)
                ->whereDate('deadline', '<=', now()->addDays(7)->endOfDay())
                ->count(),
            'completed_count' => (clone $base)->whereIn('status', ['completed', 'verified'])->count(),
        ];

        // Statistiques pour les filtres cliquables (format historique RT-08)
        $counts = [
            'total' => $stats['total_assigned'],
            'planned' => (clone $base)->where('status', 'planned')->count(),
            'in_progress' => $stats['in_progress_count'],
            'overdue' => $stats['overdue_count'],
            'completed' => $stats['completed_count'],
        ];

        $byProcessRows = (clone $base)
            ->selectRaw('process_id')
            ->selectRaw('COUNT(id) as total_count')
            ->selectRaw("SUM(CASE WHEN status NOT IN ('completed','verified','closed','cancelled') THEN 1 ELSE 0 END) as open_count")
            ->selectRaw("SUM(CASE WHEN status NOT IN ('completed','verified','closed','cancelled') AND deadline < ? THEN 1 ELSE 0 END) as overdue_count", [$today->toDateString()])
            ->groupBy('process_id')
            ->orderByDesc('open_count')
            ->limit(5)
            ->get();

        $processIds = $byProcessRows->pluck('process_id')->filter()->map(fn ($id) => (int) $id)->values();
        $processesById = Process::query()->whereIn('id', $processIds)->get(['id', 'title', 'code'])->keyBy('id');
        $byProcess = $byProcessRows->map(function ($row) use ($processesById) {
            $processId = $row->process_id ? (int) $row->process_id : null;
            $process = $processId ? $processesById->get($processId) : null;
            $label = trim((string) ($process?->title ?? $process?->code ?? ''));

            return [
                'process_id' => $processId,
                'process_label' => $label !== '' ? $label : 'Sans processus',
                'process_code' => $process?->code ? (string) $process->code : null,
                'total_count' => (int) $row->total_count,
                'open_count' => (int) $row->open_count,
                'overdue_count' => (int) $row->overdue_count,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'counts' => $counts,
            'data' => [
                'stats' => $stats,
                'actions' => $items,
                'by_process' => $byProcess,
                'pagination' => [
                    'current_page' => $actions->currentPage(),
                    'last_page' => $actions->lastPage(),
                    'per_page' => $actions->perPage(),
                    'total' => $actions->total(),
                ],
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Action::class);
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Utilisateur non authentifié'], 401);
        }

        $query = Action::query();
        $canManageAllActions = PermissionHelper::isAdmin($user)
            || PermissionHelper::can($user, 'actions.manage');

        if ($request->has('type')) {
            $query->where('type', $request->type);
        }

        if ($request->has('status')) {
            // La colonne `status` (CHECK constraint) ne connaît que
            // planned/in_progress/completed/verified/cancelled : on y ramène
            // les statuts du frontend Vue (draft/assigned/closed).
            $wanted = strtolower((string) $request->status);
            $columnStatuses = match ($wanted) {
                'draft', 'assigned' => ['planned'],
                'closed' => ['completed', 'verified'],
                'planned', 'in_progress', 'completed', 'verified', 'cancelled' => [$wanted],
                default => null,
            };
            if ($columnStatuses !== null) {
                $query->whereIn('status', $columnStatuses);
            } else {
                $query->inState($request->status);
            }
        }

        if (!$canManageAllActions) {
            $query->where('responsible_id', (int) $user->id);
        } elseif ($request->has('responsible_id')) {
            $query->where('responsible_id', $request->responsible_id);
        }

        if ($request->has('site_id')) {
            $query->where('site_id', $request->site_id);
        }

        if ($request->has('process_id')) {
            $query->where('process_id', $request->process_id);
        }

        if ($request->has('priority')) {
            $priority = $request->priority === 'urgent' ? 'critical' : $request->priority;
            $query->where('priority', $priority);
        }

        if ($request->has('search')) {
            $q = (string) $request->search;
            $query->where(function ($inner) use ($q) {
                $inner->where('ref', 'like', "%{$q}%")
                    ->orWhere('title', 'like', "%{$q}%")
                    ->orWhere('description', 'like', "%{$q}%");
            });
        }

        $actions = $query->latest()->paginate($request->get('per_page', 15));
        $actions->setCollection(
            $actions->getCollection()->map(fn (Action $action) => $this->presentAction($action))
        );

        return response()->json($actions);
    }

    public function store(StoreActionRequest $request): JsonResponse
    {
        $this->authorize('create', Action::class);
        
        $action = $this->service->create($request->validated());

        return response()->json($action, 201);
    }

    public function show(int $id): JsonResponse
    {
        $action = Action::query()->findOrFail($id);

        $this->authorize('view', $action);

        return response()->json($this->presentAction($action));
    }

    public function update(UpdateActionRequest $request, int $id): JsonResponse
    {
        $action = Action::findOrFail($id);
        $this->authorize('update', $action);
        
        $action = $this->service->update($action, $request->validated());

        return response()->json($action);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $action = Action::findOrFail($id);
        $this->authorize('update', $action);

        $validated = $request->validate([
            'status' => 'required|in:draft,assigned,in_progress,completed,verified,closed,cancelled,planned',
            'comments' => 'nullable|string|max:1000',
        ]);

        // La colonne `status` est contrainte en base
        // (planned/in_progress/completed/verified/cancelled) : les statuts du
        // frontend Vue sont ramenés vers ces valeurs stockables.
        $mappedStatus = match ($validated['status']) {
            'draft', 'assigned', 'planned' => 'planned',
            'in_progress' => 'in_progress',
            'completed' => 'completed',
            'verified', 'closed' => 'verified',
            'cancelled' => 'cancelled',
            default => 'planned',
        };

        $updates = ['status' => $mappedStatus];
        if (!empty($validated['comments'])) {
            $actor = Auth::user();
            $updates['progress_notes'] = array_values(array_filter([
                ...($action->progress_notes ?? []),
                [
                    'date' => now()->format('Y-m-d H:i:s'),
                    'note' => $validated['comments'],
                    'user_id' => Auth::id(),
                    'user_name' => $actor?->name ?? $actor?->username,
                ],
            ]));
        }

        if ($mappedStatus === 'completed') {
            $updates['progress'] = 100;
            $updates['progress_rate'] = 100;
            $updates['completion_date'] = $action->completion_date ?? now();
        }

        $action->update($updates);

        return response()->json($this->presentAction($action->fresh()));
    }

    public function destroy(int $id): JsonResponse
    {
        $action = Action::findOrFail($id);
        $this->authorize('delete', $action);
        
        $action->delete();
        return response()->json(['message' => 'Action supprimée'], 200);
    }

    public function updateProgress(UpdateActionProgressRequest $request, int $id): JsonResponse
    {
        \Illuminate\Support\Facades\Log::debug('ActionController::updateProgress called', ['id' => $id, 'user' => $request->user()?->id ?? null]);

        $action = Action::find($id);
        if (!$action) {
            \Illuminate\Support\Facades\Log::warning('Action not found in updateProgress', ['id' => $id]);
            abort(404);
        }

        $validated = $request->validated();

        $action = $this->service->updateProgress(
            $action,
            $validated['progress'],
            $validated['notes'] ?? null
        );

        return response()->json($action);
    }

    public function verify(Request $request, int $id): JsonResponse
    {
        $action = Action::findOrFail($id);
        $this->authorize('verify', $action);

        $validated = $request->validate([
            'is_effective' => 'required|boolean',
            'verification_notes' => 'nullable|string',
        ]);

        $action = $this->service->verify($action, $validated);

        return response()->json($action);
    }

    public function close(int $id): JsonResponse
    {
        $action = Action::findOrFail($id);
        $this->authorize('close', $action);
        
        $action = $this->service->complete($action);

        return response()->json($action);
    }
    
    /**
     * Download action plan template
     */
    public function downloadPlanTemplate(): BinaryFileResponse
    {
        $generator = new \App\Exports\ActionPlanTemplate(Auth::user()?->enterprise);
        $filePath = $generator->generate();

        $user = Auth::user();
        $siteId = (int) ($user?->site_id ?? 0);
        if ($siteId <= 0 && $user?->enterprise_id) {
            $siteId = (int) \App\Models\Site::query()
                ->where('enterprise_id', (int) $user->enterprise_id)
                ->orderBy('id')
                ->value('id');
        }
        if ($siteId > 0) {
            app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                'site_id' => $siteId,
                'process_id' => null,
                'process_code' => 'GEN',
                'document_kind' => 'action_plan_template_xlsx',
                'title' => 'Template plan d’actions',
                'description' => 'Modèle XLSX de plan d’actions.',
                'file_source_path' => $filePath,
                'file_extension' => 'xlsx',
                'created_by' => $user?->id,
                'type' => 'FOR',
            ]);
        }
        
        $filename = 'Template_Plan_Actions.xlsx';
        
        return response()->download($filePath, $filename)->deleteFileAfterSend(true);
    }
    
    /**
     * Import action plan from XLSX
     */
    public function importPlan(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls|max:10240', // 10MB max
            'site_id' => 'nullable|integer|exists:sites,id',
        ]);
        
        $file = $request->file('file');
        $siteId = $request->input('site_id');

        // Store file temporarily
        $path = $file->store('temp');
        $fullPath = storage_path('app/' . $path);

        try {
            $importer = new \App\Imports\ActionPlanImport();
            $results = $importer->import($fullPath, $siteId);

            $user = Auth::user();
            if ($user) {
                $errorMessages = [];
                foreach (($results['error_details'] ?? []) as $detail) {
                    foreach (($detail['errors'] ?? []) as $msg) {
                        $errorMessages[] = $msg;
                    }
                }

                event(new \App\Events\System\ImportCompleted(
                    $user,
                    $file->getClientOriginalName(),
                    '',
                    (int) ($results['success'] ?? 0),
                    (int) ($results['errors'] ?? 0) === 0,
                    $errorMessages
                ));
            }

            // Clean up temp file
            Storage::delete($path);

            $httpStatus = count($results['errors']) > 0 ? 422 : 200;

            return response()->json($results, $httpStatus);

        } catch (\Exception $e) {
            // Clean up on error
            Storage::delete($path);

            $user = Auth::user();
            if ($user) {
                event(new \App\Events\System\ImportCompleted(
                    $user,
                    $file->getClientOriginalName(),
                    '',
                    0,
                    false,
                    [$e->getMessage()]
                ));
            }

            return response()->json([
                'success' => 0,
                'errors' => 1,
                'error_details' => [
                    [
                        'row' => 0,
                        'errors' => ['Import failed: ' . $e->getMessage()],
                    ],
                ],
            ], 500);
        }
    }
}
