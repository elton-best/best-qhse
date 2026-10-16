<?php

namespace App\Modules\Hse\Services;

use App\Models\User;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Evaluation\Models\Stakeholder;
use App\Modules\Hse\Models\ComplianceObligationAspect;
use App\Modules\Hse\Models\ComplianceObligationText;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Modules\Improvement\Models\Action;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Assistant de démarrage en huit étapes (T-01). L'état de chaque étape vient des données réellement saisies dans les modules ;
 * « appliquer l'exemple » crée des brouillons du secteur à relire, jamais des éléments validés.
 */
class SetupGuideService
{
    public const STEPS = [
        'organisation' => ['Organisme et sites', 'Votre organisme et ses sites sont déclarés.', 'sites'],
        'scope' => ['Domaine d\'application', 'Les activités, sites et limites couverts par le système de management.', 'perimetre'],
        'context' => ['Enjeux de l\'organisme', 'Ce qui, à l\'extérieur et à l\'intérieur, influe sur votre performance environnementale.', 'contexte'],
        'stakeholders' => ['Parties intéressées', 'Qui attend quoi de votre organisme : clients, autorités, riverains, personnel.', 'parties-interessees'],
        'policy' => ['Politique environnementale', 'L\'engagement de la direction, à valider.', 'politique'],
        'aspects' => ['Aspects environnementaux', 'Les activités qui ont un effet sur l\'environnement.', 'aspects-environnementaux'],
        'obligations' => ['Obligations de conformité', 'Les textes et autorisations qui s\'imposent à vous.', 'obligations'],
        'actions' => ['Premier plan d\'actions', 'Les premières actions pour lancer le système.', 'actions'],
    ];

    /**
     * @return array<int, array<string, mixed>>
     */
    public function status(int $enterpriseId, int $siteId): array
    {
        $saved = DB::table('setup_guide_steps')->where('site_id', $siteId)->get()->keyBy('step');
        $steps = [];
        foreach (self::STEPS as $key => [$title, $why, $slug]) {
            $count = $this->count($key, $enterpriseId, $siteId);
            $skipped = (bool) ($saved[$key]->skipped ?? false);
            $state = $count['done'] ? 'done' : ($skipped ? 'skipped' : ($count['count'] > 0 ? 'in_progress' : 'todo'));
            $steps[] = [
                'key' => $key, 'title' => $title, 'why' => $why, 'slug' => $slug, 'state' => $state, 'count' => $count['count'],
                'can_apply' => $key !== 'organisation' && ! $count['done'] && $count['count'] === 0,
                'applied_sector' => $saved[$key]->sector ?? null,
            ];
        }

        return $steps;
    }

