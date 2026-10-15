import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  Filter,
  History,
  Layers,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import { backendApi } from "@/integrations/backend/client";
import {
  Header,
  PageSkeleton,
  SelectField,
  SiteNotice,
  Stat,
  TextAreaField,
  TextField,
  card,
  errorMessage,
  formatDateFR,
  input,
  muted,
  primary,
  secondary,
  statusBadge,
  statusLabel,
} from "@/components/app/support/shared";
import {
  downloadBlobResponse,
  downloadEquipementsTemplate,
  fetchProchainIndice,
  fetchTransferReasons,
  importEquipementsFile,
  importMaintenancesFile,
  useCodifications,
  useCodificationMutations,
  useEquipements,
  useEquipementMutations,
  useMaintenances,
  useMaintenanceAlertes,
  useMaintenanceMutations,
  useSupportSites,
  type CodificationElement,
  type Equipement,
  type EquipementTransfer,
  type Maintenance,
} from "@/integrations/backend/support";

type ResourceTab = "codification" | "inventory" | "maintenance";

export function ResourcesPage() {
  const [siteId] = useCurrentSite();
  const [activeTab, setActiveTab] = useState<ResourceTab>("codification");

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Support — ISO 9001 §7.1"
        title="Ressources & Équipements"
        description="Plan de codification syntaxique, inventaire physique des équipements et plan de maintenance préventive/corrective."
        icon={Wrench}
      />

      {/* Navigation par onglets (3 étapes du flux Ressources) */}
      <div className="grid grid-cols-1 border-b border-border sm:grid-cols-3">
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-3 ${
            activeTab === "codification"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("codification")}
        >
          <Layers className="h-4 w-4" />
          Étape 1 : Plan de codification
        </button>
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-3 ${
            activeTab === "inventory"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("inventory")}
        >
          <Wrench className="h-4 w-4" />
          Étape 2 : Inventaire des équipements
        </button>
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-3 ${
            activeTab === "maintenance"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("maintenance")}
        >
          <Calendar className="h-4 w-4" />
          Étape 3 : Plan de maintenance
        </button>
      </div>

      {activeTab === "codification" && <CodificationStep siteId={siteId} />}
      {activeTab === "inventory" && <InventoryStep siteId={siteId} />}
      {activeTab === "maintenance" && <MaintenanceStep siteId={siteId} />}
    </div>
  );
}

// ============================================================================
// ÉTAPE 1 : PLAN DE CODIFICATION
// ============================================================================

