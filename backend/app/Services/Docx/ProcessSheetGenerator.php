<?php

namespace App\Services\Docx;

use App\Models\Site;
use App\Models\Process;
use App\Services\DocumentBrandingService;
use PhpOffice\PhpWord\PhpWord;
use PhpOffice\PhpWord\Style\Font;
use PhpOffice\PhpWord\SimpleType\Jc;

class ProcessSheetGenerator
{
    private PhpWord $phpWord;
    private $section;
    private DocumentBrandingService $brandingService;

    public function __construct()
    {
        $this->brandingService = app(DocumentBrandingService::class);
    }

    public function generate(Process $process, array $documentMeta = []): string
    {
        $this->phpWord = new PhpWord();
        $this->phpWord->setDefaultFontName('Calibri');
        $this->phpWord->setDefaultFontSize(11);

        $this->section = $this->phpWord->addSection([
            'marginLeft' => 1134,
            'marginRight' => 1134,
            'marginTop' => 1134,
            'marginBottom' => 1134,
        ]);

        $enterprise = null;
        try {
            $enterprise = $process->site?->enterprise
                ?? ($process->site_id ? Site::with('enterprise')->find($process->site_id)?->enterprise : null);
        } catch (\Throwable) {
            $enterprise = null;
        }
        if ($enterprise) {
            $this->brandingService->applyDocxHeaderFooter($this->section, $enterprise, 'process', (int) $process->id, $documentMeta);
        }

        $this->addHeader($process, $documentMeta);
        $this->addGeneralInfo($process);
        $this->addSequences($process);
        $this->addObjectives($process);
        $this->addIndicators($process);
        $this->addResources($process);
        $this->addRisksOpportunities($process);

        $tempFile = tempnam(sys_get_temp_dir(), 'process_sheet_') . '.docx';
        $this->phpWord->save($tempFile, 'Word2007');

        return $tempFile;
    }

    private function addHeader(Process $process, array $documentMeta = [])
    {
        $table = $this->section->addTable([
            'borderSize' => 6,
            'borderColor' => '000000',
            'width' => 100 * 50,
            'unit' => 'pct',
        ]);

        $table->addRow();
        $cell = $table->addCell(5000);
        $cell->addText('FICHE PROCESSUS', ['bold' => true, 'size' => 16], ['alignment' => Jc::CENTER]);
        
        $cell = $table->addCell(5000);
        $cell->addText('Code: ' . ($documentMeta['code'] ?? 'N/A'), ['bold' => true], ['alignment' => Jc::CENTER]);
        $cell->addText('Version: ' . ($documentMeta['version'] ?? '1.0'), [], ['alignment' => Jc::CENTER]);

        $this->section->addTextBreak();
    }

    private function addGeneralInfo(Process $process)
    {
        $this->addSectionTitle('1. INFORMATIONS GÉNÉRALES');

        $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);

        $this->addTableRow($table, 'Nom du processus', $process->title ?? $process->name ?? 'N/A');
        $this->addTableRow($table, 'Catégorie', $this->getCategoryLabel($process->category ?? $process->type));
        $this->addTableRow($table, 'Pilote', $process->pilot?->name ?? 'Non défini');
        $this->addTableRow($table, 'Co-pilote(s)', $this->formatCopilots($process));
        $this->addTableRow($table, 'Finalité', $process->purpose ?? $process->finalite ?? 'Non définie');
        $this->addTableRow($table, 'Observation', $process->observation ?? '');
        $this->addTableRow($table, 'Interfaces', $this->formatArray($process->interfaces ?? []));
        $this->addTableRow($table, 'Normes ISO', $this->formatArray($process->normes_iso ?? []));
        $this->addTableRow($table, 'Aspects couverts', implode(', ', array_keys(array_filter([
            'Qualité' => $process->aspect_qualite,
            'Environnement' => $process->aspect_environnement,
            'Santé & sécurité' => $process->aspect_sante_securite,
        ]))) ?: 'Aucun');