    /**
     * @return array{done: bool, count: int}
     */
    private function count(string $step, int $enterpriseId, int $siteId): array
    {
        $site = fn (string $table) => DB::table($table)->where('site_id', $siteId)->when(Schema::hasColumn($table, 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'));

        return match ($step) {
            'organisation' => ['done' => DB::table('sites')->where('enterprise_id', $enterpriseId)->exists() && DB::table('enterprises')->where('id', $enterpriseId)->whereNotNull('name')->exists(), 'count' => DB::table('sites')->where('enterprise_id', $enterpriseId)->count()],
            'scope' => $this->threshold(DB::table('application_scopes')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('is_current', true)->where(fn ($q) => $q->whereNotNull('scope')->where('scope', '!=', ''))->count(), 1),
            'context' => $this->threshold($site('organization_contexts')->count(), 1),
            'stakeholders' => $this->threshold($site('stakeholders')->count(), 3),
            'policy' => $this->threshold(DB::table('qhse_policies')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('is_current', true)->whereNotNull('environmental_policy')->count(), 1),
            'aspects' => $this->threshold(DB::table('environmental_aspects')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->count(), 1),
            'obligations' => $this->threshold(DB::table('compliance_obligation_texts')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->count(), 1),
            'actions' => $this->threshold($site('actions')->count(), 1),
        };
    }

    /** @return array{done: bool, count: int} */
    private function threshold(int $count, int $needed): array
    {
        return ['done' => $count >= $needed, 'count' => $count];
    }

    public function skip(int $enterpriseId, int $siteId, string $step, bool $skipped, int $userId): void
    {
        DB::table('setup_guide_steps')->updateOrInsert(['site_id' => $siteId, 'step' => $step], [
            'enterprise_id' => $enterpriseId, 'skipped' => $skipped, 'updated_by' => $userId, 'updated_at' => now(), 'created_at' => now(),
        ]);
    }

    /**
     * Crée les brouillons du secteur pour l'étape. Refusé si l'étape contient déjà des données.
     *
     * @return int nombre d'éléments créés
     */
    public function apply(Site $site, string $step, string $sector, User $user): int
    {
        $enterpriseId = (int) $site->enterprise_id;
        $template = config("setup_templates.sectors.{$sector}");
        abort_if($template === null, 422, 'Secteur inconnu.');
        abort_if($step === 'organisation', 422, 'Cette étape se renseigne dans les paramètres de l\'organisme.');
        abort_if($this->count($step, $enterpriseId, $site->id)['count'] > 0, 422, 'Cette étape contient déjà des données : complétez-les depuis son écran.');
        $enterprise = DB::table('enterprises')->where('id', $enterpriseId)->first();
        $name = $enterprise->name ?? 'l\'organisme';

        $created = DB::transaction(function () use ($step, $template, $site, $enterpriseId, $user, $name) {
            return match ($step) {
                'scope' => $this->scope($enterpriseId, $site, $template, $name),
                'context' => $this->context($site, $template),
                'stakeholders' => $this->stakeholders($site, $template),
                'policy' => $this->policy($enterpriseId, $template, $name, $user),
                'aspects' => $this->aspects($enterpriseId, $site, $template),
                'obligations' => $this->obligations($enterpriseId, $site, $user),
                'actions' => $this->actions($enterpriseId, $site, $user),
            };
        });

        DB::table('setup_guide_steps')->updateOrInsert(['site_id' => $site->id, 'step' => $step], [
            'enterprise_id' => $enterpriseId, 'skipped' => false, 'sector' => $sector, 'applied_at' => now(), 'updated_by' => $user->id, 'updated_at' => now(), 'created_at' => now(),
        ]);

        return $created;
    }

    /** @param array<string, mixed> $t */
    private function scope(int $enterpriseId, Site $site, array $t, string $name): int
    {
        DB::table('application_scopes')->insert([
            'enterprise_id' => $enterpriseId, 'site_id' => $site->id, 'version' => 1, 'is_current' => true,
            'scope' => "Le système de management environnemental de {$name} couvre les activités de {$t['activities']} menées sur le site {$site->name}. À préciser : exclusions éventuelles et limites géographiques.",
            'objective' => 'Maîtriser les impacts environnementaux des activités et respecter les obligations de conformité.',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return 1;
    }

    /** @param array<string, mixed> $t */
    private function context(Site $site, array $t): int
    {
        DB::table('organization_contexts')->insert([
            'ref' => 'CTX-'.now()->format('Y').'-'.Str::upper(Str::random(4)), 'site_id' => $site->id, 'year' => (int) date('Y'), 'title' => 'Enjeux environnementaux (exemple à adapter)',
            'enterprise_id' => $site->enterprise_id, 'is_active' => true,
            'internal_strengths' => "Savoir-faire du personnel dans les activités de {$t['activities']}.",
            'internal_weaknesses' => 'Gestion des déchets et des consommations à structurer.',
            'external_opportunities' => 'Demande croissante de clients pour des pratiques responsables.',
            'external_threats' => 'Renforcement de la réglementation environnementale et risques climatiques.',
            'legal_factors' => 'Obligations nationales de protection de l\'environnement et d\'autorisation d\'exploitation.',
            'environmental_factors' => 'Disponibilité de l\'eau et de l\'énergie, conditions climatiques locales.',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return 1;
    }

    /** @param array<string, mixed> $t */
    private function stakeholders(Site $site, array $t): int
    {
        foreach ($t['stakeholders'] as [$name, $type, $needs]) {
            Stakeholder::create(['site_id' => $site->id, 'name' => $name, 'type' => $type, 'relevance_degree' => 'medium', 'needs_expectations' => $needs]);
        }

        return count($t['stakeholders']);
    }

    /** @param array<string, mixed> $t */
    private function policy(int $enterpriseId, array $t, string $name, User $user): int
    {
        DB::table('qhse_policies')->insert([
            'enterprise_id' => $enterpriseId, 'version' => 1, 'is_current' => true, 'effective_date' => today(), 'status' => 'draft', 'created_by' => $user->id,
            'mission' => "Exercer nos activités de {$t['activities']} de façon responsable.",
            'environmental_policy' => "{$name} s'engage à protéger l'environnement, à prévenir les pollutions liées à ses activités, à respecter les obligations de conformité qui s'imposent à elle et à améliorer en continu sa performance environnementale. Cette politique est communiquée au personnel et aux parties intéressées. (Brouillon à adapter et à faire valider par la direction.)",
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return 1;
    }

    /** @param array<string, mixed> $t */
    private function aspects(int $enterpriseId, Site $site, array $t): int
    {
        $next = DB::table('environmental_aspects')->where('enterprise_id', $enterpriseId)->count();
        foreach ($t['aspects'] as $i => [$activity, $aspect, $impact]) {
            EnvironmentalAspect::withoutGlobalScopes()->create([
                'enterprise_id' => $enterpriseId, 'site_id' => $site->id, 'aspect_number' => sprintf('A%03d', $next + $i + 1),
                'activity' => $activity, 'aspect' => $aspect, 'impact' => $impact, 'status' => 'draft',
            ]);
        }

        return count($t['aspects']);
    }

    private function obligations(int $enterpriseId, Site $site, User $user): int
    {
        $theme = ComplianceObligationAspect::create(['site_id' => $site->id, 'name' => 'Obligations générales (exemple à qualifier)']);
        foreach (config('setup_templates.obligations') as $reference) {
            $count = DB::table('compliance_obligation_texts')->count() + 1;
            ComplianceObligationText::create([
                'aspect_id' => $theme->id, 'ref' => 'OBL-'.now()->format('Y').'-'.str_pad((string) $count, 4, '0', STR_PAD_LEFT).Str::upper(Str::random(2)),
                'regulatory_reference' => $reference, 'title' => $reference, 'source_type' => 'law', 'site_id' => $site->id, 'enterprise_id' => $enterpriseId,
                'analysis_status' => 'to_analyze', 'compliance_status' => 'not_evaluated', 'responsible_id' => $user->id,
                'analysis_note' => 'Exemple de l\'assistant de démarrage : identifiez le texte exact et décidez de son applicabilité.',
            ]);
        }

        return count(config('setup_templates.obligations'));
    }

    private function actions(int $enterpriseId, Site $site, User $user): int
    {
        $starters = [
            ['Faire valider la politique environnementale par la direction', 30],
            ['Évaluer et valider les aspects environnementaux du site', 60],
            ['Qualifier les obligations de conformité et planifier leur évaluation', 60],
            ['Planifier le premier audit interne et la revue de direction', 90],
        ];
        foreach ($starters as [$title, $days]) {
            Action::create([
                'enterprise_id' => $enterpriseId, 'site_id' => $site->id, 'type' => 'improvement', 'priority' => 'medium', 'title' => $title,
                'description' => $title.' — action de démarrage proposée par l\'assistant.', 'source_type' => 'setup_guide', 'initiator_id' => $user->id,
                'responsible_id' => $user->id, 'deadline' => today()->addDays($days), 'status' => 'planned',
            ]);
        }

        return count($starters);
    }
}
