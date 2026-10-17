import { REVISION_REASONS, useVersions } from "@/integrations/backend/duerp";
import { PageSkeleton, card, formatDateFR, muted } from "../planning/shared";
import { WORKFLOW } from "./duerp-config";

/** Historique des versions : chaque version approuvée est conservée (traçabilité et conservation du document). */
export function VersionsTab({ duerpId, currentId, onOpen }: { duerpId: number; currentId: number; onOpen: (id: number) => void }) {
  const { data = [], isLoading } = useVersions(duerpId);
  if (isLoading) return <PageSkeleton rows={3} />;

  return (
    <div className={`${card} overflow-x-auto p-4`}>
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Version</th><th className="px-3 py-2">Évaluation</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Approbation</th></tr></thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.id} className="border-t border-border">
              <td className="px-3 py-3"><button type="button" className="font-semibold hover:underline" onClick={() => onOpen(v.id)}>v{v.version}{v.is_current ? " · en vigueur" : ""}{v.id === currentId ? " (affichée)" : ""}</button><p className={muted}>{v.dangers_count} risque(s)</p></td>
              <td className="px-3 py-3">{formatDateFR(v.evaluation_date)}</td>
              <td className="px-3 py-3">{REVISION_REASONS.find((r) => r.value === v.revision_reason)?.label ?? (v.revision_reason === "initial" ? "Première évaluation" : "—")}</td>
              <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${WORKFLOW[v.workflow_status].tone}`}>{WORKFLOW[v.workflow_status].label}</span></td>
              <td className="px-3 py-3">{v.approved_at ? `${formatDateFR(v.approved_at)}${v.approver ? ` — ${v.approver.name}` : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
