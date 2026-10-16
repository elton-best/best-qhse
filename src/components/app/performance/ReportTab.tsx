import { useState } from "react";
import { useReport } from "@/integrations/backend/performance";
import { PageSkeleton, card, formatDateFR, input, muted } from "../planning/shared";
import { STATE, TREND } from "./performance-config";

/** Rapport périodique pour les responsables qui décident des actions (A.9.1.1) ; alimente la revue de direction. */
export function ReportTab({ siteId }: { siteId: string }) {
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const { data, isLoading } = useReport(siteId || undefined, from, to, Boolean(siteId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Du <input type="date" className={`${input} ml-2 w-auto`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm font-semibold">au <input type="date" className={`${input} ml-2 w-auto`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold" onClick={() => window.print()}>Imprimer</button>
      </div>
      {isLoading || !data ? <PageSkeleton rows={4} /> : (
        <>
          <p className={muted}>Période du {formatDateFR(data.from)} au {formatDateFR(data.to)} · {data.alerts.length} dépassement(s) de seuil · {data.readings_with_invalid_instrument} relevé(s) avec instrument hors validité.</p>
          <div className={`${card} overflow-x-auto p-4`}>
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Indicateur</th><th className="px-3 py-2">Relevés</th><th className="px-3 py-2">Moyenne</th><th className="px-3 py-2">Dernier</th><th className="px-3 py-2">Tendance</th><th className="px-3 py-2">État</th></tr></thead>
              <tbody>
                {data.indicators.map((row) => (
                  <tr key={row.ref} className="border-t border-border">
                    <td className="px-3 py-3 font-semibold">{row.title}<p className={muted}>{row.ref} · {row.unit}</p></td>
                    <td className="px-3 py-3">{row.count}</td><td className="px-3 py-3">{row.average ?? "—"}</td><td className="px-3 py-3">{row.last_value ?? "—"}</td>
                    <td className="px-3 py-3">{TREND[row.trend]}{row.change_vs_previous_pct !== null ? ` (${row.change_vs_previous_pct > 0 ? "+" : ""}${row.change_vs_previous_pct} %)` : ""}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATE[row.threshold_state].tone}`}>{STATE[row.threshold_state].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
