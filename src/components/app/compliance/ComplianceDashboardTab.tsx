import { Link } from "@tanstack/react-router";
import { useComplianceDashboard, useExpirations, type GroupRow, type ObligationSummary } from "@/integrations/backend/compliance";
import { PageSkeleton, Stat, card, formatDateFR, muted } from "../planning/shared";
import { BUCKET_LABEL, SOURCE_TYPES, labelOf } from "./compliance-config";

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className={`${card} p-5`}>
      <h3 className="font-display font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className={`mt-3 ${muted}`}>Aucune donnée.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1">Nom</th><th>Obligations</th><th>Applicables</th><th>Non conformes</th><th>Taux</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-border">
                <td className="py-2 font-semibold">{row.name}</td>
                <td>{row.total}</td>
                <td>{row.applicable}</td>
                <td className={row.non_compliant ? "font-bold text-red-600" : ""}>{row.non_compliant}</td>
                <td>{row.rate === null ? "—" : `${row.rate} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function List({ title, items, empty, date }: { title: string; items: ObligationSummary[]; empty: string; date: (item: ObligationSummary) => string | null }) {
  return (
    <section className={`${card} p-5`}>
      <h3 className="font-display font-bold">{title}</h3>
      {items.length === 0 ? (
        <p className={`mt-3 ${muted}`}>{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {items.slice(0, 8).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <span><span className="font-semibold">{item.ref}</span> — {item.title}</span>
              <span className={muted}>{date(item) ? formatDateFR(date(item)) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tableau de bord de conformité (M5-07) et échéances des permis et licences (M5-06). */
export function ComplianceDashboardTab({ siteId }: { siteId: string }) {
  const { data, isLoading } = useComplianceDashboard(siteId || undefined, Boolean(siteId));
  const { data: expirations = [] } = useExpirations(siteId || undefined, Boolean(siteId));

  if (isLoading || !data) return <PageSkeleton rows={3} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat value={data.compliance_rate === null ? "—" : `${data.compliance_rate} %`} label="Taux de conformité" tone={data.compliance_rate !== null && data.compliance_rate < 80 ? "text-red-600" : "text-emerald-600"} />
        <Stat value={data.total} label="Obligations" />
        <Stat value={data.applicable} label="Applicables" />
        <Stat value={data.to_qualify} label="À qualifier" tone={data.to_qualify ? "text-amber-600" : "text-primary"} />
        <Stat value={data.never_evaluated.length} label="Jamais évaluées" tone={data.never_evaluated.length ? "text-red-600" : "text-primary"} />
        <Stat value={data.due_in_30_days} label="Évaluations à 30 jours" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable title="Par site" rows={data.by_site} />
        <GroupTable title="Par domaine" rows={data.by_domain} />
        <List title="Obligations jamais évaluées" items={data.never_evaluated} empty="Toutes les obligations applicables ont été évaluées." date={() => null} />
        <List title="Évaluations en retard" items={data.overdue_evaluations} empty="Aucune évaluation en retard." date={(item) => item.next_evaluation_date} />
      </div>

      <section className={`${card} p-5`}>
        <h3 className="font-display font-bold">Permis, licences et autorisations</h3>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          {(["expired", "d7", "d30", "d90"] as const).map((bucket) => (
            <span key={bucket} className={`rounded-full px-2.5 py-1 ${BUCKET_LABEL[bucket]!.tone}`}>{BUCKET_LABEL[bucket]!.label} : {data.expirations[bucket]}</span>
          ))}
        </div>
        {expirations.length === 0 ? (
          <p className={`mt-3 ${muted}`}>Aucun permis ni licence suivi.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-1">Autorisation</th><th>Type</th><th>Échéance</th><th>Reste</th></tr>
            </thead>
            <tbody>
              {expirations.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="py-2"><span className="font-semibold">{item.ref}</span> — {item.title}</td>
                  <td>{labelOf(SOURCE_TYPES, item.source_type)}</td>
                  <td>{item.expiry_date ? formatDateFR(item.expiry_date) : "—"}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BUCKET_LABEL[item.bucket ?? "later"]!.tone}`}>{(item.days_left ?? 0) < 0 ? "Expiré" : `${item.days_left} j`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={`mt-3 ${muted}`}>Des alertes sont envoyées au responsable à J-90, J-30 et J-7.</p>
      </section>

      {data.linked_aspects_at_risk > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {data.linked_aspects_at_risk} aspect(s) environnemental(aux) sont à réévaluer.{" "}
          <Link to="/app/$section" params={{ section: "aspects-environnementaux" }} className="font-bold underline">Ouvrir les aspects</Link>
        </p>
      )}
    </div>
  );
}
