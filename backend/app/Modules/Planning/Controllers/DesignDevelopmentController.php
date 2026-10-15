<?php

namespace App\Modules\Planning\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\User;
use App\Modules\Planning\Models\DesignDevelopment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Conception et développement des produits et services (ISO 9001 §8.3).
 *
 * CRUD + transition d'étape/statut (POST transition)
 * + template / export / import XLSX.
 */
class DesignDevelopmentController extends Controller
{
    public function index(Request $request)
    {
        $query = DesignDevelopment::with(['site:id,name', 'responsible:id,name', 'validator:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('stage')) {
            $query->where('stage', $request->string('stage'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)
                    ->orWhere('ref', 'like', $term)
                    ->orWhere('project_code', 'like', $term);
            });
        }

        return response()->json($query->latest()->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'title' => 'required|string|max:255',
            'project_code' => 'nullable|string|max:100',
            'stage' => 'nullable|in:planning,inputs,controls,outputs,changes',
            'status' => 'nullable|in:draft,in_progress,in_review,validated,closed',
            'description' => 'nullable|string',
            'inputs' => 'nullable|string',
            'outputs' => 'nullable|string',
            'controls' => 'nullable|string',
            'changes' => 'nullable|string',
            'responsible_id' => 'nullable|exists:users,id',
            'planned_date' => 'nullable|date',
            'actual_date' => 'nullable|date',
        ]);

        $design = DesignDevelopment::create($validated);

