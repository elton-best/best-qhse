import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useEmergencyMutations, useExercises, useScenarios, type Exercise } from "@/integrations/backend/emergency";
import { Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "./FieldsForm";

const TYPES = [
  { value: "drill", label: "Exercice pratique" }, { value: "tabletop", label: "Exercice sur table" },
  { value: "evacuation", label: "Évacuation" }, { value: "full_scale", label: "Simulation grandeur nature" },
];
const STATUS = {
  planned: { label: "Planifié", tone: "bg-sky-100 text-sky-700" },
  done: { label: "Réalisé", tone: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Annulé", tone: "bg-slate-200 text-slate-600" },
};

/** Exercices et simulations (M13-05) : planification puis compte rendu avec constats et actions. */
export function ExercisesTab({ siteId }: { siteId: string }) {
  const { data: exercises = [], isLoading } = useExercises(siteId || undefined, Boolean(siteId));
  const { data: scenarios = [] } = useScenarios(siteId || undefined, Boolean(siteId));
  const mutations = useEmergencyMutations();
  const [planning, setPlanning] = useState(false);
  const [completing, setCompleting] = useState<Exercise | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const planFields: FieldSpec[] = [
    { key: "title", label: "Intitulé", type: "text", required: true },
    { key: "procedure_id", label: "Scénario testé", type: "select", options: scenarios.map((s) => ({ value: String(s.id), label: s.title })), required: true },
    { key: "exercise_type", label: "Type", type: "select", options: TYPES },
    { key: "planned_date", label: "Date prévue", type: "date" },
    { key: "participants", label: "Participants prévus", type: "textarea" },
    { key: "description", label: "Objectifs et déroulé", type: "textarea" },
  ];
  const completeFields: FieldSpec[] = [
    { key: "performed_date", label: "Date de réalisation", type: "date", required: true },
    { key: "participants_count", label: "Nombre de participants", type: "number" },
    { key: "findings", label: "Constats (10 caractères minimum)", type: "textarea", required: true },
    { key: "actions_required", label: "Actions à mener", type: "textarea" },
    { key: "stakeholders_informed", label: "Parties intéressées informées ou formées", type: "textarea" },
    { key: "next_drill_date", label: "Prochain exercice", type: "date" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Testez vos scénarios : un exercice réalisé met à jour le scénario et planifie le suivant.</p>
        <button type="button" className={primary} onClick={() => { setError(null); setPlanning(true); }} disabled={scenarios.length === 0}><Plus className="h-4 w-4" /> Planifier un exercice</button>
      </div>
      {scenarios.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Créez d'abord un scénario d'urgence pour pouvoir planifier un exercice.</p>}

      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : exercises.length === 0 ? (
          <p className={`py-8 text-center ${muted}`}>Aucun exercice planifié ou réalisé.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Exercice</th><th className="px-3 py-2">Scénario</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {exercises.map((e) => {
                const late = e.status === "planned" && e.planned_date && e.planned_date.slice(0, 10) < today;
                return (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="px-3 py-3"><p className="font-semibold">{e.title}</p><p className={muted}>{TYPES.find((t) => t.value === e.exercise_type)?.label} · {e.ref}</p>
                      {e.findings && <p className="mt-1 whitespace-pre-line text-sm">{e.findings}</p>}
                      {e.actions_required && <p className={`mt-1 ${muted}`}>Actions : {e.actions_required}</p>}</td>
                    <td className="px-3 py-3">{e.procedure?.title ?? "—"}</td>
                    <td className="px-3 py-3">{formatDateFR(e.performed_date ?? e.planned_date)}{late && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">En retard</span>}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span></td>
                    <td className="px-3 py-3 text-right">
                      {e.status === "planned" && (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" className={primary} onClick={() => { setError(null); setCompleting(e); }}>Saisir le compte rendu</button>
                          <button type="button" className={secondary} onClick={() => mutations.cancelExercise.mutateAsync(e.id).then(() => toast.success("Exercice annulé."), (err: Error) => toast.error(err.message))}>Annuler</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {planning && (
        <Modal title="Planifier un exercice" onClose={() => setPlanning(false)}>
          <FieldsForm
            fields={planFields}
            busy={mutations.saveExercise.isPending}
            error={error}
            initial={{ exercise_type: "drill" }}
            onCancel={() => setPlanning(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await mutations.saveExercise.mutateAsync({
                  input: { site_id: siteId, title: String(v["title"]), procedure_id: Number(v["procedure_id"]), exercise_type: String(v["exercise_type"] || "drill"), planned_date: orNull(v["planned_date"]), participants: orNull(v["participants"]), description: orNull(v["description"]) } as never,
                });
                toast.success("Exercice planifié.");
                setPlanning(false);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Modal>
      )}

      {completing && (
        <Modal title="Compte rendu de l'exercice" description={completing.title} onClose={() => setCompleting(null)}>
          <FieldsForm
            fields={completeFields}
            submitLabel="Clôturer l'exercice"
            busy={mutations.completeExercise.isPending}
            error={error}
            initial={{ performed_date: today }}
            onCancel={() => setCompleting(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await mutations.completeExercise.mutateAsync({
                  id: completing.id, performed_date: String(v["performed_date"]), findings: String(v["findings"]),
                  ...(orNumber(v["participants_count"]) ? { participants_count: orNumber(v["participants_count"])! } : {}),
                  ...(orNull(v["actions_required"]) ? { actions_required: orNull(v["actions_required"])! } : {}),
                  ...(orNull(v["next_drill_date"]) ? { next_drill_date: orNull(v["next_drill_date"])! } : {}),
                });
                toast.success("Exercice clôturé : le scénario est mis à jour.");
                setCompleting(null);
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
