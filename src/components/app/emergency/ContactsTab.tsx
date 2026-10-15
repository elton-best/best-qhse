import { useState } from "react";
import { toast } from "sonner";
import { Phone, Plus } from "lucide-react";
import { useContacts, useEmergencyMutations, useScenarios, type Contact } from "@/integrations/backend/emergency";
import { ConfirmDialog } from "../ConfirmDialog";
import { Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, type FieldSpec } from "./FieldsForm";

export const CATEGORIES = [
  { value: "staff", label: "Personnel clé" },
  { value: "fire_brigade", label: "Pompiers" },
  { value: "ambulance", label: "Secours médicaux" },
  { value: "police", label: "Police / gendarmerie" },
  { value: "depollution", label: "Dépollution" },
  { value: "utility", label: "Concessionnaires (eau, électricité, gaz)" },
  { value: "neighbour", label: "Voisins (assistance mutuelle)" },
  { value: "authority", label: "Autorités" },
  { value: "other", label: "Autre" },
];

/** Annuaire d'urgence (M13-03) : un appui sur le numéro lance l'appel depuis un téléphone. */
export function ContactsTab({ siteId }: { siteId: string }) {
  const { data: contacts = [], isLoading } = useContacts(siteId || undefined, Boolean(siteId));
  const { data: scenarios = [] } = useScenarios(siteId || undefined, Boolean(siteId));
  const mutations = useEmergencyMutations();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Contact | null>(null);

  const fields: FieldSpec[] = [
    { key: "title", label: "Nom", type: "text", required: true },
    { key: "category", label: "Catégorie", type: "select", options: CATEGORIES, required: true },
    { key: "job_role", label: "Fonction", type: "text" },
    { key: "phone", label: "Téléphone", type: "tel", required: true },
    { key: "phone_alt", label: "Téléphone secondaire", type: "tel" },
    { key: "email", label: "E-mail", type: "text" },
    { key: "procedure_id", label: "Scénario concerné (facultatif)", type: "select", options: scenarios.map((s) => ({ value: String(s.id), label: s.title })) },
    { key: "available_24h", label: "Joignable 24 h/24", type: "checkbox" },
  ];

  const grouped = CATEGORIES.map((c) => ({ ...c, items: contacts.filter((x) => x.category === c.value) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Numéros à portée de main en cas d'urgence : personnel clé, secours, dépollution, voisins pour l'assistance mutuelle.</p>
        <button type="button" className={primary} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Ajouter un contact</button>
      </div>

      {isLoading ? <PageSkeleton rows={3} /> : contacts.length === 0 ? (
        <div className={`${card} p-8 text-center ${muted}`}>Aucun contact d'urgence. Commencez par les pompiers, les secours et le responsable du site.</div>
      ) : (
        grouped.map((group) => (
          <section key={group.value} className={`${card} p-4`}>
            <h3 className="font-display font-bold">{group.label}</h3>
            <ul className="mt-2 divide-y divide-border">
              {group.items.map((contact) => (
                <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{contact.title}{contact.available_24h && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">24 h/24</span>}</p>
                    <p className={muted}>{[contact.job_role, contact.email, contact.procedure?.title].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" aria-label={`Appeler ${contact.title}`}>
                      <Phone className="h-4 w-4" /> {contact.phone}
                    </a>
                    {contact.phone_alt && <a href={`tel:${contact.phone_alt.replace(/[^+0-9]/g, "")}`} className="text-sm font-semibold text-primary hover:underline">{contact.phone_alt}</a>}
                    <button type="button" className={secondary} onClick={() => { setError(null); setEditing(contact); }}>Modifier</button>
                    <button type="button" className={`${secondary} text-destructive`} onClick={() => setToDelete(contact)}>Supprimer</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <Modal title={editing === "new" ? "Nouveau contact d'urgence" : "Modifier le contact"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={fields}
            busy={mutations.saveContact.isPending}
            error={error}
            initial={editing === "new"
              ? { category: "staff", available_24h: false }
              : { title: editing.title, category: editing.category, job_role: editing.job_role ?? "", phone: editing.phone, phone_alt: editing.phone_alt ?? "", email: editing.email ?? "", procedure_id: editing.procedure_id ? String(editing.procedure_id) : "", available_24h: editing.available_24h }}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await mutations.saveContact.mutateAsync({
                  ...(editing !== "new" ? { id: editing.id } : {}),
                  input: {
                    ...(editing === "new" ? { site_id: siteId } : {}),
                    title: String(v["title"]), category: String(v["category"]), job_role: orNull(v["job_role"]), phone: String(v["phone"]),
                    phone_alt: orNull(v["phone_alt"]), email: orNull(v["email"]), available_24h: v["available_24h"] === true,
                    procedure_id: v["procedure_id"] ? Number(v["procedure_id"]) : null,
                  } as never,
                });
                toast.success("Contact enregistré.");
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
        title="Supprimer ce contact ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => { const t = toDelete; setToDelete(null); if (t) mutations.removeContact.mutateAsync(t.id).then(() => toast.success("Contact supprimé."), (e: Error) => toast.error(e.message)); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
