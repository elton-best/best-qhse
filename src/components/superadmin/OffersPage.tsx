import { useState } from "react";
import { toast } from "sonner";
import { Package, Plus } from "lucide-react";
import { useSaMutations, useSaNorms, useSaOffers, type SaOffer } from "@/integrations/backend/superadmin";
import { ConfirmDialog } from "../app/ConfirmDialog";
import { Badge, Drawer, Empty, ErrorNote, Field, SaHeader, Skeleton, btnGhost, btnPrimary, field, muted, panel } from "./sa-ui";

type Form = { name: string; description: string; price: string; duration_months: string; norms: number[]; is_active: boolean };
const EMPTY: Form = { name: "", description: "", price: "", duration_months: "12", norms: [], is_active: true };

/** Offres commerciales : chaque offre ouvre les modules des normes qui la composent. */
export function OffersPage() {
  const { data: offers, isLoading, error } = useSaOffers();
  const { data: norms = [] } = useSaNorms();
  const mutations = useSaMutations();
  const [editing, setEditing] = useState<SaOffer | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formError, setFormError] = useState("");
  const [toDelete, setToDelete] = useState<SaOffer | null>(null);

  const open = (offer: SaOffer | "new"): void => {
    setEditing(offer);
    setFormError("");
    setForm(
      offer === "new"
        ? EMPTY
        : { name: offer.name, description: offer.description ?? "", price: String(offer.price), duration_months: String(offer.duration_months), norms: offer.norms.map((n) => n.id), is_active: offer.is_active },
    );
  };

  const save = async (): Promise<void> => {
    if (!form.name.trim() || form.norms.length === 0 || form.price === "" || !form.duration_months) {
      setFormError("Le nom, le prix, la durée et au moins une norme sont obligatoires.");
      return;
    }
    try {
      await mutations.saveOffer.mutateAsync({
        ...(editing !== "new" && editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        duration_months: Number(form.duration_months),
        norms: form.norms,
        is_active: form.is_active,
      });
      toast.success("Offre enregistrée.");
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  };

  const toggleNorm = (id: number): void =>
    setForm((current) => ({ ...current, norms: current.norms.includes(id) ? current.norms.filter((n) => n !== id) : [...current.norms, id] }));

  return (
    <>
      <SaHeader title="Offres" description="Composez les offres commerciales à partir des normes publiées : les modules visibles par une entreprise en découlent." icon={Package}>
        <button type="button" className={btnPrimary} onClick={() => open("new")}>
          <Plus className="h-4 w-4" /> Nouvelle offre
        </button>
      </SaHeader>

      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <ErrorNote error={error} fallback="Impossible de charger les offres." />
      ) : !offers || offers.length === 0 ? (
        <Empty>Aucune offre. Créez la première offre pour permettre les souscriptions.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((offer) => (
            <article key={offer.id} className={`${panel} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={muted}>{offer.ref}</p>
                  <h2 className="font-display text-lg font-bold">{offer.name}</h2>
                </div>
                <Badge tone={offer.is_active ? "green" : "slate"}>{offer.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{offer.description || "—"}</p>
              <p className="mt-3 font-display text-xl font-extrabold text-primary">
                {Number(offer.price).toLocaleString("fr-FR")} FCFA <span className="text-sm font-semibold text-muted-foreground">/ {offer.duration_months} mois</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {offer.norms.map((norm) => (
                  <Badge key={norm.id} tone="blue">{norm.code}</Badge>
                ))}
              </div>
              <div className="mt-auto flex gap-2 pt-4">
                <button type="button" className={btnGhost} onClick={() => open(offer)}>Modifier</button>
                <button type="button" className={`${btnGhost} text-destructive`} onClick={() => setToDelete(offer)}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Drawer title={editing === "new" ? "Nouvelle offre" : "Modifier l'offre"} subtitle="Offre commerciale" onClose={() => setEditing(null)}>
          <Field label="Nom *"><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><textarea className={`${field} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix (FCFA) *"><input type="number" min={0} className={field} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Durée (mois) *"><input type="number" min={1} className={field} value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Normes incluses *</legend>
            <div className="space-y-1.5">
              {norms.map((norm) => (
                <label key={norm.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5 text-sm">
                  <input type="checkbox" checked={form.norms.includes(norm.id)} onChange={() => toggleNorm(norm.id)} />
                  <span className="font-semibold">{norm.code}</span>
                  <span className={muted}>{norm.name}</span>
                  {norm.status !== "published" && <Badge tone="amber">{norm.status}</Badge>}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Offre active (souscriptible)</label>
          {formError && <p className="text-sm text-red-700" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Annuler</button>
            <button type="button" className={btnPrimary} disabled={mutations.saveOffer.isPending} onClick={() => void save()}>Enregistrer</button>
          </div>
        </Drawer>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette offre ?"
        description="Une offre déjà souscrite par des entreprises ne peut généralement pas être supprimée."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) mutations.deleteOffer.mutateAsync(target.id).then(() => toast.success("Offre supprimée."), (e: Error) => toast.error(e.message));
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
