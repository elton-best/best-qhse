<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Services\IndicatorAnalysisService;
use App\Modules\Improvement\Models\Action;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Indicateurs de performance environnementale (ISO 14001 §9.1.1, M14-01, M14-02, M14-06).
 */
class EnvironmentalIndicatorController extends ManagedRecordController
{
    private const CATEGORIES = ['water', 'energy', 'waste', 'emissions', 'incidents', 'compliance', 'management', 'other'];

    protected function modelClass(): string
    {
        return EnvironmentalIndicator::class;
    }

    protected function label(): string
    {
        return 'Indicateur environnemental';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'category' => ['nullable', Rule::in(self::CATEGORIES)],
            'unit' => 'required|string|max:30',
            'formula' => 'nullable|string',
            'scope' => 'nullable|string|max:255',
            'measurement_method' => 'nullable|string',
            'frequency' => 'nullable|in:daily,weekly,monthly,quarterly,annual',
            'data_source' => 'nullable|string|max:255',
            'threshold_direction' => 'nullable|in:max,min',
            'target_value' => 'nullable|numeric',
            'alert_threshold' => 'nullable|numeric',
            'allows_negative' => 'nullable|boolean',
            'normalization' => 'nullable|in:none,per_unit_produced,per_employee,per_surface',
            'normalization_unit' => 'nullable|string|max:30',
            'aspect_id' => 'nullable|integer',
            'objective_id' => 'nullable|integer',
            'obligation_id' => 'nullable|integer',
            'responsible_id' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Indicateur', 'text'],
            ['category', 'Catégorie', 'text'],
            ['unit', 'Unité', 'text'],
            ['frequency', 'Fréquence', 'text'],
            ['threshold_direction', 'Sens du seuil (max, min)', 'text'],
            ['target_value', 'Cible', 'number'],
            ['alert_threshold', 'Seuil d\'alerte', 'number'],
            ['data_source', 'Source de la donnée', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['category', 'frequency', 'is_active'];
    }

    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name', 'aspect:id,aspect_number,aspect', 'obligation:id,ref,title'];
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertLinks($request);

        return parent::store($request);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->assertLinks($request);

        return parent::update($request, $id);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        abort_if(EnvironmentalIndicator::query()->findOrFail($id)->readings()->exists(), 422, 'Cet indicateur a des relevés : désactivez-le pour conserver l\'historique.');

        return parent::destroy($request, $id);
    }

    /**
     * Aspect, objectif et obligation liés doivent appartenir à l'entreprise.
     */
    private function assertLinks(Request $request): void
    {
        $this->assertTenant($request);
        $enterpriseId = (int) $request->user()->enterprise_id;
        $this->assertOwnedByEnterprise([
            'aspect_id' => ['table' => 'environmental_aspects', 'column' => 'enterprise_id'],
            'obligation_id' => ['table' => 'compliance_obligation_texts', 'column' => 'enterprise_id'],
        ], $request->all(), $enterpriseId);

        if ($request->filled('objective_id')) {
            $siteIds = Site::query()->where('enterprise_id', $enterpriseId)->pluck('id');
            abort_unless(DB::table('objectives')->where('id', $request->input('objective_id'))->whereIn('site_id', $siteIds)->exists(), 422, 'Objectif introuvable pour votre entreprise.');
        }
    }

    /**
     * Bibliothèque d'indicateurs proposés, avec ceux déjà activés sur le site.
     */
    public function library(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $site = $this->resolveSite($request, $request->filled('site_id') ? $request->integer('site_id') : null);
        $active = EnvironmentalIndicator::query()->where('site_id', $site->id)->whereNotNull('library_code')->pluck('library_code')->all();

        return response()->json(['data' => array_map(fn (array $item) => $item + ['activated' => in_array($item['code'], $active, true)], config('environmental_indicators.library'))]);
    }

    public function activateLibrary(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['site_id' => 'nullable|integer', 'codes' => 'required|array|min:1', 'codes.*' => 'string', 'responsible_id' => 'nullable|integer']);
        $site = $this->resolveSite($request, $data['site_id'] ?? null);
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, (int) $site->enterprise_id);

        $library = collect(config('environmental_indicators.library'))->keyBy('code');
        $unknown = array_diff($data['codes'], $library->keys()->all());
        abort_if($unknown !== [], 422, 'Indicateur inconnu de la bibliothèque : '.implode(', ', $unknown));

        $created = DB::transaction(function () use ($data, $site, $library) {
            $created = [];
            foreach (array_unique($data['codes']) as $code) {
                $item = $library[$code];
                if (EnvironmentalIndicator::query()->where('site_id', $site->id)->where('library_code', $code)->exists()) {
                    continue;
                }
                $created[] = EnvironmentalIndicator::create([
                    'enterprise_id' => $site->enterprise_id, 'site_id' => $site->id, 'title' => $item['title'], 'library_code' => $code,
                    'category' => $item['category'], 'unit' => $item['unit'], 'frequency' => $item['frequency'], 'threshold_direction' => $item['direction'],
                    'normalization' => $item['normalization'], 'data_source' => $item['data_source'], 'responsible_id' => $data['responsible_id'] ?? null,
                ])->id;
            }

            return $created;
        });

        return response()->json(['created' => count($created), 'ids' => $created], 201);
    }

    public function analysis(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $indicator = EnvironmentalIndicator::query()->findOrFail($id);
        $range = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date|after_or_equal:from']);
        $to = Carbon::parse($range['to'] ?? today());
        $from = Carbon::parse($range['from'] ?? $to->copy()->subMonths(12)->addDay());

        return response()->json(['data' => app(IndicatorAnalysisService::class)->analyse($indicator, $from, $to)]);
    }

    /**
     * Crée une action corrective en un clic quand le dernier relevé dépasse le seuil d'alerte (M14-06).
     */
    public function createAction(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $indicator = EnvironmentalIndicator::query()->findOrFail($id);
        $analysis = app(IndicatorAnalysisService::class)->analyse($indicator, today()->subMonths(12), today());
        abort_unless($analysis['threshold_state'] === 'alert', 422, 'Aucun dépassement du seuil d\'alerte : il n\'y a rien à corriger.');
        $data = $request->validate(['responsible_id' => 'nullable|integer', 'deadline' => 'nullable|date|after_or_equal:today', 'description' => 'nullable|string']);
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, (int) $indicator->enterprise_id);

        $responsible = $data['responsible_id'] ?? $indicator->responsible_id ?? $request->user()->id;
        $action = Action::create([
            'enterprise_id' => $indicator->enterprise_id,
            'site_id' => $indicator->site_id,
            'source_type' => 'environmental_indicator',
            'source_id' => $indicator->id,
            'source_ref' => $indicator->ref,
            'type' => 'corrective',
            'priority' => 'high',
            'title' => "Dépassement du seuil : {$indicator->title}",
            'description' => $data['description'] ?? "Dernier relevé {$analysis['last_value']} {$indicator->unit} le {$analysis['last_measured_on']} pour un seuil d'alerte de {$indicator->alert_threshold} {$indicator->unit} ({$indicator->ref}).",
            'initiator_id' => $request->user()->id,
            'responsible_id' => $responsible,
            'deadline' => $data['deadline'] ?? today()->addDays(30),
            'status' => 'planned',
        ]);

        return response()->json(['data' => ['id' => $action->id, 'ref' => $action->ref]], 201);
    }
}
