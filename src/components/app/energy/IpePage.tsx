import { useState } from "react";
import { toast } from "sonner";
import { Activity, PenLine, Plus, Trash2, X } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  useIpeList,
  useIpeMutations,
  useIpeValues,
  type Ipe,
  type IpeInput,
  type IpePeriodicity,
} from "@/integrations/backend/energy";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  Header,
  Label,
  PageSkeleton,
  SiteNotice,
  Stat,
  card,
  errorMessage,
  formatDateFR,
  input,
  muted,
  primary,
  secondary,
} from "../planning/shared";

const PERIODICITIES: { value: IpePeriodicity; label: string }[] = [
  { value: "journalier", label: "Journalière" },
  { value: "hebdomadaire", label: "Hebdomadaire" },
  { value: "mensuel", label: "Mensuelle" },
  { value: "trimestriel", label: "Trimestrielle" },
  { value: "annuel", label: "Annuelle" },
];

type IpeForm = {
  nom: string;
  description: string;
  formule_calcul: string;
  unite: string;
  periodicite: IpePeriodicity;
  valeur_reference: string;
  objectif_cible: string;
  date_reference: string;
};

const EMPTY_FORM: IpeForm = {
  nom: "",
  description: "",
  formule_calcul: "",
  unite: "",
  periodicite: "mensuel",
  valeur_reference: "",
  objectif_cible: "",
  date_reference: "",
};

