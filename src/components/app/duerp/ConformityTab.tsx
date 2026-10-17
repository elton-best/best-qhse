import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { useConformity } from "@/integrations/backend/duerp";
import { PageSkeleton, card, muted } from "../planning/shared";
import { LEVEL_TONE } from "./duerp-config";

/** Contrôle de conformité du document avec le Code du travail (R.4121-1 à R.4121-4) et la méthode INRS. */
export function ConformityTab({ duerpId }: { duerpId: number }) {
  const { data, isLoading } = useConformity(duerpId);
  if (isLoading || !data) return <PageSkeleton rows={5} />;

  const { checks, summary, ready } = data;
  return (
    <div className="space-y-4">
      <p className={`${card} p-4 text-sm font-semibold ${ready ? "text-emerald-700" : "text-red-700"}`} role="status">
        {ready ? "Aucun point bloquant : le document peut être soumis à la Direction." : "Des points bloquants empêchent la soumission du document."}
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["Significatif", "Moyen", "Faible"] as const).map((level) => (
          <div key={level} className={`${card} p-4`}><p className="text-2xl font-extrabold">{summary.by_level[level]}</p><p className={muted}>Risques <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[level]}`}>{level}</span></p></div>
        ))}
        <div className={`${card} p-4`}><p className="text-2xl font-extrabold">{summary.actions_overdue}</p><p className={muted}>Actions en retard</p></div>
      </div>
      <ul className={`${card} divide-y divide-border`}>
        {checks.map((check) => (
          <li key={check.code} className="flex items-start gap-3 p-4 text-sm">
            {check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : check.blocking ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            <div>
              <p className="font-semibold">{check.label}{!check.ok && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${check.blocking ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{check.blocking ? "Bloquant" : "À surveiller"}</span>}</p>
              {check.detail && !check.ok && <p className={muted}>{check.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
      {summary.families_missing.length > 0 && (
        <details className={`${card} p-4 text-sm`}>
          <summary className="cursor-pointer font-semibold">Familles INRS sans risque évalué ({summary.families_missing.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground">{summary.families_missing.map((family) => <li key={family}>{family}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
