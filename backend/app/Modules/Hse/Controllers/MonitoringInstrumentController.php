<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\InstrumentCalibration;
use App\Modules\Hse\Models\MonitoringInstrument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Registre des instruments de surveillance et de mesure (ISO 14001 §7.1.5, §9.1.1, M14-05).
 */
class MonitoringInstrumentController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return MonitoringInstrument::class;
    }

    protected function label(): string
    {
        return 'Instrument de mesure';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'instrument_type' => ['nullable', Rule::in(MonitoringInstrument::TYPES)],
            'serial_number' => 'nullable|string|max:100',
            'location' => 'nullable|string|max:255',
            'measurement_range' => 'nullable|string|max:100',
            'accuracy' => 'nullable|string|max:100',
            'last_calibration_date' => 'nullable|date|before_or_equal:today',
            'calibration_frequency_days' => 'nullable|integer|min:1|max:3650',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [
            ['title', 'Instrument', 'text'],
            ['instrument_type', 'Type', 'text'],
            ['serial_number', 'N° de série', 'text'],
            ['location', 'Emplacement', 'text'],
            ['last_calibration_date', 'Dernier étalonnage', 'date'],
            ['next_calibration_date', 'Prochain étalonnage', 'date'],
            ['status', 'Statut', 'text'],
        ];
    }

    protected function filterable(): array
    {
        return ['status', 'instrument_type'];
    }

    protected function searchable(): array
    {
        return ['ref', 'title', 'serial_number'];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        $last = $data['last_calibration_date'] ?? $existing?->last_calibration_date;
        $frequency = $data['calibration_frequency_days'] ?? $existing?->calibration_frequency_days ?? 365;
        if ($last !== null && (array_key_exists('last_calibration_date', $data) || array_key_exists('calibration_frequency_days', $data))) {
            $data['next_calibration_date'] = Carbon::parse($last)->addDays((int) $frequency)->toDateString();
        }

        return $data;
    }

    public function index(Request $request): JsonResponse
    {
        $response = parent::index($request);
        $payload = $response->getData(true);
        $payload['data'] = array_map(function (array $row) {
            $row['validity'] = $this->validity($row);

            return $row;
        }, $payload['data']);

        return response()->json($payload);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $instrument = MonitoringInstrument::query()->with([...$this->relations(), 'calibrations.recorder:id,name'])->findOrFail($id);

        return response()->json($instrument->toArray() + ['validity' => $this->validity($instrument->toArray())]);
    }

    /**
     * Enregistre un étalonnage ou une vérification. Un résultat « non conforme » met l'instrument hors service
     * et indique les relevés faits avec lui depuis le dernier étalonnage valable, à réexaminer.
     */
    public function calibrate(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $instrument = MonitoringInstrument::query()->findOrFail($id);
        $data = $request->validate([
            'calibrated_on' => 'required|date|before_or_equal:today',
            'result' => 'required|in:pass,fail',
            'certificate_ref' => 'required_if:result,pass|nullable|string|max:255',
            'next_due_on' => 'nullable|date|after:calibrated_on',
            'provider' => 'nullable|string|max:255',
            'note' => 'nullable|string',
        ]);

        $calibratedOn = Carbon::parse($data['calibrated_on']);
        $next = isset($data['next_due_on']) ? Carbon::parse($data['next_due_on']) : $calibratedOn->copy()->addDays($instrument->calibration_frequency_days);
        $toReview = 0;

        DB::transaction(function () use ($instrument, $data, $request, $calibratedOn, $next, &$toReview) {
            InstrumentCalibration::create([
                'enterprise_id' => $instrument->enterprise_id,
                'instrument_id' => $instrument->id,
                'calibrated_on' => $calibratedOn,
                'next_due_on' => $data['result'] === 'pass' ? $next : null,
                'result' => $data['result'],
                'certificate_ref' => $data['certificate_ref'] ?? null,
                'provider' => $data['provider'] ?? null,
                'note' => $data['note'] ?? null,
                'recorded_by' => $request->user()->id,
            ]);

            if ($data['result'] === 'pass') {
                $instrument->update(['last_calibration_date' => $calibratedOn, 'next_calibration_date' => $next, 'status' => 'in_service']);

                return;
            }
            $since = $instrument->last_calibration_date ?? $calibratedOn->copy()->subYear();
            $toReview = IndicatorReading::query()->where('instrument_id', $instrument->id)->whereNull('superseded_by_id')->where('measured_on', '>=', $since)->count();
            $instrument->update(['status' => 'out_of_service']);
        });

        return response()->json(['data' => $instrument->fresh($this->relations()), 'readings_to_review' => $toReview]);
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function validity(array $row): string
    {
        if (($row['status'] ?? null) === 'out_of_service') {
            return 'out_of_service';
        }
        $next = $row['next_calibration_date'] ?? null;
        if ($next === null) {
            return 'never_calibrated';
        }
        $days = (int) today()->diffInDays(Carbon::parse($next)->startOfDay(), false);

        return match (true) {
            $days < 0 => 'expired',
            $days <= 30 => 'due_soon',
            default => 'valid',
        };
    }
}