        return response()->json(
            $design->load(['site:id,name', 'responsible:id,name']),
            201
        );
    }

    public function show(DesignDevelopment $designDevelopment)
    {
        return response()->json(
            $designDevelopment->load(['site:id,name', 'responsible:id,name', 'validator:id,name'])
        );
    }

    public function update(Request $request, DesignDevelopment $designDevelopment)
    {
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'title' => 'sometimes|string|max:255',
            'project_code' => 'nullable|string|max:100',
            'stage' => 'sometimes|in:planning,inputs,controls,outputs,changes',
            'status' => 'sometimes|in:draft,in_progress,in_review,validated,closed',
            'description' => 'nullable|string',
            'inputs' => 'nullable|string',
            'outputs' => 'nullable|string',
            'controls' => 'nullable|string',
            'changes' => 'nullable|string',
            'responsible_id' => 'nullable|exists:users,id',
            'planned_date' => 'nullable|date',
            'actual_date' => 'nullable|date',
        ]);

        $designDevelopment->update($validated);

        return response()->json(
            $designDevelopment->fresh()->load(['site:id,name', 'responsible:id,name', 'validator:id,name'])
        );
    }

    public function destroy(DesignDevelopment $designDevelopment)
    {
        $designDevelopment->delete();

        return response()->json(['message' => 'Conception/développement supprimé(e).']);
    }

    /**
     * Transition d'étape ou de statut (§8.3 : revues, vérifications, validation).
     */
    public function transition(Request $request, DesignDevelopment $designDevelopment)
    {
        $validated = $request->validate([
            'stage' => 'nullable|in:planning,inputs,controls,outputs,changes',
            'status' => 'nullable|in:draft,in_progress,in_review,validated,closed',
            'validation_comment' => 'nullable|string',
        ]);

        if (empty($validated['stage']) && empty($validated['status'])) {
            return response()->json(['message' => 'Préciser stage et/ou status.'], 422);
        }

        $payload = [];
        if (!empty($validated['stage'])) {
            $payload['stage'] = $validated['stage'];
        }
        if (!empty($validated['status'])) {
            $payload['status'] = $validated['status'];

            if ($validated['status'] === 'validated') {
                $payload['validated_by'] = Auth::id();
                $payload['validated_at'] = now();
                $payload['validation_comment'] = $validated['validation_comment'] ?? null;
            }
            if ($validated['status'] === 'closed') {
                $payload['actual_date'] = $payload['actual_date'] ?? $designDevelopment->actual_date ?? now()->toDateString();
            }
        }

        $designDevelopment->update($payload);

        return response()->json(
            $designDevelopment->fresh()->load(['site:id,name', 'responsible:id,name', 'validator:id,name'])
        );
    }

    public function downloadTemplate()
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modele import');
        $sheet->setCellValue('A1', "MODELE D'IMPORT - CONCEPTION & DEVELOPPEMENT (§8.3)");
        $sheet->fromArray([
            'Titre',
            'Code projet',
            'Etape (planning, inputs, controls, outputs, changes)',
            'Statut (draft, in_progress, in_review, validated, closed)',
            'Description',
            'Entrees',
            'Sorties',
            'Controles',
            'Modifications',
            'Responsable (nom)',
            'Date prevue (AAAA-MM-JJ)',
        ], null, 'A3');
        $sheet->fromArray([
            ['Nouveau produit X', 'PRJ-2026-001', 'planning', 'draft', 'Description du projet', 'Besoins clients', 'Prototype', 'Revue de conception', '', 'Nom responsable', '2026-12-31'],
        ], null, 'A4');

        foreach (range('A', 'K') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'modele_import_conception_developpement.xlsx');
    }

    public function exportXlsx(Request $request)
    {
        $query = DesignDevelopment::with(['responsible:id,name'])->orderBy('id');

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Conception');
        $sheet->fromArray([
            'Ref', 'Titre', 'Code projet', 'Etape', 'Statut', 'Description',
            'Entrees', 'Sorties', 'Controles', 'Modifications',
            'Responsable', 'Date prevue', 'Date reelle',
        ], null, 'A1');

        $row = 2;
        foreach ($query->get() as $item) {
            $sheet->fromArray([
                $item->ref,
                $item->title,
                $item->project_code,
                $item->stage,
                $item->status,
                $item->description,
                $item->inputs,
                $item->outputs,
                $item->controls,
                $item->changes,
                $item->responsible?->name,
                $item->planned_date?->format('Y-m-d'),
                $item->actual_date?->format('Y-m-d'),
            ], null, 'A' . $row++);
        }

        foreach (range('A', 'M') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'conception_developpement_' . now()->format('Ymd_His') . '.xlsx');
    }

    public function importXlsx(Request $request)
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ]);

        $file = $request->file('file');
        $reader = IOFactory::createReaderForFile($file->getRealPath());
        $reader->setReadDataOnly(true);
        $rows = $reader->load($file->getRealPath())->getActiveSheet()->toArray(null, true, true, true);

        $imported = 0;
        $errors = [];

        foreach ($rows as $index => $row) {
            if ($index <= 3) {
                continue;
            }

            $title = trim((string) ($row['A'] ?? ''));
            if ($title === '') {
                continue;
            }

            try {
                DesignDevelopment::create([
                    'site_id' => (int) $validated['site_id'],
                    'title' => $title,
                    'project_code' => $this->normalizeStringOrNull($row['B'] ?? null),
                    'stage' => $this->normalizeStage($row['C'] ?? null),
                    'status' => $this->normalizeStatus($row['D'] ?? null),
                    'description' => $this->normalizeStringOrNull($row['E'] ?? null),
                    'inputs' => $this->normalizeStringOrNull($row['F'] ?? null),
                    'outputs' => $this->normalizeStringOrNull($row['G'] ?? null),
                    'controls' => $this->normalizeStringOrNull($row['H'] ?? null),
                    'changes' => $this->normalizeStringOrNull($row['I'] ?? null),
                    'responsible_id' => $this->resolveUserIdFromName($row['J'] ?? null),
                    'planned_date' => $this->normalizeDate($row['K'] ?? null),
                ]);
                $imported++;
            } catch (\Throwable $e) {
                $errors[] = "Ligne {$index} : {$e->getMessage()}";
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$imported} conception(s) importée(s).",
            'data' => ['imported' => $imported, 'errors' => $errors],
        ]);
    }

    private function downloadSpreadsheet(Spreadsheet $spreadsheet, string $filename)
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'dd_') . '.xlsx';
        (new Xlsx($spreadsheet))->save($tempPath);

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    private function normalizeStringOrNull(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeStage(mixed $value): string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        return in_array($normalized, DesignDevelopment::STAGES, true) ? $normalized : 'planning';
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        return in_array($normalized, DesignDevelopment::STATUSES, true) ? $normalized : 'draft';
    }

    private function normalizeDate(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
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

    private function resolveUserIdFromName(mixed $value): ?int
    {
        $name = trim((string) ($value ?? ''));
        if ($name === '') {
            return null;
        }

        return User::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->value('id');
    }
}
