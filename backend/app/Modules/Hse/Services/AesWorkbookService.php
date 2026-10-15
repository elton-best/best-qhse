<?php

namespace App\Modules\Hse\Services;

use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Canevas Excel du registre des aspects (feuilles « Cotation » et « Registre ») et lecture
 * contrôlée d'un registre existant avant intégration (ISO 14001 §6.1.2, M4-11).
 */
class AesWorkbookService
{
    public const REGISTER_SHEET = 'Registre';

    public const FIRST_DATA_ROW = 5;

    /** @var array<int, array{0: string, 1: string}> colonne du canevas => [clé, en-tête] */
    private const COLUMNS = [
        ['aspect_number', 'N°'],
        ['process', 'Processus'],
        ['sub_process', 'Sous-processus / zone'],
        ['mode', 'Mode (N ou A)'],
        ['activity', 'Activité'],
        ['aspect', 'Aspect environnemental'],
        ['impact', 'Impact environnemental'],
        ['risk', 'Risque associé'],
        ['existing_controls', 'Mesures de maîtrise existantes'],
        ['gravity', 'Gravité (G)'],
        ['frequency', 'Fréquence (F)'],
        ['sensitivity', 'Sensibilité (S)'],
        ['mastery', 'Maîtrise (M)'],
        ['additional_actions', 'Actions complémentaires'],
        ['responsible', 'Responsable (nom)'],
        ['deadline', 'Délai (AAAA-MM-JJ)'],
        ['effectiveness_criterion', "Critère d'effectivité"],
        ['efficiency_criterion', "Critère d'efficacité"],
        ['observations', 'Observations'],
    ];

    public function __construct(private readonly AesSignificanceService $significance) {}

    /**
     * @param  array<string, mixed>  $settings
     */
    public function buildTemplate(array $settings): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();

        $register = $spreadsheet->getActiveSheet();
        $register->setTitle(self::REGISTER_SHEET);
        $register->setCellValue('A1', 'REGISTRE DES ASPECTS ET IMPACTS ENVIRONNEMENTAUX — ISO 14001');
        $register->setCellValue('A2', "Significatif si Cr = G × F × S × M > {$settings['significance_threshold']}. "
            . 'Renseignez G, F, S de 1 à ' . $settings['max_gravity'] . ' (1, 3, 5 ou 7 recommandés) et M de 1 à ' . $settings['max_mastery'] . ' (1, 3 ou 5). '
            . 'La ligne 3 est un exemple non importé ; saisissez vos aspects à partir de la ligne 5. Les en-têtes de la ligne 4 ne doivent pas être modifiés.');
        $register->mergeCells('A1:S1');
        $register->mergeCells('A2:S2');
        $register->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        $register->getStyle('A2')->getAlignment()->setWrapText(true);
        $register->getRowDimension(2)->setRowHeight(34);

        foreach (self::COLUMNS as $index => [, $header]) {
            $register->setCellValue([$index + 1, 4], $header);
        }
        $register->getStyle('A4:S4')->getFont()->setBold(true)->getColor()->setARGB('FFFFFFFF');
        $register->getStyle('A4:S4')->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setARGB('FF166534');
        $register->getStyle('A4:S4')->getAlignment()->setWrapText(true)->setVertical(Alignment::VERTICAL_CENTER);
        $register->fromArray([[
            'Ex. 1', 'Gouvernance et stratégie', 'Secrétariat général', 'N', 'Éclairage et climatisation des bureaux',
            "Consommation d'énergie électrique", 'Contribution au réchauffement climatique',
            "Risque d'accélération du changement climatique", 'Sensibilisation périodique du personnel',
            5, 7, 3, 5, 'Installer des équipements économes', 'Responsable QHSE', '2026-12-31',
            'Support de sensibilisation disponible', 'Baisse de la consommation mesurée', 'Ligne d\'exemple : non importée',
        ]], null, 'A3');
        $register->getStyle('A3:S3')->getFont()->setItalic(true)->getColor()->setARGB('FF64748B');
        foreach (range('A', 'S') as $column) {
            $register->getColumnDimension($column)->setWidth(24);
        }

