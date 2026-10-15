<?php

namespace App\Modules\Planning\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Planning\Models\ProductRelease;
use App\Modules\Planning\Models\ProductionOperation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ProductReleaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductRelease::query()->with([
            'site:id,name',
            'productionOperation:id,title,client_order,status',
        ]);

        $this->applyScope($request, $query);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('production_operation_id')) {
            $query->where('production_operation_id', (int) $request->integer('production_operation_id'));
        }
        if ($request->filled('q')) {
            $term = '%' . trim((string) $request->q) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('batch_number', 'like', $term)
                    ->orWhere('criteria', 'like', $term)
                    ->orWhere('authorized_by', 'like', $term);
            });
        }

        $rows = $query->orderByDesc('updated_at')->paginate($request->integer('per_page', 20));

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules(), $this->messages());

        $operation = ProductionOperation::findOrFail($validated['production_operation_id']);
        $this->assertAccess($request, $operation);

        $release = ProductRelease::create([
            ...$validated,
            'enterprise_id' => $operation->enterprise_id,
            'site_id' => $validated['site_id'] ?? $operation->site_id,
            'status' => ProductRelease::STATUS_EN_ATTENTE,
        ]);
        $release->load(['site:id,name', 'productionOperation:id,title,client_order,status']);

        return response()->json(['data' => $release], 201);
    }

    public function show(Request $request, ProductRelease $productRelease): JsonResponse
    {
        $this->assertAccess($request, $productRelease);

        return response()->json([
            'data' => $productRelease->load(['site:id,name', 'productionOperation:id,title,client_order,status']),
        ]);
    }

    public function update(Request $request, ProductRelease $productRelease): JsonResponse
    {
        $this->assertAccess($request, $productRelease);

        if ($productRelease->status !== ProductRelease::STATUS_EN_ATTENTE) {
            return response()->json([
                'message' => 'Seule une libération « En attente » peut être modifiée.',
            ], 422);
        }

        $validated = $request->validate($this->updateRules(), $this->messages());
        unset($validated['status']);
        $productRelease->update($validated);

        return response()->json([
            'data' => $productRelease->fresh()->load(['site:id,name', 'productionOperation:id,title,client_order,status']),
        ]);
    }

    public function destroy(Request $request, ProductRelease $productRelease): JsonResponse
    {
        $this->assertAccess($request, $productRelease);

        if ($productRelease->status !== ProductRelease::STATUS_EN_ATTENTE) {
            return response()->json([
                'message' => 'Seule une libération « En attente » peut être supprimée.',
            ], 422);
        }

        $productRelease->delete();

        return response()->json(['message' => 'Libération supprimée.']);
    }

    /**
     * Valide la libération d'un lot : libere, derogation ou rejete.
     * N'accepte qu'une libération « en_attente ».
     */
    public function validateRelease(Request $request, ProductRelease $productRelease): JsonResponse
    {
        $this->assertAccess($request, $productRelease);

        if ($productRelease->status !== ProductRelease::STATUS_EN_ATTENTE) {
            return response()->json([
                'message' => 'Cette libération a déjà été traitée (' . $productRelease->statusLabel() . ').',
            ], 422);
        }

        $validated = $request->validate([
            'decision' => 'required|in:' . implode(',', ProductRelease::DECISIONS),
            'authorized_by' => 'required|string|max:255',
            'decision_notes' => 'nullable|string',
        ], $this->messages());

        $productRelease->update([
            'status' => $validated['decision'],
            'authorized_by' => $validated['authorized_by'],
            'decision_notes' => $validated['decision_notes'] ?? null,
            'decided_at' => now(),
        ]);

        $this->syncOperationStatus($productRelease->fresh(), $validated['decision']);

        return response()->json([
            'message' => 'Décision enregistrée : ' . $productRelease->fresh()->statusLabel() . '.',
            'data' => $productRelease->fresh()->load(['site:id,name', 'productionOperation:id,title,client_order,status']),
        ]);
    }

    public function exportXlsx(Request $request)
    {
        $query = ProductRelease::query()->with(['site:id,name', 'productionOperation:id,title,client_order,status']);
        $this->applyScope($request, $query);
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        $rows = $query->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Liberations');
        $sheet->fromArray([
            'N°',
            'Lot / prestation',
            'Opération',
            'Site',
            'Critères de libération',
            'Date',
            'Statut',
            'Autorisé par',
            'Notes de décision',
        ], null, 'A1');

        $line = 2;
        foreach ($rows as $index => $row) {
            $sheet->fromArray([
                $index + 1,
                (string) $row->batch_number,
                (string) ($row->productionOperation?->title ?? ''),
                (string) ($row->site?->name ?? ''),
                (string) ($row->criteria ?? ''),
                $row->release_date?->format('Y-m-d'),
                $row->statusLabel(),
                (string) ($row->authorized_by ?? ''),
                (string) ($row->decision_notes ?? ''),
            ], null, "A{$line}");
            $line++;
        }

        foreach (range('A', 'I') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'product_releases_' . now()->format('Ymd_His') . '.xlsx';
        $tempPath = Storage::disk('local')->path('exports/' . $filename);
        if (!is_dir(dirname($tempPath))) {
            mkdir(dirname($tempPath), 0775, true);
        }
        (new Xlsx($spreadsheet))->save($tempPath);

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    public function downloadTemplate()
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modele import');
        $sheet->setCellValue('A1', "MODÈLE D'IMPORT — LIBÉRATION DES PRODUITS & SERVICES");
        $sheet->setCellValue('A2', 'Une ligne = un lot. La libération est créée « en_attente », la décision se fait via POST validate.');
        $sheet->fromArray([
            'Lot / prestation',
            'Opération (id)',
            'Site (id)',
            'Critères de libération',
            'Date (AAAA-MM-JJ)',
        ], null, 'A4');
        $sheet->fromArray([
            ['LOT-2026-031', 1, 1, 'Contrôle final conforme, dossier complet', '2026-11-06'],
            ['LOT-2026-032', 2, 1, 'Essai client validé sous réserve mineure', '2026-11-13'],
        ], null, 'A5');

        foreach (range('A', 'E') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'modele_import_liberations_' . now()->format('Ymd_His') . '.xlsx';
        $tempPath = Storage::disk('local')->path('exports/' . $filename);
        if (!is_dir(dirname($tempPath))) {
            mkdir(dirname($tempPath), 0775, true);
        }
        (new Xlsx($spreadsheet))->save($tempPath);

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    public function importXlsx(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ], $this->messages());

        $file = $request->file('file');
        $reader = IOFactory::createReaderForFile($file->getRealPath());
        $reader->setReadDataOnly(true);
        $rows = $reader->load($file->getRealPath())->getActiveSheet()->toArray(null, true, true, true);

        $user = $request->user();
        $imported = 0;
        $skipped = 0;

        foreach ($rows as $index => $row) {
            if ($index <= 4) {
                continue;
            }
            $batch = trim((string) ($row['A'] ?? ''));
            $operationId = is_numeric($row['B'] ?? null) ? (int) $row['B'] : null;
            if ($batch === '' || !$operationId) {
                $skipped++;
                continue;
            }

            $operation = ProductionOperation::find($operationId);
            if (!$operation) {
                $skipped++;
                continue;
            }
            if ($user && $user->user_type !== 'super_admin' && $user->enterprise_id
                && (int) $user->enterprise_id !== (int) $operation->enterprise_id) {
                $skipped++;
                continue;
            }

            ProductRelease::create([
                'enterprise_id' => $operation->enterprise_id,
                'site_id' => is_numeric($row['C'] ?? null) ? (int) $row['C'] : ((int) $validated['site_id'] ?: $operation->site_id),
                'production_operation_id' => $operation->id,
                'batch_number' => $batch,
                'criteria' => $this->nullIfEmpty($row['D'] ?? null),
                'release_date' => $this->parseDate($row['E'] ?? null),
                'status' => ProductRelease::STATUS_EN_ATTENTE,
            ]);
            $imported++;
        }

        return response()->json([
            'success' => true,
            'message' => 'Import Excel des libérations terminé.',
            'data' => ['imported_rows' => $imported, 'skipped_rows' => $skipped],
        ]);
    }

    /**
     * Répercute la décision de libération sur l'opération liée
     * (sans forcer une transition interdite).
     */
    private function syncOperationStatus(ProductRelease $release, string $decision): void
    {
        $operation = $release->productionOperation;
        if (!$operation) {
            return;
        }

        if ($decision === ProductRelease::STATUS_LIBERE
            && in_array($operation->status, [ProductionOperation::STATUS_CONTROLEE, ProductionOperation::STATUS_EN_COURS], true)) {
            $operation->update([
                'status' => ProductionOperation::STATUS_LIBEREE,
                'released_by' => $release->authorized_by,
                'released_at' => now(),
            ]);
        }

        if ($decision === ProductRelease::STATUS_REJETE
            && in_array($operation->status, [ProductionOperation::STATUS_EN_COURS, ProductionOperation::STATUS_CONTROLEE], true)) {
            $operation->update(['status' => ProductionOperation::STATUS_BLOQUEE]);
        }
    }

    private function rules(): array
    {
        return [
            'production_operation_id' => 'required|exists:production_operations,id',
            'site_id' => 'nullable|exists:sites,id',
            'batch_number' => 'required|string|max:255',
            'criteria' => 'nullable|string',
            'release_date' => 'nullable|date',
        ];
    }

    private function updateRules(): array
    {
        return [
            'site_id' => 'sometimes|nullable|exists:sites,id',
            'batch_number' => 'sometimes|string|max:255',
            'criteria' => 'sometimes|nullable|string',
            'release_date' => 'sometimes|nullable|date',
        ];
    }

    private function messages(): array
    {
        return [
            'production_operation_id.required' => "L'opération de production est obligatoire.",
            'production_operation_id.exists' => "L'opération de production est introuvable.",
            'site_id.exists' => 'Le site sélectionné est introuvable.',
            'batch_number.required' => 'Le lot / la prestation est obligatoire.',
            'batch_number.max' => 'Le lot ne doit pas dépasser 255 caractères.',
            'release_date.date' => 'La date doit être une date valide (AAAA-MM-JJ).',
            'decision.required' => 'La décision est obligatoire (libere, derogation, rejete).',
            'decision.in' => 'La décision doit être : ' . implode(', ', ProductRelease::DECISIONS) . '.',
            'authorized_by.required' => 'La personne autorisée est obligatoire.',
            'file.required' => 'Le fichier Excel est obligatoire.',
            'file.mimes' => 'Le fichier doit être au format Excel (.xlsx, .xls).',
        ];
    }

    private function applyScope(Request $request, $query): void
    {
        $user = $request->user();
        if ($user && $user->user_type !== 'super_admin' && $user->enterprise_id) {
            $query->where('enterprise_id', $user->enterprise_id);
        }
        if ($request->filled('site_id')) {
            $query->where('site_id', (int) $request->integer('site_id'));
        } elseif ($user && $user->site_id) {
            $query->where('site_id', (int) $user->site_id);
        }
    }

    private function assertAccess(Request $request, $model): void
    {
        $user = $request->user();
        if ($user && $user->user_type === 'super_admin') {
            return;
        }
        abort_unless(
            $user && $user->enterprise_id && (int) $user->enterprise_id === (int) $model->enterprise_id,
            403,
            'Accès refusé à cette libération.'
        );
    }

    private function nullIfEmpty(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function parseDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            try {
                return \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject((float) $value)->format('Y-m-d');
            } catch (\Throwable) {
                return null;
            }
        }
        try {
            return \Carbon\Carbon::parse(trim((string) $value))->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }
}
