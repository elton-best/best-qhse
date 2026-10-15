import { useState } from "react";
import { useRelationOptions } from "@/integrations/backend/energy";
import { useAesList } from "@/integrations/backend/aes";
import type { Obligation, ObligationInput } from "@/integrations/backend/compliance";
import { Drawer, Field } from "../overlay";
import { input, muted, primary, secondary } from "../planning/shared";
import { CHANGE_STATUS, EXPIRING, FREQUENCIES, SOURCE_TYPES } from "./compliance-config";

type Form = {
  title: string; source_type: string; regulatory_reference: string; authority: string; source_url: string; description: string;
  applicable_requirement: string; aspect_name: string; entry_into_force_date: string; regulatory_change_status: string;
  responsible_id: string; evaluation_frequency: string; permit_number: string; expiry_date: string; watch_source: string;
  comments: string; environmental_aspect_ids: number[];
};

function initial(o: Obligation | null): Form {
  const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
  return {
    title: text(o?.title), source_type: o?.source_type ?? "law", regulatory_reference: text(o?.regulatory_reference), authority: text(o?.authority),
    source_url: text(o?.source_url), description: text(o?.description), applicable_requirement: text(o?.applicable_requirement),
    aspect_name: text(o?.aspect.name), entry_into_force_date: text(o?.entry_into_force_date).slice(0, 10),
    regulatory_change_status: o?.regulatory_change_status ?? "existing", responsible_id: text(o?.responsible_id),
    evaluation_frequency: o?.evaluation_frequency ?? "annual", permit_number: text(o?.permit_number), expiry_date: text(o?.expiry_date).slice(0, 10),
    watch_source: text(o?.watch_source), comments: text(o?.comments), environmental_aspect_ids: o?.environmental_aspects.map((a) => a.id) ?? [],
  };
}

