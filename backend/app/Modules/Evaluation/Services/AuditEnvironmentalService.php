<?php

namespace App\Modules\Evaluation\Services;

use App\Modules\Processes\Models\Process;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Appui à l'audit interne ISO 14001:2026 §9.2 : propositions pour le programme (importance environnementale des processus,
 * changements, résultats des audits précédents) et listes de contrôle par article de la norme.
 */
class AuditEnvironmentalService
{
    /** Articles de la norme proposés pour la liste de contrôle, avec leurs questions. */
    public const CLAUSES = [
        '4.1' => ['Le contexte et les enjeux externes et internes influant sur le SME sont-ils déterminés et revus ?'],
        '4.2' => ['Les parties intéressées et leurs exigences pertinentes sont-elles identifiées, dont celles devenues obligations de conformité ?'],
        '5.2' => ['La politique environnementale est-elle documentée, communiquée et comprise par le personnel ?'],
        '6.1.2' => [
            'Les aspects environnementaux sont-ils identifiés pour chaque activité, produit et service, y compris en situation anormale et d\'urgence ?',
            'Les critères de significativité sont-ils appliqués et les aspects significatifs tenus à jour ?',
        ],
        '6.1.3' => [
            'Les obligations de conformité sont-elles identifiées, accessibles et mises à jour ?',
            'L\'applicabilité de chaque obligation est-elle justifiée et leur évaluation périodique tracée ?',
        ],
        '6.2' => ['Les objectifs environnementaux sont-ils mesurables, suivis et assortis d\'actions planifiées (qui, quoi, quand, ressources) ?'],
        '6.3' => ['Les changements planifiés ont-ils fait l\'objet d\'une analyse d\'impact environnemental avant leur mise en œuvre ?'],
        '7.2' => ['Les compétences des personnes dont le travail influe sur la performance environnementale sont-elles démontrées ?'],
        '7.3' => ['Le personnel connaît-il la politique, les aspects significatifs liés à son travail et les conséquences d\'un manquement ?'],
        '7.4' => ['Les communications internes et externes sont-elles planifiées et les plaintes traitées rapidement ?'],
        '7.5' => ['Les informations documentées sont-elles maîtrisées (identification, approbation, diffusion, conservation) ?'],
        '8.1' => ['Les processus nécessaires aux exigences du SME sont-ils maîtrisés, y compris ceux externalisés, avec une perspective de cycle de vie ?'],
        '8.2' => ['Les scénarios d\'urgence sont-ils identifiés, les moyens vérifiés et les exercices réalisés ?', 'Les situations d\'urgence réelles ont-elles donné lieu à un retour d\'expérience ?'],
        '9.1.1' => ['La performance environnementale est-elle surveillée et mesurée, avec des instruments étalonnés et des résultats traçables ?'],
        '9.1.2' => ['La conformité aux obligations est-elle évaluée à la fréquence définie, avec les preuves conservées ?'],
        '9.3' => ['La revue de direction a-t-elle examiné toutes les entrées requises et produit les décisions attendues ?'],
        '10.2' => ['Les non-conformités sont-elles traitées, leurs causes analysées et l\'efficacité des actions vérifiée ?'],
    ];

    /**
     * @param  array<int, string>  $clauses  articles demandés ; tous si la liste est vide
     * @return array<int, array<string, mixed>>
     */
    public function checklistQuestions(array $clauses): array
    {
        $selected = $clauses === [] ? array_keys(self::CLAUSES) : $clauses;
        $items = [];
        foreach ($selected as $clause) {
            foreach (self::CLAUSES[$clause] ?? [] as $question) {
                $items[] = ['question' => $question, 'clause_iso' => $clause, 'conformity' => null, 'evidence' => '', 'notes' => ''];
            }
        }

        return $items;
    }

    /**
     * Propositions de sujets d'audit du site, classées par importance (M15-01).
     *
     * @return array<int, array<string, mixed>>
     */
    public function proposals(int $enterpriseId, int $siteId, int $year): array
    {
        $today = Carbon::create($year, 12, 31)->min(today());
        $processes = Process::query()->where('site_id', $siteId)->get(['id', 'title', 'code']);

        $aspects = DB::table('environmental_aspects')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)->where('status', '!=', 'archived')
            ->get(['process_id', 'is_significant', 'needs_reassessment'])->groupBy('process_id');
        $findings = DB::table('audit_findings')->whereNull('deleted_at')->whereIn('status', ['open', 'nc_created', 'action_planned'])->whereIn('type', ['nc_major', 'nc_minor'])
            ->whereIn('process_id', $processes->pluck('id'))->get(['process_id', 'type'])->groupBy('process_id');
        $lastAudits = DB::table('audit_process as ap')->join('audits as a', 'a.id', '=', 'ap.audit_id')->whereNull('a.deleted_at')->where('a.status', 'completed')
            ->whereIn('ap.process_id', $processes->pluck('id'))->groupBy('ap.process_id')->select('ap.process_id', DB::raw('max(coalesce(a.actual_date, a.planned_date)) as last_date'))->pluck('last_date', 'process_id');
        $siteChanges = DB::table('management_changes')->whereNull('deleted_at')->where('enterprise_id', $enterpriseId)->where('site_id', $siteId)
            ->whereNotIn('status', ['rejected'])->where('created_at', '>=', today()->subYear())->count();

        $rows = [];
        foreach ($processes as $process) {
            $reasons = [];
            $score = 0;
            $processAspects = $aspects->get($process->id, collect());
            $significant = $processAspects->where('is_significant', true)->count();
            if ($significant > 0) {
                $score += min($significant, 5) * 2;
                $reasons[] = "{$significant} aspect(s) environnemental(aux) significatif(s)";
            }
            $reassess = $processAspects->where('needs_reassessment', true)->count();
            if ($reassess > 0) {
                $score += $reassess * 2;
                $reasons[] = "{$reassess} aspect(s) à réévaluer (changement, urgence ou obligation)";
            }
            $open = $findings->get($process->id, collect());
            if ($open->isNotEmpty()) {
                $score += $open->where('type', 'nc_major')->count() * 6 + $open->where('type', 'nc_minor')->count() * 3;
                $reasons[] = $open->count().' non-conformité(s) d\'audit encore ouverte(s)';
            }
            $last = isset($lastAudits[$process->id]) ? Carbon::parse($lastAudits[$process->id]) : null;
            $months = $last?->diffInMonths($today);
            if ($last === null) {
                $score += 6;
                $reasons[] = 'jamais audité';
            } elseif ($months > 12) {
                $score += 4;
                $reasons[] = "dernier audit il y a {$months} mois";
            } elseif ($months > 6) {
                $score += 2;
                $reasons[] = "dernier audit il y a {$months} mois";
            }
            if ($siteChanges > 0 && $significant > 0) {
                $score += 2;
                $reasons[] = "{$siteChanges} changement(s) sur le site depuis 12 mois";
            }

            $rows[] = [
                'process_id' => $process->id, 'process' => $process->title, 'code' => $process->code, 'score' => $score,
                'priority' => $score >= 12 ? 'high' : ($score >= 6 ? 'medium' : 'low'),
                'suggested_frequency' => $score >= 12 ? 'biannual' : ($score >= 6 ? 'annual' : 'ad_hoc'),
                'last_audited_at' => $last?->toDateString(), 'reasons' => $reasons,
            ];
        }
        usort($rows, fn (array $a, array $b) => $b['score'] <=> $a['score']);

        return $rows;
    }
}
