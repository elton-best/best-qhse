import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { useEmergencyMutations, useResources, useScenarios, type Resource } from "@/integrations/backend/emergency";
import { ConfirmDialog } from "../ConfirmDialog";
import { Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "./FieldsForm";

const TYPES = [
  { value: "extinguisher", label: "Extincteur" }, { value: "spill_kit", label: "Kit anti-déversement" }, { value: "first_aid", label: "Trousse de secours" },
  { value: "alarm", label: "Alarme / détection" }, { value: "eyewash", label: "Douche / lave-yeux" }, { value: "pump", label: "Pompe / absorbant" }, { value: "other", label: "Autre" },
];
const STATUSES = [
  { value: "operational", label: "Opérationnel" }, { value: "to_check", label: "À vérifier" }, { value: "defective", label: "Défectueux" }, { value: "out_of_service", label: "Hors service" },
];
const TONE: Record<string, string> = {
  operational: "bg-emerald-100 text-emerald-700", to_check: "bg-amber-100 text-amber-800", defective: "bg-red-100 text-red-700", out_of_service: "bg-slate-200 text-slate-600",
};

/** Inventaire des moyens d'intervention (M13-04) : prochaine vérification calculée, alertes J-30, J-7 et jour J. */
export function ResourcesTab({ siteId }: { siteId: string }) {
  const { data: resources = [], isLoading } = useResources(siteId || undefined, Boolean(siteId));
  const { data: scenarios = [] } = useScenarios(siteId || undefined, Boolean(siteId));
  const mutations = useEmergencyMutations();
  const [editing, setEditing] = useState<Resource | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Resource | null>(null);

  const fields: FieldSpec[] = [
    { key: "title", label: "Moyen", type: "text", required: true },
    { key: "resource_type", label: "Type", type: "select", options: TYPES, required: true },
    { key: "location", label: "Emplacement", type: "text" },
    { key: "quantity", label: "Quantité", type: "number" },
    { key: "specification", label: "Caractéristiques", type: "text" },
    { key: "status", label: "Statut", type: "select", options: STATUSES },
    { key: "last_check_date", label: "Dernière vérification", type: "date", hint: "La prochaine échéance est calculée avec la fréquence." },
    { key: "check_frequency_days", label: "Fréquence de vérification (jours)", type: "number" },
    { key: "procedure_id", label: "Scénario concerné (facultatif)", type: "select", options: scenarios.map((s) => ({ value: String(s.id), label: s.title })) },
  ];

  const markChecked = async (resource: Resource): Promise<void> => {
    try {
      await mutations.saveResource.mutateAsync({ id: resource.id, input: { last_check_date: new Date().toISOString().slice(0, 10) } as never });
      toast.success("Vérification enregistrée.");
    } catch (e) {
      toast.error(errorMessage(e, "Enregistrement impossible."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Extincteurs, kits anti-déversement, alarmes… avec leurs dates de vérification.</p>
        <button type="button" className={primary} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Ajouter un moyen</button>
      </div>

      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : resources.length === 0 ? (
          <p className={`py-8 text-center ${muted}`}>Aucun moyen d'intervention enregistré.</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Moyen</th><th className="px-3 py-2">Emplacement</th><th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Dernière vérif.</th><th className="px-3 py-2">Prochaine vérif.</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-3"><p className="font-semibold">{r.title}</p><p className={muted}>{TYPES.find((t) => t.value === r.resource_type)?.label} · ×{r.quantity}</p></td>
                  <td className="px-3 py-3">{r.location ?? "—"}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[r.status]}`}>{STATUSES.find((s) => s.value === r.status)?.label}</span></td>
                  <td className="px-3 py-3">{r.last_check_date ? formatDateFR(r.last_check_date) : "—"}</td>
                  <td className="px-3 py-3">
                    {r.next_check_date ? formatDateFR(r.next_check_date) : "—"}
                    {r.is_overdue && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">En retard</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={secondary} onClick={() => void markChecked(r)}><CheckCircle2 className="h-4 w-4" /> Vérifié aujourd'hui</button>
                      <button type="button" className={secondary} onClick={() => { setError(null); setEditing(r); }}>Modifier</button>
                      <button type="button" className={`${secondary} text-destructive`} onClick={() => setToDelete(r)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Nouveau moyen d'intervention" : "Modifier le moyen"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={fields}
            busy={mutations.saveResource.isPending}
            error={error}
            initial={editing === "new"
              ? { resource_type: "extinguisher", quantity: "1", check_frequency_days: "365", status: "operational" }
              : { title: editing.title, resource_type: editing.resource_type, location: editing.location ?? "", quantity: String(editing.quantity), specification: editing.specification ?? "", status: editing.status, last_check_date: editing.last_check_date?.slice(0, 10) ?? "", check_frequency_days: String(editing.check_frequency_days), procedure_id: editing.procedure_id ? String(editing.procedure_id) : "" }}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await mutations.saveResource.mutateAsync({
                  ...(editing !== "new" ? { id: editing.id } : {}),
                  input: {
                    ...(editing === "new" ? { site_id: siteId } : {}),
                    title: String(v["title"]), resource_type: String(v["resource_type"]), location: orNull(v["location"]), quantity: orNumber(v["quantity"]) ?? 1,
                    specification: orNull(v["specification"]), status: String(v["status"] || "operational"), last_check_date: orNull(v["last_check_date"]),
                    check_frequency_days: orNumber(v["check_frequency_days"]) ?? 365, procedure_id: v["procedure_id"] ? Number(v["procedure_id"]) : null,
                  } as never,
                });
                toast.success("Moyen enregistré.");
                setEditing(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce moyen ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => { const t = toDelete; setToDelete(null); if (t) mutations.removeResource.mutateAsync(t.id).then(() => toast.success("Moyen supprimé."), (e: Error) => toast.error(e.message)); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
