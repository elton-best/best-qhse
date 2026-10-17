import { useState } from "react";
import { toast } from "sonner";
import { useAesList } from "@/integrations/backend/aes";
import {
  CHANGE_TYPES, IMPACT_DIMENSIONS, useChange, useChangeMutations, type Change, type ImpactAnalysis, type ResourcesRequested,
} from "@/integrations/backend/changes";
import { Drawer, Field } from "../overlay";
import { errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { STATUS } from "./changes-config";

const RESOURCE_FIELDS = [
  { key: "human", label: "Humaines" }, { key: "financial", label: "Financières" },
  { key: "technical", label: "Techniques" }, { key: "infrastructure", label: "Infrastructure" },
] as const;

/** Fiche d'un changement : analyse d'impact (M8-02), décision (M8-03), tâches (M8-04) et revue. */
export function ChangeDetail({ id, siteId, onClose }: { id: number; siteId: string; onClose: () => void }) {
  const { data: change, isLoading } = useChange(id);
  const actions = useChangeMutations();
  const { data: aspects = [] } = useAesList({ site_id: siteId }, Boolean(siteId));
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !change) {
    return <Drawer title="Changement" onClose={onClose}><p className={muted}>Chargement…</p></Drawer>;
  }

  const attempt = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try {
      await job;
      toast.success(success);
    } catch (e) {
      setError(errorMessage(e, "Action impossible."));
    }
  };
  const editable = change.status === "requested" || change.status === "in_analysis";
  const type = CHANGE_TYPES.find((t) => t.value === change.change_type)?.label ?? change.change_type;

  return (
    <Drawer title={change.title} subtitle={`${change.ref} · ${type}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[change.status].tone}`}>{STATUS[change.status].label}</span>
          <span className={muted}>{change.origin === "internal" ? "Origine interne" : "Origine externe"} · {change.duration === "temporary" ? "Temporaire" : "Permanent"} · {change.is_planned ? "Planifié" : "Non planifié (régularisation)"}</span>
        </div>
        {change.description && <p className="whitespace-pre-line text-sm">{change.description}</p>}
        {!change.is_planned && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p><strong>Conséquences :</strong> {change.unplanned_consequences}</p>
            <p><strong>Mesures d'atténuation :</strong> {change.mitigation_measures}</p>
          </div>
        )}

        {editable ? (
          <AnalysisForm change={change} aspects={aspects.map((a) => ({ id: a.id, label: `${a.aspect_number ?? ""} ${a.aspect}`.trim() }))} busy={actions.saveAnalysis.isPending || actions.submit.isPending}
            onSave={(payload) => attempt(actions.saveAnalysis.mutateAsync({ id: change.id, ...payload }), "Analyse enregistrée.")}
            onSubmit={(payload) => attempt(
              actions.saveAnalysis.mutateAsync({ id: change.id, ...payload }).then(() => actions.submit.mutateAsync(change.id)),
              change.is_planned ? "Analyse soumise à approbation." : "Changement régularisé : les tâches sont ouvertes.",
            )}
          />
        ) : (
          <AnalysisReadOnly change={change} />
        )}

        {change.status === "awaiting_approval" && <DecisionForm change={change} busy={actions.decide.isPending} onDecide={(payload) => attempt(actions.decide.mutateAsync({ id: change.id, ...payload }), "Décision enregistrée.")} />}

        {change.tasks && change.tasks.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Tâches de mise à jour</h3>
            {change.tasks.map((task) => (
              <TaskRow key={task.id} title={task.title} status={task.status} due={task.due_date} note={task.done_note}
                canComplete={change.status === "implementing" && task.status === "todo"}
                onComplete={(note) => attempt(actions.completeTask.mutateAsync({ id: task.id, note }), "Tâche terminée.")} />
            ))}
          </section>
        )}

        {change.status === "implemented" && <ReviewForm busy={actions.review.isPending} onReview={(payload) => attempt(actions.review.mutateAsync({ id: change.id, ...payload }), "Changement clôturé.")} />}
        {change.review_result && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Revue :</strong> {change.review_result === "effective" ? "efficace" : change.review_result === "partial" ? "partiellement efficace" : "inefficace"} — {change.review_note}</p>
        )}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </div>
    </Drawer>
  );
}

function AnalysisReadOnly({ change }: { change: Change }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Analyse d'impact</h3>
      <ul className="space-y-1 text-sm">
        {IMPACT_DIMENSIONS.map((d) => {
          const entry = change.impact_analysis?.[d.key];
          return <li key={d.key}><strong>{d.label} :</strong> {entry?.impacted ? `concerné — ${entry.note}` : "non concerné"}</li>;
        })}
      </ul>
      {change.decision_note && <p className={muted}>Décision{change.decider ? ` (${change.decider.name}, ${formatDateFR(change.decided_at)})` : ""} : {change.decision_note}</p>}
      {change.resources_decision && <p className={muted}>Ressources {change.resources_decision === "granted" ? "accordées" : "refusées"}{change.resources_decision_note ? ` — ${change.resources_decision_note}` : ""}.</p>}
    </section>
  );
}

type Payload = { impact_analysis: ImpactAnalysis; affected_aspect_ids: number[]; resources_requested: ResourcesRequested };

