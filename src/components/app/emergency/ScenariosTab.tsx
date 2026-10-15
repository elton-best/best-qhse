import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useRelationOptions } from "@/integrations/backend/energy";
import { useEmergencyMutations, useScenarios, type Scenario } from "@/integrations/backend/emergency";
import { ConfirmDialog } from "../ConfirmDialog";
import { Drawer } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, type FieldSpec } from "./FieldsForm";

const STATUS = {
  planifie: { label: "À compléter", tone: "bg-amber-100 text-amber-800" },
  operationnel: { label: "Prêt", tone: "bg-emerald-100 text-emerald-700" },
  teste: { label: "Testé", tone: "bg-sky-100 text-sky-700" },
  a_reviser: { label: "À réviser", tone: "bg-red-100 text-red-700" },
} as const;

/** Scénarios d'urgence et plans de réponse (M13-01 et M13-02), issus des aspects (M4-07) ou créés à la main. */
export function ScenariosTab({ siteId }: { siteId: string }) {
  const { data: scenarios = [], isLoading } = useScenarios(siteId || undefined, Boolean(siteId));
  const users = useRelationOptions("users", siteId, true).data ?? [];
  const mutations = useEmergencyMutations();
  const [editing, setEditing] = useState<Scenario | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Scenario | null>(null);

  const fields: FieldSpec[] = [
    { key: "title", label: "Scénario", type: "text", required: true },
    { key: "emergency_type", label: "Nature (incendie, déversement, inondation…)", type: "text", required: true },
    { key: "hazard_nature", label: "Nature du danger", type: "text" },
    { key: "probable_scale", label: "Ampleur probable", type: "text" },
    { key: "neighbour_risk", label: "Effets possibles d'une installation voisine", type: "textarea" },
    { key: "measures", label: "Mesures de préparation et de réponse", type: "textarea", hint: "Obligatoire pour déclarer le scénario prêt." },
    { key: "procedure_steps", label: "Conduite à tenir (une étape par ligne)", type: "textarea" },
    { key: "prevention_actions", label: "Actions de prévention", type: "textarea" },
    { key: "mitigation_actions", label: "Actions d'atténuation", type: "textarea" },
    { key: "internal_communication", label: "Communication interne", type: "textarea" },
    { key: "external_communication", label: "Communication externe", type: "textarea" },
    { key: "evacuation_routes", label: "Itinéraires d'évacuation", type: "textarea" },
    { key: "assembly_points", label: "Points de rassemblement", type: "textarea" },
    { key: "responsible_id", label: "Responsable", type: "select", options: users.map((u) => ({ value: u.value, label: u.label })) },
    { key: "status", label: "Statut", type: "select", options: [{ value: "planifie", label: "À compléter" }, { value: "operationnel", label: "Prêt" }, { value: "a_reviser", label: "À réviser" }] },
    { key: "next_drill_date", label: "Prochain exercice", type: "date" },
    { key: "next_review_date", label: "Prochaine revue du plan", type: "date" },
  ];

  const initial = (s: Scenario | "new") => (s === "new"
    ? { status: "planifie" }
    : {
        title: s.title, emergency_type: s.emergency_type, hazard_nature: s.hazard_nature ?? "", probable_scale: s.probable_scale ?? "", neighbour_risk: s.neighbour_risk ?? "",
        measures: s.measures ?? "", procedure_steps: (s.procedure_steps ?? []).join("\n"), prevention_actions: s.prevention_actions ?? "", mitigation_actions: s.mitigation_actions ?? "",
        internal_communication: s.internal_communication ?? "", external_communication: s.external_communication ?? "", evacuation_routes: s.evacuation_routes ?? "",
        assembly_points: s.assembly_points ?? "", responsible_id: s.responsible_id ? String(s.responsible_id) : "", status: s.status === "teste" ? "operationnel" : s.status,
        next_drill_date: s.next_drill_date?.slice(0, 10) ?? "", next_review_date: s.next_review_date?.slice(0, 10) ?? "",
      });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Chaque aspect à potentiel d'urgence crée automatiquement un scénario « à compléter ». Un scénario prêt exige un plan de réponse et un responsable.</p>
        <button type="button" className={primary} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Nouveau scénario</button>
      </div>

      {isLoading ? <PageSkeleton rows={3} /> : scenarios.length === 0 ? (
        <div className={`${card} p-8 text-center ${muted}`}>Aucun scénario. Identifiez vos situations d'urgence potentielles (incendie, déversement, inondation…).</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scenarios.map((s) => (
            <article key={s.id} className={`${card} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={muted}>{s.emergency_type}</p>
                  <h3 className="font-display text-lg font-bold">{s.title}</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
              </div>
              {s.aspect && (
                <p className="mt-2 text-sm">
                  Issu de l'aspect :{" "}
                  <Link to="/app/$section" params={{ section: "aspects-environnementaux" }} className="font-semibold text-primary hover:underline">{s.aspect.aspect_number ? `${s.aspect.aspect_number} — ` : ""}{s.aspect.aspect}</Link>
                </p>
              )}
              {s.status === "a_reviser" && s.review_reason && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-800">{s.review_reason}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs font-bold uppercase text-muted-foreground">Responsable</dt><dd>{s.responsible?.name ?? "—"}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-muted-foreground">Dernier exercice</dt><dd>{s.last_drill_date ? formatDateFR(s.last_drill_date) : "Jamais"}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-muted-foreground">Prochain exercice</dt><dd>{s.next_drill_date ? formatDateFR(s.next_drill_date) : "—"}</dd></div>
                <div><dt className="text-xs font-bold uppercase text-muted-foreground">Situations réelles</dt><dd>{s.events_count ?? 0}</dd></div>
              </dl>
              <div className="mt-auto flex gap-2 pt-4">
                <button type="button" className={secondary} onClick={() => { setError(null); setEditing(s); }}>Plan de réponse</button>
                <button type="button" className={`${secondary} text-destructive`} onClick={() => setToDelete(s)}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Drawer title={editing === "new" ? "Nouveau scénario d'urgence" : editing.title} subtitle="ISO 14001 — §8.2" onClose={() => setEditing(null)} wide>
          <FieldsForm
            fields={fields}
            busy={mutations.saveScenario.isPending}
            error={error}
            initial={initial(editing)}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await mutations.saveScenario.mutateAsync({
                  ...(editing !== "new" ? { id: editing.id } : {}),
                  input: {
                    ...(editing === "new" ? { site_id: siteId } : {}),
                    title: String(v["title"]), emergency_type: String(v["emergency_type"]), hazard_nature: orNull(v["hazard_nature"]), probable_scale: orNull(v["probable_scale"]),
                    neighbour_risk: orNull(v["neighbour_risk"]), measures: orNull(v["measures"]),
                    procedure_steps: String(v["procedure_steps"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
                    prevention_actions: orNull(v["prevention_actions"]), mitigation_actions: orNull(v["mitigation_actions"]),
                    internal_communication: orNull(v["internal_communication"]), external_communication: orNull(v["external_communication"]),
                    evacuation_routes: orNull(v["evacuation_routes"]), assembly_points: orNull(v["assembly_points"]),
                    responsible_id: v["responsible_id"] ? Number(v["responsible_id"]) : null, status: String(v["status"] || "planifie"),
                    next_drill_date: orNull(v["next_drill_date"]), next_review_date: orNull(v["next_review_date"]),
                  } as never,
                });
                toast.success("Scénario enregistré.");
                setEditing(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Drawer>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce scénario ?"
        description="Un scénario lié à des situations réelles ne peut pas être supprimé."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => { const t = toDelete; setToDelete(null); if (t) mutations.removeScenario.mutateAsync(t.id).then(() => toast.success("Scénario supprimé."), (e: Error) => toast.error(e.message)); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
