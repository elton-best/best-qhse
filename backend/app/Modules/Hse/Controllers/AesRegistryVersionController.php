<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\AesRegistryVersion;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\AesSignificanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Versions figées du registre des aspects (ISO 14001 §6.1.2, M4-10).
 */
class AesRegistryVersionController extends Controller
{
    use ScopesToUserTenant;

    private const TRACKED = ['aspect_number', 'activity', 'aspect', 'impact', 'gravity', 'frequency', 'sensitivity', 'mastery',
        'criticality_score', 'is_significant', 'significance_basis', 'status', 'existing_controls', 'additional_actions'];

    public function __construct(private readonly AesSignificanceService $significance) {}

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = AesRegistryVersion::query()->select([
            'id', 'site_id', 'version_number', 'label', 'aspects_count', 'significant_count', 'created_by', 'created_at',
        ])->orderByDesc('id');
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->query('site_id'));
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);

        return response()->json(['success' => true, 'data' => AesRegistryVersion::query()->findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['site_id' => 'nullable|integer', 'label' => 'nullable|string|max:255']);
        $site = $this->resolveSite($request, isset($data['site_id']) ? (int) $data['site_id'] : null);

        $aspects = EnvironmentalAspect::query()
            ->where('site_id', $site->id)->where('status', '!=', 'archived')->orderBy('id')->get();
        abort_if($aspects->isEmpty(), 422, 'Le registre de ce site est vide : aucune version à figer.');
        abort_if(
            $aspects->contains(fn ($a) => $a->status !== 'validated'),
            422,
            'Tous les aspects du registre doivent être validés avant de figer une version.',
        );

        $settings = $this->significance->settingsFor((int) $site->enterprise_id);
        $version = DB::transaction(function () use ($aspects, $site, $data, $settings, $request) {
            $next = (int) AesRegistryVersion::query()->where('site_id', $site->id)->max('version_number') + 1;

            return AesRegistryVersion::create([
                'enterprise_id' => $site->enterprise_id,
                'site_id' => $site->id,
                'version_number' => $next,
                'label' => $data['label'] ?? null,
                'snapshot' => $aspects->map(fn ($a) => $a->only(array_merge(['id'], self::TRACKED)))->values()->all(),
                'method' => $this->significance->method($settings),
                'aspects_count' => $aspects->count(),
                'significant_count' => $aspects->where('is_significant', true)->count(),
                'created_by' => $request->user()->id,
            ]);
        });

        return response()->json(['success' => true, 'data' => $version->makeHidden('snapshot')], 201);
    }

    /**
     * Compare deux versions : aspects ajoutés, retirés ou modifiés (champs de cotation et de décision).
     */
    public function compare(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $ids = $request->validate(['from' => 'required|integer', 'to' => 'required|integer']);
        $from = AesRegistryVersion::query()->findOrFail($ids['from']);
        $to = AesRegistryVersion::query()->findOrFail($ids['to']);
        abort_if($from->site_id !== $to->site_id, 422, 'Les deux versions doivent concerner le même site.');

        $before = collect($from->snapshot)->keyBy('id');
        $after = collect($to->snapshot)->keyBy('id');

        $changed = $after->filter(fn ($row, $id) => $before->has($id))->map(function ($row, $id) use ($before) {
            $diff = [];
            foreach (self::TRACKED as $field) {
                if (($before[$id][$field] ?? null) != ($row[$field] ?? null)) {
                    $diff[$field] = ['from' => $before[$id][$field] ?? null, 'to' => $row[$field] ?? null];
                }
            }

            return $diff ? ['id' => $id, 'aspect' => $row['aspect'], 'changes' => $diff] : null;
        })->filter()->values();

        return response()->json(['success' => true, 'data' => [
            'from' => $from->only(['id', 'version_number', 'label', 'created_at']),
            'to' => $to->only(['id', 'version_number', 'label', 'created_at']),
            'added' => $after->diffKeys($before)->values(),
            'removed' => $before->diffKeys($after)->values(),
            'changed' => $changed,
            'method_changed' => $from->method != $to->method,
        ]]);
    }
}
