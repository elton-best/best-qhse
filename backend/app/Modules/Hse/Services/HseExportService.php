<?php

namespace App\Modules\Hse\Services;

use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Hse\Models\Duerp;
use App\Modules\Hse\Models\DuerpDanger;
use App\Modules\Hse\Models\EnvironmentalAspect;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Color;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class HseExportService
{
    /**
     * Export DUERP to Excel (identique au canevas officiel Document Unique d'Évaluation des Risques Professionnels)
     */
    public function exportDuerpXlsx(int $enterpriseId, ?int $siteId = null, ?int $duerpId = null): string
    {
        $enterprise = Enterprise::find($enterpriseId);
        $site = $siteId ? Site::find($siteId) : null;

        $query = DuerpDanger::query()
            ->whereHas('duerp', function ($q) use ($enterpriseId, $siteId, $duerpId) {
                $q->where('enterprise_id', $enterpriseId);
                if ($siteId) {
                    $q->where('site_id', $siteId);
                }
                if ($duerpId) {
                    $q->where('id', $duerpId);
                } else {
                    $q->where('is_current', true);
                }
            })
            ->with(['duerp.site', 'process', 'responsible']);

        $dangers = $query->orderBy('work_unit')->orderBy('id')->get();

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('DUERP - ISO 45001');

        // Document Header
        $enterpriseName = $enterprise?->name ?? 'ENTREPRISE';
        $siteName = $site ? ' - Site : '.$site->name : ' - Tous les sites';

        $sheet->setCellValue('A1', "DOCUMENT UNIQUE D'ÉVALUATION DES RISQUES PROFESSIONNELS (DUERP) — ISO 45001");
        $sheet->setCellValue('A2', "Entreprise : {$enterpriseName}{$siteName} | Date d'extraction : ".date('d/m/Y H:i'));

        $sheet->mergeCells('A1:Q1');
        $sheet->mergeCells('A2:Q2');

        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14)->setColor(new Color('FFFFFF'));
        $sheet->getStyle('A1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF1E293B'); // Slate 800
        $sheet->getStyle('A1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $sheet->getStyle('A2')->getFont()->setItalic(true)->setSize(11)->setColor(new Color('475569'));
        $sheet->getStyle('A2')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        // Métadonnées du document (R.4121-1 : date de l'évaluation, mise à jour, validation)
        $documents = $dangers->pluck('duerp')->unique('id')->values();
        $meta = $documents->map(fn ($d) => 'v'.($d->version ?? '1.0').' — évaluation du '.($d->evaluation_date?->format('d/m/Y') ?? '—')
            .' — prochaine mise à jour '.($d->next_evaluation_date?->format('d/m/Y') ?? '—')
            .' — '.match ($d->workflow_status) {
                'approved_by_ceo' => 'approuvé le '.($d->approved_at?->format('d/m/Y') ?? ''), 'submitted_by_rq' => 'soumis à validation', default => 'brouillon'
            })->implode(' | ');
        $sheet->setCellValue('A3', $meta ?: 'Aucun document');
        $sheet->mergeCells('A3:U3');
        $sheet->getStyle('A3')->getFont()->setBold(true)->setSize(10);
        $sheet->getStyle('A3')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->unmergeCells('A1:Q1');
        $sheet->unmergeCells('A2:Q2');
        $sheet->mergeCells('A1:U1');
        $sheet->mergeCells('A2:U2');

        $headers = [
            'A' => 'N°', 'B' => 'Unité de Travail (UT)', 'C' => 'Activité / Poste', 'D' => 'Famille de Danger (INRS)',
            'E' => 'Situation Dangereuse', 'F' => 'Risques Identifiés / Dommages', 'G' => 'Gravité (G)', 'H' => 'Fréquence (F)',
            'I' => 'Risque Brut (G×F)', 'J' => 'Niveau Brut', 'K' => 'Mesures Existantes de Prévention', 'L' => 'Maîtrise (M)',
            'M' => 'Risque Évalué (G×F×M)', 'N' => 'Niveau Évalué', 'O' => 'Plan d\'Actions Préventives', 'P' => 'Responsable',
            'Q' => 'Délai / Échéance', 'R' => 'Statut Action', 'S' => 'Risque Résiduel', 'T' => 'Niveau Résiduel', 'U' => 'Effectifs exposés',
        ];
        foreach ($headers as $col => $val) {
            $sheet->setCellValue("{$col}4", $val);
        }

        $sheet->getStyle('A4:U4')->getFont()->setBold(true)->setColor(new Color('FFFFFF'));
        $sheet->getStyle('A4:U4')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF0F766E');
        $sheet->getStyle('A4:U4')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getRowDimension(4)->setRowHeight(28);

        $maitrise = fn (?string $level) => match ($level) {
            '1' => 'Bonne', '2' => 'Moyenne', '3' => 'Faible ou absente', default => '—'
        };
        $colorLevel = function (string $cell, ?string $level) use ($sheet): void {
            $sheet->getStyle($cell)->getFont()->setBold(true);
            $sheet->getStyle($cell)->getFont()->getColor()->setARGB(match (mb_strtolower((string) $level)) {
                'significatif' => 'FFDC2626', 'moyen' => 'FFD97706', default => 'FF15803D',
            });
        };

        $row = 5;
        $idx = 1;
        foreach ($dangers as $danger) {
            $values = [
                'A' => $idx++,
                'B' => $danger->work_unit ?: ($danger->process?->title ?? 'N/A'),
                'C' => $danger->activity ?? 'N/A',
                'D' => $danger->inrs_family ?? 'N/A',
                'E' => $danger->dangerous_situation ?? 'N/A',
                'F' => $danger->identified_risks ?: ($danger->consequences ?? 'N/A'),
                'G' => $danger->gravity ?? '—',
                'H' => $danger->frequency ?? '—',
                'I' => $danger->raw_risk_score ?? '—',
                'J' => mb_strtoupper((string) ($danger->raw_risk_level ?? '—')),
                'K' => $danger->existing_preventions ?: 'Aucune',
                'L' => $maitrise($danger->mitigation_level),
                'M' => $danger->assessed_risk_score ?? '—',
                'N' => mb_strtoupper((string) ($danger->assessed_risk_level ?? '—')),
                'O' => $danger->prevention_actions ?: 'Aucune',
                'P' => $danger->responsible?->name ?: ($danger->responsible_name ?: 'Non assigné'),
                'Q' => $danger->deadline ? $danger->deadline->format('d/m/Y') : '—',
                'R' => ucfirst(str_replace('_', ' ', (string) ($danger->action_status ?? 'non démarrée'))),
                'S' => $danger->residual_risk_score ?? '—',
                'T' => mb_strtoupper((string) ($danger->residual_risk_level ?? '—')),
                'U' => $danger->exposed_workers_count ?? '—',
            ];
            foreach ($values as $col => $value) {
                $sheet->setCellValue("{$col}{$row}", $value);
            }
            $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("G{$row}:J{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("L{$row}:N{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("Q{$row}:U{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $colorLevel("J{$row}", $danger->raw_risk_level);
            $colorLevel("N{$row}", $danger->assessed_risk_level);
            if ($danger->residual_risk_level) {
                $colorLevel("T{$row}", $danger->residual_risk_level);
            }
            $row++;
        }

        $lastRow = max(5, $row - 1);
        $sheet->getStyle("A4:U{$lastRow}")->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN)->setColor(new Color('CBD5E1'));
        foreach (range('A', 'U') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tempFile = tempnam(sys_get_temp_dir(), 'duerp_').'.xlsx';
        $writer->save($tempFile);

        return $tempFile;
    }

    /**
     * Export AES to Excel (identique au canevas officiel BASE AES 2.xlsx)
     */
    public function exportEnvironmentalAspectsXlsx(int $enterpriseId, array $filters = []): string
    {
        $enterprise = Enterprise::find($enterpriseId);
        $site = ! empty($filters['site_id']) ? Site::find($filters['site_id']) : null;

        $query = EnvironmentalAspect::query()
            ->where('enterprise_id', $enterpriseId)
            ->with(['site', 'process', 'responsible']);

        if (! empty($filters['site_id'])) {
            $query->where('site_id', $filters['site_id']);
        }
        if (! empty($filters['process_id'])) {
            $query->where('process_id', $filters['process_id']);
        }
        if (isset($filters['is_significant'])) {
            $query->where('is_significant', (bool) $filters['is_significant']);
        }

        $aspects = $query->orderBy('process_id')->orderBy('id')->get();

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('AES - ISO 14001');

        // Header
        $enterpriseName = $enterprise?->name ?? 'ENTREPRISE';
        $siteName = $site ? ' - Site : '.$site->name : ' - Tous les sites';

        $sheet->setCellValue('A1', 'ANALYSE ENVIRONNEMENTALE & ASPECTS ENVIRONNEMENTAUX SIGNIFICATIFS (AES) — ISO 14001');
        $sheet->setCellValue('A2', "Entreprise : {$enterpriseName}{$siteName} | Seuil de significativité standard : 343 | Date d'extraction : ".date('d/m/Y H:i'));

        $sheet->mergeCells('A1:T1');
        $sheet->mergeCells('A2:T2');

        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14)->setColor(new Color('FFFFFF'));
        $sheet->getStyle('A1')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF166534'); // Green 800
        $sheet->getStyle('A1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $sheet->getStyle('A2')->getFont()->setItalic(true)->setSize(11)->setColor(new Color('475569'));
        $sheet->getStyle('A2')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        // Column Headers
        $headers = [
            'A4' => 'N°',
            'B4' => 'Processus / Domaine',
            'C4' => 'Sous-Processus / Zone',
            'D4' => 'Mode (N/A)',
            'E4' => 'Activité',
            'F4' => 'Aspect Environnemental',
            'G4' => 'Impact Environnemental',
            'H4' => 'Mesures Existantes de Maîtrise',
            'I4' => 'Gravité (G)',
            'J4' => 'Fréquence (F)',
            'K4' => 'Sensibilité (S)',
            'L4' => 'Maîtrise (M)',
            'M4' => 'Score Criticité (IC)',
            'N4' => 'Significatif ?',
            'O4' => 'Actions de Maîtrise Complémentaires',
            'P4' => 'Responsable',
            'Q4' => 'Délai / Échéance',
            'R4' => 'Regroupement',
            'S4' => 'Activités / produits regroupés',
            'T4' => 'Caractéristiques communes',
        ];

        foreach ($headers as $cell => $val) {
            $sheet->setCellValue($cell, $val);
        }

        $sheet->getStyle('A4:T4')->getFont()->setBold(true)->setColor(new Color('FFFFFF'));
        $sheet->getStyle('A4:T4')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF15803D'); // Green 700
        $sheet->getStyle('A4:T4')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getRowDimension(4)->setRowHeight(28);

        // Rows
        $row = 5;
        $idx = 1;
        foreach ($aspects as $aspect) {
            $sheet->setCellValue("A{$row}", $idx++);
            $sheet->setCellValue("B{$row}", $aspect->process?->title ?? 'Général');
            $sheet->setCellValue("C{$row}", $aspect->sub_process ?? '—');
            $sheet->setCellValue("D{$row}", $aspect->mode ?? 'N');
            $sheet->setCellValue("E{$row}", $aspect->activity);
            $sheet->setCellValue("F{$row}", $aspect->aspect);
            $sheet->setCellValue("G{$row}", $aspect->impact);
            $sheet->setCellValue("H{$row}", $aspect->existing_controls ?: 'Aucune');
            $sheet->setCellValue("I{$row}", $aspect->gravity ?? 1);
            $sheet->setCellValue("J{$row}", $aspect->frequency ?? 1);
            $sheet->setCellValue("K{$row}", $aspect->sensitivity ?? 1);
            $sheet->setCellValue("L{$row}", $aspect->mastery ?? 1);
            $sheet->setCellValue("M{$row}", $aspect->criticality_score ?? ($aspect->gravity * $aspect->frequency * $aspect->sensitivity * $aspect->mastery));
            $sheet->setCellValue("N{$row}", $aspect->is_significant ? 'OUI (AES)' : 'NON');
            $sheet->setCellValue("O{$row}", $aspect->additional_actions ?: '—');
            $sheet->setCellValue("P{$row}", $aspect->responsible?->name ?: ($aspect->responsible_name ?: 'Non assigné'));
            $sheet->setCellValue("Q{$row}", $aspect->deadline ? $aspect->deadline->format('d/m/Y') : '—');

            $sheet->setCellValue("R{$row}", $aspect->group_label);
            $sheet->setCellValue("S{$row}", implode("\n", $aspect->group_members ?? []));
            $sheet->setCellValue("T{$row}", $aspect->group_characteristics);

            // Alignment
            $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("D{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("I{$row}:N{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("Q{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

            // Highlight significant aspects
            if ($aspect->is_significant) {
                $sheet->getStyle("N{$row}")->getFont()->setBold(true)->getColor()->setARGB('FFDC2626');
                $sheet->getStyle("M{$row}")->getFont()->setBold(true)->getColor()->setARGB('FFDC2626');
                $sheet->getStyle("N{$row}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFFEE2E2');
            }

            $row++;
        }

        // Borders
        $lastRow = max(5, $row - 1);
        $sheet->getStyle("A4:T{$lastRow}")->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN)->setColor(new Color('CBD5E1'));

        // Auto-fit
        foreach (range('A', 'T') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tempFile = tempnam(sys_get_temp_dir(), 'aes_').'.xlsx';
        $writer->save($tempFile);

        return $tempFile;
    }
}