        $this->section->addTextBreak();
    }

    private function addSequences(Process $process)
    {
        $this->addSectionTitle('2. SÉQUENCES DU PROCESSUS');

        $sequences = $process->sequences ?? [];
        
        if (empty($sequences)) {
            $this->section->addText('Aucune séquence définie.', ['italic' => true]);
            $this->section->addTextBreak();
            return;
        }

        foreach ($sequences as $index => $seq) {
            $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
            
            $table->addRow();
            $cell = $table->addCell(10000, ['gridSpan' => 6, 'bgColor' => 'E7E6E6']);
            $cell->addText('Séquence ' . ($index + 1), ['bold' => true]);

            $table->addRow();
            $table->addCell(1666)->addText('Processus fournisseurs', ['bold' => true]);
            $table->addCell(1666)->addText('Entrées', ['bold' => true]);
            $table->addCell(1666)->addText('Activités', ['bold' => true]);
            $table->addCell(1666)->addText('Sous-activités', ['bold' => true]);
            $table->addCell(1666)->addText('Sorties', ['bold' => true]);
            $table->addCell(1666)->addText('Processus clients', ['bold' => true]);

            $table->addRow();
            $table->addCell(1666)->addText($this->formatArray($seq->supplier_processes ?? []));
            $table->addCell(1666)->addText($seq->input_description ?? '');
            $table->addCell(1666)->addText($seq->activity_description ?? '');
            $table->addCell(1666)->addText($this->formatArray($seq->sub_activities ?? []));
            $table->addCell(1666)->addText($seq->output_description ?? '');
            $table->addCell(1666)->addText($this->formatArray($seq->client_processes ?? []));

            $this->addTableRow($table, 'Responsable de la séquence', $seq->responsibleUser?->name ?? 'Non assigné');
            $this->addTableRow($table, 'Durée', $seq->duration_minutes ? $seq->duration_minutes . ' minutes' : 'Non définie');
            if ($seq->documents && $seq->documents->count() > 0) {
                $this->addTableRow($table, 'Documents associés', $this->formatArray($seq->documents));
            }

            $this->section->addTextBreak();
        }
    }

    private function addObjectives(Process $process)
    {
        $this->addSectionTitle('3. OBJECTIFS ET INDICATEURS');

        $objectives = $process->processObjectives ?? [];
        
        if (empty($objectives)) {
            $this->section->addText('Aucun objectif défini.', ['italic' => true]);
            $this->section->addTextBreak();
            return;
        }

        $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
        
        $table->addRow();
        $table->addCell(5000)->addText('Objectif', ['bold' => true]);
        $table->addCell(5000)->addText('Indicateur', ['bold' => true]);

        foreach ($objectives as $obj) {
            $table->addRow();
            $table->addCell(5000)->addText($obj->title ?? '');
            $table->addCell(5000)->addText(($obj->indicator?->name ?? $obj->indicator_name ?? 'Non défini') . ' · cible : ' . ($obj->target_value ?? '—') . ' · statut : ' . ($obj->status ?? '—'));
        }

        $this->section->addTextBreak();
    }

    private function addIndicators(Process $process): void
    {
        $this->addSectionTitle('3 BIS. KPI DU PROCESSUS');
        $indicators = $process->indicators ?? [];
        if (count($indicators) === 0) {
            $this->section->addText('Aucun KPI défini.', ['italic' => true]);
            $this->section->addTextBreak();
            return;
        }

        $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
        $headerRow = $table->addRow();
        foreach (['Nom', 'Type / catégorie', 'Unité', 'Cible', 'Dernière valeur', 'Responsable'] as $heading) {
            $headerRow->addCell(1666)->addText($heading, ['bold' => true]);
        }
        foreach ($indicators as $indicator) {
            $latest = $indicator->values?->sortByDesc('measurement_date')->first();
            $row = $table->addRow();
            $row->addCell(1666)->addText((string) ($indicator->name ?? ''));
            $row->addCell(1666)->addText(($indicator->type ?? '') . ' / ' . ($indicator->category ?? ''));
            $row->addCell(1666)->addText((string) ($indicator->unit ?? ''));
            $row->addCell(1666)->addText((string) ($indicator->target_value ?? '—'));
            $row->addCell(1666)->addText((string) ($latest?->value ?? '—'));
            $row->addCell(1666)->addText($indicator->responsibleUser?->name ?? '—');
        }
        $this->section->addTextBreak();
    }

    private function addResources(Process $process)
    {
        $this->addSectionTitle('4. RESSOURCES NÉCESSAIRES');

        $resources = $process->ressources ?? [];
        
        $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
        
        $this->addTableRow($table, 'Ressources humaines', $this->formatArray($resources['human'] ?? []));
        $this->addTableRow($table, 'Ressources technologiques', $this->formatArray($resources['technological'] ?? []));
        $this->addTableRow($table, 'Ressources matérielles', $this->formatArray($resources['material'] ?? []));
        $this->addTableRow($table, 'Ressources documentaires', $this->formatArray($resources['documentary'] ?? []));

        $this->section->addTextBreak();
    }

    private function addRisksOpportunities(Process $process)
    {
        $this->addSectionTitle('5. RISQUES ET OPPORTUNITÉS');

        $items = $process->risksOpportunities ?? [];
        
        if (empty($items)) {
            $this->section->addText('Aucun risque ou opportunité identifié.', ['italic' => true]);
            return;
        }

        $risks = $items->where('type', 'risque');
        $opportunities = $items->where('type', 'opportunite');

        if ($risks->count() > 0) {
            $this->section->addText('Risques:', ['bold' => true, 'color' => 'FF0000']);
            $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
            
            foreach ($risks as $risk) {
                $table->addRow();
                $table->addCell(10000)->addText($risk->description ?? $risk->title ?? '');
            }
            $this->section->addTextBreak();
        }

        if ($opportunities->count() > 0) {
            $this->section->addText('Opportunités:', ['bold' => true, 'color' => '00AA00']);
            $table = $this->section->addTable(['borderSize' => 6, 'borderColor' => '000000']);
            
            foreach ($opportunities as $opp) {
                $table->addRow();
                $table->addCell(10000)->addText($opp->description ?? $opp->title ?? '');
            }
        }
    }

    private function addSectionTitle(string $title)
    {
        $this->section->addText($title, ['bold' => true, 'size' => 14, 'color' => '1F4E78']);
        $this->section->addTextBreak();
    }

    private function addTableRow($table, string $label, string $value)
    {
        $table->addRow();
        $table->addCell(3000, ['bgColor' => 'E7E6E6'])->addText($label, ['bold' => true]);
        $table->addCell(7000)->addText($value);
    }

    private function formatArray($array): string
    {
        if (empty($array)) return 'Non défini';
        if (is_string($array)) return $array;
        if ($array instanceof \Illuminate\Support\Collection) $array = $array->all();
        return collect($array)->map(function ($item) {
            if (is_array($item)) return (string) ($item['name'] ?? $item['title'] ?? $item['label'] ?? $item['description'] ?? '');
            if (is_object($item)) return (string) ($item->name ?? $item->title ?? $item->label ?? $item->description ?? '');
            return (string) $item;
        })->filter(fn ($item) => trim($item) !== '')->implode(', ') ?: 'Non défini';
    }

    private function formatCopilots(Process $process): string
    {
        $copilotNames = [];

        if ($process->relationLoaded('copilots') && $process->copilots) {
            $copilotNames = $process->copilots
                ->pluck('name')
                ->filter(fn ($name) => is_string($name) && trim($name) !== '')
                ->map(fn ($name) => trim((string) $name))
                ->values()
                ->all();
        }

        if (empty($copilotNames) && $process->copilot?->name) {
            $copilotNames[] = $process->copilot->name;
        }

        return !empty($copilotNames) ? implode(', ', array_unique($copilotNames)) : 'Non défini';
    }

    private function getCategoryLabel(?string $category): string
    {
        $cat = strtolower(trim((string) $category));
        return match($cat) {
            'pilotage', 'management' => 'Management',
            'operationnel', 'realization' => 'Réalisation',
            'support' => 'Support',
            'mesure_amelioration' => 'Mesure et amélioration',
            default => !empty($category) ? ucfirst($category) : 'Non défini',
        };
    }
}
