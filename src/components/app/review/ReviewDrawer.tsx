import { useState } from "react";
import { CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useCollaborators } from "@/integrations/backend/leadership";
import { useReviewMutations, useWorkspace, type Assessment, type Conclusions, type Dossier, type Workspace } from "@/integrations/backend/reviews";
import { Drawer, Field } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";

const ASSESSMENT: { value: Assessment; label: string }[] = [
  { value: "adequate", label: "Satisfaisant" }, { value: "partly", label: "Partiellement satisfaisant" }, { value: "inadequate", label: "Insuffisant" },
];
const CONCLUSION_LABELS = { suitability: "Pertinence du système", adequacy: "Adéquation du système", effectiveness: "Efficacité du système" } as const;

/** Espace de travail d'une revue : dossier d'entrée (9.3.2), réunions, conclusions et décisions (9.3.3), signature. */
export function ReviewDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: ws } = useWorkspace(id);
  const actions = useReviewMutations();
  const [error, setError] = useState<string | null>(null);
  if (!ws) return <Drawer title="Revue de direction" onClose={onClose}><PageSkeleton rows={4} /></Drawer>;

  const locked = ws.record !== null;
  const attempt = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try { await job; toast.success(success); } catch (e) { setError(errorMessage(e, "Action impossible.")); }
  };

  return (
    <Drawer title={ws.review.title ?? "Revue de direction"} subtitle={`${ws.review.ref ?? ""}${locked ? " · signée et archivée" : ""}`} onClose={onClose} wide>
      <div className="space-y-8">
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">1. Dossier d'entrée (9.3.2)</h3>
            {!locked && <button type="button" className={secondary} disabled={actions.dossier.isPending} onClick={() => void attempt(actions.dossier.mutateAsync(id), "Dossier généré à partir des données actuelles.")}>{ws.dossier ? "Régénérer" : "Générer le dossier"}</button>}
          </div>
          {ws.dossier ? <DossierView dossier={ws.dossier} /> : <p className={muted}>Le dossier est construit à partir des actions précédentes, des changements, des objectifs, des tendances, des ressources, des communications et des opportunités.</p>}
        </section>

        <SessionsSection ws={ws} locked={locked} onAdd={(payload) => attempt(actions.addSession.mutateAsync({ id, ...payload }), "Réunion enregistrée.")} />
        <ConclusionsSection ws={ws} locked={locked} onSave={(c) => attempt(actions.saveConclusions.mutateAsync({ id, conclusions: c }), "Conclusions enregistrées.")} />
        <DecisionsSection ws={ws} locked={locked}
          onAdd={(payload) => attempt(actions.addDecision.mutateAsync({ id, ...payload }), "Décision enregistrée : l'action est créée.")}
          onRemove={(decisionId) => attempt(actions.removeDecision.mutateAsync({ id, decisionId }), "Décision retirée.")} />

        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">5. Signature de la direction</h3>
          {locked ? (
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Signée le {formatDateFR(ws.record?.signed_at)} par {ws.record?.signed_by}.</p>
                <p className="break-all font-mono text-xs">Empreinte : {ws.record?.sha256}</p>
                <p>{ws.record?.intact ? "Intégrité vérifiée : l'enregistrement n'a pas été altéré." : "ATTENTION : l'enregistrement ne correspond plus à son empreinte."}</p>
              </div>
            </div>
          ) : (
            <>
              {ws.readiness.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{ws.readiness.map((m) => <li key={m}>{m}</li>)}</ul>}
              <button type="button" className={primary} disabled={ws.readiness.length > 0 || actions.sign.isPending} onClick={() => void attempt(actions.sign.mutateAsync(id), "Revue signée et archivée.")}>Signer et archiver la revue</button>
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}

const Stat = ({ label, value }: { label: string; value: string | number | null }) => (
  <div className="rounded-xl bg-muted/40 p-3"><p className="text-xl font-extrabold">{value ?? "—"}</p><p className="text-xs text-muted-foreground">{label}</p></div>
);

function DossierView({ dossier: d }: { dossier: Dossier }) {
  return (
    <div className="space-y-4 text-sm">
      <p className={muted}>Généré le {formatDateFR(d.generated_at)}.</p>
      <div>
        <h4 className="font-semibold">Actions des revues précédentes</h4>
        {d.previous_actions.previous_review ? (
          <div className="mt-2 grid grid-cols-3 gap-2"><Stat label="Terminées" value={d.previous_actions.done} /><Stat label="Ouvertes" value={d.previous_actions.open} /><Stat label="En retard" value={d.previous_actions.overdue} /></div>
        ) : <p className={muted}>Aucune revue précédente.</p>}
      </div>
      <div>
        <h4 className="font-semibold">Changements</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Aspects significatifs" value={d.changes.significant_aspects.total} /><Stat label="Aspects à réévaluer" value={d.changes.significant_aspects.to_reassess} />
          <Stat label="Obligations nouvelles ou modifiées" value={d.changes.obligations.new_or_modified_12m} /><Stat label="Changements du système (12 mois)" value={d.changes.system_changes.total_12m} />
          <Stat label="Nouvelles parties intéressées" value={d.changes.stakeholders_new_12m} /><Stat label="Risques de criticité élevée" value={d.changes.risks_opportunities.high_criticality} />
        </div>
      </div>
      <div>
        <h4 className="font-semibold">Objectifs environnementaux</h4>
        <div className="mt-2 grid grid-cols-3 gap-2"><Stat label="Atteints" value={d.objectives.achieved} /><Stat label="Non atteints" value={d.objectives.not_achieved} /><Stat label="Taux" value={d.objectives.rate === null ? null : `${d.objectives.rate} %`} /></div>
        {d.objectives.not_achieved_items.length > 0 && <ul className="mt-2 list-disc pl-5">{d.objectives.not_achieved_items.map((o) => <li key={o.title}>{o.title}{o.deadline ? ` (échéance ${formatDateFR(o.deadline)})` : ""}</li>)}</ul>}
      </div>
      <div>
        <h4 className="font-semibold">Tendances</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Non-conformités (12 mois)" value={d.trends.nonconformities.total_12m} /><Stat label="Dont récurrentes" value={d.trends.nonconformities.recurring} />
          <Stat label="Seuils d'alerte dépassés" value={d.trends.monitoring.by_state["alert"] ?? 0} /><Stat label="Audits réalisés" value={d.trends.audits.completed_12m} />
          <Stat label="Obligations applicables" value={d.trends.compliance.applicable} /><Stat label="NC d'audit ouvertes" value={d.trends.audits.open_nonconformities} />
        </div>
        {d.trends.monitoring.alerts.length > 0 && <ul className="mt-2 list-disc pl-5">{d.trends.monitoring.alerts.map((a) => <li key={a.indicator}>{a.indicator} : {a.last_value} {a.unit}</li>)}</ul>}
      </div>
      <div>
        <h4 className="font-semibold">Ressources, communications et amélioration</h4>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Ressources refusées" value={d.resources.resources_refused_12m} /><Stat label="Instruments hors validité" value={d.resources.instruments_not_valid} />
          <Stat label="Moyens d'urgence défectueux" value={d.resources.emergency_resources_defective} /><Stat label="Plaintes (12 mois)" value={d.communications.complaints_12m} />
          <Stat label="Plaintes ouvertes" value={d.communications.complaints_open} /><Stat label="Suggestions du personnel" value={d.improvement.suggestions_12m} />
        </div>
      </div>
    </div>
  );
}

function SessionsSection({ ws, locked, onAdd }: { ws: Workspace; locked: boolean; onAdd: (p: { held_on: string; notes: string; attendees?: string[] }) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">2. Réunions ({ws.sessions.length})</h3>
      <p className={muted}>Une revue peut s'étaler sur plusieurs réunions.</p>
      {ws.sessions.map((s) => <div key={s.id} className={`${card} p-3 text-sm`}><p className="font-semibold">{formatDateFR(s.held_on)}{s.attendees?.length ? ` — ${s.attendees.join(", ")}` : ""}</p><p className="whitespace-pre-line">{s.notes}</p></div>)}
      {!locked && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2"><Field label="Date"><input type="date" max={today} className={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Présents (séparés par des virgules)"><input className={input} value={attendees} onChange={(e) => setAttendees(e.target.value)} /></Field></div>
          <Field label="Compte rendu * (10 caractères minimum)"><textarea className={`${input} min-h-16`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <button type="button" className={secondary} disabled={notes.trim().length < 10} onClick={() => void onAdd({ held_on: date, notes: notes.trim(), ...(attendees.trim() ? { attendees: attendees.split(",").map((a) => a.trim()).filter(Boolean) } : {}) }).then(() => setNotes(""))}>Enregistrer la réunion</button>
        </div>
      )}
    </section>
  );
}

function ConclusionsSection({ ws, locked, onSave }: { ws: Workspace; locked: boolean; onSave: (c: Conclusions) => Promise<void> }) {
  const empty = { assessment: "adequate" as Assessment, comment: "" };
  const [values, setValues] = useState<Conclusions>(ws.conclusions ?? { suitability: empty, adequacy: empty, effectiveness: empty });
  const keys = Object.keys(CONCLUSION_LABELS) as (keyof typeof CONCLUSION_LABELS)[];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">3. Conclusions (9.3.3)</h3>
      {keys.map((key) => (
        <div key={key} className="grid gap-2 sm:grid-cols-3">
          <Field label={CONCLUSION_LABELS[key]}>
            <select className={input} disabled={locked} value={values[key].assessment} onChange={(e) => setValues({ ...values, [key]: { ...values[key], assessment: e.target.value as Assessment } })}>{ASSESSMENT.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
          </Field>
          <div className="sm:col-span-2"><Field label="Justification"><input aria-label={`Justification ${CONCLUSION_LABELS[key]}`} className={input} disabled={locked} value={values[key].comment} onChange={(e) => setValues({ ...values, [key]: { ...values[key], comment: e.target.value } })} /></Field></div>
        </div>
      ))}
      {!locked && <button type="button" className={secondary} onClick={() => void onSave(values)}>Enregistrer les conclusions</button>}
    </section>
  );
}

function DecisionsSection({ ws, locked, onAdd, onRemove }: {
  ws: Workspace; locked: boolean; onAdd: (p: { output_type: string; text: string; not_applicable?: boolean; responsible_id?: number; due_date?: string }) => Promise<void>; onRemove: (id: number) => Promise<void>;
}) {
  const [siteId] = useCurrentSite();
  const { data: people = [] } = useCollaborators(siteId);
  const [type, setType] = useState(Object.keys(ws.output_types)[0] ?? "improvement");
  const [text, setText] = useState("");
  const [notApplicable, setNotApplicable] = useState(false);
  const [responsible, setResponsible] = useState("");
  const [due, setDue] = useState("");

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">4. Décisions et actions (9.3.3)</h3>
      {Object.entries(ws.output_types).map(([key, label]) => {
        const rows = ws.decisions.filter((d) => d.output_type === key);
        return (
          <div key={key} className={`${card} p-3`}>
            <p className="flex items-center gap-2 text-sm font-semibold">{rows.length > 0 && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{label}</p>
            {rows.length === 0 && <p className={muted}>À traiter, ou à déclarer sans objet.</p>}
            <ul className="mt-1 space-y-1 text-sm">
              {rows.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2">
                  <span>{d.not_applicable ? <em>Sans objet — {d.text}</em> : <>{d.text} <span className={muted}>→ {d.responsible?.name}, avant le {formatDateFR(d.due_date)} ({d.action?.ref})</span></>}</span>
                  {!locked && <button type="button" aria-label="Retirer la décision" className="text-muted-foreground hover:text-destructive" onClick={() => void onRemove(d.id)}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!locked && (
        <div className="space-y-2 rounded-xl bg-muted/40 p-3">
          <Field label="Sortie concernée"><select className={input} value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(ws.output_types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
          <Field label="Décision ou motif * (10 caractères minimum)"><textarea className={`${input} min-h-16`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notApplicable} onChange={(e) => setNotApplicable(e.target.checked)} /> Sans objet cette année (le texte explique pourquoi)</label>
          {!notApplicable && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Responsable *"><select className={input} value={responsible} onChange={(e) => setResponsible(e.target.value)}><option value="">— Choisir —</option>{people.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`}</option>)}</select></Field>
              <Field label="Échéance *"><input type="date" className={input} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
          )}
          <button type="button" className={primary} disabled={text.trim().length < 10 || (!notApplicable && (!responsible || !due))}
            onClick={() => void onAdd({ output_type: type, text: text.trim(), ...(notApplicable ? { not_applicable: true } : { responsible_id: Number(responsible), due_date: due }) }).then(() => { setText(""); })}>Enregistrer la décision</button>
        </div>
      )}
    </section>
  );
}