function CodificationStep({ siteId: _siteId }: { siteId?: string }) {
  const { data: categories = [], isLoading: loadingCat } = useCodifications("categorie");
  const { data: locations = [], isLoading: loadingLoc } = useCodifications("localisation");
  const { save, remove } = useCodificationMutations();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"categorie" | "localisation">("categorie");
  const [editingItem, setEditingItem] = useState<CodificationElement | null>(null);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);

  const openCreate = (type: "categorie" | "localisation") => {
    setModalType(type);
    setEditingItem(null);
    setCode("");
    setLibelle("");
    setDescription("");
    setModalOpen(true);
  };

  const openEdit = (item: CodificationElement) => {
    setModalType(item.type);
    setEditingItem(item);
    setCode(item.code);
    setLibelle(item.libelle);
    setDescription(item.description ?? "");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!code.trim() || !libelle.trim()) {
      toast.error("Le code et le libellé sont obligatoires.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editingItem?.id,
        payload: {
          code: code.trim().toUpperCase(),
          libelle: libelle.trim(),
          description: description.trim(),
          type: modalType,
          actif: true,
        },
      });
      toast.success(
        editingItem
          ? `${modalType === "categorie" ? "Catégorie" : "Localisation"} mise à jour.`
          : `${modalType === "categorie" ? "Catégorie" : "Localisation"} créée avec succès.`,
      );
      setModalOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de la codification."));
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Élément de codification supprimé.");
    } catch (error) {
      toast.error(
        errorMessage(
          error,
          "Impossible de supprimer cet élément (peut-être rattaché à un équipement).",
        ),
      );
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Synthèse de la règle syntaxique standard */}
      <div className={`${card} p-6`}>
        <h2 className="font-display text-lg font-bold">Règle de Codification Standard</h2>
        <p className={`mt-1 ${muted}`}>
          La nomenclature des équipements repose sur une structure normée garantissant l'unicité et
          la traçabilité :
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-sm">
          <span className="rounded-lg bg-primary/10 px-3 py-1 font-bold text-primary">
            [SIGLE_ENTREPRISE]
          </span>
          <span>/</span>
          <span className="rounded-lg bg-sky-100 px-3 py-1 font-bold text-sky-800">
            [CATEGORIE]
          </span>
          <span>/</span>
          <span className="rounded-lg bg-indigo-100 px-3 py-1 font-bold text-indigo-800">
            [NOM_COMMUN_3_LETTRES]
          </span>
          <span>/</span>
          <span className="rounded-lg bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
            [LOCALISATION]
          </span>
          <span>/</span>
          <span className="rounded-lg bg-amber-100 px-3 py-1 font-bold text-amber-800">
            [INDICE_3_CHIFFRES]
          </span>
          <span>/</span>
          <span className="rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-800">
            [ANNEE]
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Exemple généré automatiquement :{" "}
          <strong className="font-mono text-foreground">BEG / INF / ECR / BUR / 001 / 2026</strong>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Catégories */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold">Catégories d'équipements</h3>
              <p className={muted}>Identifiants courts par famille technique</p>
            </div>
            <button className={secondary} onClick={() => openCreate("categorie")}>
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
          {loadingCat ? (
            <PageSkeleton rows={3} />
          ) : categories.length === 0 ? (
            <p className={`mt-4 py-6 text-center ${muted}`}>Aucune catégorie enregistrée.</p>
          ) : (
            <div className="mt-4 divide-y divide-border">
              {categories.map((c) => (
                <div key={String(c.id)} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 font-mono text-xs font-bold text-sky-800">
                      {c.code}
                    </span>
                    <span className="ml-2.5 text-sm font-semibold">{c.libelle}</span>
                    {c.description && (
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="rounded p-1 hover:bg-background"
                      onClick={() => openEdit(c)}
                      aria-label="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      className="rounded p-1 hover:bg-background"
                      onClick={() => setConfirmDeleteId(c.id)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Localisations */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold">Localisations physiques</h3>
              <p className={muted}>Bâtiments, ateliers, bureaux et zones</p>
            </div>
            <button className={secondary} onClick={() => openCreate("localisation")}>
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
          {loadingLoc ? (
            <PageSkeleton rows={3} />
          ) : locations.length === 0 ? (
            <p className={`mt-4 py-6 text-center ${muted}`}>Aucune localisation enregistrée.</p>
          ) : (
            <div className="mt-4 divide-y divide-border">
              {locations.map((l) => (
                <div key={String(l.id)} className="flex items-center justify-between py-2.5">
                  <div>
                    <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800">
                      {l.code}
                    </span>
                    <span className="ml-2.5 text-sm font-semibold">{l.libelle}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="rounded p-1 hover:bg-background"
                      onClick={() => openEdit(l)}
                      aria-label="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      className="rounded p-1 hover:bg-background"
                      onClick={() => setConfirmDeleteId(l.id)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Guide des États */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={`${card} p-4 border-l-4 border-emerald-500`}>
          <h4 className="font-bold text-emerald-700">Très bon état</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Équipement neuf ou récemment révisé, pleine disponibilité opérationnelle.
          </p>
        </div>
        <div className={`${card} p-4 border-l-4 border-sky-500`}>
          <h4 className="font-bold text-sky-700">Bon état</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Fonctionnel avec maintenances préventives régulières, sans défaillance critique.
          </p>
        </div>
        <div className={`${card} p-4 border-l-4 border-red-500`}>
          <h4 className="font-bold text-red-700">Mauvais état</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Dégradations régulières ou pannes récurrentes, remplacement ou révision majeure requise.
          </p>
        </div>
      </div>

      {/* Dialogue Création / Modification Codification */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-bold">
                {editingItem ? "Modifier" : "Ajouter une"}{" "}
                {modalType === "categorie" ? "catégorie" : "localisation"}
              </h3>
              <button onClick={() => setModalOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <TextField
                label="Code (trigramme ou abréviation)"
                value={code}
                onChange={setCode}
                placeholder="Ex: INF, BUR, AT1..."
                required
              />
              <TextField
                label="Libellé complet"
                value={libelle}
                onChange={setLibelle}
                placeholder="Ex: Informatique, Bureau Direction..."
                required
              />
              {modalType === "categorie" && (
                <TextAreaField
                  label="Description / Périmètre"
                  value={description}
                  onChange={setDescription}
                  placeholder="Équipements et matériels concernés..."
                />
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button
                className={primary}
                onClick={() => void handleSubmit()}
                disabled={save.isPending}
              >
                {save.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cet élément de codification ?"
        description="Cette action est irréversible. Si des équipements utilisent ce code, la suppression sera bloquée."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// ============================================================================
// ÉTAPE 2 : INVENTAIRE DES ÉQUIPEMENTS
// ============================================================================

function InventoryStep({ siteId }: { siteId?: string }) {
  const [search, setSearch] = useState("");
  const [etatFilter, setEtatFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [locFilter, setLocFilter] = useState("all");

  const { data: equipements = [], isLoading, refetch } = useEquipements({
    site_id: siteId,
    search: search || undefined,
    etat: etatFilter,
    categorie_id: catFilter,
    localisation_id: locFilter,
  });

  const { data: categories = [] } = useCodifications("categorie");
  const { data: locations = [] } = useCodifications("localisation");
  const { save, remove } = useEquipementMutations();
  const [importingEquipements, setImportingEquipements] = useState(false);

  const handleDownloadEquipementsTemplate = async () => {
    try {
      await downloadEquipementsTemplate();
      toast.success("Gabarit d'inventaire téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec du téléchargement du gabarit."));
    }
  };

  const handleEquipementsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingEquipements(true);
    try {
      const result = await importEquipementsFile(file);
      const summary = result.summary;
      if (summary.failed > 0) {
        toast.warning(
          `Import partiel : ${summary.created} créé(s), ${summary.updated} mis à jour, ${summary.failed} erreur(s).`,
        );
      } else {
        toast.success(
          `Import terminé : ${summary.created} créé(s), ${summary.updated} mis à jour.`,
        );
      }
      void refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Import des équipements impossible."));
    } finally {
      setImportingEquipements(false);
    }
  };

  // Dialogues
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipement | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [transferItem, setTransferItem] = useState<Equipement | null>(null);
  const [historyItem, setHistoryItem] = useState<Equipement | null>(null);

  // Formulaire équipement
  const [nomCommun, setNomCommun] = useState("");
  const [categorieId, setCategorieId] = useState("");
  const [localisationId, setLocalisationId] = useState("");
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [marque, setMarque] = useState("");
  const [modele, setModele] = useState("");
  const [numSerie, setNumSerie] = useState("");
  const [etat, setEtat] = useState<"tres_bon" | "bon" | "mauvais">("bon");
  const [valeur, setValeur] = useState("");
  const [necessiteMaint, setNecessiteMaint] = useState(false);
  const [freqMaint, setFreqMaint] = useState(90);
  const [observations, setObservations] = useState("");
  const [codeComplet, setCodeComplet] = useState("");

  const openCreate = () => {
    setEditingItem(null);
    setNomCommun("");
    setCategorieId(categories[0]?.id ? String(categories[0].id) : "");
    setLocalisationId(locations[0]?.id ? String(locations[0].id) : "");
    setAnnee(new Date().getFullYear());
    setMarque("");
    setModele("");
    setNumSerie("");
    setEtat("bon");
    setValeur("");
    setNecessiteMaint(false);
    setFreqMaint(90);
    setObservations("");
    setCodeComplet("");
    setFormOpen(true);
  };

  const openEdit = (item: Equipement) => {
    setEditingItem(item);
    setNomCommun(item.nom_commun);
    setCategorieId(item.categorie_id ? String(item.categorie_id) : "");
    setLocalisationId(item.localisation_id ? String(item.localisation_id) : "");
    setAnnee(item.annee_acquisition ?? new Date().getFullYear());
    setMarque(item.marque ?? "");
    setModele(item.modele ?? "");
    setNumSerie(item.numero_serie ?? "");
    setEtat(item.etat);
    setValeur(item.valeur_acquisition ? String(item.valeur_acquisition) : "");
    setNecessiteMaint(item.necessite_maintenance);
    setFreqMaint(item.frequence_maintenance_jours ?? 90);
    setObservations(item.observations ?? "");
    setCodeComplet(item.code_complet);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!nomCommun.trim()) {
      toast.error("Le nom de l'équipement est obligatoire.");
      return;
    }
    if (!categorieId || !localisationId) {
      toast.error("Sélectionnez une catégorie et une localisation pour l'équipement.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        nom_commun: nomCommun.trim(),
        categorie_id: categorieId ? Number(categorieId) : undefined,
        localisation_id: localisationId ? Number(localisationId) : undefined,
        annee_acquisition: annee,
        marque: marque.trim() || undefined,
        modele: modele.trim() || undefined,
        numero_serie: numSerie.trim() || undefined,
        etat,
        valeur_acquisition: valeur ? Number(valeur) : undefined,
        necessite_maintenance: necessiteMaint,
        frequence_maintenance_jours: necessiteMaint ? Number(freqMaint) : undefined,
        observations: observations.trim() || undefined,
        actif: true,
      };
      if (codeComplet.trim()) {
        payload["code_complet"] = codeComplet.trim();
      }
      if (siteId) {
        payload["site_id"] = Number(siteId);
      }
      await save.mutateAsync({ id: editingItem?.id, payload });
      toast.success(
        editingItem ? "Équipement mis à jour." : "Équipement enregistré dans l'inventaire.",
      );
      setFormOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de l'équipement."));
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Équipement retiré de l'inventaire.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de supprimer cet équipement."));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // KPIs
  const total = equipements.length;
  const tresBon = equipements.filter((e) => e.etat === "tres_bon").length;
  const bon = equipements.filter((e) => e.etat === "bon").length;
  const mauvais = equipements.filter((e) => e.etat === "mauvais").length;
  const avecMaint = equipements.filter((e) => e.necessite_maintenance).length;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total équipements" value={total} tone="text-foreground" />
        <Stat label="Très bon état" value={tresBon} tone="text-emerald-600" />
        <Stat label="Bon état" value={bon} tone="text-sky-600" />
        <Stat label="Mauvais état" value={mauvais} tone="text-red-600" />
        <Stat label="Sous maintenance" value={avecMaint} tone="text-primary" />
      </div>

      {/* Barre d'outils et Filtres */}
      <div className={`${card} min-w-0 space-y-4 p-4 sm:p-5`}>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-w-0 items-center gap-2 sm:col-span-2 xl:col-span-1">
              <Filter className="h-4 w-4 shrink-0 text-primary" />
              <span className="shrink-0 text-sm font-bold">Filtres</span>
              <input
                className={`${input} min-w-0 flex-1 sm:w-auto`}
                placeholder="Rechercher nom, code, série..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={`${input} w-full min-w-0`}
              value={etatFilter}
              onChange={(e) => setEtatFilter(e.target.value)}
            >
              <option value="all">Tous états</option>
              <option value="tres_bon">Très bon</option>
              <option value="bon">Bon</option>
              <option value="mauvais">Mauvais</option>
            </select>
            <select
              className={`${input} w-full min-w-0`}
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
            >
              <option value="all">Toutes catégories</option>
              {categories.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {c.code} - {c.libelle}
                </option>
              ))}
            </select>
            <select
              className={`${input} w-full min-w-0`}
              value={locFilter}
              onChange={(e) => setLocFilter(e.target.value)}
            >
              <option value="all">Toutes localisations</option>
              {locations.map((l) => (
                <option key={String(l.id)} value={String(l.id)}>
                  {l.code} - {l.libelle}
                </option>
              ))}
            </select>
            {(search || etatFilter !== "all" || catFilter !== "all" || locFilter !== "all") && (
              <button
                className={`${secondary} w-full justify-center sm:w-auto`}
                onClick={() => {
                  setSearch("");
                  setEtatFilter("all");
                  setCatFilter("all");
                  setLocFilter("all");
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
          </div>
          <button className={`${primary} w-full justify-center lg:w-auto`} onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouvel équipement
          </button>
          <button
            className={`${secondary} w-full justify-center lg:w-auto`}
            onClick={() => void handleDownloadEquipementsTemplate()}
            title="Télécharger le gabarit Excel d'import"
          >
            <Download className="h-4 w-4" /> Gabarit
          </button>
          <label className={`${secondary} w-full cursor-pointer justify-center lg:w-auto`}>
            <Upload className="h-4 w-4" /> {importingEquipements ? "Import…" : "Importer"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importingEquipements}
              onChange={(e) => void handleEquipementsFile(e)}
              aria-label="Fichier d'inventaire des équipements à importer"
            />
          </label>
        </div>

        {/* Liste / Tableau */}
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : equipements.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            Aucun équipement ne correspond aux filtres.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Code complet</th>
                  <th className="p-3">Désignation</th>
                  <th className="p-3">Catégorie</th>
                  <th className="p-3">Localisation</th>
                  <th className="p-3">Année</th>
                  <th className="p-3">État</th>
                  <th className="p-3">Maintenance</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipements.map((eq) => (
                  <tr key={String(eq.id)} className="hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs font-bold text-primary">
                      {eq.code_complet}
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{eq.nom_commun}</p>
                      {(eq.marque || eq.modele) && (
                        <p className="text-xs text-muted-foreground">
                          {[eq.marque, eq.modele].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {eq.categorie ? (
                        <span className="rounded bg-sky-100 px-2 py-0.5 font-bold text-sky-800">
                          {eq.categorie.code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      {eq.localisation ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                          {eq.localisation.code}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3 text-xs">{eq.annee_acquisition ?? "—"}</td>
                    <td className="p-3">
                      <span className={statusBadge(eq.etat)}>
                        {eq.etat === "tres_bon"
                          ? "Très bon"
                          : eq.etat === "bon"
                            ? "Bon"
                            : "Mauvais"}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {eq.necessite_maintenance ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <Wrench className="h-3 w-3" /> Tous les{" "}
                          {eq.frequence_maintenance_jours ?? 90}j
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Non requise</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded p-1 hover:bg-background"
                          title="Enregistrer un transfert"
                          onClick={() => setTransferItem(eq)}
                        >
                          <Send className="h-4 w-4 text-sky-600" />
                        </button>
                        <button
                          className="rounded p-1 hover:bg-background"
                          title="Historique des transferts"
                          onClick={() => setHistoryItem(eq)}
                        >
                          <History className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          className="rounded p-1 hover:bg-background"
                          title="Modifier"
                          onClick={() => openEdit(eq)}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          className="rounded p-1 hover:bg-background"
                          title="Supprimer"
                          onClick={() => setConfirmDeleteId(eq.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Modal Création / Modification Équipement */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {editingItem ? "Modifier l'équipement" : "Nouvel équipement dans l'inventaire"}
                </h3>
                <p className={muted}>
                  Renseignez les caractéristiques techniques et de traçabilité.
                </p>
              </div>
              <button onClick={() => setFormOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nom commun (ex: Imprimante laser)"
                value={nomCommun}
                onChange={setNomCommun}
                required
              />
              <TextField
                label="Code complet (laisser vide pour calcul auto)"
                value={codeComplet}
                onChange={setCodeComplet}
                placeholder="Ex: BEG/INF/IMP/DIR/001/2026"
              />
              <SelectField label="Catégorie" value={categorieId} onChange={setCategorieId} required>
                <option value="">Sélectionner une catégorie</option>
                {categories.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.code} — {c.libelle}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Localisation"
                value={localisationId}
                onChange={setLocalisationId}
                required
              >
                <option value="">Sélectionner une localisation</option>
                {locations.map((l) => (
                  <option key={String(l.id)} value={String(l.id)}>
                    {l.code} — {l.libelle}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Année d'acquisition"
                type="number"
                value={String(annee)}
                onChange={(v) => setAnnee(Number(v))}
                required
              />
              <SelectField
                label="État initial"
                value={etat}
                onChange={(v) => setEtat(v as "tres_bon" | "bon" | "mauvais")}
                required
              >
                <option value="tres_bon">Très bon état</option>
                <option value="bon">Bon état</option>
                <option value="mauvais">Mauvais état</option>
              </SelectField>
              <TextField
                label="Marque"
                value={marque}
                onChange={setMarque}
                placeholder="Ex: HP, Dell..."
              />
              <TextField
                label="Modèle"
                value={modele}
                onChange={setModele}
                placeholder="Ex: LaserJet Pro..."
              />
              <TextField label="Numéro de série" value={numSerie} onChange={setNumSerie} />
              <TextField
                label="Valeur d'acquisition (FCFA)"
                type="number"
                value={valeur}
                onChange={setValeur}
              />
              <div className="sm:col-span-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={necessiteMaint}
                    onChange={(e) => setNecessiteMaint(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary"
                  />
                  Cet équipement nécessite un plan de maintenance régulier
                </label>
                {necessiteMaint && (
                  <div className="mt-3">
                    <TextField
                      label="Périodicité de maintenance (en jours)"
                      type="number"
                      value={String(freqMaint)}
                      onChange={(v) => setFreqMaint(Number(v))}
                    />
                  </div>
                )}
              </div>
              <TextAreaField
                label="Observations / Caractéristiques particulières"
                value={observations}
                onChange={setObservations}
                span
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setFormOpen(false)}>
                Annuler
              </button>
              <button
                className={primary}
                onClick={() => void handleSave()}
                disabled={save.isPending}
              >
                {save.isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transfert Équipement */}
      {transferItem && (
        <TransferModal
          equipement={transferItem}
          siteId={siteId}
          onClose={() => setTransferItem(null)}
        />
      )}

      {/* Modal Historique des Transferts */}
      {historyItem && (
        <TransferHistoryModal equipement={historyItem} onClose={() => setHistoryItem(null)} />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cet équipement ?"
        description="L'équipement et ses historiques de maintenance seront retirés de l'inventaire."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// ============================================================================
// MODAL TRANSFERT D'ÉQUIPEMENT
// ============================================================================

function TransferModal({
  equipement,
  siteId,
  onClose,
}: {
  equipement: Equipement;
  siteId?: string | undefined;
  onClose: () => void;
}) {
  const { data: sites = [] } = useSupportSites();
  const { data: locations = [] } = useCodifications("localisation");
  const { data: profile } = useQuery({
    queryKey: ["auth-profile-for-transfer"],
    queryFn: backendApi.auth.me,
    staleTime: 5 * 60_000,
  });
  const enterpriseId = profile?.enterprise_id;
  const { data: transferReasons = [], isLoading: transferReasonsLoading } = useQuery({
    queryKey: ["transfer-reasons", enterpriseId ?? "none"],
    queryFn: () => fetchTransferReasons(enterpriseId as string | number),
    enabled: Boolean(enterpriseId),
    staleTime: 5 * 60_000,
  });
  const { transfer } = useEquipementMutations();

  const [targetSiteId, setTargetSiteId] = useState(siteId ?? "");
  const [targetLocId, setTargetLocId] = useState("");
  const [reasonCode, setReasonCode] = useState("transfer_site");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (
      transferReasons.length > 0 &&
      !transferReasons.some((reason) => reason.code === reasonCode)
    ) {
      const firstReason = transferReasons[0];
      if (firstReason) setReasonCode(firstReason.code);
    }
  }, [reasonCode, transferReasons]);

  const handleSubmit = async () => {
    if (!targetSiteId || !targetLocId) {
      toast.error("Veuillez sélectionner le site et la localisation de destination.");
      return;
    }
    if (
      !reasonCode ||
      transferReasonsLoading ||
      !transferReasons.some((reason) => reason.code === reasonCode)
    ) {
      toast.error("Sélectionnez un motif de transfert valide.");
      return;
    }
    try {
      await transfer.mutateAsync({
        id: equipement.id,
        payload: {
          new_site_id: Number(targetSiteId),
          new_localisation_id: Number(targetLocId),
          transfer_reason_code: reasonCode,
          transfer_notes: notes.trim() || undefined,
        },
      });
      toast.success("Transfert de l'équipement enregistré.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec du transfert de l'équipement."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} w-full max-w-lg p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Transfert d'équipement</h3>
            <p className="text-xs text-muted-foreground font-mono">
              {equipement.code_complet} — {equipement.nom_commun}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <SelectField
            label="Nouveau site de destination"
            value={targetSiteId}
            onChange={setTargetSiteId}
            required
          >
            <option value="">Sélectionner un site</option>
            {sites.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Nouvelle localisation physique"
            value={targetLocId}
            onChange={setTargetLocId}
            required
          >
            <option value="">Sélectionner une localisation</option>
            {locations.map((l) => (
              <option key={String(l.id)} value={String(l.id)}>
                {l.code} — {l.libelle}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Motif du transfert"
            value={reasonCode}
            onChange={setReasonCode}
            required
          >
            <option value="">Sélectionner un motif</option>
            {transferReasons.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Notes / Justificatif"
            value={notes}
            onChange={setNotes}
            placeholder="Détails du déplacement..."
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            className={primary}
            onClick={() => void handleSubmit()}
            disabled={transfer.isPending}
          >
            {transfer.isPending ? "Transfert en cours..." : "Confirmer le transfert"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL HISTORIQUE DES TRANSFERTS
// ============================================================================

function TransferHistoryModal({
  equipement,
  onClose,
}: {
  equipement: Equipement;
  onClose: () => void;
}) {
  const [transfers, setTransfers] = useState<EquipementTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useState(() => {
    backendApi
      .request<unknown>(`equipements/${equipement.id}/transfers`)
      .then((payload) => {
        const root =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const items = Array.isArray(payload)
          ? payload
          : Array.isArray(root["data"])
            ? root["data"]
            : [];
        setTransfers(items as EquipementTransfer[]);
      })
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} max-h-[85dvh] w-full max-w-xl overflow-y-auto p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Historique des transferts</h3>
            <p className="text-xs text-muted-foreground font-mono">
              {equipement.code_complet} — {equipement.nom_commun}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-5">
          {loading ? (
            <PageSkeleton rows={3} />
          ) : transfers.length === 0 ? (
            <p className={`py-8 text-center ${muted}`}>
              Aucun transfert enregistré pour cet équipement.
            </p>
          ) : (
            <div className="relative border-l-2 border-primary/20 ml-3 space-y-6 py-2">
              {transfers.map((t) => (
                <div key={String(t.id)} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-primary" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {t.previous_site?.name ?? "Site initial"} →{" "}
                      {t.new_site?.name ?? "Nouveau site"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateFR(t.transferred_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Localisation : {t.new_localisation?.libelle ?? "—"} · Motif :{" "}
                    {t.transfer_reason_code ?? t.transfer_reason?.name ?? "Non précisé"}
                  </p>
                  {t.transfer_notes && (
                    <p className="mt-1 rounded bg-muted/40 p-2 text-xs italic">
                      {t.transfer_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <button className={secondary} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ÉTAPE 3 : PLAN DE MAINTENANCE
// ============================================================================

function MaintenanceStep({ siteId }: { siteId?: string }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statutFilter, setStatutFilter] = useState("all");

  const { data: maintenances = [], isLoading, refetch } = useMaintenances({
    site_id: siteId,
    type: typeFilter,
    statut: statutFilter,
  });

  const { data: alertes = [] } = useMaintenanceAlertes(siteId);
  const { data: equipements = [] } = useEquipements({ site_id: siteId });
  const { save, remove } = useMaintenanceMutations();

  // Dialogues
  const [planOpen, setPlanOpen] = useState(false);
  const [suiviItem, setSuiviItem] = useState<Maintenance | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [importingMaintenances, setImportingMaintenances] = useState(false);

  // Formulaire planification
  const [equipementId, setEquipementId] = useState("");
  const [typeMaint, setTypeMaint] = useState<"preventive" | "corrective" | "etalonnage">(
    "preventive",
  );
  const [datePrevue, setDatePrevue] = useState(new Date().toISOString().slice(0, 10));
  const [responsable, setResponsable] = useState("");
  const [description, setDescription] = useState("");

  const openPlan = () => {
    setEquipementId(equipements[0]?.id ? String(equipements[0].id) : "");
    setTypeMaint("preventive");
    setDatePrevue(new Date().toISOString().slice(0, 10));
    setResponsable("");
    setDescription("");
    setPlanOpen(true);
  };

  const handleSavePlan = async () => {
    if (!equipementId || !datePrevue) {
      toast.error("Veuillez sélectionner l'équipement et la date prévue.");
      return;
    }
    try {
      await save.mutateAsync({
        payload: {
          equipement_id: Number(equipementId),
          type: typeMaint,
          date_prevue: datePrevue,
          statut: "planifie",
          responsable: responsable.trim() || undefined,
          description: description.trim() || undefined,
          ...(siteId ? { site_id: Number(siteId) } : {}),
        },
      });
      toast.success("Intervention de maintenance planifiée.");
      setPlanOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la planification."));
    }
  };

  const handleExport = async () => {
    try {
      const blob = await backendApi.blob(
        `maintenances/export${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`,
      );
      await downloadBlobResponse(
        blob,
        `plan_maintenance_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Plan de maintenance exporté avec succès.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'exporter le plan de maintenance."));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await backendApi.blob("maintenances/template");
      await downloadBlobResponse(blob, "modele_import_maintenances.xlsx");
      toast.success("Gabarit de maintenance téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de télécharger le gabarit."));
    }
  };

  const handleMaintenancesFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingMaintenances(true);
    try {
      const result = await importMaintenancesFile(file);
      const summary = result.summary;
      if (summary.failed > 0) {
        toast.warning(
          `Import partiel : ${summary.created} créée(s), ${summary.failed} erreur(s).`,
        );
      } else {
        toast.success(`Import réussi : ${summary.created} maintenance(s) créée(s).`);
      }
      void refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Import des maintenances impossible."));
    } finally {
      setImportingMaintenances(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Intervention supprimée.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de supprimer l'intervention."));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  // KPIs
  const total = maintenances.length;
  const preventives = maintenances.filter((m) => m.type === "preventive").length;
  const correctives = maintenances.filter((m) => m.type === "corrective").length;
  const etalonnages = maintenances.filter((m) => m.type === "etalonnage").length;
  const realisees = maintenances.filter((m) => m.statut === "realise").length;

  return (
    <div className="space-y-6">
      {/* Bandeau d'Alertes de Maintenance */}
      {alertes.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 font-bold text-red-800">
            <AlertTriangle className="h-5 w-5" />
            <span>{alertes.length} alerte(s) de maintenance à traiter</span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alertes.slice(0, 6).map((a) => (
              <div
                key={String(a.id)}
                className="flex items-center justify-between rounded-xl bg-white p-2.5 text-xs shadow-sm"
              >
                <div>
                  <span className="font-bold text-foreground">
                    {a.equipement_code ?? "Équipement"}
                  </span>
                  <p className="text-muted-foreground">{a.equipement_nom ?? a.type}</p>
                </div>
                <span className={statusBadge(a.niveau_alerte)}>
                  {a.jours_restants < 0
                    ? `${Math.abs(a.jours_restants)}j de retard`
                    : a.jours_restants === 0
                      ? "Aujourd'hui"
                      : `Sous ${a.jours_restants}j`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total interventions" value={total} tone="text-foreground" />
        <Stat label="Préventives" value={preventives} tone="text-sky-600" />
        <Stat label="Correctives" value={correctives} tone="text-amber-600" />
        <Stat label="Étalonnages" value={etalonnages} tone="text-indigo-600" />
        <Stat label="Réalisées" value={realisees} tone="text-emerald-600" />
      </div>

      {/* Outils et Filtres */}
      <div className={`${card} min-w-0 space-y-4 p-4 sm:p-5`}>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-primary" />
              <span className="shrink-0 text-sm font-bold">Filtres</span>
            </div>
            <select
              className={`${input} w-full min-w-0`}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">Tous les types</option>
              <option value="preventive">Préventive</option>
              <option value="corrective">Corrective</option>
              <option value="etalonnage">Étalonnage</option>
            </select>
            <select
              className={`${input} w-full min-w-0`}
              value={statutFilter}
              onChange={(e) => setStatutFilter(e.target.value)}
            >
              <option value="all">Tous les statuts</option>
              <option value="planifie">Planifiée</option>
              <option value="en_cours">En cours</option>
              <option value="realise">Réalisée</option>
              <option value="reporte">Reportée</option>
              <option value="annule">Annulée</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              className={`${secondary} w-full justify-center sm:w-auto`}
              onClick={() => void handleDownloadTemplate()}
              title="Télécharger le modèle Excel"
            >
              <Download className="h-4 w-4" /> Gabarit
            </button>
            <label
              className={`${secondary} w-full cursor-pointer justify-center sm:w-auto`}
              title="Importer des maintenances (XLSX)"
            >
              <Upload className="h-4 w-4" />{" "}
              {importingMaintenances ? "Import…" : "Importer"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={importingMaintenances}
                onChange={(e) => void handleMaintenancesFile(e)}
                aria-label="Fichier de maintenances à importer"
              />
            </label>
            <button
              className={`${secondary} w-full justify-center sm:w-auto`}
              onClick={() => void handleExport()}
              title="Exporter le plan complet en XLSX"
            >
              <FileDown className="h-4 w-4" /> Exporter XLSX
            </button>
            <button className={`${primary} w-full justify-center sm:w-auto`} onClick={openPlan}>
              <Plus className="h-4 w-4" /> Planifier
            </button>
          </div>
        </div>

        {/* Tableau des Maintenances */}
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : maintenances.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            Aucune intervention de maintenance enregistrée.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Équipement</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Date prévue</th>
                  <th className="p-3">Date réalisée</th>
                  <th className="p-3">Responsable</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {maintenances.map((m) => (
                  <tr key={String(m.id)} className="hover:bg-muted/20">
                    <td className="p-3">
                      <p className="font-mono text-xs font-bold text-primary">
                        {m.equipement?.code_complet ?? `EQP-${m.equipement_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.equipement?.nom_commun}</p>
                    </td>
                    <td className="p-3 text-xs font-semibold capitalize">{m.type}</td>
                    <td className="p-3 text-xs font-mono">{formatDateFR(m.date_prevue)}</td>
                    <td className="p-3 text-xs font-mono">
                      {m.date_realisee ? formatDateFR(m.date_realisee) : "—"}
                    </td>
                    <td className="p-3 text-xs">{m.responsable ?? "—"}</td>
                    <td className="p-3">
                      <span className={statusBadge(m.statut)}>{statusLabel(m.statut)}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className={secondary}
                          style={{ height: "30px", padding: "0 10px" }}
                          onClick={() => setSuiviItem(m)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Suivre
                        </button>
                        <button
                          className="rounded p-1.5 hover:bg-background"
                          onClick={() => setConfirmDeleteId(m.id)}
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Modal Planifier Maintenance */}
      {planOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-bold">Planifier une maintenance</h3>
              <button onClick={() => setPlanOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <SelectField
                label="Équipement cible"
                value={equipementId}
                onChange={setEquipementId}
                required
              >
                <option value="">Sélectionner un équipement</option>
                {equipements.map((eq) => (
                  <option key={String(eq.id)} value={String(eq.id)}>
                    {eq.code_complet} — {eq.nom_commun}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Type d'intervention"
                value={typeMaint}
                onChange={(v) => setTypeMaint(v as "preventive" | "corrective" | "etalonnage")}
                required
              >
                <option value="preventive">Maintenance préventive</option>
                <option value="corrective">Maintenance corrective</option>
                <option value="etalonnage">Étalonnage / Métrologie</option>
              </SelectField>
              <TextField
                label="Date prévue"
                type="date"
                value={datePrevue}
                onChange={setDatePrevue}
                required
              />
              <TextField
                label="Intervenant / Responsable"
                value={responsable}
                onChange={setResponsable}
                placeholder="Ex: Service technique, Technicien..."
              />
              <TextAreaField
                label="Description des travaux"
                value={description}
                onChange={setDescription}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setPlanOpen(false)}>
                Annuler
              </button>
              <button
                className={primary}
                onClick={() => void handleSavePlan()}
                disabled={save.isPending}
              >
                {save.isPending ? "Planification..." : "Planifier"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Suivi d'intervention */}
      {suiviItem && (
        <SuiviMaintenanceModal maintenance={suiviItem} onClose={() => setSuiviItem(null)} />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cette intervention ?"
        description="L'intervention sera définitivement supprimée du plan de maintenance."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// ============================================================================
// MODAL SUIVI D'INTERVENTION DE MAINTENANCE
// ============================================================================

function SuiviMaintenanceModal({
  maintenance,
  onClose,
}: {
  maintenance: Maintenance;
  onClose: () => void;
}) {
  const [action, setAction] = useState<"realise" | "reporte">("realise");
  const [dateAction, setDateAction] = useState(new Date().toISOString().slice(0, 10));
  const [nouvelleDate, setNouvelleDate] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (action === "reporte" && !nouvelleDate) {
      toast.error("Veuillez indiquer la nouvelle date prévue pour le report.");
      return;
    }
    if (action === "reporte" && nouvelleDate <= dateAction) {
      toast.error("La nouvelle date doit être postérieure à la date d'action.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("action", action);
      formData.append("date_action", dateAction);
      if (action === "reporte") {
        formData.append("nouvelle_date_prevue", nouvelleDate);
      }
      if (commentaire.trim()) {
        formData.append("commentaire", commentaire.trim());
      }
      await backendApi.request(`maintenances/${maintenance.id}/suivre`, {
        method: "POST",
        body: formData,
      });
      toast.success(
        action === "realise" ? "Maintenance marquée comme réalisée." : "Maintenance reportée.",
      );
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement du suivi."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} w-full max-w-lg p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Suivi de maintenance</h3>
            <p className="text-xs text-muted-foreground font-mono">
              {maintenance.equipement?.code_complet} · Prévue le{" "}
              {formatDateFR(maintenance.date_prevue)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <div className="flex gap-4 border-b border-border pb-3">
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="radio"
                name="suivi_action"
                value="realise"
                checked={action === "realise"}
                onChange={() => setAction("realise")}
                className="text-primary"
              />
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Intervention réalisée
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
              <input
                type="radio"
                name="suivi_action"
                value="reporte"
                checked={action === "reporte"}
                onChange={() => setAction("reporte")}
                className="text-primary"
              />
              <Clock className="h-4 w-4 text-amber-600" />
              Reporter l'intervention
            </label>
          </div>

          <TextField
            label={action === "realise" ? "Date de réalisation" : "Date de décision du report"}
            type="date"
            value={dateAction}
            onChange={setDateAction}
            required
          />

          {action === "reporte" && (
            <TextField
              label="Nouvelle date d'intervention prévue"
              type="date"
              value={nouvelleDate}
              onChange={setNouvelleDate}
              required
            />
          )}

          <TextAreaField
            label="Commentaires / Rapport d'intervention"
            value={commentaire}
            onChange={setCommentaire}
            placeholder={
              action === "realise"
                ? "Détails des opérations effectuées, pièces remplacées..."
                : "Motif du report..."
            }
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button className={primary} onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "Enregistrement..." : "Enregistrer le suivi"}
          </button>
        </div>
      </div>
    </div>
  );
}
