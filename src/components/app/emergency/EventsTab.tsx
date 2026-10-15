import { useState } from "react";
import { toast } from "sonner";
import { Phone, Siren } from "lucide-react";
import { useContacts, useEmergencyMutations, useEvents, useScenarios, type EmergencyEvent } from "@/integrations/backend/emergency";
import { Drawer, Field, Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, input, muted, primary, secondary } from "../planning/shared";

const SEVERITY = { minor: { label: "Mineure", tone: "bg-sky-100 text-sky-700" }, major: { label: "Majeure", tone: "bg-amber-100 text-amber-800" }, critical: { label: "Critique", tone: "bg-red-100 text-red-700" } };
const STATUS = { ongoing: { label: "En cours", tone: "bg-red-100 text-red-700" }, contained: { label: "Maîtrisée", tone: "bg-amber-100 text-amber-800" }, closed: { label: "Clôturée", tone: "bg-emerald-100 text-emerald-700" } };
const time = (value: string): string => new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Guidance({ event, siteId }: { event: EmergencyEvent; siteId: string }) {
  const { data: contacts = [] } = useContacts(siteId || undefined, Boolean(siteId));
  const relevant = contacts.filter((c) => c.available_24h || c.procedure_id === event.procedure_id).slice(0, 6);
  const procedure = event.procedure;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <h3 className="font-display font-bold">Conduite à tenir</h3>
      {!procedure ? (
        <p className="mt-1 text-sm">Aucun scénario rattaché : appliquez les consignes générales d'évacuation et alertez les secours.</p>
      ) : (
        <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold">{procedure.title}</p>
          {(procedure.procedure_steps ?? []).length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5">{(procedure.procedure_steps ?? []).map((step, i) => <li key={i}>{step}</li>)}</ol>
          ) : procedure.measures ? <p className="whitespace-pre-line">{procedure.measures}</p> : <p>Plan de réponse non renseigné.</p>}
          {procedure.evacuation_routes && <p><span className="font-semibold">Évacuation :</span> {procedure.evacuation_routes}</p>}
          {procedure.assembly_points && <p><span className="font-semibold">Rassemblement :</span> {procedure.assembly_points}</p>}
        </div>
      )}
      {relevant.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {relevant.map((c) => (
            <a key={c.id} href={`tel:${c.phone.replace(/[^+0-9]/g, "")}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white" aria-label={`Appeler ${c.title}`}>
              <Phone className="h-4 w-4" /> {c.title} · {c.phone}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/** Situations d'urgence réelles (M13-06) : déclaration rapide, chronologie, maîtrise, puis retour d'expérience obligatoire. */
export function EventsTab({ siteId }: { siteId: string }) {
  const { data: events = [], isLoading } = useEvents(siteId || undefined, Boolean(siteId));
  const { data: scenarios = [] } = useScenarios(siteId || undefined, Boolean(siteId));
  const mutations = useEmergencyMutations();
  const [declaring, setDeclaring] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [severity, setSeverity] = useState("major");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [debrief, setDebrief] = useState("");
  const [lessons, setLessons] = useState("");
  const [error, setError] = useState("");
  const open = events.find((e) => e.id === openId) ?? null;

  const declare = async (): Promise<void> => {
    if (!title.trim()) {
      setError("Décrivez brièvement la situation.");
      return;
    }
    setError("");
    try {
      const created = await mutations.declareEvent.mutateAsync({ title: title.trim(), severity, site_id: siteId, ...(procedureId ? { procedure_id: Number(procedureId) } : {}), ...(description.trim() ? { description: description.trim() } : {}) });
      setDeclaring(false);
      setTitle(""); setDescription(""); setProcedureId("");
      setOpenId(created.id);
      toast.warning("Situation d'urgence déclarée : suivez la conduite à tenir.");
    } catch (e) {
      setError(errorMessage(e, "Déclaration impossible."));
    }
  };

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error(errorMessage(e, "Action impossible."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={muted}>Déclarez une situation en quelques gestes ; la conduite à tenir s'affiche. La clôture exige un retour d'expérience qui révise le plan.</p>
        <button type="button" className="inline-flex h-12 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-red-600/30" onClick={() => { setError(""); setDeclaring(true); }}>
          <Siren className="h-5 w-5" /> Déclarer une situation d'urgence
        </button>
      </div>

      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : events.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune situation d'urgence réelle enregistrée.</p> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Situation</th><th className="px-3 py-2">Déclarée</th><th className="px-3 py-2">Gravité</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:text-primary" onClick={() => setOpenId(e.id)}>{e.title}</button><p className={muted}>{e.ref}{e.procedure ? ` · ${e.procedure.title}` : ""}</p></td>
                  <td className="px-3 py-3">{time(e.declared_at)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SEVERITY[e.severity].tone}`}>{SEVERITY[e.severity].label}</span></td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[e.status].tone}`}>{STATUS[e.status].label}</span></td>
                  <td className="px-3 py-3 text-right"><button type="button" className={secondary} onClick={() => setOpenId(e.id)}>Ouvrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {declaring && (
        <Modal title="Déclarer une situation d'urgence" description="Trois informations suffisent ; vous complétez ensuite la chronologie." onClose={() => setDeclaring(false)}>
          <Field label="Que se passe-t-il ? *"><input className={input} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : fuite de gasoil au dépôt" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scénario"><select className={input} value={procedureId} onChange={(e) => setProcedureId(e.target.value)}><option value="">Non identifié</option>{scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
            <Field label="Gravité"><select className={input} value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="minor">Mineure</option><option value="major">Majeure</option><option value="critical">Critique</option></select></Field>
          </div>
          <Field label="Détails"><textarea className={`${input} min-h-16`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setDeclaring(false)}>Annuler</button><button type="button" className="inline-flex h-10 items-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white" disabled={mutations.declareEvent.isPending} onClick={() => void declare()}>Déclarer</button></div>
        </Modal>
      )}

      {open && (
        <Drawer title={open.title} subtitle={`${open.ref} — ${STATUS[open.status].label}`} onClose={() => setOpenId(null)} wide>
          {open.status !== "closed" && <Guidance event={open} siteId={siteId} />}
          <section>
            <h3 className="font-display font-bold">Chronologie</h3>
            <ol className="mt-2 space-y-2 border-l-2 border-border pl-4 text-sm">
              {open.timeline.map((entry, i) => (<li key={i}><span className="font-semibold">{time(entry.at)}</span> — {entry.text}{entry.by && <span className={muted}> ({entry.by})</span>}</li>))}
            </ol>
            {open.status !== "closed" && (
              <div className="mt-3 flex gap-2">
                <input className={input} placeholder="Ajouter une action ou un constat" aria-label="Nouvelle entrée de chronologie" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="button" className={primary} disabled={!note.trim()} onClick={() => run(async () => { await mutations.addTimeline.mutateAsync({ id: open.id, text: note.trim() }); setNote(""); }, "Entrée ajoutée.")}>Ajouter</button>
              </div>
            )}
          </section>
          {open.status === "closed" ? (
            <section className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950">
              <h3 className="font-display font-bold">Retour d'expérience</h3>
              <p className="mt-1 whitespace-pre-line">{open.debrief}</p>
              {open.lessons_actions && <p className="mt-2 whitespace-pre-line"><span className="font-semibold">Actions : </span>{open.lessons_actions}</p>}
              <p className="mt-2 text-xs font-semibold">{open.plan_revision_requested ? "Le scénario a été marqué « à réviser »." : ""} {open.aspects_flagged ? `${open.aspects_flagged} aspect(s) à réévaluer.` : ""}</p>
            </section>
          ) : (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {open.status === "ongoing" && <button type="button" className={secondary} onClick={() => run(() => mutations.containEvent.mutateAsync(open.id), "Situation déclarée maîtrisée.")}>Situation maîtrisée</button>}
              <button type="button" className={primary} onClick={() => { setDebrief(""); setLessons(""); setClosing(true); }}>Clôturer avec retour d'expérience</button>
            </div>
          )}
        </Drawer>
      )}

      {closing && open && (
        <Modal title="Retour d'expérience" description="Obligatoire : il révise le plan et la liste des aspects concernés." onClose={() => setClosing(false)}>
          <Field label="Analyse de la situation (20 caractères minimum) *"><textarea className={`${input} min-h-28`} value={debrief} onChange={(e) => setDebrief(e.target.value)} /></Field>
          <Field label="Enseignements et actions"><textarea className={`${input} min-h-16`} value={lessons} onChange={(e) => setLessons(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setClosing(false)}>Annuler</button>
            <button type="button" className={primary} disabled={debrief.trim().length < 20 || mutations.closeEvent.isPending}
              onClick={() => run(async () => { await mutations.closeEvent.mutateAsync({ id: open.id, debrief: debrief.trim(), ...(lessons.trim() ? { lessons_actions: lessons.trim() } : {}) }); setClosing(false); }, "Situation clôturée : le plan est à réviser.")}>Clôturer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
