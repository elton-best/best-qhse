<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\EnvironmentalIndicator;
use App\Modules\Hse\Models\IndicatorReading;
use App\Modules\Hse\Models\MonitoringInstrument;
use App\Modules\Hse\Services\IndicatorReadingService;
use Carbon\Exceptions\InvalidFormatException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Relevés des indicateurs (M14-03, M14-04) : saisie rapide, synchronisation hors connexion, import,
 * correction traçable et preuve jointe. Un relevé n'est jamais modifié ni supprimé.
 */
class IndicatorReadingController extends Controller
{
    use ScopesToUserTenant;

    private const MAX_BATCH = 200;

    private const MAX_IMPORT_ROWS = 1000;

    private function service(): IndicatorReadingService
    {
        return app(IndicatorReadingService::class);
    }

    /**
     * @return array<string, mixed>
     */
    private function rules(): array
    {
        return [
            'measured_on' => 'nullable|date|before_or_equal:today',
            'value' => 'required|numeric',
            'unit' => 'nullable|string|max:30',
            'activity_quantity' => 'nullable|numeric|gt:0',
            'instrument_id' => 'nullable|integer',
            'client_uuid' => 'nullable|string|max:64',
            'note' => 'nullable|string|max:2000',
            'source' => 'nullable|in:manual,offline,import',
            'confirm_outlier' => 'nullable|boolean',
            'confirm_duplicate' => 'nullable|boolean',
        ];
    }

    private function activeIndicator(int $id): EnvironmentalIndicator
    {
        $indicator = EnvironmentalIndicator::query()->findOrFail($id);
        abort_unless($indicator->is_active, 422, 'Cet indicateur est désactivé : réactivez-le pour saisir un relevé.');

        return $indicator;
    }

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = IndicatorReading::query()->with(['indicator:id,ref,title,unit', 'instrument:id,ref,title', 'recorder:id,name']);

