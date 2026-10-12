<?php

namespace App\Modules\Improvement\Controllers;

use App\Models\Action;
use App\Services\ActionService;

use App\Http\Controllers\Controller;
use App\Http\Resources\ComplaintResource;
use App\Models\Complaint;
use App\Models\Site;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\JsonResponse;

class ComplaintController extends Controller
{
    /**
     * Get complaints list
     * - Client B: only their own complaints
     * - Client A: all complaints for their enterprise sites
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        // NOTE: pas de with(['user','site',...]) ici : les relations user/site du modèle
        // Complaint sont résolues dans le mauvais namespace (voir rapport) et provoquent
        // un 500 dès qu'il y a des lignes. On charge sans eager-load puis on attache
        // manuellement via les modèles aliasés App\Models\*.
        $query = Complaint::query();

        // Filter based on user type
        if ($user->isClientB()) {
            // Client B: only their own complaints
            $query->where('user_id', $user->id);
        } elseif ($user->user_type === 'company') {
            // Client A: complaints from their enterprise's sites (sans passer par $user->enterprise->sites)
            $siteIds = Site::where('enterprise_id', $user->enterprise_id)->pluck('id');
            $query->whereIn('site_id', $siteIds);
        }

        // Additional filters
        if ($request->has('site_id') && $request->site_id) {
            $query->where('site_id', $request->site_id);
        }

        if ($request->has('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        if ($request->has('search') && $request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('title', 'like', '%' . $request->search . '%')
                  ->orWhere('description', 'like', '%' . $request->search . '%')
                  ->orWhere('ref', 'like', '%' . $request->search . '%');
            });
        }

        $perPage = $request->get('per_page', 20);
        $complaints = $query->latest()->paginate($perPage);

        // For Client B, return simple JSON format with normalized field names
        if ($user->isClientB()) {
            $items = collect($complaints->items())->map(function ($complaint) {
                return $this->toSimplePayload($complaint);
            });

            return response()->json([
                'data' => $items,
                'total' => $complaints->total(),
                'current_page' => $complaints->currentPage(),
                'last_page' => $complaints->lastPage(),
                'per_page' => $complaints->perPage(),
            ]);
        }

        return ComplaintResource::collection($complaints);
    }

    /**
     * Create a new complaint
     * Client B creates complaint for themselves
     */
    public function store(Request $request)
    {
        $user = Auth::user();

        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'title' => 'required|string|max:255',
            'description' => 'required|string|min:10',
            'category' => 'nullable|string|max:255',
            'priority' => 'nullable|in:low,medium,high,urgent',
            'status' => 'nullable|in:pending,in_progress,resolved,closed',
            'assigned_to' => 'nullable|exists:users,id',
            'wants_mail' => 'nullable|boolean',
            'wants_email_response' => 'nullable|boolean',
            'recommandations' => 'nullable|string',
            'analysis' => 'nullable|string',
            'immediate_response' => 'nullable|string',
            'expected_solution' => 'nullable|string',
            'customer_name' => 'nullable|string|max:255',
            'customer_email' => 'nullable|email|max:255',
            'customer_phone' => 'nullable|string|max:30',
            'customer_address' => 'nullable|string|max:500',
            'client_name' => 'nullable|string|max:255',
            'client_email' => 'nullable|email|max:255',
            'client_phone' => 'nullable|string|max:30',
            'client_company' => 'nullable|string|max:255',
            'received_date' => 'nullable|date',
            'due_date' => 'nullable|date',
            'actions' => 'nullable|array',
            'actions.*.type' => 'required|in:corrective,preventive,improvement',
            'actions.*.description' => 'required|string',
            'actions.*.responsible_id' => 'required|exists:users,id',
            'actions.*.deadline' => 'required|date',
            'actions.*.process_id' => 'nullable|exists:processes,id',
            'actions.*.title' => 'nullable|string|max:255',
        ]);

        if (array_key_exists('category', $validated)) {
            $validated['category'] = $this->normalizeCategory($validated['category']);
        }

        // Client B creates complaint for themselves
        if ($user->isClientB()) {
            $validated['user_id'] = $user->id;
            $validated['status'] = 'pending';
        } else {
            // Client A can assign user_id
            $validated['user_id'] = $validated['user_id'] ?? $user->id;
            $validated['status'] = $request->get('status', 'pending');
        }

        if (array_key_exists('wants_email_response', $validated) && !array_key_exists('wants_mail', $validated)) {
            $validated['wants_mail'] = $validated['wants_email_response'];
        }

        if (!empty($validated['customer_name']) && empty($validated['client_name'])) {
            $validated['client_name'] = $validated['customer_name'];
        }
        if (!empty($validated['customer_name']) && empty($validated['client_company'])) {
            $validated['client_company'] = $validated['customer_name'];
        }

        $actions = $validated['actions'] ?? null;
        unset($validated['actions']);

        // Périmètre : un company ne peut déclarer que sur ses propres sites.
        if ($user->user_type === 'company' && $user->enterprise_id) {
            $ownsSite = Site::where('id', $validated['site_id'])
                ->where('enterprise_id', $user->enterprise_id)
                ->exists();
            if (!$ownsSite) {
                return response()->json([
                    'success' => false,
                    'message' => 'Site hors périmètre de votre entreprise.',
                ], 422);
            }
        }

        $complaint = Complaint::create($validated);

        if (is_array($actions)) {
            foreach ($actions as $actionData) {
                $payload = array_merge($actionData, [
                    'site_id' => $complaint->site_id,
                    'process_id' => $actionData['process_id'] ?? null,
                    'title' => $actionData['title'] ?? ($actionData['description'] ?? 'Action réclamation'),
                    'description' => $actionData['description'] ?? '',
                    'source' => 'complaint',
                ]);
                $action = app(\App\Services\ActionService::class)->create($payload);
                $complaint->addAction($action);
            }
        }

        // For Client B, return simple JSON format with normalized field names
        if ($user->isClientB()) {
            return response()->json([
                'success' => true,
                'data' => $this->toSimplePayload($complaint->fresh()),
                'message' => 'Réclamation créée avec succès'
            ], 201);
        }

        return new ComplaintResource($complaint->fresh());
    }

    /**
     * Show complaint details
     * Client B: only their own complaints
     * Client A: complaints from their sites
     */
    public function show(Complaint $complaint)
    {
        $user = Auth::user();

        // Authorization check
        if ($user->isClientB() && $complaint->user_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Non autorisé'
            ], 403);
        }

        if ($user->user_type === 'company') {
            $ownsSite = Site::where('id', $complaint->site_id)
                ->where('enterprise_id', $user->enterprise_id)
                ->exists();
            if (!$ownsSite) {
                return response()->json([
                    'success' => false,
                    'message' => 'Non autorisé'
                ], 403);
            }
        }

        // For Client B, return simple JSON format with normalized field names
        if ($user->isClientB()) {
            return response()->json([
                'success' => true,
                'data' => $this->toSimplePayload($complaint)
            ]);
        }

        return new ComplaintResource($complaint);
    }

    /**
     * Update complaint
     * Client B: only before it's processed (status = pending)
     * Client A: can update status and assignment
     */
    public function update(Request $request, Complaint $complaint)
    {
        $user = Auth::user();

        // Authorization check
        if ($user->isClientB()) {
            if ($complaint->user_id !== $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Non autorisé'
                ], 403);
            }

            // Client B can only edit pending complaints
            if ($complaint->status !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Impossible de modifier une réclamation en cours de traitement'
                ], 422);
            }

            $validated = $request->validate([
                'title' => 'sometimes|string|max:255',
                'description' => 'sometimes|string|min:10',
                'category' => 'sometimes|string',
                'priority' => 'sometimes|in:low,medium,high,urgent',
                'wants_mail' => 'boolean',
                'wants_email_response' => 'nullable|boolean',
                'recommandations' => 'nullable|string',
                'expected_solution' => 'nullable|string',
                'customer_address' => 'nullable|string|max:500',
                'satisfaction_rating' => 'nullable|integer|min:1|max:5',
                'satisfaction_comment' => 'nullable|string|max:1000',
            ]);
        } else {
            // Client A can update more fields
            // Company : périmètre vérifié + transition de statut tracée (response/closed dates).
            if ($user->enterprise_id) {
                $ownsSite = Site::where('id', $complaint->site_id)
                    ->where('enterprise_id', $user->enterprise_id)
                    ->exists();
                if (!$ownsSite) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Non autorisé',
                    ], 403);
                }
            }
            $validated = $request->validate([
                'title' => 'sometimes|string|max:255',
                'description' => 'sometimes|string',
                'category' => 'sometimes|string|max:255',
                'priority' => 'sometimes|in:low,medium,high,urgent',
                'wants_mail' => 'boolean',
                'wants_email_response' => 'nullable|boolean',
                'recommandations' => 'nullable|string',
                'analysis' => 'nullable|string',
                'immediate_response' => 'nullable|string',
                'expected_solution' => 'nullable|string',
                'customer_name' => 'nullable|string|max:255',
                'customer_email' => 'nullable|email|max:255',
                'customer_phone' => 'nullable|string|max:30',
                'customer_address' => 'nullable|string|max:500',
                'client_name' => 'nullable|string|max:255',
                'client_email' => 'nullable|email|max:255',
                'client_phone' => 'nullable|string|max:30',
                'client_company' => 'nullable|string|max:255',
                'received_date' => 'nullable|date',
                'due_date' => 'nullable|date',
                'response_date' => 'nullable|date',
                'closed_date' => 'nullable|date',
                'satisfaction_rating' => 'nullable|integer|min:1|max:5',
                'satisfaction_comment' => 'nullable|string|max:1000',
                'status' => 'sometimes|in:pending,in_progress,resolved,closed',
                'assigned_to' => 'nullable|exists:users,id',
                'actions' => 'nullable|array',
                'actions.*.type' => 'required|in:corrective,preventive,improvement',
                'actions.*.description' => 'required|string',
                'actions.*.responsible_id' => 'required|exists:users,id',
                'actions.*.deadline' => 'required|date',
                'actions.*.process_id' => 'nullable|exists:processes,id',
                'actions.*.title' => 'nullable|string|max:255',
            ]);
        }

        if (array_key_exists('category', $validated)) {
            $validated['category'] = $this->normalizeCategory($validated['category']);
        }

        if (array_key_exists('wants_email_response', $validated) && !array_key_exists('wants_mail', $validated)) {
            $validated['wants_mail'] = $validated['wants_email_response'];
        }

        if (!empty($validated['customer_name']) && empty($validated['client_name'])) {
            $validated['client_name'] = $validated['customer_name'];
        }
        if (!empty($validated['customer_name']) && empty($validated['client_company'])) {
            $validated['client_company'] = $validated['customer_name'];
        }

        $actions = $validated['actions'] ?? null;
        unset($validated['actions']);

        $complaint->update($validated);

        if (is_array($actions)) {
            $complaint->actions()->detach();
            foreach ($actions as $actionData) {
                $payload = array_merge($actionData, [
                    'site_id' => $complaint->site_id,
                    'process_id' => $actionData['process_id'] ?? null,
                    'title' => $actionData['title'] ?? ($actionData['description'] ?? 'Action réclamation'),
                    'description' => $actionData['description'] ?? '',
                    'source' => 'complaint',
                ]);
                $action = app(\App\Services\ActionService::class)->create($payload);
                $complaint->addAction($action);
            }
        }

        if ($user->isClientB()) {
            return response()->json([
                'success' => true,
                'data' => $this->toSimplePayload($complaint->fresh()),
            ]);
        }

        return new ComplaintResource($complaint->fresh());
    }

    /**
     * Delete complaint
     * Client B: only their own pending complaints
     * Client A: any complaint from their sites
     */
    public function destroy(Complaint $complaint)
    {
        $user = Auth::user();

        // Authorization check
        if ($user->isClientB()) {
            if ($complaint->user_id !== $user->id) {
                return response()->json([
                    'success' => false,
                    'message' => 'Non autorisé'
                ], 403);
            }

            // Client B can only delete pending complaints
            if ($complaint->status !== 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Impossible de supprimer une réclamation en cours de traitement'
                ], 422);
            }
        } elseif ($user->user_type === 'company' && $user->enterprise_id) {
            $ownsSite = Site::where('id', $complaint->site_id)
                ->where('enterprise_id', $user->enterprise_id)
                ->exists();
            if (!$ownsSite) {
                return response()->json([
                    'success' => false,
                    'message' => 'Non autorisé',
                ], 403);
            }
        }

        $complaint->delete();

        return response()->json([
            'success' => true,
            'message' => 'Réclamation supprimée'
        ], 200);
    }

    /**
     * Add a response to a complaint (Client A only)
     */
    public function addResponse(Request $request, Complaint $complaint): JsonResponse
    {
        $user = Auth::user();

        if ($user->user_type !== 'company') {
            return response()->json([
                'success' => false,
                'message' => 'Non autorisé'
            ], 403);
        }

        $validated = $request->validate([
            'response' => 'required|string|min:10',
            'status' => 'sometimes|in:pending,in_progress,resolved,closed',
        ]);

        if ($user->enterprise_id) {
            $ownsSite = Site::where('id', $complaint->site_id)
                ->where('enterprise_id', $user->enterprise_id)
                ->exists();
            if (!$ownsSite) {
                return response()->json([
                    'success' => false,
                    'message' => 'Non autorisé',
                ], 403);
            }
        }

        // Cycle de vie : pending -> in_progress -> resolved -> closed.
        // On trace response_date à la première réponse et closed_date à la clôture.
        $newStatus = $validated['status'] ?? $complaint->status;
        $patch = [
            'recommandations' => $complaint->recommandations
                ? $complaint->recommandations . "\n\n---\n" . $validated['response']
                : $validated['response'],
            'status' => $newStatus,
            'assigned_to' => $complaint->assigned_to ?? $user->id,
        ];
        if (!$complaint->response_date) {
            $patch['response_date'] = now()->toDateString();
        }
        if ($newStatus === 'closed' && !$complaint->closed_date) {
            $patch['closed_date'] = now()->toDateString();
        }
        if (in_array($newStatus, ['resolved', 'closed'], true) && !$complaint->response_date) {
            $patch['response_date'] = now()->toDateString();
        }
        $complaint->update($patch);

        return response()->json([
            'success' => true,
            'message' => 'Réponse ajoutée avec succès',
            'data' => new ComplaintResource($complaint->fresh())
        ]);
    }

    /**
     * Get complaint categories
     */
    public function getCategories(): JsonResponse
    {
        $categories = [
            ['value' => 'product', 'label' => 'Produit'],
            ['value' => 'service', 'label' => 'Service'],
            ['value' => 'delivery', 'label' => 'Livraison'],
            ['value' => 'billing', 'label' => 'Facturation'],
            ['value' => 'support', 'label' => 'Support client'],
            ['value' => 'quality', 'label' => 'Qualité'],
            ['value' => 'other', 'label' => 'Autre'],
        ];

        return response()->json([
            'success' => true,
            'data' => $categories
        ]);
    }

    private function normalizeCategory(?string $value): ?string
    {
        if (!$value) {
            return null;
        }

        $raw = trim($value);
        $normalized = strtolower($raw);
        // Libellés FR du formulaire React/Vue (avec accents) -> catégories backend.
        $frMap = [
            'qualité produit' => 'product_quality',
            'qualite produit' => 'product_quality',
            'délai de livraison' => 'delivery_delay',
            'delai de livraison' => 'delivery_delay',
            'livraison' => 'delivery_delay',
            'service client' => 'service_quality',
            'facturation' => 'billing',
            'sécurité' => 'other',
            'securite' => 'other',
            'support client' => 'other',
            'produit' => 'product_quality',
            'qualité' => 'product_quality',
            'service' => 'service_quality',
            'autre' => 'other',
        ];
        if (isset($frMap[$normalized])) {
            return $frMap[$normalized];
        }
        $map = [
            'product' => 'product_quality',
            'quality' => 'product_quality',
            'service' => 'service_quality',
            'delivery' => 'delivery_delay',
            'safety' => 'other',
            'environment' => 'other',
        ];

        $allowed = [
            'product_quality',
            'product_defect',
            'service_quality',
            'delivery_delay',
            'delivery_error',
            'documentation',
            'packaging',
            'billing',
            'communication',
            'other',
        ];

        if (isset($map[$normalized])) {
            return $map[$normalized];
        }

        return in_array($normalized, $allowed, true) ? $normalized : 'other';
    }

    /**
     * Search sites for autocomplete
     * - ClientB / super_admin : tous les sites actifs (formulaire Vue).
     * - Company : uniquement les sites de sa propre entreprise (périmètre).
     */
    public function searchSites(Request $request): JsonResponse
    {
        $user = Auth::user();
        $query = $request->input('q', '');

        $base = Site::where('is_active', true);
        if ($user && $user->user_type === 'company' && $user->enterprise_id) {
            $base->where('enterprise_id', $user->enterprise_id);
        }

        // Si la requête est vide, retourner tous les sites actifs du périmètre
        if (strlen($query) < 2) {
            $sites = (clone $base)
                ->with('enterprise:id,name')
                ->limit(100)
                ->get()
                ->map(function ($site) {
                    return [
                        'id' => $site->id,
                        'name' => $site->name,
                        'location' => $site->location,
                        'city' => $site->city ?? null,
                        'enterprise' => $site->enterprise->name ?? null,
                        'ref' => $site->ref,
                        'label' => $site->name . ($site->location ? ' - ' . $site->location : '') .
                                  ($site->enterprise ? ' (' . $site->enterprise->name . ')' : '')
                    ];
                });
            
            return response()->json([
                'success' => true,
                'data' => $sites
            ]);
        }

        $driver = \Illuminate\Support\Facades\DB::getDriverName();
        $like = $driver === 'pgsql' ? 'ILIKE' : 'LIKE';
        $sites = (clone $base)
            ->where(function ($q) use ($query, $like) {
                $q->where('name', $like, "%{$query}%")
                  ->orWhere('location', $like, "%{$query}%")
                  ->orWhere('ref', $like, "%{$query}%");
            })
            ->with('enterprise:id,name')
            ->limit(10)
            ->get()
            ->map(function ($site) {
                return [
                    'id' => $site->id,
                    'name' => $site->name,
                    'location' => $site->location,
                    'city' => $site->city ?? null,
                    'enterprise' => $site->enterprise->name ?? null,
                    'ref' => $site->ref,
                    'label' => $site->name . ($site->location ? ' - ' . $site->location : '') .
                              ($site->enterprise ? ' (' . $site->enterprise->name . ')' : '')
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $sites
        ]);
    }

    /**
     * Payload simple ClientB sans toucher aux relations cassées du modèle
     * (user/site/assignedUser résolus dans le mauvais namespace).
     * Le vrai correctif modèle est décrit dans le rapport final.
     */
    private function toSimplePayload($complaint): array
    {
        $site = null;
        $user = null;
        $assignedUser = null;
        try {
            $site = Site::select('id', 'ref', 'name', 'location', 'city')->find($complaint->site_id);
        } catch (\Throwable $e) {
            $site = null;
        }
        try {
            $user = $complaint->user_id ? User::select('id', 'name', 'email')->find($complaint->user_id) : null;
            $assignedUser = $complaint->assigned_to ? User::select('id', 'name')->find($complaint->assigned_to) : null;
        } catch (\Throwable $e) {
            $user = null;
            $assignedUser = null;
        }
        $actions = [];
        try {
            $actions = $complaint->actions()->get();
        } catch (\Throwable $e) {
            $actions = [];
        }

        return [
            'id' => $complaint->id,
            'reference' => $complaint->ref,
            'ref' => $complaint->ref,
            'title' => $complaint->title,
            'description' => $complaint->description,
            'status' => $complaint->status,
            'priority' => $complaint->priority,
            'category' => $complaint->category,
            'site_id' => $complaint->site_id,
            'user_id' => $complaint->user_id,
            'assigned_to' => $complaint->assigned_to,
            'wants_email_response' => $complaint->wants_email_response,
            'wants_mail' => $complaint->wants_mail,
            'recommandations' => $complaint->recommandations,
            'analysis' => $complaint->analysis,
            'immediate_response' => $complaint->immediate_response,
            'expected_solution' => $complaint->expected_solution,
            'customer_name' => $complaint->customer_name,
            'customer_email' => $complaint->customer_email,
            'customer_phone' => $complaint->customer_phone,
            'customer_address' => $complaint->customer_address,
            'client_name' => $complaint->client_name,
            'client_email' => $complaint->client_email,
            'client_phone' => $complaint->client_phone,
            'client_company' => $complaint->client_company,
            'satisfaction_rating' => $complaint->satisfaction_rating,
            'satisfaction_comment' => $complaint->satisfaction_comment,
            'received_date' => $complaint->received_date?->toISOString(),
            'due_date' => $complaint->due_date?->toISOString(),
            'response_date' => $complaint->response_date?->toISOString(),
            'closed_date' => $complaint->closed_date?->toISOString(),
            'created_at' => $complaint->created_at?->toISOString(),
            'updated_at' => $complaint->updated_at?->toISOString(),
            'site' => $site,
            'user' => $user,
            'assignedUser' => $assignedUser,
            'actions' => $actions,
        ];
    }
}
