<?php

namespace App\Modules\Support\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Support\Models\OrganizationalKnowledge;
use Illuminate\Http\Request;

/**
 * Base de connaissances organisationnelles (ISO 9001 §7.1.6 — Q8-07).
 *
 * Sources, détenteur, criticité, transmission et mise à jour périodique.
 * L'alerte `single_holder_alert` signale un savoir critique détenu par une
 * seule personne (risque de perte avant un départ).
 */
class OrganizationalKnowledgeController extends Controller
{
    public function index(Request $request)
    {
        $query = OrganizationalKnowledge::with(['site:id,name', 'holder:id,name', 'successor:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->filled('category')) {
            $query->where('category', $this->normalizeCategory($request->input('category')));
        }
        if ($request->boolean('critical')) {
            $query->where('is_critical', true);
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)
                    ->orWhere('ref', 'like', $term)
                    ->orWhere('description', 'like', $term);
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
            'category' => 'nullable|in:experience,formation,methodes,documents,systemes,retour_experience',
            'description' => 'nullable|string',
            'holder_id' => 'nullable|exists:users,id',
            'is_critical' => 'nullable|boolean',
            'single_holder' => 'nullable|boolean',
            'successor_id' => 'nullable|exists:users,id',
            'transfer_plan' => 'nullable|string',
            'sharing_evidence' => 'nullable|string',
            'review_frequency_months' => 'nullable|integer|min:1|max:120',
            'last_reviewed_at' => 'nullable|date',
            'next_review_at' => 'nullable|date',
            'status' => 'nullable|in:active,review,obsolete',
        ]);

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        $validated['category'] = $validated['category'] ?? 'experience';
        $validated['status'] = $validated['status'] ?? 'active';

        $knowledge = OrganizationalKnowledge::create($validated);

        return response()->json(
            $knowledge->load(['site:id,name', 'holder:id,name', 'successor:id,name']),
            201
        );
    }

    public function show(OrganizationalKnowledge $organizationalKnowledge)
    {
        return response()->json(
            $organizationalKnowledge->load(['site:id,name', 'holder:id,name', 'successor:id,name'])
        );
    }

    public function update(Request $request, OrganizationalKnowledge $organizationalKnowledge)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'title' => 'sometimes|string|max:255',
            'category' => 'sometimes|in:experience,formation,methodes,documents,systemes,retour_experience',
            'description' => 'nullable|string',
            'holder_id' => 'nullable|exists:users,id',
            'is_critical' => 'nullable|boolean',
            'single_holder' => 'nullable|boolean',
            'successor_id' => 'nullable|exists:users,id',
            'transfer_plan' => 'nullable|string',
            'sharing_evidence' => 'nullable|string',
            'review_frequency_months' => 'nullable|integer|min:1|max:120',
            'last_reviewed_at' => 'nullable|date',
            'next_review_at' => 'nullable|date',
            'status' => 'sometimes|in:active,review,obsolete',
        ]);

        if (array_key_exists('status', $validated) && $validated['status'] === null) {
            unset($validated['status']);
        }

        $organizationalKnowledge->update($validated);

        return response()->json(
            $organizationalKnowledge->fresh()->load(['site:id,name', 'holder:id,name', 'successor:id,name'])
        );
    }

    public function destroy(OrganizationalKnowledge $organizationalKnowledge)
    {
        $organizationalKnowledge->delete();

        return response()->json(['message' => 'Connaissance organisationnelle supprimée.']);
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }
        if ($request->filled('category')) {
            $merge['category'] = $this->normalizeCategory($request->input('category'));
        }
        foreach (['is_critical', 'single_holder'] as $flag) {
            if ($request->has($flag)) {
                $merge[$flag] = $this->normalizeBoolean($request->input($flag));
            }
        }
        // Alias frontend : pilot_id (responsable générique) -> holder_id.
        if (!$request->filled('holder_id') && $request->filled('pilot_id')) {
            $pilot = $request->input('pilot_id');
            $merge['holder_id'] = is_numeric($pilot) ? (int) $pilot : null;
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'active' => 'active',
            'actif' => 'active',
            'activee' => 'active',
            'review' => 'review',
            'a revoir' => 'review',
            'en revue' => 'review',
            'obsolete' => 'obsolete',
            'perime' => 'obsolete',
            'perimee' => 'obsolete',
        ];
        $status = $map[$normalized] ?? 'active';

        return in_array($status, OrganizationalKnowledge::STATUSES, true) ? $status : 'active';
    }

    private function normalizeCategory(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'experience' => 'experience',
            'formation' => 'formation',
            'methodes' => 'methodes',
            'methodes et processus' => 'methodes',
            'documents' => 'documents',
            'systemes' => 'systemes',
            'systemes numeriques' => 'systemes',
            'retour experience' => 'retour_experience',
            'retour d experience' => 'retour_experience',
            'retour_experience' => 'retour_experience',
        ];
        $category = $map[$normalized] ?? 'experience';

        return in_array($category, OrganizationalKnowledge::CATEGORIES, true) ? $category : 'experience';
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
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç', '’'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c', "'"],
            $value
        );
    }
}
