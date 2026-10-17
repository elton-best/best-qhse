<?php

namespace App\Modules\Hse\Services;

use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Enregistrement d'un relevé avec contrôles de plausibilité (unité, valeur négative ou aberrante, doublon)
 * et validité de l'instrument à la date de la mesure (ISO 14001 §9.1.1, A.9.1.1).
 */
class IndicatorReadingService
{
    public const MIN_HISTORY_FOR_OUTLIER = 5;

    public const OUTLIER_SIGMAS = 3;

    public const EVIDENCE_DISK = 'local';

    /**
     * @param  array{measured_on: string, value: float|int|string, unit?: string|null, activity_quantity?: float|int|string|null, instrument_id?: int|null, source?: string, client_uuid?: string|null, note?: string|null, confirm_outlier?: bool, confirm_duplicate?: bool, supersedes_id?: int|null, correction_reason?: string|null}  $data
     */
    public function record(EnvironmentalIndicator $indicator, array $data, int $userId, ?UploadedFile $evidence = null): IndicatorReading
    {
        if (! empty($data['client_uuid'])) {
            $existing = IndicatorReading::query()->where('enterprise_id', $indicator->enterprise_id)->where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing;
            }
        }

        $date = Carbon::parse($data['measured_on'])->startOfDay();
        $value = (float) $data['value'];
        $flags = [];

        $this->failIf(isset($data['unit']) && $data['unit'] !== null && mb_strtolower(trim((string) $data['unit'])) !== mb_strtolower($indicator->unit),
            'unit', "L'unité du relevé doit être « {$indicator->unit} » (unité de l'indicateur).", 'UNIT_MISMATCH');
        $this->failIf($date->isFuture(), 'measured_on', 'La date de mesure ne peut pas être dans le futur.', 'FUTURE_DATE');
        $this->failIf($value < 0 && ! $indicator->allows_negative, 'value', 'Cet indicateur n\'accepte pas de valeur négative.', 'NEGATIVE_VALUE');
        $this->failIf($indicator->unit === '%' && $value > 100, 'value', 'Un pourcentage ne peut pas dépasser 100.', 'PERCENT_RANGE');

        $query = IndicatorReading::query()->where('indicator_id', $indicator->id)->whereNull('superseded_by_id')
            ->when(! empty($data['supersedes_id']), fn ($q) => $q->where('id', '!=', $data['supersedes_id']));

        if ((clone $query)->whereDate('measured_on', $date)->exists()) {
            $this->failIf(empty($data['confirm_duplicate']), 'measured_on', 'Un relevé existe déjà à cette date : confirmez s\'il s\'agit bien d\'une seconde mesure.', 'DUPLICATE', true);
            $flags[] = 'duplicate_confirmed';
        }

        $history = (clone $query)->where('measured_on', '<', $date)->orderByDesc('measured_on')->limit(12)->pluck('value')->map(fn ($v) => (float) $v);
        if ($history->count() >= self::MIN_HISTORY_FOR_OUTLIER) {
            $mean = $history->avg();
            $sd = sqrt($history->map(fn ($v) => ($v - $mean) ** 2)->avg());
            if ($sd > 0 && abs($value - $mean) > self::OUTLIER_SIGMAS * $sd) {
                $this->failIf(empty($data['confirm_outlier']), 'value', 'Valeur très éloignée des relevés précédents : vérifiez l\'unité et confirmez si elle est exacte.', 'OUTLIER', true);
                $flags[] = 'outlier_confirmed';
            }
        }

        $instrumentValid = null;
        if (! empty($data['instrument_id'])) {
            $instrument = MonitoringInstrument::query()->where('enterprise_id', $indicator->enterprise_id)->find($data['instrument_id']);
            $this->failIf($instrument === null, 'instrument_id', 'Instrument introuvable pour votre entreprise.', 'INSTRUMENT_UNKNOWN');
            $instrumentValid = $instrument->isValidOn($date);
            if (! $instrumentValid) {
                $flags[] = $instrument->status === 'in_service' ? 'instrument_out_of_validity' : 'instrument_out_of_service';
            }
        }

        $path = null;
        $name = null;
        if ($evidence) {
            $name = $evidence->getClientOriginalName();
            $path = $evidence->store("monitoring-evidence/{$indicator->enterprise_id}", self::EVIDENCE_DISK);
        }

        return IndicatorReading::create([
            'enterprise_id' => $indicator->enterprise_id,
            'site_id' => $indicator->site_id,
            'indicator_id' => $indicator->id,
            'measured_on' => $date,
            'value' => $value,
            'unit' => $indicator->unit,
            'activity_quantity' => $data['activity_quantity'] ?? null,
            'instrument_id' => $data['instrument_id'] ?? null,
            'instrument_valid' => $instrumentValid,
            'source' => $data['source'] ?? 'manual',
            'client_uuid' => $data['client_uuid'] ?? null,
            'evidence_path' => $path,
            'evidence_name' => $name,
            'note' => $data['note'] ?? null,
            'flags' => $flags === [] ? null : $flags,
            'recorded_by' => $userId,
            'supersedes_id' => $data['supersedes_id'] ?? null,
            'correction_reason' => $data['correction_reason'] ?? null,
        ]);
    }

    public function evidenceExists(IndicatorReading $reading): bool
    {
        return $reading->evidence_path !== null && Storage::disk(self::EVIDENCE_DISK)->exists($reading->evidence_path);
    }

    private function failIf(bool $condition, string $field, string $message, string $code, bool $needsConfirmation = false): void
    {
        if ($condition) {
            abort(response()->json(['message' => $message, 'code' => $code, 'needs_confirmation' => $needsConfirmation, 'errors' => [$field => [$message]]], 422));
        }
    }
}
