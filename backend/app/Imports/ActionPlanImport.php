<?php

namespace App\Imports;

use App\Models\Process;
use App\Models\Site;
use App\Models\User;
use App\Modules\Improvement\Services\ActionService;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Import d'un plan d'actions depuis XLSX.
 *
 * Format attendu = le gabarit `Template_Plan_Actions.xlsx`
 * (GET actions/templates/plan) :
 *   A N° | B Titre | C Description | D Type | E Priorité |
 *   F Responsable (email) | G Processus (code) | H Codification documentaire (info, ignorée) |
 *   I Délai (JJ/MM/AAAA) | J Statut
 */
class ActionPlanImport
{
    protected array $errors = [];
    protected int $imported = 0;
    protected int $currentRow = 0;
    protected ?int $siteId = null;
    protected ?int $enterpriseId = null;

    protected ActionService $service;

    public function __construct(?ActionService $service = null)
    {
        $this->service = $service ?? app(ActionService::class);
    }

    /**
     * Import XLSX file
     */
    public function import(string $filePath, ?int $siteId = null): array
    {
        $this->errors = [];
        $this->imported = 0;

        $user = auth()->user();
        $this->enterpriseId = $user?->enterprise_id ? (int) $user->enterprise_id : null;
        $this->siteId = $siteId
            ?? ($user?->site_id ? (int) $user->site_id : null)
            ?? $this->firstEnterpriseSiteId();

        try {
            $spreadsheet = IOFactory::load($filePath);
            $sheet = $spreadsheet->getActiveSheet();

            $this->processSheet($sheet);
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
     * Process sheet
     */
    protected function processSheet(Worksheet $sheet): void
    {
        $highestRow = $sheet->getHighestRow();

        // Ligne 1 = en-têtes, on démarre à la ligne 2.
        for ($row = 2; $row <= $highestRow; $row++) {
            $this->currentRow = $row;

            $rowData = [
                'numero' => $this->cell($sheet, 'A'.$row),
                'titre' => $this->cell($sheet, 'B'.$row),
                'description' => $this->cell($sheet, 'C'.$row),
                'type' => $this->cell($sheet, 'D'.$row),
                'priorite' => $this->cell($sheet, 'E'.$row),
                'responsable_email' => $this->cell($sheet, 'F'.$row),
                'processus_code' => $this->cell($sheet, 'G'.$row),
                // H = Codification documentaire : informative, sans colonne cible.
                'delai' => $this->strVal($sheet->getCell('I'.$row)->getValue()),
                'statut' => $this->cell($sheet, 'J'.$row),
            ];

            // Ligne vide => ignorée (la légende sous le tableau aussi : pas de titre).
            if ($rowData['titre'] === null || trim((string) $rowData['titre']) === '') {
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

        $title = trim((string) ($rowData['titre'] ?? ''));
        if ($title === '' || mb_strlen($title) > 255) {
            $rowErrors[] = 'Le titre est obligatoire (255 caractères maximum).';
        }

        $type = $this->mapType($rowData['type']);
        if ($type === null) {
            $rowErrors[] = 'Type invalide (attendu : Corrective, Préventive ou Amélioration).';
        }

        $priority = $this->mapPriorite($rowData['priorite']);
        if ($priority === null) {
            $rowErrors[] = 'Priorité invalide (attendue : Basse, Moyenne, Haute ou Critique).';
        }

        $responsibleId = $this->resolveUser($rowData['responsable_email'], $rowErrors);
        $processId = $this->resolveProcess($rowData['processus_code'], $rowErrors);
        $deadline = $this->parseDeadline($rowData['delai'], $rowErrors);
        $status = $this->mapStatut($rowData['statut']);
        if ($status === null) {
            $rowErrors[] = 'Statut invalide (attendu : Planifiée, En cours, Terminée, Validée ou Annulée).';
        }

        if ($this->siteId === null) {
            $rowErrors[] = 'Aucun site cible (renseignez site_id ou sélectionnez un site).';
        }

        if (count($rowErrors) > 0) {
            $this->errors[] = ['row' => $this->currentRow, 'errors' => $rowErrors];
            return;
        }

        try {
            $description = trim((string) ($rowData['description'] ?? ''));
            $payload = [
                'site_id' => $this->siteId,
                'process_id' => $processId,
                'type' => $type,
                'priority' => $priority,
                'title' => $title,
                'description' => $description !== '' ? $description : 'Action importée depuis Excel',
                'responsible_id' => $responsibleId,
                'deadline' => $deadline,
                'status' => $status,
                'progress' => $status === 'completed' ? 100 : 0,
            ];
            if ($status === 'completed') {
                $payload['completion_date'] = now()->toDateString();
            }

            $this->service->create($payload);
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
        return $this->strVal($sheet->getCell($coord)->getValue());
    }

    protected function strVal(mixed $value): mixed
    {
        if ($value instanceof \PhpOffice\PhpSpreadsheet\RichText\RichText) {
            $value = $value->getPlainText();
        }
        if (is_string($value)) {
            $value = trim($value);
            return $value === '' ? null : $value;
        }
        return $value;
    }

    protected function resolveUser(mixed $email, array &$rowErrors): ?int
    {
        if ($email === null || $email === '') {
            return null;
        }
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $rowErrors[] = 'E-mail responsable invalide.';
            return null;
        }
        $query = User::where('email', $email);
        if ($this->enterpriseId) {
            $query->where('enterprise_id', $this->enterpriseId);
        }
        $user = $query->first();
        if (!$user) {
            $rowErrors[] = "Responsable introuvable : {$email}.";
            return null;
        }
        return (int) $user->id;
    }

    protected function resolveProcess(mixed $code, array &$rowErrors): ?int
    {
        if ($code === null || $code === '' || !is_string($code)) {
            $rowErrors[] = 'Processus (code) obligatoire et doit exister.';
            return null;
        }
        // `code` est unique globalement : recherche directe.
        $process = Process::where('code', trim($code))->first();
        if (!$process) {
            $rowErrors[] = "Processus introuvable : {$code}.";
            return null;
        }
        return (int) $process->id;
    }

    protected function parseDeadline(mixed $value, array &$rowErrors): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        try {
            if (is_numeric($value)) {
                return ExcelDate::excelToDateTimeObject((float) $value)->format('Y-m-d');
            }
            $text = trim((string) $value);
            if (preg_match('#^\d{2}/\d{2}/\d{4}$#', $text)) {
                return Carbon::createFromFormat('d/m/Y', $text)->format('Y-m-d');
            }
            return Carbon::parse($text)->format('Y-m-d');
        } catch (\Exception) {
            $rowErrors[] = 'Délai invalide (attendu : JJ/MM/AAAA).';
            return null;
        }
    }

    protected function mapType(mixed $type): ?string
    {
        if ($type === null || $type === '') {
            return 'corrective';
        }
        $value = mb_strtolower(trim((string) $type));
        if (str_contains($value, 'correct')) {
            return 'corrective';
        }
        if (str_contains($value, 'prevent') || str_contains($value, 'prévent') || str_contains($value, 'prevent')) {
            return 'preventive';
        }
        if (str_contains($value, 'amelior') || str_contains($value, 'amélior') || str_contains($value, 'improv')) {
            return 'improvement';
        }
        if (str_contains($value, 'immediate') || str_contains($value, 'immédiat')) {
            return 'immediate';
        }
        return null;
    }

    protected function mapPriorite(mixed $priorite): ?string
    {
        if ($priorite === null || $priorite === '') {
            return 'medium';
        }
        $value = mb_strtolower(trim((string) $priorite));
        if (str_contains($value, 'crit') || str_contains($value, 'urgent')) {
            return 'critical';
        }
        if (str_contains($value, 'haut') || str_contains($value, 'high') || str_contains($value, 'elev')) {
            return 'high';
        }
        if (str_contains($value, 'moyen') || str_contains($value, 'medium') || str_contains($value, 'normal')) {
            return 'medium';
        }
        if (str_contains($value, 'bas') || str_contains($value, 'low') || str_contains($value, 'faible')) {
            return 'low';
        }
        return null;
    }

    protected function mapStatut(mixed $statut): ?string
    {
        if ($statut === null || $statut === '') {
            return 'planned';
        }
        $value = mb_strtolower(trim((string) $statut));
        if (str_contains($value, 'planif') || str_contains($value, 'planned') || str_contains($value, 'brouillon') || str_contains($value, 'assign')) {
            return 'planned';
        }
        if (str_contains($value, 'cours') || str_contains($value, 'progress') || str_contains($value, 'demarr')) {
            return 'in_progress';
        }
        if (str_contains($value, 'termin') || str_contains($value, 'complet') || str_contains($value, 'clotur') || str_contains($value, 'clôtur') || str_contains($value, 'done')) {
            return 'completed';
        }
        if (str_contains($value, 'valid') || str_contains($value, 'verifi') || str_contains($value, 'vérifi') || str_contains($value, 'verif')) {
            return 'verified';
        }
        if (str_contains($value, 'annul') || str_contains($value, 'cancel')) {
            return 'cancelled';
        }
        return null;
    }

    protected function firstEnterpriseSiteId(): ?int
    {
        $query = Site::query()->orderBy('id');
        if ($this->enterpriseId) {
            $query->where('enterprise_id', $this->enterpriseId);
        }
        $id = $query->value('id');
        return $id === null ? null : (int) $id;
    }

    // Gardé pour compatibilité avec l'ancien appelant (non utilisé en interne).
    public function __invoke(string $filePath, ?int $siteId = null): array
    {
        return $this->import($filePath, $siteId);
    }
}