const EMPTY_VALUE = { periode_debut: "", periode_fin: "", valeur: "", commentaire: "" };

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function signed(value: string | null): string {
  if (value === null) return "—";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toLocaleString("fr-FR")}`;
}

/** Indicateurs de performance énergétique (ISO 50001 §6.4) : définition, valeurs et écarts. */
export function IpePage() {
  const [siteId] = useCurrentSite();
  const { data: ipes = [], isLoading, isError, error } = useIpeList(siteId);
  const mutations = useIpeMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Ipe | null>(null);
  const [form, setForm] = useState<IpeForm>(EMPTY_FORM);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [valueForm, setValueForm] = useState(EMPTY_VALUE);
  const [toDelete, setToDelete] = useState<Ipe | null>(null);

  const detail = ipes.find((ipe) => ipe.id === detailId) ?? null;
  const { data: values = [], isLoading: valuesLoading } = useIpeValues(detail?.id ?? null);

  const openCreate = (): void => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant de créer un IPÉ.");
      return;
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (ipe: Ipe): void => {
    setEditing(ipe);
    setForm({
      nom: ipe.nom,
      description: ipe.description ?? "",
      formule_calcul: ipe.formule_calcul,
      unite: ipe.unite,
      periodicite: ipe.periodicite,
      valeur_reference: ipe.valeur_reference ?? "",
      objectif_cible: ipe.objectif_cible ?? "",
      date_reference: ipe.date_reference?.slice(0, 10) ?? "",
    });
    setFormOpen(true);
  };

  const submit = async (): Promise<void> => {
    if (!form.nom.trim() || !form.formule_calcul.trim() || !form.unite.trim()) {
      toast.error("Le nom, la formule de calcul et l'unité sont obligatoires.");
      return;
    }
    const payload: Partial<IpeInput> = {
      nom: form.nom.trim(),
      formule_calcul: form.formule_calcul.trim(),
      unite: form.unite.trim(),
      periodicite: form.periodicite,
      description: form.description.trim(),
      valeur_reference: numberOrNull(form.valeur_reference),
      objectif_cible: numberOrNull(form.objectif_cible),
      date_reference: form.date_reference || null,
    };
    try {
      if (editing) {
        await mutations.update.mutateAsync({ id: editing.id, input: payload });
        toast.success("IPÉ mis à jour.");
      } else {
        await mutations.create.mutateAsync({ ...(payload as IpeInput), site_id: siteId });
        toast.success("IPÉ créé.");
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(errorMessage(e, "Enregistrement impossible."));
    }
  };

  const submitValue = async (): Promise<void> => {
    if (!detail) return;
    if (!valueForm.periode_debut || !valueForm.periode_fin || valueForm.valeur.trim() === "") {
      toast.error("La période et la valeur sont obligatoires.");
      return;
    }
    try {
      await mutations.addValue.mutateAsync({
        id: detail.id,
        input: {
          periode_debut: valueForm.periode_debut,
          periode_fin: valueForm.periode_fin,
          valeur: Number(valueForm.valeur),
          ...(valueForm.commentaire.trim() ? { commentaire: valueForm.commentaire.trim() } : {}),
        },
      });
      setValueForm(EMPTY_VALUE);
      toast.success("Valeur enregistrée.");
    } catch (e) {
      toast.error(errorMessage(e, "Enregistrement de la valeur impossible."));
    }
  };

  const toggleActive = async (ipe: Ipe): Promise<void> => {
    try {
      await mutations.update.mutateAsync({ id: ipe.id, input: { actif: !ipe.actif } });
    } catch (e) {
      toast.error(errorMessage(e, "Changement de statut impossible."));
    }
  };

  const remove = async (): Promise<void> => {
    if (!toDelete) return;
    try {
      await mutations.remove.mutateAsync(toDelete.id);
      if (detailId === toDelete.id) setDetailId(null);
      toast.success("IPÉ supprimé.");
    } catch (e) {
      toast.error(errorMessage(e, "Suppression impossible."));
    } finally {
      setToDelete(null);
    }
  };

  const touch = (key: keyof IpeForm, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const activeCount = ipes.filter((ipe) => ipe.actif).length;
  const withTarget = ipes.filter((ipe) => ipe.objectif_cible !== null).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification — ISO 50001"
        title="Indicateurs de performance énergétique (IPÉ)"
        description="Définissez vos IPÉ, saisissez leurs valeurs par période et suivez les écarts à la référence et à l'objectif (§6.4)."
        icon={Activity}
      >
        <button type="button" className={primary} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nouvel IPÉ
        </button>
      </Header>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {errorMessage(error, "Impossible de charger les IPÉ.")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat value={ipes.length} label="IPÉ définis" />
        <Stat value={activeCount} label="IPÉ actifs" tone="text-emerald-600" />
        <Stat value={withTarget} label="Avec objectif cible" tone="text-sky-600" />
      </div>

      <div className={`${card} p-5`}>
        {isLoading && siteId ? (
          <PageSkeleton rows={3} />
        ) : ipes.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            {siteId ? "Aucun IPÉ défini pour ce site." : "Sélectionnez un site pour afficher les IPÉ."}
          </p>
        ) : (
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">IPÉ</th>
                  <th className="px-3 py-2">Unité</th>
                  <th className="px-3 py-2">Périodicité</th>
                  <th className="px-3 py-2">Référence</th>
                  <th className="px-3 py-2">Objectif</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ipes.map((ipe) => (
                  <tr key={ipe.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold hover:text-primary"
                        onClick={() => setDetailId(ipe.id)}
                      >
                        {ipe.nom}
                      </button>
                      <p className="text-xs text-muted-foreground">{ipe.formule_calcul}</p>
                    </td>
                    <td className="px-3 py-2">{ipe.unite}</td>
                    <td className="px-3 py-2">
                      {PERIODICITIES.find((p) => p.value === ipe.periodicite)?.label ?? ipe.periodicite}
                    </td>
                    <td className="px-3 py-2">{ipe.valeur_reference ?? "—"}</td>
                    <td className="px-3 py-2">{ipe.objectif_cible ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${ipe.actif ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                        onClick={() => void toggleActive(ipe)}
                        aria-label={ipe.actif ? "Désactiver l'IPÉ" : "Activer l'IPÉ"}
                      >
                        {ipe.actif ? "Actif" : "Inactif"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" className={secondary} onClick={() => openEdit(ipe)}>
                          <PenLine className="h-4 w-4" /> Modifier
                        </button>
                        <button type="button" className={secondary} onClick={() => setToDelete(ipe)}>
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">Valeurs de l'IPÉ</p>
              <h2 className="font-display text-lg font-bold">{detail.nom}</h2>
              <p className={muted}>
                Référence : {detail.valeur_reference ?? "—"} {detail.unite} · Objectif :{" "}
                {detail.objectif_cible ?? "—"} {detail.unite}
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl p-2 text-muted-foreground hover:bg-background"
              onClick={() => setDetailId(null)}
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <Label>Début de période</Label>
              <input
                type="date"
                className={input}
                value={valueForm.periode_debut}
                onChange={(e) => setValueForm({ ...valueForm, periode_debut: e.target.value })}
              />
            </div>
            <div>
              <Label>Fin de période</Label>
              <input
                type="date"
                className={input}
                value={valueForm.periode_fin}
                onChange={(e) => setValueForm({ ...valueForm, periode_fin: e.target.value })}
              />
            </div>
            <div>
              <Label>{`Valeur (${detail.unite})`}</Label>
              <input
                type="number"
                className={input}
                value={valueForm.valeur}
                onChange={(e) => setValueForm({ ...valueForm, valeur: e.target.value })}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className={`${primary} w-full`}
                disabled={mutations.addValue.isPending}
                onClick={() => void submitValue()}
              >
                <Plus className="h-4 w-4" /> Ajouter la valeur
              </button>
            </div>
            <div className="sm:col-span-4">
              <Label>Commentaire</Label>
              <input
                className={input}
                value={valueForm.commentaire}
                onChange={(e) => setValueForm({ ...valueForm, commentaire: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {valuesLoading ? (
              <PageSkeleton rows={2} />
            ) : values.length === 0 ? (
              <p className={`py-6 text-center ${muted}`}>Aucune valeur saisie pour cet IPÉ.</p>
            ) : (
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Période</th>
                    <th className="px-3 py-2">Valeur</th>
                    <th className="px-3 py-2">Écart à la référence</th>
                    <th className="px-3 py-2">Écart à l'objectif</th>
                    <th className="px-3 py-2">Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {values.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        {formatDateFR(row.periode_debut)} → {formatDateFR(row.periode_fin)}
                      </td>
                      <td className="px-3 py-2 font-semibold">{row.valeur}</td>
                      <td className="px-3 py-2">{signed(row.ecart_reference)}</td>
                      <td className="px-3 py-2">{signed(row.ecart_objectif)}</td>
                      <td className="px-3 py-2">{row.commentaire ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Modifier l'IPÉ" : "Nouvel IPÉ"}
        >
          <div className={`${card} my-8 w-full max-w-2xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-xl font-bold">
                {editing ? "Modifier l'IPÉ" : "Nouvel IPÉ"}
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-muted-foreground hover:bg-background"
                onClick={() => setFormOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nom *</Label>
                <input className={input} value={form.nom} onChange={(e) => touch("nom", e.target.value)} />
              </div>
              <div>
                <Label>Formule de calcul *</Label>
                <input
                  className={input}
                  placeholder="kWh consommés / tonnes produites"
                  value={form.formule_calcul}
                  onChange={(e) => touch("formule_calcul", e.target.value)}
                />
              </div>
              <div>
                <Label>Unité *</Label>
                <input className={input} value={form.unite} onChange={(e) => touch("unite", e.target.value)} />
              </div>
              <div>
                <Label>Périodicité *</Label>
                <select
                  className={input}
                  value={form.periodicite}
                  onChange={(e) => touch("periodicite", e.target.value)}
                >
                  {PERIODICITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Date de référence</Label>
                <input
                  type="date"
                  className={input}
                  value={form.date_reference}
                  onChange={(e) => touch("date_reference", e.target.value)}
                />
              </div>
              <div>
                <Label>Valeur de référence</Label>
                <input
                  type="number"
                  className={input}
                  value={form.valeur_reference}
                  onChange={(e) => touch("valeur_reference", e.target.value)}
                />
              </div>
              <div>
                <Label>Objectif cible</Label>
                <input
                  type="number"
                  className={input}
                  value={form.objectif_cible}
                  onChange={(e) => touch("objectif_cible", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <textarea
                  className={`${input} min-h-20`}
                  value={form.description}
                  onChange={(e) => touch("description", e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setFormOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className={primary}
                disabled={mutations.create.isPending || mutations.update.isPending}
                onClick={() => void submit()}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cet IPÉ ?"
        description="L'IPÉ et ses valeurs seront retirés du suivi."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
