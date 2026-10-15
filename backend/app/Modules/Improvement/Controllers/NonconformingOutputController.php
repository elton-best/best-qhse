<?php

namespace App\Modules\Improvement\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\User;
use App\Modules\Improvement\Models\NonconformingOutput;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Sorties non conformes (ISO 9001 §8.7).
 *
 * CRUD + transitions isoler / corriger / derogation / rebuter / cloturer
 * + template / export / import XLSX.
 *
 * Distinct de NonConformity (§10.2) : ici les produits / services
 * non conformes détectés avant livraison ou après fourniture.
 */
class NonconformingOutputController extends Controller
{
    public function index(Request $request)
    {
        $query = NonconformingOutput::with(['site:id,name', 'responsible:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('severity')) {
            $query->where('severity', $this->normalizeSeverity($request->input('severity')));
        }
        if ($request->filled('search')) {
            $term = '%' . trim((string) $request->string('search')) . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('title', 'like', $term)
                    ->orWhere('ref', 'like', $term)
                    ->orWhere('description', 'like', $term);
            });
        }

        return response()->json($query->latest()->paginate($request->integer('per_page', 20)));
    }

    public function store(Request $request)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'nullable|exists:sites,id',
            'process_id' => 'nullable|exists:processes,id',
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'detection_source' => 'nullable|string|max:255',
            'detection_date' => 'nullable|date',
            'quantity' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'severity' => 'nullable|in:minor,major,critical',
            'decision' => 'nullable|in:correction,derogation,rebut,retour',
            'responsible_id' => 'nullable|exists:users,id',
        ]);

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        if (empty($validated['site_id'])) {
            return response()->json([
                'message' => 'Le site est obligatoire.',
                'errors' => ['site_id' => ['Le site est obligatoire.']],
            ], 422);
        }

        $validated['severity'] = $validated['severity'] ?? 'minor';
        $validated['status'] = $validated['status'] ?? 'detected';

        $output = NonconformingOutput::create($validated);

        return response()->json(
            $output->load(['site:id,name', 'responsible:id,name']),
            201
        );
    }

    public function show(NonconformingOutput $nonconformingOutput)
    {
        return response()->json(
            $nonconformingOutput->load(['site:id,name', 'responsible:id,name', 'closedBy:id,name'])
        );
    }

    public function update(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'process_id' => 'nullable|exists:processes,id',
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'detection_source' => 'nullable|string|max:255',
            'detection_date' => 'nullable|date',
            'quantity' => 'nullable|numeric|min:0',
            'unit' => 'nullable|string|max:50',
            'severity' => 'sometimes|in:minor,major,critical',
            'decision' => 'nullable|in:correction,derogation,rebut,retour',
            'responsible_id' => 'nullable|exists:users,id',
        ]);

        $nonconformingOutput->update($validated);

        return response()->json(
            $nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name', 'closedBy:id,name'])
        );
    }

    public function destroy(NonconformingOutput $nonconformingOutput)
    {
        $nonconformingOutput->delete();

        return response()->json(['message' => 'Sortie non conforme supprimée.']);
    }

    /**
     * Isolement de la sortie non conforme (detected -> isolated).
     */
    public function isoler(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $validated = $request->validate([
            'responsible_id' => 'nullable|exists:users,id',
            'comment' => 'nullable|string',
        ]);

        $nonconformingOutput->update([
            'status' => 'isolated',
            'responsible_id' => $validated['responsible_id'] ?? $nonconformingOutput->responsible_id,
            'description' => $this->appendComment($nonconformingOutput->description, $validated['comment'] ?? null, 'Isolement'),
        ]);

        return response()->json($nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name']));
    }

    /**
     * Correction de la sortie non conforme (isolated -> corrected).
     */
    public function corriger(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $validated = $request->validate([
            'corrective_action' => 'required|string',
            'decision' => 'nullable|in:correction,derogation,rebut,retour',
        ]);

        $nonconformingOutput->update([
            'status' => 'corrected',
            'decision' => $validated['decision'] ?? 'correction',
            'corrective_action' => $validated['corrective_action'],
        ]);

        return response()->json($nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name']));
    }

    /**
     * Dérogation / concession (isolated|corrected -> under_derogation).
     */
    public function derogation(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $validated = $request->validate([
            'derogation_reference' => 'required|string|max:255',
            'derogation_granted_by' => 'required|string|max:255',
            'comment' => 'nullable|string',
        ]);

        $nonconformingOutput->update([
            'status' => 'under_derogation',
            'decision' => 'derogation',
            'derogation_reference' => $validated['derogation_reference'],
            'derogation_granted_by' => $validated['derogation_granted_by'],
            'description' => $this->appendComment($nonconformingOutput->description, $validated['comment'] ?? null, 'Dérogation'),
        ]);

        return response()->json($nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name']));
    }

    /**
     * Rebut de la sortie non conforme (isolated|corrected -> scrapped).
     */
    public function rebuter(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $validated = $request->validate([
            'comment' => 'nullable|string',
        ]);

        $nonconformingOutput->update([
            'status' => 'scrapped',
            'decision' => 'rebut',
            'description' => $this->appendComment($nonconformingOutput->description, $validated['comment'] ?? null, 'Rebut'),
        ]);

        return response()->json($nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name']));
    }

    /**
     * Clôture (corrected|under_derogation|scrapped -> closed).
     */
    public function cloturer(Request $request, NonconformingOutput $nonconformingOutput)
    {
        $validated = $request->validate([
            'closure_comment' => 'nullable|string',
        ]);

        if (!in_array($nonconformingOutput->status, ['corrected', 'under_derogation', 'scrapped'], true)) {
            return response()->json([
                'message' => "Clôture impossible depuis le statut '{$nonconformingOutput->status}'. Traiter la sortie (corriger / dérogation / rebuter) avant clôture.",
            ], 422);
        }

        $nonconformingOutput->update([
            'status' => 'closed',
            'closure_comment' => $validated['closure_comment'] ?? null,
            'closed_by' => Auth::id() ?? $nonconformingOutput->closed_by,
            'closed_at' => now(),
        ]);

        return response()->json($nonconformingOutput->fresh()->load(['site:id,name', 'responsible:id,name', 'closedBy:id,name']));
    }

    public function downloadTemplate()
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modele import');
        $sheet->setCellValue('A1', 'MODELE D\'IMPORT - SORTIES NON CONFORMES (§8.7)');
        $sheet->fromArray([
            'Titre',
            'Description',
            'Source detection',
            'Date detection (AAAA-MM-JJ)',
            'Quantite',
            'Unite',
            'Gravite (minor, major, critical)',
            'Decision (correction, derogation, rebut, retour)',
            'Responsable (nom)',
        ], null, 'A3');
        $sheet->fromArray([
            ['Lot produit X non conforme', 'Défaut dimensionnel', 'Contrôle final', '2026-10-01', 50, 'pcs', 'major', 'correction', 'Nom responsable'],
        ], null, 'A4');

        foreach (range('A', 'I') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'modele_import_sorties_non_conformes.xlsx');
    }

    public function exportXlsx(Request $request)
    {
        $query = NonconformingOutput::with(['responsible:id,name'])->orderBy('id');

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Sorties NC');
        $sheet->fromArray([
            'Ref', 'Titre', 'Description', 'Source detection', 'Date detection',
            'Quantite', 'Unite', 'Gravite', 'Decision', 'Statut',
            'Responsable', 'Action corrective', 'Reference derogation',
        ], null, 'A1');

        $row = 2;
        foreach ($query->get() as $item) {
            $sheet->fromArray([
                $item->ref,
                $item->title,
                $item->description,
                $item->detection_source,
                $item->detection_date?->format('Y-m-d'),
                $item->quantity,
                $item->unit,
                $item->severity,
                $item->decision,
                $item->status,
                $item->responsible?->name,
                $item->corrective_action,
                $item->derogation_reference,
            ], null, 'A' . $row++);
        }

        foreach (range('A', 'M') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'sorties_non_conformes_' . now()->format('Ymd_His') . '.xlsx');
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
                NonconformingOutput::create([
                    'site_id' => (int) $validated['site_id'],
                    'title' => $title,
                    'description' => $this->normalizeStringOrNull($row['B'] ?? null),
                    'detection_source' => $this->normalizeStringOrNull($row['C'] ?? null),
                    'detection_date' => $this->normalizeDate($row['D'] ?? null),
                    'quantity' => is_numeric($row['E'] ?? null) ? (float) $row['E'] : null,
                    'unit' => $this->normalizeStringOrNull($row['F'] ?? null),
                    'severity' => $this->normalizeSeverity($row['G'] ?? null),
                    'decision' => $this->normalizeDecision($row['H'] ?? null),
                    'responsible_id' => $this->resolveUserIdFromName($row['I'] ?? null),
                ]);
                $imported++;
            } catch (\Throwable $e) {
                $errors[] = "Ligne {$index} : {$e->getMessage()}";
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$imported} sortie(s) non conforme(s) importée(s).",
            'data' => ['imported' => $imported, 'errors' => $errors],
        ]);
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        // Alias frontend : impact (Faible / Moyen / Fort) -> severity.
        if (!$request->filled('severity') && $request->filled('impact')) {
            $merge['severity'] = $this->normalizeSeverity($request->input('impact'));
        } elseif ($request->filled('severity')) {
            $merge['severity'] = $this->normalizeSeverity($request->input('severity'));
        }

        // decision : texte libre côté frontend -> code (ou null si inclassable).
        if ($request->has('decision')) {
            $merge['decision'] = $this->normalizeDecision($request->input('decision'));
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function unaccent(string $value): string
    {
        return str_replace(
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c'],
            $value
        );
    }

    private function appendComment(?string $current, ?string $comment, string $label): ?string
    {
        $comment = trim((string) ($comment ?? ''));
        if ($comment === '') {
            return $current;
        }

        $line = "[{$label} " . now()->format('Y-m-d H:i') . '] ' . $comment;

        return trim((string) ($current ?? '')) === ''
            ? $line
            : rtrim((string) $current) . "\n" . $line;
    }

    private function downloadSpreadsheet(Spreadsheet $spreadsheet, string $filename)
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'nco_') . '.xlsx';
        (new Xlsx($spreadsheet))->save($tempPath);

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    private function normalizeStringOrNull(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeSeverity(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        return match ($normalized) {
            'minor', 'mineur', 'mineure', 'faible' => 'minor',
            'major', 'majeur', 'majeure', 'moyen', 'moyenne' => 'major',
            'critical', 'critique', 'fort', 'forte' => 'critical',
            default => 'minor',
        };
    }

    private function normalizeDecision(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        $normalized = $this->unaccent(mb_strtolower(trim((string) $value)));
        foreach ([
            'correction' => ['correct', 'reprise', 'retouche'],
            'derogation' => ['derog', 'concession', 'acceptation en l'],
            'rebut' => ['rebut', 'destruction', 'mise au rebut'],
            'retour' => ['retour', 'renvoi'],
        ] as $code => $keywords) {
            if ($normalized === $code) {
                return $code;
            }
            foreach ($keywords as $keyword) {
                if (str_contains($normalized, $keyword)) {
                    return $code;
                }
            }
        }
        return null;
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
