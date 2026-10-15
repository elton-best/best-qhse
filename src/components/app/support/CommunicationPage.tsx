import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Grid,
  List,
  Megaphone,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import { backendApi } from "@/integrations/backend/client";
import { useCollaborators } from "@/integrations/backend/leadership";
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
  input,
  muted,
  primary,
  secondary,
  statusBadge,
  statusLabel,
  formatDateFR,
} from "@/components/app/support/shared";
import {
  downloadBlobResponse,
  downloadCommunicationsTemplate,
  importCommunicationsFile,
  useCommunicationMutations,
  useCommunicationPlans,
  useCommunicationStats,
  useCommunications,
  type Communication,
} from "@/integrations/backend/support";

export function CommunicationPage() {
  const [siteId] = useCurrentSite();
  const currentYear = new Date().getFullYear();

  // Filtres
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");

  // Données
  const {
    data: communications = [],
    isLoading,
    refetch,
  } = useCommunications({
    site_id: siteId || undefined,
    type: "communication",
    status: statusFilter,
    search: search || undefined,
    year: yearFilter || undefined,
  });

  const { data: stats } = useCommunicationStats(yearFilter, siteId || undefined, "communication");
  const { data: plans = [] } = useCommunicationPlans({
    site_id: siteId || undefined,
    year: yearFilter,
  });
  const { data: collaborators = [] } = useCollaborators(siteId ?? "");
  const { save, remove } = useCommunicationMutations();
  const queryClient = useQueryClient();
  const [importingPlan, setImportingPlan] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      await downloadCommunicationsTemplate();
      toast.success("Gabarit du plan de communication téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec du téléchargement du gabarit."));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportingPlan(true);
    try {
      const result = await importCommunicationsFile(file, yearFilter);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["communications"] }),
        queryClient.invalidateQueries({ queryKey: ["communications-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["communication-plans"] }),
      ]);
      toast.success(
        `Import terminé : ${result.created} création(s), ${result.updated} mise(s) à jour${result.skipped ? `, ${result.skipped} ignorée(s)` : ""}.`,
      );
    } catch (error) {
      toast.error(errorMessage(error, "Import du plan de communication impossible."));
    } finally {
      setImportingPlan(false);
    }
  };

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Communication | null>(null);
  const [detailsItem, setDetailsItem] = useState<Communication | null>(null);
  const [completeItem, setCompleteItem] = useState<Communication | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<Communication | null>(null);
  const [cancelItem, setCancelItem] = useState<Communication | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);

  // Formulaire
  const [designation, setDesignation] = useState("");
  const [cibles, setCibles] = useState("");
  const [moyens, setMoyens] = useState("");
  const [frequency, setFrequency] = useState<Communication["frequency"]>("ponctuelle");
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [organizerId, setOrganizerId] = useState("");
  const [cout, setCout] = useState("");
  const [observations, setObservations] = useState("");

  const currentPlan = plans.find((p) => Number(p.year) === yearFilter) ?? plans[0];

  const openCreate = () => {
    setEditingItem(null);
    setDesignation("");
    setCibles("");
    setMoyens("");
    setFrequency("ponctuelle");
    setDateDebut(new Date().toISOString().slice(0, 10));
    setDateFin(new Date().toISOString().slice(0, 10));
    setOrganizerId(collaborators[0]?.id ? String(collaborators[0].id) : "");
    setCout("");
    setObservations("");
    setFormOpen(true);
  };

  const openEdit = (c: Communication) => {
    setEditingItem(c);
    setDesignation(c.designation);
    setCibles(Array.isArray(c.cibles) ? c.cibles.join(", ") : "");
    setMoyens(Array.isArray(c.moyens) ? c.moyens.join(", ") : "");
    setFrequency(c.frequency);
    setDateDebut(c.date_debut ?? new Date().toISOString().slice(0, 10));
    setDateFin(c.date_fin ?? new Date().toISOString().slice(0, 10));
    setOrganizerId(c.organizer_user_id ? String(c.organizer_user_id) : "");
    setCout(c.cout ? String(c.cout) : "");
    setObservations(c.observations ?? "");
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!designation.trim()) {
      toast.error("L'objet ou le thème de la communication est obligatoire.");
      return;
    }
    if (!organizerId) {
      toast.error("Sélectionnez le responsable de la communication.");
      return;
    }
    if (!dateDebut || !dateFin || dateFin < dateDebut) {
      toast.error("Les dates de début et de fin sont obligatoires et cohérentes.");
      return;
    }
    try {
      const ciblesArray = cibles
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const moyensArray = moyens
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ciblesArray.length === 0 || moyensArray.length === 0) {
        toast.error("Renseignez au moins une cible et un moyen de communication.");
        return;
      }

      const payload: Record<string, unknown> = {
        type: "communication",
        designation: designation.trim(),
        period_mode: frequency === "ponctuelle" ? "custom" : "standard",
        frequency,
        dateDebut,
        dateFin,
        cibles: ciblesArray,
        moyens: moyensArray,
        chronogramme: Array.from({ length: 12 }, () => false),
        cout: cout ? Number(cout) : 0,
        organizer_user_id: organizerId ? Number(organizerId) : undefined,
        responsible_user_id: organizerId ? Number(organizerId) : undefined,
        observations: observations.trim() || undefined,
        plan_year: yearFilter,
        ...(siteId ? { site_id: Number(siteId) } : {}),
      };

      await save.mutateAsync({ id: editingItem?.id, payload });
      toast.success(
        editingItem
          ? "Action de communication mise à jour."
          : "Communication planifiée avec succès.",
      );
      setFormOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de l'action de communication."));
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Action de communication supprimée.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de supprimer cette action."));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const q = new URLSearchParams();
      q.set("type", "communication");
      if (siteId) q.set("site_id", siteId);
      if (yearFilter) q.set("year", String(yearFilter));
      const res = await fetch(`/api/v1/communications/export?${q.toString()}`, {
        headers: {
          Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Échec du téléchargement");
      const blob = await res.blob();
      await downloadBlobResponse(blob, `plan_communication_${yearFilter}.xlsx`);
      toast.success("Export Excel téléchargé avec succès.");
    } catch {
      toast.error("Erreur lors de l'export du plan de communication.");
    }
  };

  const filtered = communications.filter((c) => {
    if (frequencyFilter !== "all" && c.frequency !== frequencyFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <Header
        eyebrow="Support — ISO 9001 §7.4"
        title="Communication"
        description="Planification et suivi des communications internes et externes relatives au SMQ / QHSE"
        icon={Megaphone}
      />

      <SiteNotice siteId={siteId} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total communications" value={stats?.total ?? filtered.length} />
        <Stat label="Réalisées" value={stats?.realisees ?? 0} />
        <Stat label="Taux de réalisation" value={`${stats?.taux_realisation ?? 0} %`} />
        <Stat label="En retard / Alertes" value={stats?.en_retard ?? 0} />
      </div>

      {/* Plan Annuel Synthèse */}
      <div
        className={`${card} p-5 flex flex-wrap items-center justify-between gap-4 bg-muted/20 border-border`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <span className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Plan Annuel de Communication {yearFilter}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {currentPlan ? `Statut : ${currentPlan.status}` : "Non verrouillé"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Canaux, cibles et diffusion de l'information documentée et des performances QHSE
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Budget alloué</p>
            <p className="font-semibold text-sm">
              {stats?.budget_total ? `${stats.budget_total.toLocaleString("fr-FR")} FCFA` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Budget consommé</p>
            <p className="font-semibold text-sm text-emerald-600">
              {stats?.budget_consomme
                ? `${stats.budget_consomme.toLocaleString("fr-FR")} FCFA`
                : "0 FCFA"}
            </p>
          </div>
          <button className={secondary} onClick={() => void handleExport()}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Exporter plan annuel
          </button>
          <button className={secondary} onClick={() => void handleDownloadTemplate()}>
            <Download className="h-4 w-4 text-primary" />
            Gabarit
          </button>
          <label className={`${secondary} cursor-pointer`}>
            <Plus className="h-4 w-4 text-primary" />
            {importingPlan ? "Import…" : "Importer"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={importingPlan}
              onChange={(e) => void handleImportFile(e)}
              aria-label="Fichier du plan de communication à importer"
            />
          </label>
        </div>
      </div>

      {/* Barre d'outils et filtres */}
      <div className={`${card} min-w-0 space-y-4 p-4 sm:p-5`}>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par objet, cible, canal..."
                className={`${input} w-full min-w-0 pl-9`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${input} w-full min-w-0`}
            >
              <option value="all">Tous les statuts</option>
              <option value="planifiee">Planifiée</option>
              <option value="en_attente">En attente</option>
              <option value="realisee">Réalisée</option>
              <option value="replanifiee">Replanifiée</option>
              <option value="annulee">Annulée</option>
            </select>
            <select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
              className={`${input} w-full min-w-0`}
            >
              <option value="all">Toutes fréquences</option>
              <option value="ponctuelle">Ponctuelle</option>
              <option value="mensuelle">Mensuelle</option>
              <option value="trimestrielle">Trimestrielle</option>
              <option value="semestrielle">Semestrielle</option>
              <option value="annuelle">Annuelle</option>
            </select>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value))}
              className={`${input} w-full min-w-0`}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
            <div className="flex rounded-lg border border-border p-1 bg-muted/20">
              <button
                className={`p-1.5 rounded ${viewMode === "table" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"}`}
                onClick={() => setViewMode("table")}
                title="Vue Tableau"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                className={`p-1.5 rounded ${viewMode === "grid" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"}`}
                onClick={() => setViewMode("grid")}
                title="Vue Grille"
              >
                <Grid className="h-4 w-4" />
              </button>
            </div>
            <button
              className={`${secondary} w-full justify-center sm:w-auto`}
              onClick={() => void refetch()}
              title="Actualiser"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              className={`${primary} col-span-2 w-full justify-center sm:col-span-1 sm:w-auto`}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              Nouvelle communication
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {isLoading ? (
        <PageSkeleton />
      ) : filtered.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-display text-base font-semibold">
            Aucune action de communication trouvée
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Planifiez des campagnes d'affichage, des réunions d'information ou des bulletins
            internes QHSE.
          </p>
          <button className={`${primary} mt-4`} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Créer une communication
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={String(c.id)}
              className={`${card} p-5 space-y-4 hover:border-primary/50 transition-colors`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-mono font-semibold text-primary uppercase">
                    #{c.numero ?? c.id}
                  </span>
                  <h4 className="font-display font-bold text-base leading-snug">{c.designation}</h4>
                </div>
                <span className={statusBadge(c.status)}>{statusLabel(c.status)}</span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">Période :</strong>{" "}
                  {formatDateFR(c.date_debut)} — {formatDateFR(c.date_fin)}
                </p>
                <p>
                  <strong className="text-foreground">Fréquence :</strong> {c.frequency}
                </p>
                {c.cibles && c.cibles.length > 0 && (
                  <p>
                    <strong className="text-foreground">Destinataires / Cibles :</strong>{" "}
                    {Array.isArray(c.cibles) ? c.cibles.join(", ") : c.cibles}
                  </p>
                )}
                {c.moyens && c.moyens.length > 0 && (
                  <p>
                    <strong className="text-foreground">Canaux / Supports :</strong>{" "}
                    {Array.isArray(c.moyens) ? c.moyens.join(", ") : c.moyens}
                  </p>
                )}
                {c.cout ? (
                  <p>
                    <strong className="text-foreground">Coût prévu :</strong>{" "}
                    {Number(c.cout).toLocaleString("fr-FR")} FCFA
                  </p>
                ) : null}
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <button
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  onClick={() => setDetailsItem(c)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Détails & preuves
                </button>
                <div className="flex items-center gap-1">
                  {c.status !== "realisee" && c.status !== "annulee" && (
                    <button
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => setCompleteItem(c)}
                      title="Valider la réalisation"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => openEdit(c)}
                    title="Modifier"
                  >
                    <PenLine className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteId(c.id)}
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Objet / Thème</th>
                <th className="px-4 py-3">Destinataires / Cibles</th>
                <th className="px-4 py-3">Canaux / Supports</th>
                <th className="px-4 py-3">Fréquence</th>
                <th className="px-4 py-3">Période</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={String(c.id)} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    #{c.numero ?? c.id}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div>{c.designation}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.cibles && c.cibles.length > 0
                      ? Array.isArray(c.cibles)
                        ? c.cibles.join(", ")
                        : c.cibles
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.moyens && c.moyens.length > 0
                      ? Array.isArray(c.moyens)
                        ? c.moyens.join(", ")
                        : c.moyens
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{c.frequency}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {formatDateFR(c.date_debut)} — {formatDateFR(c.date_fin)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={statusBadge(c.status)}>{statusLabel(c.status)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => setDetailsItem(c)}
                        title="Consulter les détails"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {c.status !== "realisee" && c.status !== "annulee" && (
                        <button
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => setCompleteItem(c)}
                          title="Valider la réalisation"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {c.status !== "realisee" && c.status !== "annulee" && (
                        <button
                          className="rounded p-1 text-amber-600 hover:bg-amber-50"
                          onClick={() => setRescheduleItem(c)}
                          title="Replanifier"
                        >
                          <Clock className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => openEdit(c)}
                        title="Modifier"
                      >
                        <PenLine className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(c.id)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Création / Modification */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {editingItem
                    ? "Modifier la communication"
                    : "Planifier une action de communication"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Information interne, flash QHSE ou communication externe
                </p>
              </div>
              <button onClick={() => setFormOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <TextField
                label="Objet / Thème de la communication"
                value={designation}
                onChange={setDesignation}
                required
                placeholder="Ex: Flash mensuel sécurité, Diffusion de la politique qualité..."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Fréquence"
                  value={frequency}
                  onChange={(v) => setFrequency(v as Communication["frequency"])}
                  required
                >
                  <option value="ponctuelle">Ponctuelle</option>
                  <option value="mensuelle">Mensuelle</option>
                  <option value="trimestrielle">Trimestrielle</option>
                  <option value="semestrielle">Semestrielle</option>
                  <option value="annuelle">Annuelle</option>
                </SelectField>

                <SelectField
                  label="Responsable de diffusion"
                  value={organizerId}
                  onChange={setOrganizerId}
                  required
                >
                  <option value="">Sélectionner un collaborateur</option>
                  {collaborators.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  label="Date de début"
                  type="date"
                  value={dateDebut}
                  onChange={setDateDebut}
                  required
                />
                <TextField
                  label="Date de fin"
                  type="date"
                  value={dateFin}
                  onChange={setDateFin}
                  required
                />
              </div>

              <TextField
                label="Destinataires / Publics cibles (séparés par des virgules)"
                value={cibles}
                onChange={setCibles}
                placeholder="Ex: Direction, Tous les collaborateurs, Fournisseurs..."
              />

              <TextField
                label="Canaux / Supports de diffusion (séparés par des virgules)"
                value={moyens}
                onChange={setMoyens}
                placeholder="Ex: E-mail, Panneau d'affichage, Réunion d'équipe, Intranet..."
              />

              <TextField
                label="Budget prévisionnel (FCFA)"
                type="number"
                value={cout}
                onChange={setCout}
                placeholder="Ex: 25000"
              />

              <TextAreaField
                label="Détails du message et observations"
                value={observations}
                onChange={setObservations}
                placeholder="Points clés abordés, pièces jointes prévues, liens..."
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

      {/* Modal Détails & Preuves */}
      {detailsItem && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono font-semibold text-primary">
                  #{detailsItem.numero ?? detailsItem.id}
                </span>
                <h3 className="font-display text-lg font-bold">{detailsItem.designation}</h3>
              </div>
              <button onClick={() => setDetailsItem(null)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Statut actuel :</span>
                <span className={statusBadge(detailsItem.status)}>
                  {statusLabel(detailsItem.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-muted-foreground">Période</p>
                  <p className="font-semibold">
                    {formatDateFR(detailsItem.date_debut)} — {formatDateFR(detailsItem.date_fin)}
                  </p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg">
                  <p className="text-muted-foreground">Fréquence</p>
                  <p className="font-semibold capitalize">{detailsItem.frequency}</p>
                </div>
              </div>

              {detailsItem.observations && (
                <div className="text-xs">
                  <p className="font-semibold mb-1">Détails :</p>
                  <p className="text-muted-foreground bg-muted/20 p-3 rounded-lg">
                    {detailsItem.observations}
                  </p>
                </div>
              )}

              {/* Preuves */}
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">
                  Preuves de diffusion
                </h4>
                {detailsItem.proofs && detailsItem.proofs.length > 0 ? (
                  <div className="space-y-2">
                    {detailsItem.proofs.map((proof) => (
                      <div
                        key={String(proof.id)}
                        className="flex items-center justify-between p-2 rounded border border-border bg-muted/10 text-xs"
                      >
                        <span className="font-medium truncate">{proof.filename}</span>
                        <a
                          href={proof.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline font-semibold"
                        >
                          Télécharger
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Aucune preuve uploadée pour cette communication.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button className={secondary} onClick={() => setDetailsItem(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Valider Réalisation avec Preuve */}
      {completeItem && (
        <CompleteCommunicationModal
          communication={completeItem}
          onClose={() => setCompleteItem(null)}
        />
      )}

      {/* Modal Replanifier */}
      {rescheduleItem && (
        <RescheduleCommunicationModal
          communication={rescheduleItem}
          onClose={() => setRescheduleItem(null)}
        />
      )}

      {/* Modal Annuler */}
      {cancelItem && (
        <CancelCommunicationModal communication={cancelItem} onClose={() => setCancelItem(null)} />
      )}

      {/* Confirmation Suppression */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cette action de communication ?"
        description="Cette communication sera définitivement retirée du plan."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function CompleteCommunicationModal({
  communication,
  onClose,
}: {
  communication: Communication;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [dateRealisee, setDateRealisee] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Ajoutez au moins une preuve avant de clôturer la communication.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("date_realisee", dateRealisee);
      if (file) {
        formData.append("proofs[]", file);
      }
      await backendApi.request(`communications/${communication.id}/complete`, {
        method: "POST",
        body: formData,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["communications"] }),
        queryClient.invalidateQueries({ queryKey: ["communications-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["communication-plans"] }),
      ]);
      toast.success("Communication validée avec succès !");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la validation de la communication."));
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
      <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Confirmer la réalisation</h3>
            <p className="text-xs text-muted-foreground">{communication.designation}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <TextField
            label="Date de diffusion effective"
            type="date"
            value={dateRealisee}
            onChange={setDateRealisee}
            required
          />
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
              Preuve de diffusion (PV de réunion, capture, affiche, compte-rendu...)
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              className={input}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button className={primary} onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "Validation..." : "Valider la réalisation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleCommunicationModal({
  communication,
  onClose,
}: {
  communication: Communication;
  onClose: () => void;
}) {
  const [dateDebut, setDateDebut] = useState(
    communication.date_debut ?? new Date().toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(
    communication.date_fin ?? new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState("");
  const { reschedule } = useCommunicationMutations();

  const handleSubmit = async () => {
    if (!dateDebut || !dateFin || dateFin < dateDebut) {
      toast.error("Les dates de replanification sont obligatoires et cohérentes.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Le motif de replanification est obligatoire.");
      return;
    }
    try {
      await reschedule.mutateAsync({
        id: communication.id,
        payload: { date_debut: dateDebut, date_fin: dateFin, comment: reason.trim() },
      });
      toast.success("Communication replanifiée.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la replanification."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Replanifier la communication</h3>
            <p className="text-xs text-muted-foreground">{communication.designation}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <TextField
            label="Nouvelle date de début"
            type="date"
            value={dateDebut}
            onChange={setDateDebut}
            required
          />
          <TextField
            label="Nouvelle date de fin"
            type="date"
            value={dateFin}
            onChange={setDateFin}
            required
          />
          <TextAreaField
            label="Motif de replanification"
            value={reason}
            onChange={setReason}
            required
            placeholder="Ex: Report pour coordination avec la direction générale..."
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            className={primary}
            onClick={() => void handleSubmit()}
            disabled={reschedule.isPending}
          >
            {reschedule.isPending ? "Replanification..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelCommunicationModal({
  communication,
  onClose,
}: {
  communication: Communication;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { cancel } = useCommunicationMutations();

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Le motif d'annulation est obligatoire.");
      return;
    }
    try {
      await cancel.mutateAsync({ id: communication.id, reason: reason.trim() });
      toast.success("Communication annulée.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'annulation."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Annuler la communication</h3>
            <p className="text-xs text-muted-foreground">{communication.designation}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Motif d'annulation"
            value={reason}
            onChange={setReason}
            required
            placeholder="Expliquez la raison de l'annulation de cette communication..."
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Fermer
          </button>
          <button
            className={primary}
            onClick={() => void handleSubmit()}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? "Annulation..." : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}
