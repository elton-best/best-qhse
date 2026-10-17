import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { REPORT_SOURCES, useNcDashboard, useNcList, type Nc } from "@/integrations/backend/nonconformities";
import { Header, PageSkeleton, SiteNotice, card, formatDateFR, muted } from "../planning/shared";
import { NcDrawer } from "./NcDrawer";
import { QuickDeclare } from "./QuickDeclare";

type Tab = "declare" | "register" | "dashboard";
const SEVERITY: Record<string, [string, string]> = { minor: ["Mineure", "bg-amber-100 text-amber-800"], major: ["Majeure", "bg-orange-100 text-orange-800"], critical: ["Critique", "bg-red-100 text-red-700"] };
const label = (map: Record<string, string>, key: string): string => map[key] ?? key;
const SOURCE_LABEL = Object.fromEntries(REPORT_SOURCES.map((s) => [s.value, s.label]));

/** Non-conformités et actions correctives — ISO 14001:2026 §10.2. */
export function NcPage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<Tab>("declare");
  const [openNc, setOpenNc] = useState<Nc | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header eyebrow="Amélioration — ISO 14001:2026 §10.2" title="Non-conformités et actions correctives"
        description="Déclarez en moins d'une minute, traitez l'urgence, décidez de l'action corrective, cherchez la cause et vérifiez l'efficacité avant de clôturer."
        icon={ShieldAlert} />
      <div role="tablist" aria-label="Sections des non-conformités" className="flex flex-wrap gap-1 border-b border-border">
        {([["declare", "Déclarer"], ["register", "Registre"], ["dashboard", "Tableau de bord"]] as const).map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{text}</button>
        ))}
      </div>
      {tab === "declare" && <QuickDeclare />}
      {tab === "register" && <Register siteId={siteId} onOpen={setOpenNc} />}
      {tab === "dashboard" && <Dashboard siteId={siteId} />}
      {openNc && <NcDrawer nc={openNc} onClose={() => setOpenNc(null)} />}
    </div>
  );
}

function Register({ siteId, onOpen }: { siteId: string; onOpen: (nc: Nc) => void }) {
  const { data = [], isLoading } = useNcList(siteId || undefined, Boolean(siteId));
  if (isLoading) return <PageSkeleton rows={4} />;
  return (
    <div className={`${card} overflow-x-auto p-4`}>
      {data.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune non-conformité.</p> : (
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Non-conformité</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Gravité</th><th className="px-3 py-2">Échéance</th><th className="px-3 py-2">État</th></tr></thead>
          <tbody>
            {data.map((nc) => (
              <tr key={nc.id} className="border-t border-border">
                <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => onOpen(nc)}>{nc.title}</button><p className={muted}>{nc.ref}{nc.is_recurrent ? " · récurrente" : ""}</p></td>
                <td className="px-3 py-3">{nc.report_source ? label(SOURCE_LABEL, nc.report_source) : "—"}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY[nc.severity]?.[1] ?? ""}`}>{SEVERITY[nc.severity]?.[0] ?? nc.severity}</span></td>
                <td className="px-3 py-3">{formatDateFR(nc.deadline)}{nc.escalation_level > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Niveau {nc.escalation_level}</span>}</td>
                <td className="px-3 py-3">{nc.resolution_date ? "Clôturée" : nc.corrective_decision === "not_required" ? "Sans action" : nc.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Dashboard({ siteId }: { siteId: string }) {
  const { data, isLoading } = useNcDashboard(siteId || undefined);
  if (isLoading || !data) return <PageSkeleton rows={3} />;
  const tiles: [string, string | number][] = [
    ["Ouvertes", data.open], ["Closes", data.closed], ["En retard", data.overdue], ["Délai moyen de clôture", data.average_closure_days === null ? "—" : `${data.average_closure_days} j`],
    ["Récurrentes", data.recurrence_rate === null ? "—" : `${data.recurrence_rate} %`], ["Efficacité à vérifier", data.effectiveness_pending],
  ];
  const Block = ({ title, rows }: { title: string; rows: [string, number][] }) => (
    <div className={`${card} p-4`}><h3 className="text-sm font-bold">{title}</h3><ul className="mt-2 space-y-1 text-sm">{rows.map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><strong>{v}</strong></li>)}{rows.length === 0 && <li className={muted}>—</li>}</ul></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{tiles.map(([text, value]) => <div key={text} className={`${card} p-4`}><p className="text-2xl font-extrabold">{value}</p><p className={muted}>{text}</p></div>)}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Block title="Par source" rows={Object.entries(data.by_source).map(([k, v]) => [label(SOURCE_LABEL, k), v])} />
        <Block title="Par gravité" rows={Object.entries(data.by_severity).map(([k, v]) => [SEVERITY[k]?.[0] ?? k, v])} />
        <Block title="Par site" rows={data.by_site.map((s) => [`${s.site} (${s.open} ouvertes)`, s.total])} />
      </div>
    </div>
  );
}
