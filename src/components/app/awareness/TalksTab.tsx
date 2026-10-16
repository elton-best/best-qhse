import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TOPICS, fetchTalkQr, useAwarenessMutations, useTalk, useTalks, type Talk } from "@/integrations/backend/awareness";
import { Drawer, Field, Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "../emergency/FieldsForm";

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Sujet de la causerie", type: "text", required: true },
  { key: "held_on", label: "Date", type: "date", required: true },
  { key: "duration_minutes", label: "Durée (minutes)", type: "number" },
  { key: "topic", label: "Point de la clause 7.3", type: "select", options: TOPICS },
  { key: "notes", label: "Messages clés", type: "textarea" },
];

/** Causeries de 10 minutes (M9-05) : émargement par QR code. */
export function TalksTab({ siteId }: { siteId: string }) {
  const { data: talks = [], isLoading } = useTalks(siteId || undefined, Boolean(siteId));
  const actions = useAwarenessMutations();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Affichez le QR code pendant la causerie : chaque participant le scanne avec son compte pour signer.</p>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Nouvelle causerie</button>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : talks.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune causerie.</p> : (
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Causerie</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {talks.map((t) => (
                <tr key={t.id} className="border-t border-border"><td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => setOpenId(t.id)}>{t.title}</button><p className={muted}>{t.ref} · {t.duration_minutes} min</p></td><td className="px-3 py-3">{formatDateFR(t.held_on)}</td><td className="px-3 py-3">{t.status === "open" ? "Émargement ouvert" : "Clôturée"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <Modal title="Nouvelle causerie" onClose={() => setCreating(false)}>
          <FieldsForm fields={FIELDS} busy={actions.saveTalk.isPending} error={error} initial={{ held_on: today, duration_minutes: "10" }} onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const created = await actions.saveTalk.mutateAsync({ input: { site_id: siteId, title: String(v["title"]), held_on: String(v["held_on"]), duration_minutes: orNumber(v["duration_minutes"]) ?? 10, topic: orNull(v["topic"]), notes: orNull(v["notes"]) } });
                toast.success("Causerie créée.");
                setCreating(false);
                setOpenId(created.id);
              } catch (e) {
                setError(errorMessage(e, "Création impossible."));
              }
            }} />
        </Modal>
      )}
      {openId !== null && <TalkDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function TalkDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: talk } = useTalk(id);
  const actions = useAwarenessMutations();
  const [qr, setQr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");

  useEffect(() => {
    let url: string | null = null;
    void fetchTalkQr(id).then((blob) => { url = URL.createObjectURL(blob); setQr(url); }, () => setQr(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  if (!talk) return <Drawer title="Causerie" onClose={onClose}><PageSkeleton rows={3} /></Drawer>;
  const open = talk.status === "open";
  const attendances: NonNullable<Talk["attendances"]> = talk.attendances ?? [];

  return (
    <Drawer title={talk.title} subtitle={`${talk.ref} · ${formatDateFR(talk.held_on)}`} onClose={onClose}>
      <div className="space-y-5">
        {open && qr && <div className="flex flex-col items-center gap-2"><img src={qr} alt="QR code d'émargement de la causerie" className="h-56 w-56" /><p className={muted}>À scanner par chaque participant</p></div>}
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Liste d'émargement ({attendances.length})</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {attendances.map((a) => <li key={a.id} className="flex justify-between py-2"><span>{a.name}{a.organization ? ` — ${a.organization}` : ""}</span><span className={muted}>{a.method === "qr" ? "QR code" : "ajout manuel"}</span></li>)}
            {attendances.length === 0 && <li className={`py-3 ${muted}`}>Personne n'a encore signé.</li>}
          </ul>
        </section>
        {open && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Ajouter une personne présente</h3>
            <Field label="Nom"><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Entreprise (extérieur)"><input className={input} value={organization} onChange={(e) => setOrganization(e.target.value)} /></Field>
            <div className="flex gap-2">
              <button type="button" className={secondary} disabled={!name.trim()} onClick={() => actions.addAttendee.mutateAsync({ id, name: name.trim(), ...(organization ? { organization } : {}) }).then(() => { setName(""); setOrganization(""); toast.success("Personne ajoutée."); }, (e: unknown) => toast.error(errorMessage(e, "Ajout impossible.")))}>Ajouter</button>
              <button type="button" className={primary} onClick={() => actions.closeTalk.mutateAsync(id).then(() => toast.success("Émargement clôturé."), (e: unknown) => toast.error(errorMessage(e, "Clôture impossible.")))}>Clôturer l'émargement</button>
            </div>
          </section>
        )}
      </div>
    </Drawer>
  );
}
