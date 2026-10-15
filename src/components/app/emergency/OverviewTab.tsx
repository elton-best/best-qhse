import { useEmergencyOverview } from "@/integrations/backend/emergency";
import { PageSkeleton, Stat, card, muted } from "../planning/shared";

/** Vue d'ensemble de la préparation (§8.2) : scénarios prêts, moyens à vérifier, exercices et situations réelles. */
export function OverviewTab({ siteId, onNavigate }: { siteId: string; onNavigate: (tab: "scenarios" | "contacts" | "resources" | "exercises" | "events") => void }) {
  const { data, isLoading } = useEmergencyOverview(siteId || undefined, Boolean(siteId));
  if (isLoading || !data) return <PageSkeleton rows={2} />;

  const gaps: { label: string; tab: "scenarios" | "resources" | "exercises" | "events"; show: boolean }[] = [
    { label: `${data.scenarios.to_complete} scénario(s) à compléter (plan de réponse manquant)`, tab: "scenarios", show: data.scenarios.to_complete > 0 },
    { label: `${data.scenarios.to_revise} scénario(s) à réviser après une situation réelle`, tab: "scenarios", show: data.scenarios.to_revise > 0 },
    { label: `${data.scenarios.without_recent_drill.length} scénario(s) prêt(s) sans exercice depuis plus d'un an`, tab: "exercises", show: data.scenarios.without_recent_drill.length > 0 },
    { label: `${data.resources.overdue} moyen(s) d'intervention à vérifier en retard`, tab: "resources", show: data.resources.overdue > 0 },
    { label: `${data.resources.defective} moyen(s) défectueux ou à vérifier`, tab: "resources", show: data.resources.defective > 0 },
    { label: `${data.exercises.overdue} exercice(s) planifié(s) en retard`, tab: "exercises", show: data.exercises.overdue > 0 },
    { label: `${data.events.ongoing} situation(s) d'urgence en cours ou à clôturer`, tab: "events", show: data.events.ongoing > 0 },
  ];
  const open = gaps.filter((g) => g.show);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat value={`${data.scenarios.ready}/${data.scenarios.total}`} label="Scénarios prêts" tone={data.scenarios.to_complete ? "text-amber-600" : "text-emerald-600"} />
        <Stat value={data.scenarios.from_aspects} label="Issus des aspects" />
        <Stat value={data.contacts.total} label="Contacts d'urgence" />
        <Stat value={data.resources.overdue} label="Vérifications en retard" tone={data.resources.overdue ? "text-red-600" : "text-emerald-600"} />
        <Stat value={data.exercises.done_last_12_months} label="Exercices (12 mois)" />
        <Stat value={data.events.ongoing} label="Urgences en cours" tone={data.events.ongoing ? "text-red-600" : "text-emerald-600"} />
      </div>
      <section className={`${card} p-5`}>
        <h2 className="font-display text-lg font-bold">Points d'attention</h2>
        {open.length === 0 ? (
          <p className={`mt-2 ${muted}`}>Aucun écart : la préparation aux urgences est à jour.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {open.map((gap) => (
              <li key={gap.label} className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                <span>{gap.label}</span>
                <button type="button" className="font-semibold underline" onClick={() => onNavigate(gap.tab)}>Traiter</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
