import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useCollaborators } from "@/integrations/backend/leadership";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useNcMutations, useSimilar, type Nc } from "@/integrations/backend/nonconformities";
import { Drawer, Field } from "../overlay";
import { card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";

const CAUSES = [["methods", "Méthodes"], ["machines", "Matériel"], ["manpower", "Main-d'œuvre"], ["materials", "Matières"], ["environment", "Milieu"], ["measurement", "Mesure"]] as const;
const Step = ({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) => (
  <section className={`${card} space-y-3 p-4`}>
    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{title}</h3>
    {children}
  </section>
);

/** Traitement guidé d'une non-conformité : traitement immédiat, décision, causes, plan correctif, vérification et clôture. */
export function NcDrawer({ nc, onClose }: { nc: Nc; onClose: () => void }) {
  const actions = useNcMutations();
  const [siteId] = useCurrentSite();
  const { data: people = [] } = useCollaborators(siteId);
  const { data: similar = [] } = useSimilar(nc.id, true);
  const [error, setError] = useState<string | null>(null);
  const [immediate, setImmediate_] = useState(nc.immediate_action ?? "");
  const [mitigation, setMitigation] = useState(nc.impact_mitigation ?? "");
  const [justification, setJustification] = useState(nc.decision_justification ?? "");
  const [method, setMethod] = useState<"five_why" | "cause_effect">(nc.root_cause_method ?? "five_why");
  const [whys, setWhys] = useState(nc.five_whys?.length ? nc.five_whys : [{ why: "Pourquoi ?", answer: "" }, { why: "Pourquoi ?", answer: "" }, { why: "Pourquoi ?", answer: "" }]);
  const [causes, setCauses] = useState<Record<string, string>>({});
  const [rootCause, setRootCause] = useState("");
  const [responsible, setResponsible] = useState("");
  const [deadline, setDeadline] = useState("");
  const [planText, setPlanText] = useState("");
  const [sme, setSme] = useState("");
  const [notes, setNotes] = useState("");
  const closed = nc.status === "closed" || nc.resolution_date !== null;

  const attempt = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try { await job; toast.success(success); } catch (e) { setError(errorMessage(e, "Action impossible.")); }
  };

  return (
    <Drawer title={nc.title} subtitle={`${nc.ref} · gravité ${nc.severity}${nc.is_recurrent ? " · récurrente" : ""}`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="whitespace-pre-line text-sm">{nc.description}</p>
        {nc.location && <p className={muted}>Lieu : {nc.location}</p>}
        {nc.escalation_level > 0 && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">En retard — escalade de niveau {nc.escalation_level}.</p>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <Step done={Boolean(nc.immediate_action)} title="1. Traitement immédiat">
          <Field label="Maîtrise et correction *"><textarea className={`${input} min-h-16`} value={immediate} onChange={(e) => setImmediate_(e.target.value)} /></Field>
          <Field label={`Atténuation des impacts environnementaux${nc.environmental_impact ? " *" : ""}`}><textarea className={`${input} min-h-14`} value={mitigation} onChange={(e) => setMitigation(e.target.value)} /></Field>
          <button type="button" className={secondary} disabled={closed || immediate.trim().length < 10} onClick={() => void attempt(actions.immediate.mutateAsync({ id: nc.id, immediate_action: immediate.trim(), ...(mitigation.trim() ? { impact_mitigation: mitigation.trim() } : {}) }), "Traitement immédiat enregistré.")}>Enregistrer</button>
        </Step>

        <Step done={nc.corrective_decision !== null} title="2. Faut-il une action corrective ?">
          {nc.corrective_decision && <p className="text-sm font-semibold">{nc.corrective_decision === "required" ? "Action corrective décidée." : `Aucune action corrective — ${nc.decision_justification}`}</p>}
          {!closed && !nc.corrective_decision && (
            <>
              <p className={muted}>La décision est proportionnée aux effets : une non-conformité majeure ou critique ne peut pas être écartée.</p>
              <Field label="Justification (si aucune action)"><input className={input} value={justification} onChange={(e) => setJustification(e.target.value)} /></Field>
              <div className="flex gap-2">
                <button type="button" className={primary} onClick={() => void attempt(actions.decide.mutateAsync({ id: nc.id, decision: "required" }), "Action corrective décidée.")}>Mener une action corrective</button>
                <button type="button" className={secondary} onClick={() => void attempt(actions.decide.mutateAsync({ id: nc.id, decision: "not_required", justification: justification.trim() }), "Décision enregistrée.")}>Pas d'action corrective</button>
              </div>
            </>
          )}
        </Step>

        {nc.corrective_decision === "required" && (
          <>
            <Step done={nc.root_cause_method !== null} title="3. Analyse des causes">
              {similar.length > 0 && (
                <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">{similar.length} non-conformité(s) similaire(s) déjà enregistrée(s) — vérifiez la récurrence :</p>
                  <ul className="list-disc pl-5">{similar.map((s) => <li key={s.id}>{s.ref} — {s.title} ({formatDateFR(s.date)})</li>)}</ul>
                </div>
              )}
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="radio" checked={method === "five_why"} onChange={() => setMethod("five_why")} /> 5 pourquoi</label>
                <label className="flex items-center gap-1"><input type="radio" checked={method === "cause_effect"} onChange={() => setMethod("cause_effect")} /> Causes-effets (6M)</label>
              </div>
              {method === "five_why" ? (
                <div className="space-y-2">
                  {whys.map((w, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-2">
                      <input aria-label={`Pourquoi ${i + 1}`} className={input} value={w.why} onChange={(e) => setWhys(whys.map((x, j) => (j === i ? { ...x, why: e.target.value } : x)))} />
                      <input aria-label={`Réponse ${i + 1}`} className={input} placeholder="Parce que…" value={w.answer} onChange={(e) => setWhys(whys.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
                    </div>
                  ))}
                  {whys.length < 5 && <button type="button" className="text-xs font-bold text-primary" onClick={() => setWhys([...whys, { why: "Pourquoi ?", answer: "" }])}>+ Pourquoi</button>}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">{CAUSES.map(([key, label]) => <Field key={key} label={label}><input className={input} value={causes[key] ?? ""} onChange={(e) => setCauses({ ...causes, [key]: e.target.value })} /></Field>)}</div>
              )}
              <Field label="Cause racine retenue * (10 caractères minimum)"><input className={input} value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></Field>
              <button type="button" className={secondary} disabled={closed || rootCause.trim().length < 10}
                onClick={() => void attempt(actions.rootCause.mutateAsync({
                  id: nc.id, method, root_cause: rootCause.trim(),
                  ...(method === "five_why" ? { five_whys: whys.filter((w) => w.answer.trim()) } : { cause_effect: Object.fromEntries(Object.entries(causes).filter(([, v]) => v.trim()).map(([k, v]) => [k, [v.trim()]])) }),
                }), "Analyse enregistrée.")}>Enregistrer l'analyse</button>
            </Step>

            {nc.root_cause_method && (
              <Step done={nc.deadline !== null} title="4. Plan correctif">
                <Field label="Action corrective * (10 caractères minimum)"><textarea className={`${input} min-h-16`} value={planText} onChange={(e) => setPlanText(e.target.value)} /></Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Responsable *"><select className={input} value={responsible} onChange={(e) => setResponsible(e.target.value)}><option value="">— Choisir —</option>{people.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`}</option>)}</select></Field>
                  <Field label="Échéance *"><input type="date" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
                </div>
                <Field label="Mise à jour du système de management nécessaire (aspects, risques, documents) — préciser"><input className={input} value={sme} onChange={(e) => setSme(e.target.value)} /></Field>
                <button type="button" className={primary} disabled={closed || !responsible || !deadline || planText.trim().length < 10}
                  onClick={() => void attempt(actions.plan.mutateAsync({ id: nc.id, responsible_id: Number(responsible), deadline, description: planText.trim(), ...(sme.trim().length >= 10 ? { sme_update_required: true, sme_update_note: sme.trim() } : {}) }), "Action corrective créée dans le plan d'actions.")}>Créer l'action corrective</button>
              </Step>
            )}

            <Step done={nc.effectiveness_verified === true} title="5. Vérification de l'efficacité et clôture">
              {nc.sme_update_required && !nc.sme_update_done && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><span>Mise à jour du système à faire : {nc.sme_update_note}</span>
                  <button type="button" className={secondary} onClick={() => void attempt(actions.smeDone.mutateAsync(nc.id), "Mise à jour confirmée.")}>C'est fait</button></div>
              )}
              <Field label="Constats de la vérification"><input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondary} disabled={closed} onClick={() => void attempt(actions.verify.mutateAsync({ id: nc.id, is_effective: true, ...(notes.trim() ? { notes: notes.trim() } : {}) }), "Efficacité confirmée.")}>Les actions sont efficaces</button>
                <button type="button" className={secondary} disabled={closed} onClick={() => void attempt(actions.verify.mutateAsync({ id: nc.id, is_effective: false, ...(notes.trim() ? { notes: notes.trim() } : {}) }), "Efficacité non démontrée : reprise du traitement.")}>Non efficaces</button>
                <button type="button" className={primary} disabled={closed} onClick={() => void attempt(actions.close.mutateAsync(nc.id), "Non-conformité clôturée.")}>Clôturer</button>
              </div>
            </Step>
          </>
        )}
      </div>
    </Drawer>
  );
}