        $scales = $spreadsheet->createSheet();
        $scales->setTitle('Cotation');
        $rows = [
            ['CRITÈRES DE COTATION (canevas BASE AES)'],
            [],
            ['FRÉQUENCE (F)', '', ''],
            ['Niveau', 'Description', 'Repère'],
            [1, 'Extrêmement rare', '1 fois tous les 10 ans (événement improbable)'],
            [3, 'Rare', '1 fois par an'],
            [5, 'Peu fréquent', '1 fois par mois'],
            [7, 'Fréquent', "1 fois par jour à 1 fois par semaine (événement très probable)"],
            [],
            ['GRAVITÉ (G)', '', ''],
            ['Niveau', 'Description', 'Repère'],
            [1, 'Faible', 'Effet négligeable ou sans conséquence pour l\'environnement'],
            [3, 'Moyen', 'Effet réversible à court terme (1 à 6 mois) : nuisance, déchet banal'],
            [5, 'Majeur', 'Effet réversible à long terme (6 mois à 3 ans) : eau, sol, air, déchets dangereux'],
            [7, 'Critique', 'Effet destructeur : explosion, incendie, déversement'],
            [],
            ['SENSIBILITÉ DU MILIEU (S)', '', ''],
            ['Niveau', 'Description', 'Repère'],
            [1, 'Sensibilité faible', '1 élément sensible'],
            [3, 'Sensibilité moyenne', '2 à 3 éléments sensibles'],
            [5, 'Sensibilité forte', '4 éléments sensibles'],
            [7, 'Sensibilité extrêmement forte', '5 éléments sensibles ou plus'],
            [],
            ['MAÎTRISE (M)', '', ''],
            ['Coefficient', 'Description', 'Repère'],
            [1, 'Maîtrise forte', 'Personnel compétent, procédures testées, équipements performants et maintenance préventive'],
            [3, 'Maîtrise moyenne', 'Personnel compétent, procédures documentées, équipements fonctionnels'],
            [5, 'Maîtrise faible', 'Aucune formation, aucune procédure, équipements non fonctionnels'],
        ];
        $scales->fromArray($rows, null, 'A1');
        $scales->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        foreach ([3, 10, 17, 24] as $titleRow) {
            $scales->getStyle("A{$titleRow}")->getFont()->setBold(true);
        }
        $scales->getColumnDimension('A')->setWidth(16);
        $scales->getColumnDimension('B')->setWidth(32);
        $scales->getColumnDimension('C')->setWidth(90);
        $spreadsheet->setActiveSheetIndex(0);

