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
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'nullable|exists:sites,id',
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

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        if (empty($validated['site_id'])) {
            return response()->json([
                'message' => 'Le site est obligatoire.',
                'errors' => ['site_id' => ['Le site est obligatoire.']],
            ], 422);
        }
        $validated['status'] = $validated['status'] ?? 'draft';
        $validated['stage'] = $validated['stage'] ?? 'planning';

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
        $this->normalizeInput($request);
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

        if (array_key_exists('status', $validated) && $validated['status'] === null) {
            unset($validated['status']);
        }
        if (array_key_exists('stage', $validated) && $validated['stage'] === null) {
            unset($validated['stage']);
        }

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
        $this->normalizeInput($request);
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

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        // Statut générique du frontend (Planification, Entrées, Revue, Vérification, Validé)
        // dispatché vers stage ou status quand ces derniers sont absents.
        if ($request->filled('status') && !$request->filled('stage') && !$request->filled('status_code')) {
            $generic = $this->normalizeGenericStatus($request->input('status'));
            if (isset($generic['stage'])) {
                $merge['stage'] = $generic['stage'];
                // Ne pas laisser le label générique échouer la validation du statut backend.
                if (!$this->isKnownStatus($request->input('status'))) {
                    $merge['status'] = 'draft';
                }
            } elseif (isset($generic['status'])) {
                $merge['status'] = $generic['status'];
            }
        }

        if ($request->filled('stage')) {
            $merge['stage'] = $this->normalizeStage($request->input('stage'));
        }
        if (array_key_exists('status', $merge) && $merge['status'] === null) {
            // Statut générique déjà dispatché vers stage : rien à valider.
        } elseif ($request->filled('status') && !isset($merge['status'])) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }

        // Alias frontend : needs -> inputs, due_date -> planned_date.
        if (!$request->filled('inputs') && $request->filled('needs')) {
            $merge['inputs'] = trim((string) $request->input('needs'));
        }
        if (!$request->filled('planned_date') && $request->filled('due_date')) {
            $merge['planned_date'] = $request->input('due_date');
        }
        // Alias frontend : pilot_id (nom ou id) -> responsible_id.
        if (!$request->filled('responsible_id') && $request->filled('pilot_id')) {
            $merge['responsible_id'] = $this->resolveUserId($request->input('pilot_id'));
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    /**
     * Dispatch un label générique du frontend vers stage ou status backend.
     */
    private function normalizeGenericStatus(mixed $value): array
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        return match ($normalized) {
            'planification', 'planning' => ['stage' => 'planning'],
            'entrees', 'inputs' => ['stage' => 'inputs'],
            'verification', 'controls', 'controles' => ['stage' => 'controls'],
            'sorties', 'outputs' => ['stage' => 'outputs'],
            'modifications', 'changes' => ['stage' => 'changes'],
            'revue', 'in_review' => ['status' => 'in_review'],
            'valide', 'validated' => ['status' => 'validated'],
            'cloture', 'closed' => ['status' => 'closed'],
            'brouillon', 'draft' => ['status' => 'draft'],
            'en cours', 'in_progress' => ['status' => 'in_progress'],
            default => [],
        };
    }

    private function isKnownStatus(mixed $value): bool
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        return in_array($normalized, [
            'draft', 'brouillon', 'in_progress', 'en cours',
            'in_review', 'revue', 'en revue', 'validated', 'valide',
            'closed', 'cloture',
        ], true);
    }

    private function unaccent(string $value): string
    {
        return str_replace(
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c'],
            $value
        );
    }

    private function resolveUserId(mixed $value): ?int
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int) $value;
        }
        return $this->resolveUserIdFromName($value);
    }

    private function normalizeStringOrNull(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeStage(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'planning', 'planification' => 'planning',
            'inputs', 'entrees' => 'inputs',
            'controls', 'controles', 'verification' => 'controls',
            'outputs', 'sorties' => 'outputs',
            'changes', 'modifications' => 'changes',
        ];
        $stage = $map[$normalized] ?? 'planning';
        return in_array($stage, DesignDevelopment::STAGES, true) ? $stage : 'planning';
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'draft', 'brouillon' => 'draft',
            'in_progress', 'en cours' => 'in_progress',
            'in_review', 'revue', 'en revue' => 'in_review',
            'validated', 'valide' => 'validated',
            'closed', 'cloture' => 'closed',
        ];
        $status = $map[$normalized] ?? 'draft';
        return in_array($status, DesignDevelopment::STATUSES, true) ? $status : 'draft';
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
