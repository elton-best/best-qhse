<?php

namespace App\Modules\Planning\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Planning\Models\OperationalControl;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class OperationalControlController extends Controller
{
    public const STATUSES = ['planifie', 'conforme', 'non_conforme', 'active', 'archived'];

    public const STATUS_LABELS = [
        'planifie' => 'Planifié',
        'conforme' => 'Conforme',
        'non_conforme' => 'Non conforme',
        'active' => 'Actif',
        'archived' => 'Archivé',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = OperationalControl::query()->with(['site:id,name', 'process:id,title,code']);

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
                    ->orWhere('description', 'like', $term)
                    ->orWhere('acceptance_criteria', 'like', $term);
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

        $control = OperationalControl::create($validated);
        $control->load(['site:id,name', 'process:id,title,code']);

        return response()->json(['data' => $control], 201);
    }

    public function show(Request $request, OperationalControl $operationalControl): JsonResponse
    {
        $this->assertAccess($request, $operationalControl);

        return response()->json([
            'data' => $operationalControl->load(['site:id,name', 'process:id,title,code']),
        ]);
    }

    public function update(Request $request, OperationalControl $operationalControl): JsonResponse
    {
        $this->assertAccess($request, $operationalControl);

        $this->normalizeInput($request);
        $validated = $request->validate($this->updateRules(), $this->messages());
        $operationalControl->update($validated);

        return response()->json([
            'data' => $operationalControl->fresh()->load(['site:id,name', 'process:id,title,code']),
        ]);
    }

    public function destroy(Request $request, OperationalControl $operationalControl): JsonResponse
    {
        $this->assertAccess($request, $operationalControl);
        $operationalControl->delete();

        return response()->json(['message' => 'Contrôle opérationnel supprimé.']);
    }

