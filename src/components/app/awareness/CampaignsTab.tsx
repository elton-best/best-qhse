import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TOPICS, useAwarenessMutations, useCampaign, useCampaigns, useParticipants, type Material } from "@/integrations/backend/awareness";
import { Drawer, Field, Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, type FieldSpec } from "../emergency/FieldsForm";
import { MaterialForm } from "./MaterialForm";

const STATUS = { draft: ["Brouillon", "bg-slate-200 text-slate-700"], active: ["En cours", "bg-sky-100 text-sky-700"], closed: ["Clôturée", "bg-emerald-100 text-emerald-700"] } as const;

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Intitulé de la campagne", type: "text", required: true },
  { key: "objective", label: "Objectif", type: "textarea" },
  { key: "start_date", label: "Début", type: "date" },
  { key: "end_date", label: "Fin", type: "date" },
];

/** Campagnes (M9-04) : les quatre points de 7.3 doivent être couverts avant le lancement. */
export function CampaignsTab({ siteId }: { siteId: string }) {
  const { data: campaigns = [], isLoading } = useCampaigns(siteId || undefined, Boolean(siteId));
  const actions = useAwarenessMutations();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Une campagne rassemble des supports courts, suivis par accusé de lecture, pour un public défini.</p>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Nouvelle campagne</button>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : campaigns.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune campagne.</p> : (
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Campagne</th><th className="px-3 py-2">Période</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => setOpenId(c.id)}>{c.title}</button><p className={muted}>{c.ref}</p></td>
                  <td className="px-3 py-3">{formatDateFR(c.start_date)} → {formatDateFR(c.end_date)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[c.status][1]}`}>{STATUS[c.status][0]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <Modal title="Nouvelle campagne" description="Tout le personnel actif du site sera inscrit au lancement." onClose={() => setCreating(false)}>
          <FieldsForm fields={FIELDS} busy={actions.saveCampaign.isPending} error={error} initial={{}} onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const created = await actions.saveCampaign.mutateAsync({ input: { site_id: siteId, title: String(v["title"]), objective: orNull(v["objective"]), start_date: orNull(v["start_date"]), end_date: orNull(v["end_date"]), audience: "all_site" } });
                toast.success("Campagne créée : ajoutez maintenant les supports.");
                setCreating(false);
                setOpenId(created.id);
              } catch (e) {
                setError(errorMessage(e, "Création impossible."));
              }
            }} />
        </Modal>
      )}
      {openId !== null && <CampaignDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CampaignDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: campaign } = useCampaign(id);
  const { data: participants = [] } = useParticipants(campaign && campaign.status !== "draft" ? id : null);
  const actions = useAwarenessMutations();
  const [editing, setEditing] = useState<Material | "new" | null>(null);
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOrg, setInviteOrg] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!campaign) return <Drawer title="Campagne" onClose={onClose}><PageSkeleton rows={3} /></Drawer>;
  const materials = campaign.materials ?? [];
  const covered = new Set(materials.map((m) => m.topic));
  const draft = campaign.status === "draft";
  const attempt = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try { await job; toast.success(success); } catch (e) { setError(errorMessage(e, "Action impossible.")); }
  };

  return (
    <Drawer title={campaign.title} subtitle={`${campaign.ref} · ${STATUS[campaign.status][0]}`} onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Les quatre points de la clause 7.3</h3>
          <ul className="mt-2 space-y-1 text-sm">{TOPICS.map((t) => <li key={t.value} className={covered.has(t.value) ? "text-emerald-700" : "text-red-700"}>{covered.has(t.value) ? "✔" : "✘"} {t.label}</li>)}</ul>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Supports ({materials.length})</h3>
            {draft && <button type="button" className={secondary} onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Ajouter un support</button>}</div>
          {materials.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <button type="button" className="text-left" disabled={!draft} onClick={() => setEditing(m)}><span className="font-semibold">{m.title}</span><span className={`block ${muted}`}>{m.type === "sheet" ? "Fiche" : m.type === "video" ? "Vidéo" : `Quiz (${m.questions?.length ?? 0} question(s))`} · {TOPICS.find((t) => t.value === m.topic)?.label}</span></button>
              {draft && <button type="button" aria-label={`Supprimer ${m.title}`} className="text-muted-foreground hover:text-destructive" onClick={() => actions.removeMaterial.mutateAsync(m.id).then(() => toast.success("Support supprimé."), (e: unknown) => toast.error(errorMessage(e, "Suppression impossible.")))}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </section>

        {draft && <button type="button" className={primary} disabled={actions.activate.isPending} onClick={() => void attempt(actions.activate.mutateAsync(id), "Campagne lancée : le personnel du site est prévenu.")}>Lancer la campagne</button>}
        {campaign.status === "active" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={() => { setLink(null); setInviting(true); }}>Inviter une personne extérieure</button>
            <button type="button" className={secondary} onClick={() => void attempt(actions.close.mutateAsync(id), "Campagne clôturée.")}>Clôturer</button>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {!draft && (
          <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Participants ({participants.length})</h3>
            <ul className="divide-y divide-border text-sm">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{p.name}{p.kind === "external" ? ` (extérieur${p.organization ? ` — ${p.organization}` : ""})` : ""}</span>
                  <span className={p.completed_at ? "font-bold text-emerald-700" : muted}>{p.completed_at ? `Terminé · ${p.attestation_number}` : `${p.done}/${p.total}`}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing === "new" ? "Nouveau support" : "Modifier le support"} onClose={() => setEditing(null)}>
          <MaterialForm material={editing === "new" ? null : editing} busy={actions.saveMaterial.isPending} onCancel={() => setEditing(null)}
            onSubmit={async (payload) => { await actions.saveMaterial.mutateAsync({ campaignId: id, id: editing === "new" ? undefined : editing.id, input: payload }); toast.success("Support enregistré."); setEditing(null); }} />
        </Modal>
      )}
      {inviting && (
        <Modal title="Inviter une personne extérieure" description="Un lien personnel lui donne accès à cette seule campagne et à son attestation." onClose={() => setInviting(false)}>
          {link ? (
            <div className="space-y-3">
              <p className="text-sm">Lien personnel (affiché une seule fois) :</p>
              <div className="flex gap-2"><input readOnly aria-label="Lien d'invitation" className={input} value={link} /><button type="button" className={secondary} onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Lien copié."))}><Copy className="h-4 w-4" /></button></div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Nom *"><input className={input} value={inviteName} onChange={(e) => setInviteName(e.target.value)} /></Field>
              <Field label="Entreprise"><input className={input} value={inviteOrg} onChange={(e) => setInviteOrg(e.target.value)} /></Field>
              <Field label="E-mail (le lien lui est envoyé)"><input type="email" className={input} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></Field>
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <div className="flex justify-end"><button type="button" className={primary} disabled={actions.invite.isPending || !inviteName.trim()}
                onClick={() => actions.invite.mutateAsync({ id, name: inviteName.trim(), ...(inviteEmail ? { email: inviteEmail } : {}), ...(inviteOrg ? { organization: inviteOrg } : {}) }).then((r) => setLink(r.data.link), (e: unknown) => setError(errorMessage(e, "Invitation impossible.")))}>Créer l'invitation</button></div>
            </div>
          )}
        </Modal>
      )}
    </Drawer>
  );
}
