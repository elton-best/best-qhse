<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Enterprise\Models\User;
use App\Modules\Hse\Models\ProductServiceRequirement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Exigences relatives aux produits et services (ISO 9001 §8.2).
 *
 * CRUD + revue (POST review) + template / export / import XLSX.
 */
class ProductServiceRequirementController extends Controller
{
    public function index(Request $request)
    {
        $query = ProductServiceRequirement::with(['site:id,name', 'responsible:id,name', 'reviewer:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('requirement_type')) {
            $query->where('requirement_type', $request->string('requirement_type'));
        }
        if ($request->filled('review_status')) {
            $query->where('review_status', $request->string('review_status'));
        }
        if ($request->filled('compliance_status')) {
            $query->where('compliance_status', $request->string('compliance_status'));
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
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'title' => 'required|string|max:255',
            'requirement_type' => 'nullable|in:client,legal,regulatory,normative,contractual,internal',
            'source' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'customer_requirements' => 'nullable|string',
            'delivery_requirements' => 'nullable|string',
            'compliance_status' => 'nullable|in:compliant,partial,non_compliant,not_applicable',
            'responsible_id' => 'nullable|exists:users,id',
            'deadline' => 'nullable|date',
        ]);

        $requirement = ProductServiceRequirement::create($validated);

        return response()->json(
            $requirement->load(['site:id,name', 'responsible:id,name']),
            201
        );
    }

    public function show(ProductServiceRequirement $productServiceRequirement)
    {
        return response()->json(
            $productServiceRequirement->load(['site:id,name', 'responsible:id,name', 'reviewer:id,name'])
        );
    }

    public function update(Request $request, ProductServiceRequirement $productServiceRequirement)
    {
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'title' => 'sometimes|string|max:255',
            'requirement_type' => 'sometimes|in:client,legal,regulatory,normative,contractual,internal',
            'source' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'customer_requirements' => 'nullable|string',
            'delivery_requirements' => 'nullable|string',
            'compliance_status' => 'sometimes|in:compliant,partial,non_compliant,not_applicable',
            'responsible_id' => 'nullable|exists:users,id',
            'deadline' => 'nullable|date',
        ]);

        $productServiceRequirement->update($validated);

        return response()->json(
            $productServiceRequirement->fresh()->load(['site:id,name', 'responsible:id,name', 'reviewer:id,name'])
        );
    }

    public function destroy(ProductServiceRequirement $productServiceRequirement)
    {
        $productServiceRequirement->delete();

        return response()->json(['message' => 'Exigence produit/service supprimée.']);
    }

    /**
     * Revue de l'exigence (§8.2.3) : pending -> reviewed | approved.
     */
    public function review(Request $request, ProductServiceRequirement $productServiceRequirement)
    {
        $validated = $request->validate([
            'review_status' => 'required|in:reviewed,approved',
            'review_comment' => 'nullable|string',
        ]);

        $productServiceRequirement->update([
            'review_status' => $validated['review_status'],
            'review_comment' => $validated['review_comment'] ?? $productServiceRequirement->review_comment,
            'reviewed_by' => Auth::id() ?? $productServiceRequirement->reviewed_by,
            'reviewed_at' => now(),
        ]);

        return response()->json(
            $productServiceRequirement->fresh()->load(['site:id,name', 'responsible:id,name', 'reviewer:id,name'])
        );
    }

    public function downloadTemplate()
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modele import');
        $sheet->setCellValue('A1', "MODELE D'IMPORT - EXIGENCES PRODUITS / SERVICES (§8.2)");
        $sheet->fromArray([
            'Titre',
            'Type exigence (client, legal, regulatory, normative, contractual, internal)',
            'Source',
            'Description',
            'Exigences client',
            'Exigences livraison',
            'Statut conformite (compliant, partial, non_compliant, not_applicable)',
            'Responsable (nom)',
            'Echeance (AAAA-MM-JJ)',
        ], null, 'A3');
        $sheet->fromArray([
            ['Délai de livraison contractuel', 'contractual', 'Contrat client', 'Respect du délai convenu', 'Livraison sous 15 jours', 'Transport sécurisé', 'compliant', 'Nom responsable', '2026-12-31'],
        ], null, 'A4');

        foreach (range('A', 'I') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'modele_import_exigences_produits_services.xlsx');
    }

    public function exportXlsx(Request $request)
    {
        $query = ProductServiceRequirement::with(['responsible:id,name'])->orderBy('id');

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Exigences');
        $sheet->fromArray([
            'Ref', 'Titre', 'Type exigence', 'Source', 'Description',
            'Exigences client', 'Exigences livraison', 'Statut conformite',
            'Statut revue', 'Responsable', 'Echeance',
        ], null, 'A1');

        $row = 2;
        foreach ($query->get() as $item) {
            $sheet->fromArray([
                $item->ref,
                $item->title,
                $item->requirement_type,
                $item->source,
                $item->description,
                $item->customer_requirements,
                $item->delivery_requirements,
                $item->compliance_status,
                $item->review_status,
                $item->responsible?->name,
                $item->deadline?->format('Y-m-d'),
            ], null, 'A' . $row++);
        }

        foreach (range('A', 'K') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        return $this->downloadSpreadsheet($spreadsheet, 'exigences_produits_services_' . now()->format('Ymd_His') . '.xlsx');
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
                ProductServiceRequirement::create([
                    'site_id' => (int) $validated['site_id'],
                    'title' => $title,
                    'requirement_type' => $this->normalizeRequirementType($row['B'] ?? null),
                    'source' => $this->normalizeStringOrNull($row['C'] ?? null),
                    'description' => $this->normalizeStringOrNull($row['D'] ?? null),
                    'customer_requirements' => $this->normalizeStringOrNull($row['E'] ?? null),
                    'delivery_requirements' => $this->normalizeStringOrNull($row['F'] ?? null),
                    'compliance_status' => $this->normalizeComplianceStatus($row['G'] ?? null),
                    'responsible_id' => $this->resolveUserIdFromName($row['H'] ?? null),
                    'deadline' => $this->normalizeDate($row['I'] ?? null),
                ]);
                $imported++;
            } catch (\Throwable $e) {
                $errors[] = "Ligne {$index} : {$e->getMessage()}";
            }
        }

        return response()->json([
            'success' => true,
            'message' => "{$imported} exigence(s) importée(s).",
            'data' => ['imported' => $imported, 'errors' => $errors],
        ]);
    }

    private function downloadSpreadsheet(Spreadsheet $spreadsheet, string $filename)
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'psr_') . '.xlsx';
        (new Xlsx($spreadsheet))->save($tempPath);

        return response()->download($tempPath, $filename)->deleteFileAfterSend(true);
    }

    private function normalizeStringOrNull(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeRequirementType(mixed $value): string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        return in_array($normalized, ['client', 'legal', 'regulatory', 'normative', 'contractual', 'internal'], true)
            ? $normalized
            : 'client';
    }

    private function normalizeComplianceStatus(mixed $value): string
    {
        $normalized = strtolower(trim((string) ($value ?? '')));
        return match ($normalized) {
            'compliant', 'conforme' => 'compliant',
            'partial', 'partiellement conforme' => 'partial',
            'non_compliant', 'non conforme' => 'non_compliant',
            default => 'not_applicable',
        };
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
