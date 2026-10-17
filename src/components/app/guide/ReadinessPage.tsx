import { Link } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useReadiness, type ClauseStatus } from "@/integrations/backend/guide";
import { Header, PageSkeleton, SiteNotice, card, muted } from "../planning/shared";

const STATUS: Record<ClauseStatus, [string, string]> = {
  compliant: ["Conforme", "bg-emerald-100 text-emerald-700"], to_complete: ["À compléter", "bg-amber-100 text-amber-800"], missing: ["Manquant", "bg-red-100 text-red-700"],
};
const CHECK_TONE = { ok: "text-emerald-700", partial: "text-amber-700", missing: "text-red-700" } as const;
const CHECK_MARK = { ok: "✔", partial: "◐", missing: "✘" } as const;

/** Score de préparation à l'audit de certification (T-03) : un état par article, calculé sur les informations présentes, à jour et validées. */
export function ReadinessPage() {
  const [siteId] = useCurrentSite();
  const { data, isLoading } = useReadiness(siteId || undefined, Boolean(siteId));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header eyebrow="Accueil — ISO 14001:2026" title="Préparation à la certification" icon={Award}
        description="Où en êtes-vous avant l'audit de certification ? Chaque article est évalué à partir de ce qui est réellement renseigné, à jour et validé." />
      {isLoading || !data ? <PageSkeleton rows={5} /> : (
        <>
          <section className={`${card} flex flex-wrap items-center gap-6 p-5`} role="status" aria-label="Score de préparation">
            <div><p className="text-5xl font-extrabold">{Math.round(data.score)} %</p><p className={muted}>Score de préparation — {data.site.name}</p></div>
            <div className="flex flex-wrap gap-3 text-sm">
              {(["compliant", "to_complete", "missing"] as const).map((key) => <span key={key} className={`rounded-full px-3 py-1 font-bold ${STATUS[key][1]}`}>{data.counts[key]} {STATUS[key][0].toLowerCase()}</span>)}
            </div>
          </section>

          {data.gaps.length > 0 && (
            <section className={`${card} space-y-2 p-4`}>
              <h2 className="font-semibold">Ce qu'il reste à faire ({data.gaps.length})</h2>
              <ul className="divide-y divide-border text-sm">
                {data.gaps.map((gap) => (
                  <li key={`${gap.clause}-${gap.label}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-mono text-xs font-bold text-primary">{gap.clause}</span> {gap.label}<span className={`block ${muted}`}>{gap.detail}</span></span>
                    <Link to="/app/$section" params={{ section: gap.fix }} className="text-sm font-bold text-primary hover:underline">Corriger</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="grid gap-3 md:grid-cols-2">
            {data.clauses.map((clause) => (
              <li key={clause.clause} className={`${card} space-y-2 p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold"><span className="font-mono text-xs text-primary">{clause.clause}</span> {clause.title}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[clause.status][1]}`}>{STATUS[clause.status][0]}</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {clause.checks.map((check) => <li key={check.label} className={CHECK_TONE[check.state]}><span aria-hidden>{CHECK_MARK[check.state]}</span> {check.label}<span className={`block pl-5 ${muted}`}>{check.detail}</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