        return $spreadsheet;
    }

    public function save(Spreadsheet $spreadsheet): string
    {
        $path = tempnam(sys_get_temp_dir(), 'aes_') . '.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return $path;
    }

    /**
     * Lit le registre et contrôle chaque ligne, sans rien écrire en base.
     *
     * @param  array<string, mixed>  $settings
     * @return array{rows: array<int, array<string, mixed>>, errors: array<int, string>, total: int}
     */
    public function parse(string $path, int $enterpriseId, ?int $siteId, array $settings): array
    {
        $reader = IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $book = $reader->load($path);
        $sheet = $book->getSheetByName(self::REGISTER_SHEET) ?? $book->getActiveSheet();
        $cells = $sheet->toArray(null, true, true, false);

        $headers = array_map(fn ($value) => trim((string) $value), $cells[3] ?? []);
        $expected = array_map(fn (array $column) => $column[1], self::COLUMNS);
        if (array_slice($headers, 0, count($expected)) !== $expected) {
            return [
                'rows' => [],
                'total' => 0,
                'errors' => ['Les en-têtes de la ligne 4 ne correspondent pas au canevas. Téléchargez le modèle et conservez ses en-têtes.'],
            ];
        }

        $processes = DB::table('processes')
            ->where('enterprise_id', $enterpriseId)
            ->when($siteId, fn ($query) => $query->where(fn ($inner) => $inner->where('site_id', $siteId)->orWhereNull('site_id')))
            ->get(['id', 'title', 'code']);
        $users = DB::table('users')->where('enterprise_id', $enterpriseId)->get(['id', 'name']);
        $usedNumbers = DB::table('environmental_aspects')->where('enterprise_id', $enterpriseId)
            ->whereNotNull('aspect_number')->pluck('aspect_number')->map(fn ($n) => (string) $n)->all();

        $rows = [];
        $errors = [];
        $total = 0;
        foreach (array_slice($cells, self::FIRST_DATA_ROW - 1) as $offset => $row) {
            $line = self::FIRST_DATA_ROW + $offset;
            if (collect($row)->filter(fn ($value) => trim((string) $value) !== '')->isEmpty()) {
                continue;
            }
            $total++;

            $record = [];
            foreach (self::COLUMNS as $index => [$key]) {
                $value = $row[$index] ?? null;
                $record[$key] = is_string($value) ? trim($value) : $value;
            }

            $problems = [];
            foreach (['activity' => 'Activité', 'aspect' => 'Aspect', 'impact' => 'Impact'] as $key => $label) {
                if (blank($record[$key])) {
                    $problems[] = "{$label} manquant(e)";
                }
            }

            if (filled($record['aspect_number'])) {
                $number = (string) $record['aspect_number'];
                if (in_array($number, $usedNumbers, true)) {
                    $problems[] = "Numéro « {$number} » déjà utilisé";
                } else {
                    $usedNumbers[] = $number;
                }
            }

            $mode = strtoupper((string) ($record['mode'] ?: 'N'));
            if (! in_array($mode, ['N', 'A'], true)) {
                $problems[] = 'Mode invalide (N ou A attendu)';
            }

            $maxima = ['gravity' => $settings['max_gravity'], 'frequency' => $settings['max_frequency'],
                'sensitivity' => $settings['max_sensitivity'], 'mastery' => $settings['max_mastery']];
            $scores = [];
            foreach ($maxima as $key => $max) {
                $value = $record[$key];
                if (! is_numeric($value) || (int) $value != $value || $value < 1 || $value > $max) {
                    $problems[] = strtoupper(substr($key, 0, 1)) . " doit être un entier de 1 à {$max}";
                } else {
                    $scores[$key] = (int) $value;
                }
            }

            $processId = null;
            if (filled($record['process'])) {
                $needle = mb_strtolower((string) $record['process']);
                $processId = $processes->first(fn ($process) => mb_strtolower((string) $process->title) === $needle
                    || mb_strtolower((string) $process->code) === $needle)?->id;
                if (! $processId) {
                    $problems[] = "Processus introuvable : « {$record['process']} »";
                }
            }

            $responsibleId = null;
            if (filled($record['responsible'])) {
                $needle = mb_strtolower((string) $record['responsible']);
                $responsibleId = $users->first(fn ($user) => mb_strtolower((string) $user->name) === $needle)?->id;
            }

            $deadline = null;
            if (filled($record['deadline'])) {
                $time = is_numeric($record['deadline'])
                    ? \PhpOffice\PhpSpreadsheet\Shared\Date::excelToTimestamp((float) $record['deadline'])
                    : strtotime((string) $record['deadline']);
                if ($time === false) {
                    $problems[] = 'Délai invalide (AAAA-MM-JJ attendu)';
                } else {
                    $deadline = date('Y-m-d', $time);
                }
            }

            if ($problems !== []) {
                $errors[] = "Ligne {$line} : " . implode(' ; ', $problems);

                continue;
            }

            $evaluation = $this->significance->evaluate(
                $scores['gravity'], $scores['frequency'], $scores['sensitivity'], $scores['mastery'], false, false, $settings,
            );

            $rows[] = [
                'line' => $line,
                'aspect_number' => filled($record['aspect_number']) ? (string) $record['aspect_number'] : null,
                'process_id' => $processId,
                'sub_process' => $record['sub_process'] ?: null,
                'mode' => $mode,
                'activity' => (string) $record['activity'],
                'aspect' => (string) $record['aspect'],
                'impact' => (string) $record['impact'],
                'risk' => $record['risk'] ?: null,
                'existing_controls' => $record['existing_controls'] ?: null,
                'gravity' => $scores['gravity'],
                'frequency' => $scores['frequency'],
                'sensitivity' => $scores['sensitivity'],
                'mastery' => $scores['mastery'],
                'additional_actions' => $record['additional_actions'] ?: null,
                'responsible_id' => $responsibleId,
                'responsible_name' => $responsibleId ? null : ($record['responsible'] ?: null),
                'deadline' => $deadline,
                'effectiveness_criterion' => $record['effectiveness_criterion'] ?: null,
                'efficiency_criterion' => $record['efficiency_criterion'] ?: null,
                'observations' => $record['observations'] ?: null,
                'criticality' => $evaluation['criticality'],
                'is_significant' => $evaluation['is_significant'],
            ];
        }

        return ['rows' => $rows, 'errors' => $errors, 'total' => $total];
    }
}
