<?php

namespace App\Modules\Hse\Services;

use App\Modules\Hse\Models\Duerp;
use App\Modules\Hse\Models\DuerpDanger;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Enterprise\Models\Site;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class HseExportService
{
    /**
     * Export DUERP using the field structure of the supplied INRS workbook.
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
            ->with(['duerp.site', 'process', 'workUnit', 'riskFamily', 'responsible']);

        $dangers = $query->orderBy('work_unit')->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('DUERP - ISO 45001');

        // The supplied workbook uses B:AC for its 28 DUERP fields.
        $lastColumn = 'AC';
        $enterpriseName = $enterprise?->name ?? 'ENTREPRISE';
        $siteName = $site ? ' - Site : ' . $site->name : ' - Tous les sites';
        $sheet->setCellValue('B2', "DOCUMENT UNIQUE D'ÉVALUATION DES RISQUES PROFESSIONNELS (DUERP)");
        $sheet->setCellValue('B3', "Entreprise : {$enterpriseName}{$siteName} | Date d'extraction : " . date('d/m/Y H:i'));
        $sheet->mergeCells("B2:{$lastColumn}2");
        $sheet->mergeCells("B3:{$lastColumn}3");

        $sheet->getStyle("B2:{$lastColumn}2")->getFont()->setBold(true)->setSize(14)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B2:{$lastColumn}2")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF1E293B');
        $sheet->getStyle("B2:{$lastColumn}2")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle("B3:{$lastColumn}3")->getFont()->setItalic(true)->setSize(11)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('475569'));
        $sheet->getStyle("B3:{$lastColumn}3")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $groups = [
            'B4:H4' => 'IDENTIFICATION DU RISQUE',
            'I4:S4' => 'ÉVALUATION DU RISQUE',
            'T4:Y4' => "PLAN D'ACTIONS",
            'Z4:AC4' => 'SUIVI / ÉVALUATION',
        ];
        foreach ($groups as $range => $label) {
            $sheet->mergeCells($range);
            $sheet->setCellValue(explode(':', $range)[0], $label);
        }

        $headers = [
            'Processus',
            'Activités',
            'Unité de travail : postes de travail',
            'Famille de risques selon l’INRS',
            'Description de la situation dangereuse',
            'Risques identifiés',
            'Conséquences',
            'Gravité',
            'Fréquence',
            'Évaluation du risque brut',
            'Coefficient / score brut',
            'Actions existantes',
            'Maîtrise du risque',
            'Coefficient de maîtrise',
            'Gravité résiduelle',
            'Fréquence résiduelle',
            'Évaluation du risque résiduel',
            'Coefficient / score résiduel',
            'Actions de prévention à mettre en place',
            'Priorités',
            'Responsable des actions',
            'Date de décision',
            'Délai d’exécution / échéance',
            'Réalisation / statut',
            'Date d’évaluation de l’efficacité',
            'Critère de réalisation / effectivité',
            'Critère de performance / efficacité',
            'Observations / commentaires',
        ];
        foreach ($headers as $index => $header) {
            $column = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index + 2);
            $sheet->setCellValue("{$column}5", $header);
        }

        $sheet->getStyle("B4:{$lastColumn}4")->getFont()->setBold(true)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B4:{$lastColumn}4")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF0F766E');
        $sheet->getStyle("B4:{$lastColumn}4")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getStyle("B5:{$lastColumn}5")->getFont()->setBold(true)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B5:{$lastColumn}5")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF0F766E');
        $sheet->getStyle("B5:{$lastColumn}5")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER)->setWrapText(true);
        $sheet->getRowDimension(4)->setRowHeight(24);
        $sheet->getRowDimension(5)->setRowHeight(48);

        $row = 6;
        foreach ($dangers as $danger) {
            $rawRiskScore = $danger->raw_risk_score
                ?? ((int) ($danger->gravity ?? 1) * (int) ($danger->frequency ?? 1));
            $rawRiskLevel = $danger->raw_risk_level ?: match (true) {
                $rawRiskScore <= 3 => 'Faible',
                $rawRiskScore <= 8 => 'Moyen',
                default => 'Significatif',
            };
            $values = [
                $danger->process?->title ?? '—',
                $danger->activity ?: ($danger->activity_name ?? '—'),
                $danger->work_unit ?: ($danger->workUnit?->name ?? '—'),
                $danger->inrs_family ?: ($danger->riskFamily?->name ?? '—'),
                $danger->dangerous_situation ?? '—',
                $danger->identified_risks ?: '—',
                $danger->consequences ?? '—',
                $danger->gravity,
                $danger->frequency,
                $rawRiskLevel,
                $rawRiskScore,
                $danger->existing_preventions ?: '—',
                $danger->mitigation_level ?? '—',
                $danger->mitigation_coef,
                $danger->residual_gravity,
                $danger->residual_frequency,
                $danger->residual_risk_level ?? '—',
                $danger->residual_risk_score,
                $danger->prevention_actions ?: '—',
                $rawRiskLevel,
                $danger->responsible?->name ?: ($danger->responsible_name ?: 'Non assigné'),
                null, // The current model does not store a separate action decision date.
                $danger->deadline?->format('d/m/Y'),
                $danger->action_status ? ucfirst(str_replace('_', ' ', $danger->action_status)) : '—',
                $danger->action_evaluation_date?->format('d/m/Y'),
                $danger->action_effectivity_criteria ?? '—',
                $danger->action_efficacy_criteria ?? '—',
                $danger->observations ?? '—',
            ];
            foreach ($values as $index => $value) {
                $column = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index + 2);
                $sheet->setCellValue("{$column}{$row}", $value);
            }

            $sheet->getStyle("I{$row}:S{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("W{$row}:Z{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $level = mb_strtolower((string) $rawRiskLevel);
            if (in_array($level, ['significatif', 'fort'], true)) {
                $sheet->getStyle("K{$row}")->getFont()->getColor()->setARGB('FFDC2626');
                $sheet->getStyle("K{$row}")->getFont()->setBold(true);
            } elseif ($level === 'moyen') {
                $sheet->getStyle("K{$row}")->getFont()->getColor()->setARGB('FFD97706');
            }

            $row++;
        }

        $lastRow = max(6, $row - 1);
        $sheet->getStyle("B4:{$lastColumn}{$lastRow}")->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('CBD5E1'));
        $sheet->freezePane('B6');
        $sheet->setAutoFilter("B5:{$lastColumn}{$lastRow}");
        foreach (range(2, 29) as $index) {
            $sheet->getColumnDimension(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tempFile = tempnam(sys_get_temp_dir(), 'duerp_') . '.xlsx';
        $writer->save($tempFile);

        return $tempFile;
    }

    /**
     * Export AES using the field structure of the supplied BASE AES workbook.
     */
    public function exportEnvironmentalAspectsXlsx(int $enterpriseId, array $filters = []): string
    {
        $enterprise = Enterprise::find($enterpriseId);
        $site = !empty($filters['site_id']) ? Site::find($filters['site_id']) : null;

        $query = EnvironmentalAspect::query()
            ->where('enterprise_id', $enterpriseId)
            ->with(['site', 'process', 'responsible']);

        if (!empty($filters['site_id'])) {
            $query->where('site_id', $filters['site_id']);
        }
        if (!empty($filters['process_id'])) {
            $query->where('process_id', $filters['process_id']);
        }
        if (isset($filters['is_significant'])) {
            $query->where('is_significant', (bool) $filters['is_significant']);
        }

        $aspects = $query->orderBy('process_id')->orderBy('id')->get();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('AES - ISO 14001');

        // The supplied BASE AES "Exemple" sheet contains 19 fields in B:T.
        $lastColumn = 'T';
        $enterpriseName = $enterprise?->name ?? 'ENTREPRISE';
        $siteName = $site ? ' - Site : ' . $site->name : ' - Tous les sites';
        $sheet->setCellValue('B2', 'REGISTRE DES ASPECTS ENVIRONNEMENTAUX ET AES — ISO 14001');
        $sheet->setCellValue('B3', "Entreprise : {$enterpriseName}{$siteName} | Seuil de significativité paramétré dans l'entreprise | Date d'extraction : " . date('d/m/Y H:i'));
        $sheet->mergeCells("B2:{$lastColumn}2");
        $sheet->mergeCells("B3:{$lastColumn}3");

        $sheet->getStyle("B2:{$lastColumn}2")->getFont()->setBold(true)->setSize(14)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B2:{$lastColumn}2")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF166534');
        $sheet->getStyle("B2:{$lastColumn}2")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $sheet->getStyle("B3:{$lastColumn}3")->getFont()->setItalic(true)->setSize(11)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('475569'));
        $sheet->getStyle("B3:{$lastColumn}3")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $groups = [
            'B4:H4' => 'IDENTIFICATION',
            'I4:L4' => 'ÉVALUATION',
            'M4:N4' => 'RÉSULTATS',
            'O4:Q4' => 'TRAITEMENT ET PRÉVENTION',
            'R4:T4' => 'SUIVI ET ÉVALUATION',
        ];
        foreach ($groups as $range => $label) {
            $sheet->mergeCells($range);
            $sheet->setCellValue(explode(':', $range)[0], $label);
        }

        $headers = [
            'Processus',
            'Sous-processus / activité',
            'Mode',
            'Aspect environnemental',
            'Impact environnemental',
            'Risque associé',
            'Actions de maîtrise ou préventions existantes',
            'Gravité',
            'Fréquence / probabilité',
            'Sensibilité',
            'Maîtrise',
            'Criticité (Cr)',
            'AES',
            'Actions',
            'Responsable',
            'Délai',
            'Observations',
            "Critère d'effectivité",
            "Critère d'efficacité",
        ];
        foreach ($headers as $index => $header) {
            $column = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index + 2);
            $sheet->setCellValue("{$column}5", $header);
        }

        $sheet->getStyle("B4:{$lastColumn}4")->getFont()->setBold(true)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B4:{$lastColumn}4")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF15803D');
        $sheet->getStyle("B4:{$lastColumn}4")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER);
        $sheet->getStyle("B5:{$lastColumn}5")->getFont()->setBold(true)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FFFFFF'));
        $sheet->getStyle("B5:{$lastColumn}5")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF15803D');
        $sheet->getStyle("B5:{$lastColumn}5")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER)->setVertical(Alignment::VERTICAL_CENTER)->setWrapText(true);
        $sheet->getRowDimension(4)->setRowHeight(24);
        $sheet->getRowDimension(5)->setRowHeight(42);

        $row = 6;
        foreach ($aspects as $aspect) {
            $values = [
                $aspect->process?->title ?? 'Général',
                $aspect->sub_process ?: $aspect->activity,
                $aspect->mode ?? 'N',
                $aspect->aspect,
                $aspect->impact,
                $aspect->risk ?? '—',
                $aspect->existing_controls ?: '—',
                $aspect->gravity,
                $aspect->frequency,
                $aspect->sensitivity,
                $aspect->mastery,
                $aspect->criticality_score,
                $aspect->is_significant ? 'OUI' : 'NON',
                $aspect->additional_actions ?: '—',
                $aspect->responsible?->name ?: ($aspect->responsible_name ?: 'Non assigné'),
                $aspect->deadline?->format('d/m/Y'),
                $aspect->observations ?? '—',
                $aspect->effectiveness_criterion ?? '—',
                $aspect->efficiency_criterion ?? '—',
            ];
            foreach ($values as $index => $value) {
                $column = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index + 2);
                $sheet->setCellValue("{$column}{$row}", $value);
            }

            $sheet->getStyle("D{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("I{$row}:N{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("Q{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

            if ($aspect->is_significant) {
                $sheet->getStyle("N{$row}")->getFont()->setBold(true)->getColor()->setARGB('FFDC2626');
                $sheet->getStyle("M{$row}")->getFont()->setBold(true)->getColor()->setARGB('FFDC2626');
                $sheet->getStyle("N{$row}")->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FFFEE2E2');
            }

            $row++;
        }

        $lastRow = max(6, $row - 1);
        $sheet->getStyle("B4:{$lastColumn}{$lastRow}")->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_THIN)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('CBD5E1'));
        $sheet->freezePane('B6');
        $sheet->setAutoFilter("B5:{$lastColumn}{$lastRow}");
        foreach (range(2, 20) as $index) {
            $sheet->getColumnDimension(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($index))->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);
        $tempFile = tempnam(sys_get_temp_dir(), 'aes_') . '.xlsx';
        $writer->save($tempFile);

        return $tempFile;
    }
}

