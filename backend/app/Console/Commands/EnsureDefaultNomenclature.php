<?php

namespace App\Console\Commands;

use App\Models\DocumentTypeCatalog;
use App\Models\DocumentTypeConfiguration;
use App\Models\NomenclatureTemplate;
use App\Modules\Enterprise\Models\Enterprise;
use App\Modules\Support\Services\DocumentTypeResolver;
use App\Modules\Support\Services\NomenclatureTemplateService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class EnsureDefaultNomenclature extends Command
{
    protected $signature = 'documents:ensure-default-nomenclature {--enterprise= : ID entreprise} {--all : toutes les entreprises}';

    protected $description = 'Crée les catalogues de types + templates de nomenclature publiés manquants (POL/PRC/PRD/FOR/ENR). Idempotent.';

    public function handle(NomenclatureTemplateService $templates): int
    {
        $types = DocumentTypeResolver::availableTypes();

        $enterpriseOption = $this->option('enterprise');
        if (!empty($enterpriseOption)) {
            $enterprise = Enterprise::query()->find((int) $enterpriseOption);
            if (!$enterprise) {
                $this->error("Entreprise {$enterpriseOption} introuvable.");
                return self::FAILURE;
            }
            $enterprises = collect([$enterprise]);
        } else {
            // --all ou aucun filtre : toutes les entreprises (idempotent).
            $enterprises = Enterprise::query()->orderBy('id')->get();
            if ($enterprises->isEmpty()) {
                $this->warn('Aucune entreprise trouvée.');
                return self::SUCCESS;
            }
        }

        $defaultFormat = [
            ['order' => 1, 'type' => 'document_type'],
            ['order' => 2, 'type' => 'separator', 'value' => '-'],
            ['order' => 3, 'type' => 'year'],
            ['order' => 4, 'type' => 'separator', 'value' => '-'],
            ['order' => 5, 'type' => 'sequential_number', 'length' => 3],
        ];

        $order = 0;
        $displayOrders = [];
        foreach (array_keys($types) as $abbr) {
            $displayOrders[$abbr] = $order++;
        }

        foreach ($enterprises as $enterprise) {
            $enterpriseId = (int) $enterprise->id;
            $this->info("Entreprise {$enterpriseId} :");

            foreach ($types as $abbr => $frenchName) {
                $abbr = strtoupper(trim((string) $abbr));

                DB::transaction(function () use ($enterpriseId, $abbr, $frenchName, $defaultFormat, $displayOrders, $templates) {
                    // 1. Catalogue manquant (portée entreprise : site_id null), inactif au départ.
                    $catalog = DocumentTypeCatalog::query()
                        ->where('enterprise_id', $enterpriseId)
                        ->whereNull('site_id')
                        ->whereRaw('UPPER(abbreviation) = ?', [$abbr])
                        ->first();

                    if (!$catalog) {
                        $catalog = DocumentTypeCatalog::query()->create([
                            'enterprise_id' => $enterpriseId,
                            'site_id' => null,
                            'name' => $frenchName,
                            'abbreviation' => $abbr,
                            'description' => "Type généré automatiquement ({$frenchName}).",
                            'is_active' => false,
                            'display_order' => $displayOrders[$abbr] ?? 0,
                        ]);
                        $this->line("  [{$abbr}] catalogue créé (id={$catalog->id})");
                    } else {
                        $this->line("  [{$abbr}] catalogue existant (id={$catalog->id})");
                    }

                    // 2. Template publié+actif (tous sites) pour ce catalogue.
                    $existing = NomenclatureTemplate::query()
                        ->where('enterprise_id', $enterpriseId)
                        ->where('document_type_catalog_id', (int) $catalog->id)
                        ->where('status', 'published')
                        ->where('is_active', true)
                        ->first();

                    if (!$existing) {
                        // Version 1 par défaut, bumpée seulement en cas de conflit
                        // sur la contrainte unique (scope + version).
                        $version = 1;
                        while (NomenclatureTemplate::query()
                            ->where('enterprise_id', $enterpriseId)
                            ->where('document_type_catalog_id', (int) $catalog->id)
                            ->where('version', $version)
                            ->whereNull('site_id')
                            ->whereNull('process_catalog_id')
                            ->exists()) {
                            $version++;
                        }

                        $preview = $templates->generatePreviewExample($defaultFormat, '-');

                        $template = NomenclatureTemplate::query()->create([
                            'enterprise_id' => $enterpriseId,
                            'site_id' => null,
                            'document_type_catalog_id' => (int) $catalog->id,
                            'process_catalog_id' => null,
                            'name' => "Template {$abbr} entreprise",
                            'version' => $version,
                            'status' => 'published',
                            'format_structure' => $defaultFormat,
                            'separator' => '-',
                            'preview_example' => $preview,
                            'description' => 'Template générique créé automatiquement',
                            'is_active' => true,
                            'published_at' => now(),
                            'published_by' => null,
                        ]);

                        // Configuration technique obligatoire pour la génération de codes.
                        $templates->syncTechnicalConfiguration($template->fresh());

                        $this->line("  [{$abbr}] template publié créé (id={$template->id}, v{$version}, config technique synchronisée)");
                    } else {
                        $this->line("  [{$abbr}] template existant (id={$existing->id}, v{$existing->version})");

                        // Garantit que la configuration technique existe même pour
                        // un template pré-existant (ex. base sans sync).
                        $configExists = DocumentTypeConfiguration::query()
                            ->where('enterprise_id', $enterpriseId)
                            ->whereRaw('UPPER(abbreviation) = ?', [$abbr])
                            ->exists();
                        if (!$configExists) {
                            $templates->syncTechnicalConfiguration($existing->fresh());
                            $this->line("  [{$abbr}] config technique synchronisée (template id={$existing->id})");
                        }
                    }

                    // 3. Activation du catalogue (un type ne s'active qu'après publication).
                    if (!$catalog->fresh()->is_active) {
                        $catalog->update(['is_active' => true]);
                        $this->line("  [{$abbr}] catalogue activé");
                    }
                });
            }
        }

        $this->info('Terminé.');
        return self::SUCCESS;
    }
}
