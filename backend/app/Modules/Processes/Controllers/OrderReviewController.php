<?php

namespace App\Modules\Processes\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\User;
use App\Modules\Processes\Models\OrderReview;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Revue des exigences avant engagement — commandes et contrats (ISO 9001 §8.2.3).
 *
 * CRUD + checklist des cinq points + blocage de la validation tant que des
 * écarts avec une demande antérieure ne sont pas résolus (Q12-04).
 */
class OrderReviewController extends Controller
{
    public function index(Request $request)
    {
        $query = OrderReview::with(['site:id,name', 'reviewer:id,name', 'validator:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->filled('engagement_type')) {
            $query->where('engagement_type', $this->normalizeEngagementType($request->input('engagement_type')));
        }
        if ($request->boolean('blocked')) {
            $query->where('differences_previous', true)->where('differences_resolved', false);
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)
                    ->orWhere('ref', 'like', $term)
                    ->orWhere('customer_name', 'like', $term)
                    ->orWhere('order_reference', 'like', $term);
            });
        }

        return response()->json($query->latest()->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'nullable|exists:sites,id',
            'title' => 'required|string|max:255',
            'customer_name' => 'nullable|string|max:255',
            'order_reference' => 'nullable|string|max:100',
            'engagement_type' => 'nullable|in:commande,contrat,offre,vente_en_ligne,autre',
            'review_date' => 'nullable|date',
            'reviewer_id' => 'nullable|exists:users,id',
            'requirements_stated' => 'nullable|boolean',
            'requirements_implied' => 'nullable|boolean',
            'requirements_org' => 'nullable|boolean',
            'requirements_legal' => 'nullable|boolean',
            'differences_previous' => 'nullable|boolean',
            'checklist_notes' => 'nullable|string',
            'differences_detail' => 'nullable|string',
            'differences_resolved' => 'nullable|boolean',
            'resolution_notes' => 'nullable|string',
            'verbal_confirmation' => 'nullable|boolean',
            'catalogue_review' => 'nullable|boolean',
            'amendments' => 'nullable|string',
            'amendment_notified' => 'nullable|boolean',
            'amendment_notified_to' => 'nullable|string|max:255',
            'status' => 'nullable|in:draft,in_review,blocked,validated,closed',
            'validation_comment' => 'nullable|string',
        ]);

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        if (empty($validated['site_id'])) {
            return response()->json([
                'message' => 'Le site est obligatoire.',
                'errors' => ['site_id' => ['Le site est obligatoire.']],
            ], 422);
        }

        $validated['status'] = $validated['status'] ?? 'draft';
        $validated['reviewer_id'] = $validated['reviewer_id'] ?? $request->user()?->id;

        if ($response = $this->guardValidation($validated, null)) {
            return $response;
        }

        $review = OrderReview::create($validated);
        $this->stampValidation($review, $validated);

        return response()->json(
            $review->fresh()->load(['site:id,name', 'reviewer:id,name', 'validator:id,name']),
            201
        );
    }

    public function show(OrderReview $orderReview)
    {
        return response()->json(
            $orderReview->load(['site:id,name', 'reviewer:id,name', 'validator:id,name'])
        );
    }

    public function update(Request $request, OrderReview $orderReview)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'title' => 'sometimes|string|max:255',
            'customer_name' => 'nullable|string|max:255',
            'order_reference' => 'nullable|string|max:100',
            'engagement_type' => 'sometimes|in:commande,contrat,offre,vente_en_ligne,autre',
            'review_date' => 'nullable|date',
            'reviewer_id' => 'nullable|exists:users,id',
            'requirements_stated' => 'nullable|boolean',
            'requirements_implied' => 'nullable|boolean',
            'requirements_org' => 'nullable|boolean',
            'requirements_legal' => 'nullable|boolean',
            'differences_previous' => 'nullable|boolean',
            'checklist_notes' => 'nullable|string',
            'differences_detail' => 'nullable|string',
            'differences_resolved' => 'nullable|boolean',
            'resolution_notes' => 'nullable|string',
            'verbal_confirmation' => 'nullable|boolean',
            'catalogue_review' => 'nullable|boolean',
            'amendments' => 'nullable|string',
            'amendment_notified' => 'nullable|boolean',
            'amendment_notified_to' => 'nullable|string|max:255',
            'status' => 'sometimes|in:draft,in_review,blocked,validated,closed',
            'validation_comment' => 'nullable|string',
        ]);

        if (array_key_exists('status', $validated) && $validated['status'] === null) {
            unset($validated['status']);
        }

        // Fusion pour évaluer les règles sur l'état résultant.
        $merged = array_merge($orderReview->only([
            'requirements_stated', 'requirements_implied', 'requirements_org',
            'requirements_legal', 'differences_previous', 'differences_resolved',
        ]), $validated);

        if ($response = $this->guardValidation($validated, $merged)) {
            return $response;
        }

        $orderReview->update($validated);
        $this->stampValidation($orderReview, $validated);

        return response()->json(
            $orderReview->fresh()->load(['site:id,name', 'reviewer:id,name', 'validator:id,name'])
        );
    }

    public function destroy(OrderReview $orderReview)
    {
        $orderReview->delete();

        return response()->json(['message' => 'Revue de commande/contrat supprimée.']);
    }

    /**
     * Règles de 8.2.3 : pas de validation sans checklist complète ni tant que
     * des écarts avec une demande antérieure restent à résoudre.
     */
    private function guardValidation(array &$validated, ?array $merged): ?\Illuminate\Http\JsonResponse
    {
        $status = $validated['status'] ?? null;
        if (!in_array($status, ['validated', 'closed'], true)) {
            return null;
        }

        $state = $merged ?? $validated;
        $missing = [];
        foreach (OrderReview::CHECKLIST as $point) {
            if (($state[$point] ?? null) === null) {
                $missing[] = $point;
            }
        }

        if ($missing !== []) {
            return response()->json([
                'message' => 'Impossible de valider : les cinq points de la revue des exigences doivent être renseignés (8.2.3).',
                'errors' => ['checklist' => $missing],
            ], 422);
        }

        if (($state['differences_previous'] ?? false) && !($state['differences_resolved'] ?? false)) {
            // L'action « Résoudre les écarts et valider » fournit la résolution
            // en commentaire obligatoire : elle vaut attestation de résolution.
            $resolution = trim((string) ($state['resolution_notes'] ?? $state['validation_comment'] ?? ''));
            if ($resolution === '') {
                return response()->json([
                    'message' => 'Engagement bloqué : des écarts avec une demande antérieure restent à résoudre avant validation (8.2.3).',
                    'errors' => ['differences_resolved' => ['Les écarts doivent être résolus.']],
                ], 422);
            }

            $validated['differences_resolved'] = true;
            $validated['resolution_notes'] = $resolution;
        }

        return null;
    }

    private function stampValidation(OrderReview $review, array $validated): void
    {
        if (($validated['status'] ?? null) === 'validated' && !$review->validated_at) {
            $review->forceFill([
                'validated_by' => Auth::id(),
                'validated_at' => now(),
                'validation_comment' => $validated['validation_comment'] ?? null,
            ])->saveQuietly();
        }
    }

    /**
     * Normalise les libellés génériques du frontend React (statuts français,
     * Oui/Non, types d'engagement) vers les codes backend.
     */
    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }
        if ($request->filled('engagement_type')) {
            $merge['engagement_type'] = $this->normalizeEngagementType($request->input('engagement_type'));
        }

        foreach ([
            'requirements_stated', 'requirements_implied', 'requirements_org',
            'requirements_legal', 'differences_previous', 'differences_resolved',
            'verbal_confirmation', 'catalogue_review', 'amendment_notified',
        ] as $key) {
            if ($request->has($key)) {
                $merge[$key] = $this->normalizeBoolean($request->input($key));
            }
        }

        // Alias frontend : due_date -> review_date, client -> customer_name,
        // pilot_id (responsable générique du formulaire React) -> reviewer_id.
        if (!$request->filled('review_date') && $request->filled('date')) {
            $merge['review_date'] = $request->input('date');
        }
        if (!$request->filled('customer_name') && $request->filled('client')) {
            $merge['customer_name'] = trim((string) $request->input('client'));
        }
        if (!$request->filled('reviewer_id') && $request->filled('pilot_id')) {
            $pilot = $request->input('pilot_id');
            $merge['reviewer_id'] = is_numeric($pilot) ? (int) $pilot : null;
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'draft' => 'draft',
            'brouillon' => 'draft',
            'in_review' => 'in_review',
            'en revue' => 'in_review',
            'revue' => 'in_review',
            'blocked' => 'blocked',
            'bloque' => 'blocked',
            'bloquee' => 'blocked',
            'ecarts a lever' => 'blocked',
            'ecart a lever' => 'blocked',
            'validated' => 'validated',
            'valide' => 'validated',
            'validee' => 'validated',
            'closed' => 'closed',
            'cloture' => 'closed',
            'cloturee' => 'closed',
        ];
        $status = $map[$normalized] ?? 'draft';

        return in_array($status, OrderReview::STATUSES, true) ? $status : 'draft';
    }

    private function normalizeEngagementType(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'commande' => 'commande',
            'contrat' => 'contrat',
            'offre' => 'offre',
            'devis' => 'offre',
            'vente en ligne' => 'vente_en_ligne',
            'vente_en_ligne' => 'vente_en_ligne',
            'autre' => 'autre',
        ];
        $type = $map[$normalized] ?? 'commande';

        return in_array($type, OrderReview::ENGAGEMENT_TYPES, true) ? $type : 'autre';
    }

    private function normalizeBoolean(mixed $value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_bool($value)) {
            return $value;
        }

        $normalized = $this->unaccent(mb_strtolower(trim((string) $value)));
        if (in_array($normalized, ['oui', 'yes', 'true', '1', 'vrai'], true)) {
            return true;
        }
        if (in_array($normalized, ['non', 'no', 'false', '0', 'faux'], true)) {
            return false;
        }

        return null;
    }

    private function unaccent(string $value): string
    {
        return str_replace(
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c'],
            $value
        );
    }
}