    public function exportXlsx(Request $request)
    {
        $query = OperationalControl::query()->with(['site:id,name', 'process:id,title,code']);
        $this->applyScope($request, $query);
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        $rows = $query->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Maitrise operationnelle');
        $sheet->fromArray([
            'N°',
            'Titre (activité / contrôle)',
            'Processus',
            'Site',
            "Points de contrôle",
            "Critères d'acceptation",
            'Consignes opératoires',
            'Statut',
        ], null, 'A1');

        $line = 2;
        foreach ($rows as $index => $row) {
            $controlPoints = $row->control_points;
            if (is_array($controlPoints)) {
                $controlPoints = implode("\n", array_map('strval', $controlPoints));
            }
            $sheet->fromArray([
                $index + 1,
                (string) $row->title,
                (string) ($row->process?->title ?? ''),
                (string) ($row->site?->name ?? ''),
                (string) ($controlPoints ?? ''),
                (string) ($row->acceptance_criteria ?? ''),
                (string) ($row->operating_instructions ?? ''),
                self::STATUS_LABELS[$row->status] ?? (string) $row->status,
            ], null, "A{$line}");
            $line++;
        }

        foreach (range('A', 'H') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'maitrise_operationnelle_' . now()->format('Ymd_His') . '.xlsx';
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
        $sheet->setCellValue('A1', "MODÈLE D'IMPORT — MAÎTRISE OPÉRATIONNELLE");
        $sheet->setCellValue('A2', 'Une ligne = un contrôle. Statut accepté : planifie, conforme, non_conforme.');
        $sheet->fromArray([
            'Titre (activité / contrôle)',
            'Processus (id)',
            'Site (id)',
            'Description',
            "Points de contrôle (séparés par ;)",
            "Critères d'acceptation",
            'Consignes opératoires',
            'Statut',
        ], null, 'A4');
        $sheet->fromArray([
            ['Contrôle réception matière', 1, 1, 'Vérification à la réception', 'Aspect;Quantité;Documents', 'Conforme au bon de commande', 'Voir instruction INS-01', 'planifie'],
            ['Contrôle en cours de fabrication', 1, 1, 'Autocontrôle opérateur', 'Cotes;Finition', 'Plan n° PL-2026-014', 'Gamme GM-07', 'conforme'],
        ], null, 'A5');

        foreach (range('A', 'H') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        $filename = 'modele_import_maitrise_operationnelle_' . now()->format('Ymd_His') . '.xlsx';
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

            $controlPoints = array_values(array_filter(array_map(
                fn ($part) => trim((string) $part),
                explode(';', (string) ($row['E'] ?? ''))
            )));

            OperationalControl::create([
                'enterprise_id' => $request->user()->enterprise_id,
                'site_id' => (int) $validated['site_id'],
                'process_id' => is_numeric($row['C'] ?? null) ? (int) $row['C'] : null,
                'title' => $title,
                'description' => $this->nullIfEmpty($row['D'] ?? null),
                'control_points' => $controlPoints !== [] ? $controlPoints : null,
                'acceptance_criteria' => $this->nullIfEmpty($row['F'] ?? null),
                'operating_instructions' => $this->nullIfEmpty($row['G'] ?? null),
                'status' => $this->normalizeStatus($row['H'] ?? null),
            ]);
            $imported++;
        }

        return response()->json([
            'success' => true,
            'message' => 'Import Excel de la maîtrise opérationnelle terminé.',
            'data' => ['imported_rows' => $imported, 'skipped_rows' => $skipped],
        ]);
    }

    private function rules(): array
    {
        return [
            'site_id' => 'nullable|exists:sites,id',
            'process_id' => 'nullable|exists:processes,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'control_points' => 'nullable|array',
            'control_points.*' => 'string|max:1000',
            'acceptance_criteria' => 'nullable|string',
            'operating_instructions' => 'nullable|string',
            'related_document_ids' => 'nullable|array',
            'related_document_ids.*' => 'integer|exists:documents,id',
            'status' => 'nullable|in:' . implode(',', self::STATUSES),
        ];
    }

    private function updateRules(): array
    {
        return [
            'site_id' => 'sometimes|nullable|exists:sites,id',
            'process_id' => 'sometimes|nullable|exists:processes,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'control_points' => 'sometimes|nullable|array',
            'control_points.*' => 'string|max:1000',
            'acceptance_criteria' => 'sometimes|nullable|string',
            'operating_instructions' => 'sometimes|nullable|string',
            'related_document_ids' => 'sometimes|nullable|array',
            'related_document_ids.*' => 'integer|exists:documents,id',
            'status' => 'sometimes|in:' . implode(',', self::STATUSES),
        ];
    }

    private function messages(): array
    {
        return [
            'process_id.required' => 'Le processus est obligatoire.',
            'process_id.exists' => 'Le processus sélectionné est introuvable.',
            'site_id.exists' => 'Le site sélectionné est introuvable.',
            'title.required' => 'Le titre de l’activité / du contrôle est obligatoire.',
            'title.max' => 'Le titre ne doit pas dépasser 255 caractères.',
            'status.in' => 'Le statut doit être : ' . implode(', ', self::STATUSES) . '.',
            'related_document_ids.*.exists' => 'Un document lié est introuvable.',
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

    private function assertAccess(Request $request, OperationalControl $control): void
    {
        $user = $request->user();
        if ($user && $user->user_type === 'super_admin') {
            return;
        }
        abort_unless(
            $user && $user->enterprise_id && (int) $user->enterprise_id === (int) $control->enterprise_id,
            403,
            'Accès refusé à ce contrôle opérationnel.'
        );
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        // Statut : accepte les labels FR du frontend (« Planifié », « Non conforme », …).
        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }

        // process_id : le frontend l'envoie en texte libre (id ou nom) ou null.
        if ($request->has('process_id')) {
            $merge['process_id'] = $this->normalizeProcessId($request->input('process_id'));
        }

        // Alias frontend : criteria -> acceptance_criteria.
        if (!$request->filled('acceptance_criteria') && $request->filled('criteria')) {
            $merge['acceptance_criteria'] = trim((string) $request->input('criteria'));
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
        // Recherche par code ou titre (saisie texte libre côté frontend).
        $id = \App\Modules\Processes\Models\Process::query()
            ->where('code', (string) $value)
            ->orWhereRaw('LOWER(title) = ?', [mb_strtolower(trim((string) $value))])
            ->value('id');
        return $id !== null ? (int) $id : null;
    }

    private function nullIfEmpty(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));
        $normalized = str_replace(['é', 'è', 'ê'], 'e', $normalized);
        $map = [
            'planifie' => 'planifie', 'planifiee' => 'planifie',
            'conforme' => 'conforme',
            'non conforme' => 'non_conforme', 'non_conforme' => 'non_conforme',
            'non-conforme' => 'non_conforme',
            'actif' => 'active', 'active' => 'active',
            'archive' => 'archived', 'archived' => 'archived',
        ];
        $status = $map[$normalized] ?? 'planifie';
        return in_array($status, self::STATUSES, true) ? $status : 'planifie';
    }
}
