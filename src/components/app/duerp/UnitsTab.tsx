import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDuerpMutations, type Duerp, type WorkUnit } from "@/integrations/backend/duerp";
import { Modal } from "../overlay";
import { card, errorMessage, muted, primary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "../emergency/FieldsForm";

const FIELDS: FieldSpec[] = [
  { key: "name", label: "Unité de travail", type: "text", required: true, hint: "Un ensemble de postes ou de situations de travail homogènes (atelier, bureau, chantier…)." },
  { key: "code", label: "Code", type: "text" },
  { key: "headcount", label: "Effectif", type: "number" },
  { key: "description", label: "Description des activités", type: "textarea" },
];

/** Unités de travail (INRS, étape 1) : découpage de l'entreprise en situations de travail comparables. */
export function UnitsTab({ duerp, siteId }: { duerp: Duerp; siteId: string }) {
  const actions = useDuerpMutations();
  const [editing, setEditing] = useState<WorkUnit | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = duerp.workflow_status === "draft";
  const units = duerp.work_units ?? [];
  const dangers = duerp.dangers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={muted}>Chaque unité de travail doit avoir au moins un risque évalué pour que le document soit conforme.</p>
        {draft && <button type="button" className={primary} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Ajouter une unité</button>}
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {units.length === 0 ? <p className={`py-6 text-center ${muted}`}>Aucune unité de travail définie.</p> : (
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Unité</th><th className="px-3 py-2">Effectif</th><th className="px-3 py-2">Risques évalués</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {units.map((unit) => {
                const count = dangers.filter((d) => d.work_unit_id === unit.id).length;
                return (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" disabled={!draft} onClick={() => { setError(null); setEditing(unit); }}>{unit.name}</button>{unit.description && <p className={muted}>{unit.description}</p>}</td>
                    <td className="px-3 py-3">{unit.headcount ?? "—"}</td>
                    <td className="px-3 py-3">{count === 0 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Aucun</span> : count}</td>
                    <td className="px-3 py-3 text-right">
                      {draft && count === 0 && (
                        <button type="button" aria-label={`Supprimer ${unit.name}`} className="text-muted-foreground hover:text-destructive"
                          onClick={() => actions.removeUnit.mutateAsync(unit.id).then(() => toast.success("Unité supprimée."), (e: unknown) => toast.error(errorMessage(e, "Suppression impossible.")))}><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {editing !== null && (
        <Modal title={editing === "new" ? "Nouvelle unité de travail" : "Modifier l'unité de travail"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            busy={actions.saveUnit.isPending}
            error={error}
            initial={editing === "new" ? {} : { name: editing.name, code: editing.code ?? "", headcount: editing.headcount ? String(editing.headcount) : "", description: editing.description ?? "" }}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const headcount = orNumber(v["headcount"]);
                await actions.saveUnit.mutateAsync({
                  id: editing === "new" ? undefined : editing.id,
                  input: { name: String(v["name"]), code: orNull(v["code"]), headcount, description: orNull(v["description"]), ...(editing === "new" ? { duerp_id: duerp.id, site_id: siteId } : {}) },
                });
                toast.success("Unité de travail enregistrée.");
                setEditing(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}
