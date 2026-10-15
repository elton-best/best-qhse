<?php

namespace App\Imports;

use App\Models\Document;
use App\Models\DocumentTypeCatalog;
use App\Models\Process;
use App\Models\Site;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\RichText\RichText;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Import d'inventaire documentaire depuis XLSX.
 *
 * Format attendu = le gabarit `modele_inventaire_documentaire.xlsx`
 * (GET documents/inventory-template, basé sur M5-D2) :
 * - Feuille 1 : cartouche/légende (ignorée).
 * - Feuille 2 « Inventaire » : A N° | B PRC (code ou abréviation du processus)
 *   | C Type | D Nom | E Code (vide = auto) | F Version | G État | H Observation.
 */
class DocumentInventoryImport
{
    protected array $errors = [];
    protected int $imported = 0;
    protected int $currentRow = 0;
    protected ?int $siteId = null;
    protected ?int $enterpriseId = null;

    /**
     * Import XLSX file
     */
    public function import(string $filePath, ?int $siteId = null): array
    {
        $this->errors = [];
        $this->imported = 0;
        $this->siteId = $siteId;

        $user = auth()->user();
        $this->enterpriseId = $user?->enterprise_id ? (int) $user->enterprise_id : null;

        try {
            $spreadsheet = IOFactory::load($filePath);

            // Première feuille = cartouche, on lit la deuxième (Inventaire).
            if ($spreadsheet->getSheetCount() < 2) {
                throw new \Exception('Le fichier doit contenir au moins 2 feuilles : cartouche et inventaire.');
            }

            $this->processSheet($spreadsheet->getSheet(1));
        } catch (\Exception $e) {
            $this->errors[] = [
                'row' => 0,
                'errors' => ['Erreur lecture fichier : '.$e->getMessage()],
            ];
        }

        return [
            'success' => $this->imported,
            'errors' => count($this->errors),
            'error_details' => $this->errors,
        ];
    }

    /**
     * Process inventory sheet
     */
    protected function processSheet(Worksheet $sheet): void
    {
        $highestRow = $sheet->getHighestRow();

        // Ligne 1 = en-têtes.
        for ($row = 2; $row <= $highestRow; $row++) {
            $this->currentRow = $row;

            $rowData = [
                'numero' => $this->cell($sheet, 'A'.$row),
                'prc' => $this->cell($sheet, 'B'.$row),
                'type' => $this->cell($sheet, 'C'.$row),
                'nom' => $this->cell($sheet, 'D'.$row),
                'code' => $this->cell($sheet, 'E'.$row),
                'version' => $this->cell($sheet, 'F'.$row),
                'etat' => $this->cell($sheet, 'G'.$row),
                'observation' => $this->cell($sheet, 'H'.$row),
            ];

            // Ligne vide => ignorée.
            if (($rowData['nom'] === null || trim((string) $rowData['nom']) === '')
                && ($rowData['code'] === null || trim((string) $rowData['code']) === '')
            ) {
                continue;
            }

            $this->processRow($rowData);
        }
    }

    /**
     * Process single row
     */
    protected function processRow(array $rowData): void
    {
        $rowErrors = [];

        $title = trim((string) ($rowData['nom'] ?? ''));
        if ($title === '' || mb_strlen($title) > 255) {
            $rowErrors[] = 'Le nom du document est obligatoire (255 caractères maximum).';
        }

        if ($this->siteId === null) {
            $rowErrors[] = 'Aucun site cible (renseignez site_id ou sélectionnez un site).';
        }

        $processId = $this->resolveProcess($rowData['prc']);
        $typeConfigId = $this->resolveType($rowData['type']);
        $status = $this->mapEtat($rowData['etat']);
        if ($status === null) {
            $rowErrors[] = 'État invalide (attendu : brouillon, en revue, validé ou archivé).';
        }

        $version = trim((string) ($rowData['version'] ?? ''));
        if ($version === '') {
            $version = '1.0';
        }

        if (count($rowErrors) > 0) {
            $this->errors[] = ['row' => $this->currentRow, 'errors' => $rowErrors];
            return;
        }

        try {
            $code = trim((string) ($rowData['code'] ?? ''));
            if ($code === '') {
                $code = $this->generateCode($typeConfigId, $processId);
            }

            Document::create([
                'site_id' => $this->siteId,
                'enterprise_id' => $this->enterpriseId,
                'process_id' => $processId,
                'processus' => is_string($rowData['prc']) ? trim($rowData['prc']) : null,
                'document_type_configuration_id' => $typeConfigId,
                'code' => $code,
                'title' => $title,
                'description' => is_string($rowData['observation']) ? trim($rowData['observation']) : null,
                'version' => mb_substr($version, 0, 50),
                'status' => $status,
                'workflow_status' => $status,
                'source_type' => 'import',
                'author_id' => auth()->id(),
            ]);

            $this->imported++;
        } catch (\Exception $e) {
            $this->errors[] = [
                'row' => $this->currentRow,
                'errors' => ['Erreur création : '.$e->getMessage()],
            ];
        }
    }

