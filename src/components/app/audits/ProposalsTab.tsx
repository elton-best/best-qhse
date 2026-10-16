import { useProposals } from "@/integrations/backend/audits";
import { PageSkeleton, card, formatDateFR, muted } from "../planning/shared";

const PRIORITY = { high: ["Élevée", "bg-red-100 text-red-700"], medium: ["Moyenne", "bg-amber-100 text-amber-800"], low: ["Faible", "bg-emerald-100 text-emerald-700"] } as const;
const FREQUENCY: Record<string, string> = { biannual: "Deux fois par an", annual: "Une fois par an", ad_hoc: "À la demande" };

/** Programme d'audit (M15-01) : processus classés selon leur importance environnementale, les changements et les audits précédents. */
export function ProposalsTab({ siteId, onPlan }: { siteId: string; onPlan: (processId: number) => void }) {
  const year = new Date().getFullYear();
  const { data = [], isLoading } = useProposals(siteId || undefined, year, Boolean(siteId));
  if (isLoading) return <PageSkeleton rows={4} />;

  return (
    <div className="space-y-3">
      <p className={muted}>L'application propose, vous décidez : les processus sont classés selon leurs aspects significatifs, les non-conformités ouvertes, l'ancienneté du dernier audit et les changements récents.</p>
      <div className={`${card} overflow-x-auto p-4`}>
        {data.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucun processus sur ce site.</p> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Processus</th><th className="px-3 py-2">Priorité</th><th className="px-3 py-2">Fréquence proposée</th><th className="px-3 py-2">Pourquoi</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.process_id} className="border-t border-border align-top">
                  <td className="px-3 py-3 font-semibold">{row.process}<p className={muted}>Dernier audit : {formatDateFR(row.last_audited_at)}</p></td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY[row.priority][1]}`}>{PRIORITY[row.priority][0]} · {row.score}</span></td>
                  <td className="px-3 py-3">{FREQUENCY[row.suggested_frequency] ?? row.suggested_frequency}</td>
                  <td className="px-3 py-3"><ul className="list-disc pl-4">{row.reasons.length ? row.reasons.map((r) => <li key={r}>{r}</li>) : <li className={muted}>Aucun facteur de risque identifié</li>}</ul></td>
                  <td className="px-3 py-3 text-right"><button type="button" className="text-xs font-bold text-primary hover:underline" onClick={() => onPlan(row.process_id)}>Planifier un audit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
