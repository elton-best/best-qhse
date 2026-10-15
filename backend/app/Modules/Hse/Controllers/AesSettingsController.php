<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\AesSetting;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Hse\Services\AesSignificanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Paramètres de cotation et de significativité des aspects (ISO 14001 §6.1.2).
 */
class AesSettingsController extends Controller
{
    use ScopesToUserTenant;

    public function __construct(private readonly AesSignificanceService $significance) {}

    public function show(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $settings = $this->significance->settingsFor($request->user()->enterprise_id);

        return response()->json(['success' => true, 'data' => [
            'settings' => $settings,
            'method' => $this->significance->method($settings),
            'is_default' => ! AesSetting::query()->where('enterprise_id', $request->user()->enterprise_id)->exists(),
        ]]);
    }

    /**
     * Met à jour les paramètres et recalcule tous les aspects de l'organisme.
     * Les versions figées du registre gardent la méthode avec laquelle elles ont été créées.
     */
    public function update(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        abort_unless($request->user()->enterprise_id, 403);

        $data = $request->validate([
            'significance_threshold' => 'required|integer|min:1|max:100000',
            'max_gravity' => 'required|integer|between:2,10',
            'max_frequency' => 'required|integer|between:2,10',
            'max_sensitivity' => 'required|integer|between:2,10',
            'max_mastery' => 'required|integer|between:2,10',
            'use_legal_criterion' => 'required|boolean',
            'use_stakeholder_criterion' => 'required|boolean',
            'review_frequency_months' => 'required|integer|between:1,60',
        ]);

        $enterpriseId = (int) $request->user()->enterprise_id;
        $recalculated = DB::transaction(function () use ($data, $enterpriseId, $request) {
            AesSetting::updateOrCreate(
                ['enterprise_id' => $enterpriseId],
                $data + ['updated_by' => $request->user()->id],
            );

            // Un barème réduit ne doit pas laisser de cotation hors échelle.
            $outOfScale = EnvironmentalAspect::query()->where(function ($query) use ($data) {
                $query->where('gravity', '>', $data['max_gravity'])
                    ->orWhere('frequency', '>', $data['max_frequency'])
                    ->orWhere('sensitivity', '>', $data['max_sensitivity'])
                    ->orWhere('mastery', '>', $data['max_mastery']);
            })->count();
            abort_if($outOfScale > 0, 422, "{$outOfScale} aspect(s) ont une cotation supérieure au nouveau barème : corrigez-les avant de réduire l'échelle.");

            $count = 0;
            EnvironmentalAspect::query()->whereNotNull('gravity')->get()->each(function (EnvironmentalAspect $aspect) use (&$count) {
                $aspect->save();
                $count++;
            });

            return $count;
        });

        $settings = $this->significance->settingsFor($enterpriseId);

        return response()->json(['success' => true, 'data' => [
            'settings' => $settings,
            'method' => $this->significance->method($settings),
            'recalculated' => $recalculated,
        ]]);
    }
}
