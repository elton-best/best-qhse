import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Danger, Duerp } from "@/integrations/backend/duerp";
import { card, formatDateFR, muted } from "../planning/shared";
import { ACTION_STATUS, LEVEL_TONE, PREVENTION_TYPES } from "./duerp-config";

/** Plan d'actions de prévention : risques à traiter, classés par niveau de risque évalué. */
export function PlanTab({ duerp, onOpen }: { duerp: Duerp; onOpen: (danger: Danger) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (duerp.dangers ?? [])
    .filter((d) => d.prevention_actions || d.assessed_risk_level === "Significatif")
    .sort((a, b) => (b.assessed_risk_score ?? 0) - (a.assessed_risk_score ?? 0));

  if (rows.length === 0) return <p className={`${card} p-6 text-center ${muted}`}>Aucune action de prévention : les risques significatifs doivent obligatoirement en avoir une.</p>;

  return (
    <div className={`${card} overflow-x-auto p-4`}>
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Risque</th><th className="px-3 py-2">Action de prévention</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Échéance</th><th className="px-3 py-2">Avancement</th><th className="px-3 py-2">Résiduel</th></tr></thead>
        <tbody>
          {rows.map((d) => {
            const missing = !d.prevention_actions || !d.responsible_name || !d.deadline;
            const late = d.deadline !== null && d.deadline.slice(0, 10) < today && d.action_status !== "realise" && d.action_status !== "en_continu";
            return (
              <tr key={d.id} className="border-t border-border align-top">
                <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => onOpen(d)}>{d.dangerous_situation}</button>
                  <p className={muted}>{d.work_unit} · {d.assessed_risk_level && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[d.assessed_risk_level]}`}>{d.assessed_risk_level}</span>}</p></td>
                <td className="px-3 py-3">{d.prevention_actions ?? <span className="inline-flex items-center gap-1 text-red-700"><AlertTriangle className="h-4 w-4" /> À définir</span>}
                  {d.prevention_type && <p className={muted}>{PREVENTION_TYPES.find((t) => t.value === d.prevention_type)?.label}</p>}</td>
                <td className="px-3 py-3">{d.responsible_name ?? (missing ? "—" : "")}</td>
                <td className="px-3 py-3">{formatDateFR(d.deadline)}{late && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">En retard</span>}</td>
                <td className="px-3 py-3">{d.action_status ? ACTION_STATUS[d.action_status] : "Non démarrée"}{d.action_status === "realise" && <CheckCircle2 className="ml-1 inline h-4 w-4 text-emerald-600" />}</td>
                <td className="px-3 py-3">{d.residual_risk_level ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[d.residual_risk_level]}`}>{d.residual_risk_score} · {d.residual_risk_level}</span> : d.action_status === "realise" ? <span className="text-xs font-bold text-red-700">À évaluer</span> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
