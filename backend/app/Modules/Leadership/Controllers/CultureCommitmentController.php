<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Leadership\Models\CultureCommitment;
use Illuminate\Http\Request;

/**
 * Charte de valeurs et engagements de la direction (ISO 9001 §5.1.1 i — Q3-06).
 */
class CultureCommitmentController extends Controller
{
    public function index(Request $request)
    {
        $query = CultureCommitment::with(['site:id,name', 'owner:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->filled('type')) {
            $query->where('type', $this->normalizeType($request->input('type')));
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)->orWhere('ref', 'like', $term);
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
            'type' => 'nullable|in:valeur,engagement,charte',
            'description' => 'nullable|string',
            'owner_id' => 'nullable|exists:users,id',
            'status' => 'nullable|in:active,in_review,archived',
            'review_frequency_months' => 'nullable|integer|min:1|max:120',
            'last_reviewed_at' => 'nullable|date',
            'next_review_at' => 'nullable|date',
        ]);

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        $validated['type'] = $validated['type'] ?? 'engagement';
        $validated['status'] = $validated['status'] ?? 'active';

        $commitment = CultureCommitment::create($validated);

        return response()->json(
            $commitment->load(['site:id,name', 'owner:id,name']),
            201
        );
    }

    public function show(CultureCommitment $cultureCommitment)
    {
        return response()->json($cultureCommitment->load(['site:id,name', 'owner:id,name']));
    }

    public function update(Request $request, CultureCommitment $cultureCommitment)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'title' => 'sometimes|string|max:255',
            'type' => 'sometimes|in:valeur,engagement,charte',
            'description' => 'nullable|string',
            'owner_id' => 'nullable|exists:users,id',
            'status' => 'sometimes|in:active,in_review,archived',
            'review_frequency_months' => 'nullable|integer|min:1|max:120',
            'last_reviewed_at' => 'nullable|date',
            'next_review_at' => 'nullable|date',
            'published_at' => 'nullable|date',
        ]);

        if (array_key_exists('status', $validated) && $validated['status'] === null) {
            unset($validated['status']);
        }

        $cultureCommitment->update($validated);

        return response()->json(
            $cultureCommitment->fresh()->load(['site:id,name', 'owner:id,name'])
        );
    }

    public function destroy(CultureCommitment $cultureCommitment)
    {
        $cultureCommitment->delete();

        return response()->json(['message' => 'Engagement de culture qualité supprimé.']);
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }
        if ($request->filled('type')) {
            $merge['type'] = $this->normalizeType($request->input('type'));
        }
        // Alias frontend : pilot_id (responsable générique) -> owner_id.
        if (!$request->filled('owner_id') && $request->filled('pilot_id')) {
            $pilot = $request->input('pilot_id');
            $merge['owner_id'] = is_numeric($pilot) ? (int) $pilot : null;
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
            'in_review' => 'in_review',
            'en revision' => 'in_review',
            'en revue' => 'in_review',
            'revision' => 'in_review',
            'archived' => 'archived',
            'archive' => 'archived',
            'archivee' => 'archived',
        ];
        $status = $map[$normalized] ?? 'active';

        return in_array($status, CultureCommitment::STATUSES, true) ? $status : 'active';
    }

    private function normalizeType(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'valeur' => 'valeur',
            'valeurs' => 'valeur',
            'engagement' => 'engagement',
            'engagements' => 'engagement',
            'charte' => 'charte',
        ];
        $type = $map[$normalized] ?? 'engagement';

        return in_array($type, CultureCommitment::TYPES, true) ? $type : 'engagement';
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