    // ---------- Résolutions / mappings ----------

    protected function cell(Worksheet $sheet, string $coord): mixed
    {
        $value = $sheet->getCell($coord)->getValue();
        if ($value instanceof RichText) {
            $value = $value->getPlainText();
        }
        if (is_string($value)) {
            $value = trim($value);
            return $value === '' ? null : $value;
        }
        return $value;
    }

    protected function resolveProcess(mixed $prc): ?int
    {
        if (!is_string($prc) || trim($prc) === '') {
            return null;
        }
        $ref = trim($prc);
        $process = Process::where('code', $ref)->orWhere('abbreviation', $ref)->first();
        return $process ? (int) $process->id : null;
    }

    protected function resolveType(mixed $type): ?int
    {
        $abbr = $this->mapTypeAbbr($type);
        if ($abbr === null) {
            return null;
        }
        $catalog = DocumentTypeCatalog::where('abbreviation', $abbr)->first();
        return $catalog ? (int) $catalog->id : null;
    }

    protected function mapTypeAbbr(mixed $type): ?string
    {
        if (!is_string($type) || trim($type) === '') {
            return null;
        }
        $value = mb_strtolower(trim($type));
        if (str_contains($value, 'polit')) {
            return 'POL';
        }
        if (str_contains($value, 'manuel') || str_contains($value, 'manual')) {
            return null;
        }
        if (str_contains($value, 'proced') || str_contains($value, 'procéd')) {
            return 'PRC';
        }
        if (str_contains($value, 'instruct')) {
            return 'PRD';
        }
        if (str_contains($value, 'enreg')) {
            return 'ENR';
        }
        if (str_contains($value, 'formul')) {
            return 'FOR';
        }
        // Abréviation directe (POL, PRC, PRD, ENR, FOR).
        $upper = mb_strtoupper(trim($type));
        if (in_array($upper, ['POL', 'PRC', 'PRD', 'ENR', 'FOR'], true)) {
            return $upper;
        }
        return null;
    }

    protected function mapEtat(mixed $etat): ?string
    {
        if ($etat === null || (is_string($etat) && trim($etat) === '')) {
            return 'draft';
        }
        $value = mb_strtolower(trim((string) $etat));
        if (str_contains($value, 'brouillon') || str_contains($value, 'draft')) {
            return 'draft';
        }
        if (str_contains($value, 'revue') || str_contains($value, 'review') || str_contains($value, 'verification') || str_contains($value, 'vérification') || str_contains($value, 'approbation') || str_contains($value, 'correction')) {
            return 'pending_verification';
        }
        if (str_contains($value, 'valid') || str_contains($value, 'termin') || str_contains($value, 'publi') || str_contains($value, 'approuv')) {
            return 'approved';
        }
        if (str_contains($value, 'archiv') || str_contains($value, 'obsolet') || str_contains($value, 'obsol')) {
            return 'obsolete';
        }
        if (str_contains($value, 'rejet')) {
            return 'rejected';
        }
        return null;
    }

    protected function generateCode(?int $typeConfigId, ?int $processId): string
    {
        $abbr = 'DOC';
        if ($typeConfigId) {
            $abbr = (string) (DocumentTypeCatalog::where('id', $typeConfigId)->value('abbreviation') ?: 'DOC');
        }
        $prc = 'GEN';
        if ($processId) {
            $prc = (string) (Process::where('id', $processId)->value('abbreviation')
                ?: Process::where('id', $processId)->value('code')
                ?: 'GEN');
        }
        return sprintf('%s/%s/IMP-%d', $abbr, $prc, time() % 1000000 + $this->currentRow);
    }
}