function AnalysisForm({ change, aspects, busy, onSave, onSubmit }: {
  change: Change; aspects: { id: number; label: string }[]; busy: boolean; onSave: (p: Payload) => void; onSubmit: (p: Payload) => void;
}) {
  const [analysis, setAnalysis] = useState<ImpactAnalysis>(() => Object.fromEntries(IMPACT_DIMENSIONS.map((d) => [d.key, change.impact_analysis?.[d.key] ?? { impacted: false, note: "" }])));
  const [aspectIds, setAspectIds] = useState<number[]>(change.affected_aspect_ids ?? []);
  const [resources, setResources] = useState<ResourcesRequested>(change.resources_requested ?? {});
  const payload = (): Payload => ({ impact_analysis: analysis, affected_aspect_ids: aspectIds, resources_requested: resources });
  const patch = (key: string, value: Partial<{ impacted: boolean; note: string }>): void =>
    setAnalysis({ ...analysis, [key]: { impacted: false, note: "", ...analysis[key], ...value } });

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Analyse d'impact (obligatoire avant approbation)</h3>
      {IMPACT_DIMENSIONS.map((d) => {
        const entry = analysis[d.key] ?? { impacted: false, note: "" };
        return (
          <div key={d.key} className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={entry.impacted} onChange={(e) => patch(d.key, { impacted: e.target.checked })} /> {d.label} concerné(es)
            </label>
            {entry.impacted && (
              <textarea aria-label={`Impact sur ${d.label}`} className={`${input} mt-2 min-h-16`} placeholder="Décrivez l'impact et ce qui doit être mis à jour" value={entry.note} onChange={(e) => patch(d.key, { note: e.target.value })} />
            )}
            {d.key === "aspects" && entry.impacted && aspects.length > 0 && (
              <Field label="Aspects concernés (marqués « à réévaluer » à l'approbation)">
                <select multiple className={`${input} min-h-24`} value={aspectIds.map(String)} onChange={(e) => setAspectIds(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}>
                  {aspects.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RESOURCE_FIELDS.map((r) => (
          <Field key={r.key} label={`Ressources ${r.label.toLowerCase()} demandées`}>
            <input className={input} value={resources[r.key] ?? ""} onChange={(e) => setResources({ ...resources, [r.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={() => onSave(payload())}>Enregistrer l'analyse</button>
        <button type="button" className={primary} disabled={busy} onClick={() => onSubmit(payload())}>{change.is_planned ? "Soumettre à approbation" : "Régulariser le changement"}</button>
      </div>
    </section>
  );
}

function DecisionForm({ change, busy, onDecide }: {
  change: Change; busy: boolean;
  onDecide: (p: { decision: "approve" | "reject"; note?: string; resources_decision?: "granted" | "refused"; resources_decision_note?: string }) => void;
}) {
  const [note, setNote] = useState("");
  const [resources, setResources] = useState<"" | "granted" | "refused">("");
  const [resourcesNote, setResourcesNote] = useState("");
  const asked = change.resources_requested && Object.keys(change.resources_requested).length > 0;

  return (
    <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide">Décision de la direction</h3>
      {asked && (
        <div className="space-y-2">
          <p className="text-sm">Ressources demandées : {Object.values(change.resources_requested ?? {}).join(" · ")}</p>
          <select aria-label="Décision sur les ressources" className={input} value={resources} onChange={(e) => setResources(e.target.value as "" | "granted" | "refused")}>
            <option value="">Ressources : décision à prendre</option><option value="granted">Accordées</option><option value="refused">Refusées</option>
          </select>
          {resources === "refused" && <input aria-label="Motif du refus des ressources" className={input} placeholder="Motif du refus" value={resourcesNote} onChange={(e) => setResourcesNote(e.target.value)} />}
        </div>
      )}
      <textarea aria-label="Commentaire de décision" className={`${input} min-h-16`} placeholder="Commentaire (obligatoire en cas de refus)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={() => onDecide({ decision: "reject", note })}>Refuser</button>
        <button type="button" className={primary} disabled={busy}
          onClick={() => onDecide({ decision: "approve", ...(note ? { note } : {}), ...(resources ? { resources_decision: resources } : {}), ...(resourcesNote ? { resources_decision_note: resourcesNote } : {}) })}>Approuver</button>
      </div>
    </section>
  );
}

function TaskRow({ title, status, due, note, canComplete, onComplete }: {
  title: string; status: "todo" | "done"; due: string | null; note: string | null; canComplete: boolean; onComplete: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{status === "done" ? "Terminée" : `À faire — ${formatDateFR(due)}`}</span>
      </div>
      {note && <p className={muted}>{note}</p>}
      {canComplete && !open && <button type="button" className={`${secondary} mt-2`} onClick={() => setOpen(true)}>Marquer comme terminée</button>}
      {canComplete && open && (
        <div className="mt-2 flex gap-2">
          <input aria-label="Ce qui a été mis à jour" className={input} placeholder="Ce qui a été mis à jour" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className={primary} onClick={() => onComplete(text)}>Valider</button>
        </div>
      )}
    </div>
  );
}

function ReviewForm({ busy, onReview }: { busy: boolean; onReview: (p: { result: "effective" | "partial" | "ineffective"; note: string }) => void }) {
  const [result, setResult] = useState<"effective" | "partial" | "ineffective">("effective");
  const [note, setNote] = useState("");
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide">Revue après mise en œuvre</h3>
      <select aria-label="Résultat de la revue" className={input} value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
        <option value="effective">Efficace</option><option value="partial">Partiellement efficace</option><option value="ineffective">Inefficace</option>
      </select>
      <textarea aria-label="Constats de la revue" className={`${input} min-h-16`} placeholder="Constats (10 caractères minimum)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end"><button type="button" className={primary} disabled={busy} onClick={() => onReview({ result, note })}>Clôturer le changement</button></div>
    </section>
  );
}
