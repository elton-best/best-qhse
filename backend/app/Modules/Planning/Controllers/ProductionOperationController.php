<?php

namespace App\Modules\Planning\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Planning\Models\ProductionOperation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ProductionOperationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ProductionOperation::query()->with(['site:id,name', 'process:id,title,code']);

        $this->applyScope($request, $query);

        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->filled('process_id')) {
            $query->where('process_id', (int) $request->integer('process_id'));
        }
        if ($request->filled('q')) {
            $term = '%' . trim((string) $request->q) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)
                    ->orWhere('client_order', 'like', $term)
                    ->orWhere('criteria', 'like', $term);
            });
        }

        $rows = $query->orderByDesc('updated_at')->paginate($request->integer('per_page', 20));

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizeInput($request);
        $validated = $request->validate($this->rules(), $this->messages());
        $validated['enterprise_id'] = $request->user()->enterprise_id;
        $validated['status'] = $validated['status'] ?? ProductionOperation::STATUS_PLANIFIEE;

        $operation = ProductionOperation::create($validated);
        $operation->load(['site:id,name', 'process:id,title,code']);

        return response()->json(['data' => $operation], 201);
    }

    public function show(Request $request, ProductionOperation $productionOperation): JsonResponse
    {
        $this->assertAccess($request, $productionOperation);

        return response()->json([
            'data' => $productionOperation->load(['site:id,name', 'process:id,title,code', 'releases']),
        ]);
    }

    public function update(Request $request, ProductionOperation $productionOperation): JsonResponse
    {
        $this->assertAccess($request, $productionOperation);

        $this->normalizeInput($request);
        $validated = $request->validate($this->updateRules(), $this->messages());
        unset($validated['status']);
        $productionOperation->update($validated);

        return response()->json([
            'data' => $productionOperation->fresh()->load(['site:id,name', 'process:id,title,code']),
        ]);
    }

    public function destroy(Request $request, ProductionOperation $productionOperation): JsonResponse
    {
        $this->assertAccess($request, $productionOperation);
        $productionOperation->delete();

        return response()->json(['message' => 'Opération de production supprimée.']);
    }

    /**
     * Fait avancer le statut de l'opération (planifiee -> en_cours -> controlee -> liberee,
     * avec blocage / déblocage possibles).
     */
    public function transition(Request $request, ProductionOperation $productionOperation): JsonResponse
    {
        $this->assertAccess($request, $productionOperation);

        if ($request->filled('status')) {
            $request->merge(['status' => $this->normalizeStatus($request->input('status'))]);
        }
        $validated = $request->validate([
            'status' => 'required|in:' . implode(',', ProductionOperation::STATUSES),
            'control_result' => 'nullable|string',
            'released_by' => 'nullable|string|max:255',
        ], $this->messages());

        $target = $validated['status'];

        if (!$productionOperation->canTransitionTo($target)) {
            return response()->json([
                'message' => "Transition impossible de « {$productionOperation->statusLabel()} » vers « " . (ProductionOperation::STATUS_LABELS[$target] ?? $target) . ' ».',
                'allowed' => ProductionOperation::TRANSITIONS[$productionOperation->status] ?? [],
            ], 422);
        }

        $payload = ['status' => $target];
        if (array_key_exists('control_result', $validated)) {
            $payload['control_result'] = $validated['control_result'];
        }
        if ($target === ProductionOperation::STATUS_LIBEREE) {
            $payload['released_by'] = $validated['released_by'] ?? $request->user()?->name;
            $payload['released_at'] = now();
        }

        $productionOperation->update($payload);

        return response()->json([
            'message' => 'Statut mis à jour : ' . $productionOperation->fresh()->statusLabel() . '.',
            'data' => $productionOperation->fresh()->load(['site:id,name', 'process:id,title,code']),
        ]);
    }

    public function exportXlsx(Request $request)
    {
        $query = ProductionOperation::query()->with(['site:id,name', 'process:id,title,code']);
        $this->applyScope($request, $query);
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        $rows = $query->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Production');
        $sheet->fromArray([
            'N°',
            'Produit / service',
            'Processus',
            'Site',
            'Client / commande',
            'Date prévue',
            'Équipement (id)',
            'Critères',
            'Résultat du contrôle',
            'Statut',
        ], null, 'A1');

        $line = 2;
        foreach ($rows as $index => $row) {
            $sheet->fromArray([
                $index + 1,
                (string) $row->title,
                (string) ($row->process?->title ?? ''),
                (string) ($row->site?->name ?? ''),
                (string) ($row->client_order ?? ''),
                $row->planned_date?->format('Y-m-d'),
                $row->equipment_id,
                (string) ($row->criteria ?? ''),
                (string) ($row->control_result ?? ''),
                $row->statusLabel(),
            ], null, "A{$line}");
            $line++;
        }

        foreach (range('A', 'J') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'production_operations_' . now()->format('Ymd_His') . '.xlsx';
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
        $sheet->setCellValue('A1', "MODÈLE D'IMPORT — PRODUCTION & PRESTATION");
        $sheet->setCellValue('A2', 'Une ligne = une opération. Statut accepté : planifiee, en_cours, controlee, liberee, bloquee.');
        $sheet->fromArray([
            'Produit / service',
            'Processus (id)',
            'Site (id)',
            'Client / commande',
            'Date prévue (AAAA-MM-JJ)',
            'Équipement (id)',
            'Critères',
            'Statut',
        ], null, 'A4');
        $sheet->fromArray([
            ['Lot savon 500g — lot L-2026-031', 1, 1, 'Commande CMD-2026-118', '2026-11-05', null, 'Fiche produit FP-12', 'planifiee'],
            ['Prestation nettoyage site B', 2, 1, 'Contrat CT-2026-04', '2026-11-12', null, 'Cahier des charges CDC-03', 'en_cours'],
        ], null, 'A5');

        foreach (range('A', 'H') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'modele_import_production_' . now()->format('Ymd_His') . '.xlsx';
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

        $imported = 0;
        $skipped = 0;

        foreach ($rows as $index => $row) {
            if ($index <= 4) {
                continue;
            }
            $title = trim((string) ($row['A'] ?? ''));
            if ($title === '') {
                $skipped++;
                continue;
            }

            ProductionOperation::create([
                'enterprise_id' => $request->user()->enterprise_id,
                'site_id' => (int) $validated['site_id'],
                'process_id' => is_numeric($row['B'] ?? null) ? (int) $row['B'] : null,
                'equipment_id' => is_numeric($row['F'] ?? null) ? (int) $row['F'] : null,
                'title' => $title,
                'client_order' => $this->nullIfEmpty($row['D'] ?? null),
                'planned_date' => $this->parseDate($row['E'] ?? null),
                'criteria' => $this->nullIfEmpty($row['G'] ?? null),
                'status' => $this->normalizeStatus($row['H'] ?? null),
            ]);
            $imported++;
        }

        return response()->json([
            'success' => true,
            'message' => 'Import Excel de la production terminé.',
            'data' => ['imported_rows' => $imported, 'skipped_rows' => $skipped],
        ]);
    }

    private function rules(): array
    {
        return [
            'site_id' => 'nullable|exists:sites,id',
            'process_id' => 'nullable|exists:processes,id',
            'equipment_id' => 'nullable|exists:equipements,id',
            'title' => 'required|string|max:255',
            'client_order' => 'nullable|string|max:255',
            'planned_date' => 'nullable|date',
            'criteria' => 'nullable|string',
            'control_result' => 'nullable|string',
            'status' => 'nullable|in:' . implode(',', ProductionOperation::STATUSES),
            'released_by' => 'nullable|string|max:255',
        ];
    }

    private function updateRules(): array
    {
        return [
            'site_id' => 'sometimes|nullable|exists:sites,id',
            'process_id' => 'sometimes|nullable|exists:processes,id',
            'equipment_id' => 'sometimes|nullable|exists:equipements,id',
            'title' => 'sometimes|string|max:255',
            'client_order' => 'sometimes|nullable|string|max:255',
            'planned_date' => 'sometimes|nullable|date',
            'criteria' => 'sometimes|nullable|string',
            'control_result' => 'sometimes|nullable|string',
        ];
    }

    private function messages(): array
    {
        return [
            'site_id.exists' => 'Le site sélectionné est introuvable.',
            'process_id.exists' => 'Le processus sélectionné est introuvable.',
            'equipment_id.exists' => "L'équipement sélectionné est introuvable.",
            'title.required' => 'Le produit / service est obligatoire.',
            'title.max' => 'Le titre ne doit pas dépasser 255 caractères.',
            'planned_date.date' => 'La date prévue doit être une date valide (AAAA-MM-JJ).',
            'status.required' => 'Le statut cible est obligatoire.',
            'status.in' => 'Le statut doit être : ' . implode(', ', ProductionOperation::STATUSES) . '.',
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

    private function assertAccess(Request $request, ProductionOperation $operation): void
    {
        $user = $request->user();
        if ($user && $user->user_type === 'super_admin') {
            return;
        }
        abort_unless(
            $user && $user->enterprise_id && (int) $user->enterprise_id === (int) $operation->enterprise_id,
            403,
            'Accès refusé à cette opération de production.'
        );
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }

        // process_id / equipment_id : le frontend les envoie en texte libre (id ou nom) ou null.
        if ($request->has('process_id')) {
            $merge['process_id'] = $this->normalizeProcessId($request->input('process_id'));
        }
        if ($request->has('equipment_id')) {
            $merge['equipment_id'] = $this->normalizeEquipmentId($request->input('equipment_id'));
        }

        // Alias frontend : client -> client_order, date -> planned_date, requirements -> criteria.
        if (!$request->filled('client_order') && $request->filled('client')) {
            $merge['client_order'] = trim((string) $request->input('client'));
        }
        if (!$request->filled('planned_date') && $request->filled('date')) {
            $merge['planned_date'] = $request->input('date');
        }
        if (!$request->filled('criteria') && $request->filled('requirements')) {
            $merge['criteria'] = trim((string) $request->input('requirements'));
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function normalizeProcessId(mixed $value): ?int
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        $id = \App\Modules\Processes\Models\Process::query()
            ->where('code', (string) $value)
            ->orWhereRaw('LOWER(title) = ?', [mb_strtolower(trim((string) $value))])
            ->value('id');
        return $id !== null ? (int) $id : null;
    }

    private function normalizeEquipmentId(mixed $value): ?int
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        $id = \App\Modules\Support\Models\Equipement::query()
            ->where('code_complet', (string) $value)
            ->orWhereRaw('LOWER(nom_commun) = ?', [mb_strtolower(trim((string) $value))])
            ->value('id');
        return $id !== null ? (int) $id : null;
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

    private function normalizeStatus(mixed $value): string
    {
        $normalized = str_replace(
            ['é', 'è', 'ê', 'ë'],
            'e',
            mb_strtolower(trim((string) ($value ?? '')))
        );
        $map = [
            'planifiee' => 'planifiee', 'planifie' => 'planifiee',
            'en cours' => 'en_cours', 'en_cours' => 'en_cours',
            'controlee' => 'controlee',
            'liberee' => 'liberee',
            'bloquee' => 'bloquee',
        ];
        $status = $map[$normalized] ?? 'planifiee';
        return in_array($status, ProductionOperation::STATUSES, true) ? $status : 'planifiee';
    }
}