/** Fiche d'obligation de conformité (§6.1.3) : source, exigences, périodicité et aspects concernés. */
export function ObligationForm({
  obligation, siteId, busy, error, onSubmit, onClose,
}: {
  obligation: Obligation | null; siteId: string; busy: boolean; error: string | null;
  onSubmit: (input: ObligationInput) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Form>(() => initial(obligation));
  const [localError, setLocalError] = useState<string | null>(null);
  const users = useRelationOptions("users", siteId, true).data ?? [];
  const aspects = useAesList({ site_id: siteId || undefined }, Boolean(siteId)).data ?? [];
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => setForm((current) => ({ ...current, [key]: value }));
  const expiring = EXPIRING.includes(form.source_type);

  const submit = (): void => {
    if (!form.regulatory_reference.trim()) {
      setLocalError("La référence ou l'intitulé du texte est obligatoire.");
      return;
    }
    if (!obligation && !form.aspect_name.trim()) {
      setLocalError("Indiquez le thème (domaine) de l'obligation.");
      return;
    }
    setLocalError(null);
    const orNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());
    onSubmit({
      ...(obligation ? { aspect_id: obligation.aspect.id ?? undefined } : { site_id: siteId, aspect_name: form.aspect_name.trim() }),
      title: orNull(form.title),
      source_type: form.source_type as ObligationInput["source_type"],
      regulatory_reference: form.regulatory_reference.trim(),
      authority: orNull(form.authority),
      source_url: orNull(form.source_url),
      description: orNull(form.description),
      applicable_requirement: orNull(form.applicable_requirement),
      watch_source: orNull(form.watch_source),
      entry_into_force_date: orNull(form.entry_into_force_date),
      regulatory_change_status: form.regulatory_change_status as ObligationInput["regulatory_change_status"],
      responsible_id: form.responsible_id ? Number(form.responsible_id) : null,
      evaluation_frequency: form.evaluation_frequency as ObligationInput["evaluation_frequency"],
      permit_number: expiring ? orNull(form.permit_number) : null,
      expiry_date: expiring ? orNull(form.expiry_date) : null,
      comments: orNull(form.comments),
      environmental_aspect_ids: form.environmental_aspect_ids,
    });
  };

  const toggleAspect = (id: number): void =>
    set("environmental_aspect_ids", form.environmental_aspect_ids.includes(id) ? form.environmental_aspect_ids.filter((x) => x !== id) : [...form.environmental_aspect_ids, id]);

  return (
    <Drawer title={obligation ? "Modifier l'obligation" : "Nouvelle obligation de conformité"} subtitle="ISO 14001 — §6.1.3" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type de source *">
          <select className={input} value={form.source_type} onChange={(e) => set("source_type", e.target.value)}>
            {SOURCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Thème / domaine *">
          <input className={input} placeholder="Déchets, eau, air, bruit…" disabled={Boolean(obligation)} value={form.aspect_name} onChange={(e) => set("aspect_name", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Référence du texte *"><input className={input} placeholder="Décret n° 2024-123 du …" value={form.regulatory_reference} onChange={(e) => set("regulatory_reference", e.target.value)} /></Field>
        </div>
        <div className="sm:col-span-2"><Field label="Intitulé court"><input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field></div>
        <Field label="Autorité / émetteur"><input className={input} value={form.authority} onChange={(e) => set("authority", e.target.value)} /></Field>
        <Field label="Lien vers le texte"><input type="url" className={input} placeholder="https://" value={form.source_url} onChange={(e) => set("source_url", e.target.value)} /></Field>
        <Field label="Entrée en vigueur"><input type="date" className={input} value={form.entry_into_force_date} onChange={(e) => set("entry_into_force_date", e.target.value)} /></Field>
        <Field label="Statut du texte">
          <select className={input} value={form.regulatory_change_status} onChange={(e) => set("regulatory_change_status", e.target.value)}>
            {CHANGE_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        {expiring && (
          <>
            <Field label="N° du permis / de la licence"><input className={input} value={form.permit_number} onChange={(e) => set("permit_number", e.target.value)} /></Field>
            <Field label="Date d'expiration"><input type="date" className={input} value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} /></Field>
          </>
        )}
        <div className="sm:col-span-2"><Field label="Exigences applicables"><textarea className={`${input} min-h-20`} value={form.applicable_requirement} onChange={(e) => set("applicable_requirement", e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><textarea className={`${input} min-h-16`} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <Field label="Responsable">
          <select className={input} value={form.responsible_id} onChange={(e) => set("responsible_id", e.target.value)}>
            <option value="">—</option>
            {users.map((user) => <option key={user.value} value={user.value}>{user.label}</option>)}
          </select>
        </Field>
        <Field label="Fréquence d'évaluation">
          <select className={input} value={form.evaluation_frequency} onChange={(e) => set("evaluation_frequency", e.target.value)}>
            {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Source de veille"><input className={input} placeholder="Journal officiel, abonnement…" value={form.watch_source} onChange={(e) => set("watch_source", e.target.value)} /></Field>
      </div>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Aspects environnementaux concernés</legend>
        {aspects.length === 0 ? (
          <p className={muted}>Aucun aspect disponible pour ce site (le module des aspects peut ne pas faire partie de votre offre).</p>
        ) : (
          <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {aspects.map((aspect) => (
              <label key={aspect.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={form.environmental_aspect_ids.includes(aspect.id)} onChange={() => toggleAspect(aspect.id)} />
                <span>{aspect.aspect_number ? `${aspect.aspect_number} — ` : ""}{aspect.aspect}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Field label="Commentaires"><textarea className={`${input} min-h-16`} value={form.comments} onChange={(e) => set("comments", e.target.value)} /></Field>

      {(localError || error) && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{localError ?? error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button type="button" className={secondary} onClick={onClose}>Annuler</button>
        <button type="button" className={primary} disabled={busy} onClick={submit}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Drawer>
  );
}