        foreach (['indicator_id', 'site_id', 'instrument_id'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->integer($filter));
            }
        }
        if ($request->filled('from')) {
            $query->whereDate('measured_on', '>=', $request->input('from'));
        }
        if ($request->filled('to')) {
            $query->whereDate('measured_on', '<=', $request->input('to'));
        }
        if ($request->boolean('flagged')) {
            $query->whereNotNull('flags');
        }
        if (! $request->boolean('include_superseded')) {
            $query->whereNull('superseded_by_id');
        }

        return response()->json($query->orderByDesc('measured_on')->orderByDesc('id')->paginate(min($request->integer('per_page', 50), 200)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(array_merge(['indicator_id' => 'required|integer', 'evidence' => 'nullable|file|mimes:jpg,jpeg,png,pdf,xlsx,csv|max:5120'], $this->rules()));
        $indicator = $this->activeIndicator((int) $data['indicator_id']);

        $reading = $this->service()->record($indicator, $data + ['measured_on' => today()->toDateString()], $request->user()->id, $request->file('evidence'));

        return response()->json(['data' => $reading->load(['instrument:id,ref,title'])], $reading->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Synchronisation d'une file de relevés saisis hors connexion : idempotente grâce à `client_uuid`.
     */
    public function batch(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $payload = $request->validate(['readings' => 'required|array|min:1|max:'.self::MAX_BATCH, 'readings.*.indicator_id' => 'required|integer', 'readings.*.client_uuid' => 'required|string|max:64']);

        $results = [];
        foreach ($request->input('readings') as $item) {
            $uuid = (string) $item['client_uuid'];
            try {
                $validated = validator($item, $this->rules())->validate();
                $indicator = $this->activeIndicator((int) $item['indicator_id']);
                $reading = $this->service()->record($indicator, $validated + ['measured_on' => today()->toDateString(), 'source' => 'offline'], $request->user()->id);
                $results[] = ['client_uuid' => $uuid, 'status' => $reading->wasRecentlyCreated ? 'created' : 'exists', 'id' => $reading->id, 'flags' => $reading->flags ?? []];
            } catch (HttpResponseException $e) {
                $body = json_decode($e->getResponse()->getContent(), true);
                $results[] = ['client_uuid' => $uuid, 'status' => 'rejected', 'code' => $body['code'] ?? 'INVALID', 'message' => $body['message'] ?? 'Relevé refusé.', 'needs_confirmation' => $body['needs_confirmation'] ?? false];
            } catch (ValidationException $e) {
                $results[] = ['client_uuid' => $uuid, 'status' => 'rejected', 'code' => 'INVALID', 'message' => collect($e->errors())->flatten()->first()];
            } catch (HttpException|ModelNotFoundException $e) {
                $results[] = ['client_uuid' => $uuid, 'status' => 'rejected', 'code' => 'INVALID', 'message' => $e instanceof ModelNotFoundException ? 'Indicateur introuvable.' : $e->getMessage()];
            }
        }

        return response()->json(['data' => $results, 'meta' => ['payload_size' => count($payload['readings'])]]);
    }

    /**
     * Correction : un nouveau relevé remplace l'ancien, qui reste consultable avec le motif.
     */
    public function correct(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $old = IndicatorReading::query()->findOrFail($id);
        abort_if($old->superseded_by_id !== null, 422, 'Ce relevé a déjà été corrigé.');
        $data = $request->validate(array_merge($this->rules(), ['correction_reason' => 'required|string|min:5|max:1000']));
        $indicator = $this->activeIndicator((int) $old->indicator_id);

        $new = DB::transaction(function () use ($indicator, $old, $data, $request) {
            $new = $this->service()->record($indicator, $data + ['measured_on' => $old->measured_on->toDateString(), 'supersedes_id' => $old->id], $request->user()->id);
            $old->forceFill(['superseded_by_id' => $new->id])->save();

            return $new;
        });

        return response()->json(['data' => $new], 201);
    }

    public function evidence(Request $request, int $id): StreamedResponse
    {
        $this->assertTenant($request);
        $reading = IndicatorReading::query()->findOrFail($id);
        abort_unless($this->service()->evidenceExists($reading), 404, 'Aucune preuve jointe.');

        return Storage::disk(IndicatorReadingService::EVIDENCE_DISK)->download($reading->evidence_path, $reading->evidence_name);
    }

    /**
     * Import CSV ou Excel : une ligne par relevé (référence indicateur, date, valeur, unité, référence instrument, quantité d'activité, note).
     */
    public function importXlsx(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv,txt|max:10240']);
        $rows = IOFactory::load($request->file('file')->getRealPath())->getActiveSheet()->toArray(null, true, true, false);
        $rows = array_slice($rows, 1);
        abort_if(count($rows) > self::MAX_IMPORT_ROWS, 422, 'Import limité à '.self::MAX_IMPORT_ROWS.' lignes.');

        $created = 0;
        $rejected = [];
        foreach ($rows as $index => $row) {
            $line = $index + 2;
            if (blank(array_filter($row, fn ($cell) => $cell !== null && $cell !== ''))) {
                continue;
            }
            try {
                [$ref, $date, $value, $unit, $instrumentRef, $quantity, $note] = array_pad($row, 7, null);
                $indicator = EnvironmentalIndicator::query()->where('ref', trim((string) $ref))->where('is_active', true)->first();
                if (! $indicator) {
                    throw new \RuntimeException("Indicateur « {$ref} » introuvable.");
                }
                if (! is_numeric(str_replace(',', '.', (string) $value))) {
                    throw new \RuntimeException('Valeur non numérique.');
                }
                $instrumentId = null;
                if (filled($instrumentRef)) {
                    $instrumentId = MonitoringInstrument::query()->where('ref', trim((string) $instrumentRef))->value('id');
                    if (! $instrumentId) {
                        throw new \RuntimeException("Instrument « {$instrumentRef} » introuvable.");
                    }
                }
                $this->service()->record($indicator, [
                    'measured_on' => Carbon::parse($date)->toDateString(),
                    'value' => (float) str_replace(',', '.', (string) $value),
                    'unit' => filled($unit) ? (string) $unit : null,
                    'activity_quantity' => filled($quantity) ? (float) str_replace(',', '.', (string) $quantity) : null,
                    'instrument_id' => $instrumentId,
                    'note' => filled($note) ? (string) $note : null,
                    'source' => 'import',
                ], $request->user()->id);
                $created++;
            } catch (HttpResponseException $e) {
                $rejected[] = ['row' => $line, 'message' => json_decode($e->getResponse()->getContent(), true)['message'] ?? 'Ligne refusée.'];
            } catch (\Throwable $e) {
                $rejected[] = ['row' => $line, 'message' => $e instanceof InvalidFormatException ? 'Date invalide.' : $e->getMessage()];
            }
        }

        return response()->json(['created' => $created, 'rejected' => $rejected]);
    }
}
