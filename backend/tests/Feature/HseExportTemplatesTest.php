<?php

namespace Tests\Feature;

use App\Models\Enterprise;
use App\Modules\Hse\Services\HseExportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class HseExportTemplatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_duerp_export_preserves_the_reference_workbook_fields(): void
    {
        $enterprise = Enterprise::factory()->create();
        $duerpId = DB::table('duerp')->insertGetId([
            'enterprise_id' => $enterprise->id,
            'version' => '1.0',
            'is_current' => true,
            'evaluation_date' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('duerp_dangers')->insert([
            'duerp_id' => $duerpId,
            'work_unit' => 'Atelier',
            'activity' => 'Maintenance',
            'inrs_family' => 'Risques électriques',
            'dangerous_situation' => 'Intervention sur une armoire électrique',
            'identified_risks' => 'Électrisation',
            'consequences' => 'Brûlure',
            'gravity' => 4,
            'frequency' => 2,
            'raw_risk_score' => 8,
            'raw_risk_level' => 'Moyen',
            'existing_preventions' => 'Consignation',
            'mitigation_level' => 'Maîtrisé',
            'mitigation_coef' => 0.5,
            'prevention_actions' => 'Former les intervenants',
            'action_status' => 'en_cours',
            'action_effectivity_criteria' => 'Formation réalisée',
            'action_efficacy_criteria' => 'Aucun incident',
            'observations' => 'À revoir au prochain audit',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $path = app(HseExportService::class)->exportDuerpXlsx($enterprise->id);

        try {
            $sheet = IOFactory::load($path)->getActiveSheet();

            $this->assertSame('AC', $sheet->getHighestColumn());
            $this->assertSame('Processus', $sheet->getCell('B5')->getValue());
            $this->assertSame('Unité de travail : postes de travail', $sheet->getCell('D5')->getValue());
            $this->assertSame('Observations / commentaires', $sheet->getCell('AC5')->getValue());
            $this->assertSame('Atelier', $sheet->getCell('D6')->getValue());
            $this->assertSame('Électrisation', $sheet->getCell('G6')->getValue());
            $this->assertSame('Formation réalisée', $sheet->getCell('AA6')->getValue());
            $this->assertSame('Aucun incident', $sheet->getCell('AB6')->getValue());
            $this->assertSame('À revoir au prochain audit', $sheet->getCell('AC6')->getValue());
        } finally {
            @unlink($path);
        }
    }

    public function test_aes_export_preserves_the_reference_workbook_fields(): void
    {
        $enterprise = Enterprise::factory()->create();

        DB::table('environmental_aspects')->insert([
            'enterprise_id' => $enterprise->id,
            'activity' => 'Nettoyage des locaux',
            'aspect' => 'Consommation d’eau',
            'impact' => 'Épuisement de la ressource',
            'risk' => 'Risque de stress hydrique',
            'mode' => 'N',
            'sub_process' => 'Services généraux',
            'gravity' => 5,
            'frequency' => 7,
            'sensitivity' => 3,
            'mastery' => 5,
            'criticality_score' => 525,
            'significance_threshold' => 343,
            'is_significant' => true,
            'existing_controls' => 'Réducteurs de débit',
            'additional_actions' => 'Suivre les consommations',
            'deadline' => now()->addMonth()->toDateString(),
            'observations' => 'Compteur à vérifier',
            'effectiveness_criterion' => 'Relevé mensuel disponible',
            'efficiency_criterion' => 'Baisse de consommation mesurée',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $path = app(HseExportService::class)->exportEnvironmentalAspectsXlsx($enterprise->id);

        try {
            $sheet = IOFactory::load($path)->getActiveSheet();

            $this->assertSame('T', $sheet->getHighestColumn());
            $this->assertSame('Processus', $sheet->getCell('B5')->getValue());
            $this->assertSame('Risque associé', $sheet->getCell('G5')->getValue());
            $this->assertSame("Critère d'effectivité", $sheet->getCell('S5')->getValue());
            $this->assertSame("Critère d'efficacité", $sheet->getCell('T5')->getValue());
            $this->assertSame('Consommation d’eau', $sheet->getCell('E6')->getValue());
            $this->assertSame('Risque de stress hydrique', $sheet->getCell('G6')->getValue());
            $this->assertSame('525', (string) $sheet->getCell('M6')->getValue());
            $this->assertSame('Compteur à vérifier', $sheet->getCell('R6')->getValue());
            $this->assertSame('Relevé mensuel disponible', $sheet->getCell('S6')->getValue());
            $this->assertSame('Baisse de consommation mesurée', $sheet->getCell('T6')->getValue());
        } finally {
            @unlink($path);
        }
    }
}
