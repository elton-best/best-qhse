import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDuerpMutations, useRiskFamilies, useScales, type Danger, type DangerInput, type Duerp,
} from "@/integrations/backend/duerp";
import { Drawer } from "../overlay";
import { PageSkeleton, card, errorMessage, muted, primary } from "../planning/shared";
import { LEVEL_TONE } from "./duerp-config";
import { RiskForm } from "./RiskForm";

/** Registre des risques : unité de travail ➔ famille de risques ➔ risques évalués (canevas INRS). */
export function RegisterTab({ duerp }: { duerp: Duerp }) {
  const { data: scalesData } = useScales();
  const { data: families = [] } = useRiskFamilies();
  const actions = useDuerpMutations();
  const [editing, setEditing] = useState<Danger | "new" | null>(null);
  const draft = duerp.workflow_status === "draft";
  const dangers = duerp.dangers ?? [];
  const units = duerp.work_units ?? [];

  if (!scalesData) return <PageSkeleton rows={3} />;

  const names = [...new Set([...units.map((unit) => unit.name), ...dangers.map((d) => d.work_unit ?? "Unité non précisée")])];
  const save = async (input: DangerInput): Promise<void> => {
    await actions.saveDanger.mutateAsync({ duerpId: duerp.id, id: editing !== "new" && editing ? editing.id : undefined, input });
    toast.success("Risque enregistré.");
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={muted}>Évaluez les risques tels qu'ils se présentent dans le travail réel, unité de travail par unité de travail.</p>
        {draft && <button type="button" className={primary} disabled={units.length === 0} onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Ajouter un risque</button>}
      </div>
      {draft && units.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Définissez d'abord vos unités de travail (onglet « Unités de travail »).</p>}

      {names.map((name) => {
        const rows = dangers.filter((d) => (d.work_unit ?? "Unité non précisée") === name).sort((a, b) => (b.assessed_risk_score ?? 0) - (a.assessed_risk_score ?? 0));
        return (
          <section key={name} className={`${card} p-4`}>
            <h3 className="font-display font-bold">{name} <span className={muted}>· {rows.length} risque(s)</span></h3>
            {rows.length === 0 ? <p className={`mt-2 ${muted}`}>Aucun risque évalué : à compléter avant la soumission.</p> : (
              <ul className="mt-3 space-y-2">
                {rows.map((d) => (
                  <li key={d.id} className="rounded-xl bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(d)}>
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{d.inrs_family}</span>
                        <span className="block font-semibold">{d.dangerous_situation}</span>
                        <span className={muted}>{d.identified_risks}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {d.needs_review && <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">À réévaluer</span>}
                        {d.assessed_risk_level && <span className={`rounded-full px-2.5 py-0.5 font-bold ${LEVEL_TONE[d.assessed_risk_level]}`}>Évalué {d.assessed_risk_score} · {d.assessed_risk_level}</span>}
                        {d.residual_risk_level && <span className={`rounded-full px-2.5 py-0.5 font-bold ${LEVEL_TONE[d.residual_risk_level]}`}>Résiduel {d.residual_risk_score}</span>}
                        {draft && (
                          <button type="button" aria-label="Supprimer ce risque" className="text-muted-foreground hover:text-destructive"
                            onClick={() => actions.removeDanger.mutateAsync({ duerpId: duerp.id, id: d.id }).then(() => toast.success("Risque supprimé."), (e: unknown) => toast.error(errorMessage(e, "Suppression impossible.")))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editing !== null && (
        <Drawer title={editing === "new" ? "Nouveau risque" : "Fiche de risque"} subtitle={duerp.title ?? `DUERP v${duerp.version}`} onClose={() => setEditing(null)} wide>
          <RiskForm
            danger={editing === "new" ? null : editing}
            units={units}
            families={families}
            scales={scalesData.scales}
            locked={!draft}
            busy={actions.saveDanger.isPending}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        </Drawer>
      )}
    </div>
  );
}
