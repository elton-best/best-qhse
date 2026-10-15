<?php

namespace App\Console\Commands;

use App\Modules\Hse\Models\ComplianceObligationAspect;
use App\Modules\Hse\Models\ComplianceObligationText;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Recopie les anciennes structures de conformité dans le registre unifié, sans rien supprimer ni
 * dupliquer (clé `legacy_table` + `legacy_id`). Les obligations reprises sont « à qualifier » : leur
 * applicabilité doit être justifiée avant toute évaluation (ISO 14001 §6.1.3).
 */
class MigrateLegacyCompliance extends Command
{
    protected $signature = 'compliance:migrate-legacy {--dry-run : Compte les lignes à reprendre sans rien écrire}';

    protected $description = 'Reprend les obligations des anciennes tables dans le registre de conformité unifié';

    private const THEME = 'Reprise des anciens registres';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $report = [
            'obligations_conformite_environnementales' => $this->migrate('obligations_conformite_environnementales', fn (object $row) => [
                'enterprise_id' => $row->enterprise_id,
                'site_id' => $row->site_id,
                'title' => $row->titre,
                'source_type' => $this->sourceType($row->type),
                'authority' => $row->autorite_competente,
                'regulatory_reference' => $row->reference ?: $row->titre,
                'description' => $row->description,
                'entry_into_force_date' => $row->date_application,
                'evaluation_frequency' => $this->frequency($row->periodicite_controle),
                'next_evaluation_date' => $row->date_prochain_controle,
                'compliance_status' => $this->status($row->statut_conformite),
                'comments' => $row->preuves_conformite,
                'actions_corrective_preventive' => $row->actions_correctives,
            ], $dry),
            'applicable_requirements' => $this->migrate('applicable_requirements', fn (object $row) => [
                'site_id' => $row->site_id,
                'title' => $row->title,
                'source_type' => $this->sourceType($row->type),
                'regulatory_reference' => $row->title,
                'description' => $row->description,
                'watch_source' => $row->source,
                'compliance_status' => $this->status($row->compliance_status),
                'actions_corrective_preventive' => $row->actions,
                'responsible_id' => $row->responsible_id,
                'deadline' => $row->deadline,
            ], $dry),
            'compliance_requirements' => $this->migrate('compliance_requirements', fn (object $row) => [
                'enterprise_id' => $row->enterprise_id,
                'site_id' => $row->site_id,
                'title' => $row->title,
                'source_type' => $this->sourceType($row->requirement_type),
                'regulatory_reference' => $row->reference ?: $row->title,
                'description' => $row->description,
                'source_url' => $row->source_url ? mb_substr($row->source_url, 0, 500) : null,
                'watch_source' => $row->source,
                'entry_into_force_date' => $row->effective_date,
                'compliance_status' => $this->status($row->compliance_status),
                'last_evaluation_date' => $row->last_evaluation_date,
                'next_evaluation_date' => $row->next_evaluation_date,
                'responsible_id' => $row->responsible_user_id,
            ], $dry),
        ];

        foreach ($report as $table => $counts) {
            $this->line(sprintf('%-45s repris : %d · déjà repris : %d · ignorés (sans site) : %d', $table, $counts['migrated'], $counts['skipped'], $counts['no_site']));
        }
        $this->info($dry ? 'Simulation terminée : aucune écriture.' : 'Reprise terminée : les anciennes tables sont conservées.');

        return self::SUCCESS;
    }

    /**
     * @param  callable(object): array<string, mixed>  $map
     * @return array{migrated: int, skipped: int, no_site: int}
     */
    private function migrate(string $table, callable $map, bool $dry): array
    {
        $counts = ['migrated' => 0, 'skipped' => 0, 'no_site' => 0];
        if (! Schema::hasTable($table)) {
            return $counts;
        }

        DB::table($table)->whereNull('deleted_at')->orderBy('id')->each(function (object $row) use ($table, $map, $dry, &$counts) {
            if (ComplianceObligationText::query()->withoutGlobalScopes()->withTrashed()->where('legacy_table', $table)->where('legacy_id', $row->id)->exists()) {
                $counts['skipped']++;

                return;
            }
            $attributes = $map($row);
            if (empty($attributes['site_id'])) {
                $counts['no_site']++;

                return;
            }
            $counts['migrated']++;
            if ($dry) {
                return;
            }

            DB::transaction(function () use ($table, $row, $attributes) {
                $theme = ComplianceObligationAspect::query()->withoutGlobalScopes()->firstOrCreate(
                    ['site_id' => $attributes['site_id'], 'name' => self::THEME],
                    ['description' => 'Obligations reprises des anciens registres : à qualifier et à évaluer.'],
                );
                $text = new ComplianceObligationText($attributes + [
                    'aspect_id' => $theme->id,
                    'ref' => $this->nextRef(),
                    'legacy_table' => $table,
                    'legacy_id' => $row->id,
                    'validity_status' => 'in_force',
                ]);
                $text->save();
            });
        });

        return $counts;
    }

    private function nextRef(): string
    {
        $prefix = 'OBL-'.now()->format('Y').'-';
        $last = ComplianceObligationText::query()->withoutGlobalScopes()->withTrashed()->where('ref', 'like', $prefix.'%')->orderByDesc('ref')->value('ref');
        $next = $last && preg_match('/(\d+)$/', $last, $matches) ? ((int) $matches[1]) + 1 : 1;

        return $prefix.str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function sourceType(?string $value): string
    {
        $text = mb_strtolower((string) $value);

        return match (true) {
            str_contains($text, 'permis') || str_contains($text, 'permit') => 'permit',
            str_contains($text, 'licen') => 'licence',
            str_contains($text, 'arrêt') || str_contains($text, 'arret') || str_contains($text, 'order') => 'order',
            str_contains($text, 'décret') || str_contains($text, 'decret') || str_contains($text, 'decree') => 'decree',
            str_contains($text, 'contrat') || str_contains($text, 'contract') => 'contract',
            str_contains($text, 'accord') || str_contains($text, 'agreement') => 'agreement',
            str_contains($text, 'volontaire') || str_contains($text, 'voluntary') => 'voluntary_code',
            str_contains($text, 'norme') || str_contains($text, 'standard') => 'sector_standard',
            default => 'law',
        };
    }

    private function frequency(?string $value): ?string
    {
        $text = mb_strtolower((string) $value);

        return match (true) {
            $text === '' => null,
            str_contains($text, 'mens') || str_contains($text, 'month') => 'monthly',
            str_contains($text, 'trim') || str_contains($text, 'quarter') => 'quarterly',
            str_contains($text, 'sem') => 'semiannual',
            str_contains($text, 'ann') || str_contains($text, 'year') => 'annual',
            default => 'on_demand',
        };
    }

    private function status(?string $value): string
    {
        $text = mb_strtolower((string) $value);

        return match (true) {
            str_contains($text, 'non') && str_contains($text, 'conform') => 'non_compliant',
            str_contains($text, 'partiel') || str_contains($text, 'partial') => 'partial',
            str_contains($text, 'conform') || str_contains($text, 'compliant') => 'compliant',
            default => 'not_evaluated',
        };
    }
}
