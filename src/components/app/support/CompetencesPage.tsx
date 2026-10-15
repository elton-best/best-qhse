import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  FileText,
  Filter,
  GraduationCap,
  History,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  UserCheck,
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
  historyActionLabelFR,
  useCompetenceMatrix,
  useFormationMutations,
  useFormationStats,
  useFormations,
  useGapAnalysis,
  useTrainingPlans,
  type CompetenceMatrixEntry,
  type Formation,
  type FormationInternalEvaluation,
  type FormationProof,
  type GapAnalysisItem,
  type TrainingPlan,
} from "@/integrations/backend/support";

type CompetenceTab = "formations" | "plans" | "matrix" | "gaps";

export function CompetencesPage() {
  const [siteId] = useCurrentSite();
  const [activeTab, setActiveTab] = useState<CompetenceTab>("formations");

  return (
    <div className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Support — ISO 9001 §7.2"
        title="Compétences & Formations"
        description="Catalogue et cycle de vie des formations, plan annuel prévisionnel, matrice des compétences requises/acquises et analyse des écarts."
        icon={GraduationCap}
      />

      {/* Navigation par onglets */}
      <div className="grid grid-cols-2 border-b border-border md:grid-cols-4">
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-4 ${
            activeTab === "formations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("formations")}
        >
          <GraduationCap className="h-4 w-4" />
          Formations
        </button>
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-4 ${
            activeTab === "plans"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("plans")}
        >
          <Calendar className="h-4 w-4" />
          Plan annuel de formation
        </button>
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-4 ${
            activeTab === "matrix"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("matrix")}
        >
          <UserCheck className="h-4 w-4" />
          Matrice des compétences
        </button>
        <button
          className={`flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-sm font-semibold leading-tight transition sm:px-4 ${
            activeTab === "gaps"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("gaps")}
        >
          <AlertCircle className="h-4 w-4" />
          Analyse des écarts
        </button>
      </div>

      {activeTab === "formations" && <FormationsTab siteId={siteId} />}
      {activeTab === "plans" && <TrainingPlansTab siteId={siteId} />}
      {activeTab === "matrix" && <CompetenceMatrixTab />}
      {activeTab === "gaps" && <GapAnalysisTab />}
    </div>
  );
}

// ============================================================================
// ONGLET 1 : FORMATIONS
// ============================================================================

function FormationsTab({ siteId }: { siteId?: string }) {
  const currentYear = new Date().getFullYear();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [freqFilter, setFreqFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState<number>(currentYear);

  const { data: formations = [], isLoading } = useFormations({
    site_id: siteId,
    status: statusFilter,
    frequency: freqFilter,
    search: search || undefined,
    year: yearFilter || undefined,
  });

  const { data: stats } = useFormationStats(yearFilter, siteId);
  const { data: collaborators = [] } = useCollaborators(siteId ?? "");
  const { save, remove } = useFormationMutations();

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Formation | null>(null);
  const [detailsItem, setDetailsItem] = useState<Formation | null>(null);
  const [completeItem, setCompleteItem] = useState<Formation | null>(null);
  const [rescheduleItem, setRescheduleItem] = useState<Formation | null>(null);
  const [cancelItem, setCancelItem] = useState<Formation | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);

  // Formulaire formation
  const [designation, setDesignation] = useState("");
  const [periodMode, setPeriodMode] = useState<"standard" | "custom">("custom");
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<Formation["frequency"]>("ponctuelle");
  const [cout, setCout] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [formateurType, setFormateurType] = useState<"interne" | "externe">("externe");
  const [formateurNom, setFormateurNom] = useState("");
  const [formateurUserId, setFormateurUserId] = useState("");
  const [targetUserIds, setTargetUserIds] = useState<number[]>([]);
  const [observations, setObservations] = useState("");

  const openCreate = () => {
    setEditingItem(null);
    setDesignation("");
    setPeriodMode("custom");
    setDateDebut(new Date().toISOString().slice(0, 10));
    setDateFin(new Date().toISOString().slice(0, 10));
    setFrequency("ponctuelle");
    setCout("");
    setOrganizerId(collaborators[0]?.id ? String(collaborators[0].id) : "");
    setFormateurType("externe");
    setFormateurNom("");
    setFormateurUserId("");
    setTargetUserIds([]);
    setObservations("");
    setFormOpen(true);
  };

  const openEdit = (f: Formation) => {
    setEditingItem(f);
    setDesignation(f.designation);
    setPeriodMode(f.period_mode);
    setDateDebut(f.date_debut ?? "");
    setDateFin(f.date_fin ?? "");
    setFrequency(f.frequency);
    setCout(f.cout ? String(f.cout) : "");
    setOrganizerId(f.organizer_user_id ? String(f.organizer_user_id) : "");
    setFormateurType(f.formateur_type ?? "externe");
    setFormateurNom(f.formateur ?? "");
    setFormateurUserId(f.formateur_user_id ? String(f.formateur_user_id) : "");
    setTargetUserIds((f.target_user_ids ?? []).map(Number));
    setObservations(f.observations ?? "");
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!designation.trim()) {
      toast.error("La désignation de la formation est obligatoire.");
      return;
    }
    if (targetUserIds.length === 0) {
      toast.error("Veuillez sélectionner au moins un collaborateur participant.");
      return;
    }
    if (!organizerId) {
      toast.error("Sélectionnez le responsable de l'organisation.");
      return;
    }
    if (formateurType === "interne" && !formateurUserId) {
      toast.error("Sélectionnez le formateur interne.");
      return;
    }
    if (formateurType === "externe" && !formateurNom.trim()) {
      toast.error("Renseignez le nom du formateur ou de l'organisme.");
      return;
    }
    if (!dateDebut || !dateFin || dateFin < dateDebut) {
      toast.error("Les dates de début et de fin sont obligatoires et cohérentes.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        designation: designation.trim(),
        period_mode: periodMode,
        dateDebut: dateDebut || undefined,
        dateFin: dateFin || undefined,
        frequency,
        chronogramme: Array.from({ length: 12 }, () => false),
        cout: cout ? Number(cout) : 0,
        organizer_user_id: organizerId ? Number(organizerId) : undefined,
        formateur_type: formateurType,
        formateur: formateurType === "externe" ? formateurNom.trim() : "Formateur interne",
        formateur_user_id:
          formateurType === "interne" && formateurUserId ? Number(formateurUserId) : null,
        target_user_ids: targetUserIds,
        observations: observations.trim() || undefined,
        plan_year: yearFilter,
        ...(siteId ? { site_id: Number(siteId) } : {}),
      };
      await save.mutateAsync({ id: editingItem?.id, payload });
      toast.success(editingItem ? "Formation mise à jour." : "Formation créée avec succès.");
      setFormOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de la formation."));
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Formation supprimée.");
    } catch (error) {
      toast.error(
        errorMessage(error, "Impossible de supprimer cette formation (déjà réalisée ou annulée)."),
      );
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const toggleTargetUser = (id: number) => {
    setTargetUserIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Total formations"
          value={stats?.total ?? formations.length}
          tone="text-foreground"
        />
        <Stat
          label="Réalisées"
          value={`${stats?.realisees ?? 0} (${stats?.taux_realisation ?? 0}%)`}
          tone="text-emerald-600"
        />
        <Stat label="En retard" value={stats?.en_retard ?? 0} tone="text-amber-600" />
        <Stat
          label="Budget consommé"
          value={`${(stats?.budget_consomme ?? 0).toLocaleString()} F`}
          tone="text-primary"
        />
        <Stat
          label="Budget annuel prévu"
          value={`${(stats?.budget_total ?? 0).toLocaleString()} F`}
          tone="text-muted-foreground"
        />
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
                placeholder="Rechercher par thème..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={`${input} w-full min-w-0`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Tous statuts</option>
              <option value="planifiee">Planifiée</option>
              <option value="en_attente">En attente / Retard</option>
              <option value="realisee">Réalisée</option>
              <option value="replanifiee">Replanifiée</option>
              <option value="annulee">Annulée</option>
            </select>
            <select
              className={`${input} w-full min-w-0`}
              value={freqFilter}
              onChange={(e) => setFreqFilter(e.target.value)}
            >
              <option value="all">Toutes fréquences</option>
              <option value="ponctuelle">Ponctuelle</option>
              <option value="annuelle">Annuelle</option>
              <option value="semestrielle">Semestrielle</option>
              <option value="trimestrielle">Trimestrielle</option>
            </select>
            <select
              className={`${input} w-full min-w-0`}
              value={yearFilter}
              onChange={(e) => setYearFilter(Number(e.target.value))}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {(search || statusFilter !== "all" || freqFilter !== "all") && (
              <button
                className={`${secondary} w-full justify-center sm:w-auto`}
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setFreqFilter("all");
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
          </div>
          <button className={`${primary} w-full justify-center lg:w-auto`} onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouvelle formation
          </button>
        </div>

        {/* Liste / Tableau */}
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : formations.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            Aucune formation enregistrée pour cette sélection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Thème / Désignation</th>
                  <th className="p-3">Dates</th>
                  <th className="p-3">Participants</th>
                  <th className="p-3">Formateur</th>
                  <th className="p-3">Coût (FCFA)</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {formations.map((f) => (
                  <tr key={String(f.id)} className="hover:bg-muted/20">
                    <td className="p-3">
                      <p className="font-semibold text-foreground">{f.designation}</p>
                      <span className="text-xs text-muted-foreground capitalize">
                        {f.frequency}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-mono">
                      {f.date_debut ? formatDateFR(f.date_debut) : "À planifier"}
                      {f.date_fin && f.date_fin !== f.date_debut
                        ? ` → ${formatDateFR(f.date_fin)}`
                        : ""}
                    </td>
                    <td className="p-3 text-xs">
                      <span className="rounded bg-sky-100 px-2 py-0.5 font-bold text-sky-800">
                        {f.target_user_ids?.length ?? f.cibles?.length ?? 0} pers.
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {f.formateur_type === "interne" ? "Interne" : f.formateur || "Externe"}
                    </td>
                    <td className="p-3 text-xs font-mono">
                      {f.cout ? `${f.cout.toLocaleString()} F` : "—"}
                    </td>
                    <td className="p-3">
                      <span className={statusBadge(f.status)}>{statusLabel(f.status)}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded p-1.5 hover:bg-background"
                          title="Fiche détaillée & Preuves"
                          onClick={() => setDetailsItem(f)}
                        >
                          <Info className="h-4 w-4 text-primary" />
                        </button>
                        {f.status !== "realisee" && f.status !== "annulee" && (
                          <>
                            <button
                              className="rounded p-1.5 hover:bg-background"
                              title="Marquer comme réalisée"
                              onClick={() => setCompleteItem(f)}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </button>
                            <button
                              className="rounded p-1.5 hover:bg-background"
                              title="Replanifier"
                              onClick={() => setRescheduleItem(f)}
                            >
                              <Clock className="h-4 w-4 text-amber-600" />
                            </button>
                            <button
                              className="rounded p-1.5 hover:bg-background"
                              title="Modifier"
                              onClick={() => openEdit(f)}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </>
                        )}
                        <button
                          className="rounded p-1.5 hover:bg-background"
                          title="Supprimer"
                          onClick={() => setConfirmDeleteId(f.id)}
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

      {/* Modal Création / Édition Formation */}
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
                  {editingItem ? "Modifier la formation" : "Nouvelle session de formation"}
                </h3>
                <p className={muted}>
                  Planifiez une action de formation pour les collaborateurs ciblés.
                </p>
              </div>
              <button onClick={() => setFormOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <TextField
                label="Désignation / Thème de la formation"
                value={designation}
                onChange={setDesignation}
                placeholder="Ex: Formation Sauveteur Secouriste du Travail (SST)..."
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Type de planification"
                  value={periodMode}
                  onChange={(v) => setPeriodMode(v as "standard" | "custom")}
                  required
                >
                  <option value="custom">Dates personnalisées</option>
                  <option value="standard">Période standardisée</option>
                </SelectField>
                <SelectField
                  label="Fréquence / Récurrence"
                  value={frequency}
                  onChange={(v) => setFrequency(v as Formation["frequency"])}
                  required
                >
                  <option value="ponctuelle">Ponctuelle</option>
                  <option value="annuelle">Annuelle</option>
                  <option value="semestrielle">Semestrielle</option>
                  <option value="trimestrielle">Trimestrielle</option>
                  <option value="mensuelle">Mensuelle</option>
                </SelectField>
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
                <SelectField
                  label="Responsable organisation"
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
                <TextField
                  label="Budget prévisionnel (FCFA)"
                  type="number"
                  value={cout}
                  onChange={setCout}
                  placeholder="Ex: 250000"
                />
              </div>

              {/* Formateur */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Formateur
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="formateur_type"
                      value="externe"
                      checked={formateurType === "externe"}
                      onChange={() => setFormateurType("externe")}
                    />
                    Organisme / Formateur externe
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="formateur_type"
                      value="interne"
                      checked={formateurType === "interne"}
                      onChange={() => setFormateurType("interne")}
                    />
                    Formateur interne (collaborateur)
                  </label>
                </div>
                {formateurType === "externe" ? (
                  <TextField
                    label="Nom du formateur ou cabinet"
                    value={formateurNom}
                    onChange={setFormateurNom}
                    placeholder="Ex: Bureau Veritas, Cabinet Expert..."
                  />
                ) : (
                  <SelectField
                    label="Collaborateur formateur"
                    value={formateurUserId}
                    onChange={setFormateurUserId}
                  >
                    <option value="">Sélectionner un collaborateur</option>
                    {collaborators.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>

              {/* Sélection des participants */}
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-muted-foreground">
                    Collaborateurs participants ({targetUserIds.length} sélectionné(s)) *
                  </label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      if (targetUserIds.length === collaborators.length) setTargetUserIds([]);
                      else setTargetUserIds(collaborators.map((c) => Number(c.id)));
                    }}
                  >
                    {targetUserIds.length === collaborators.length
                      ? "Tout désélectionner"
                      : "Tout sélectionner"}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border rounded-lg border border-input p-2">
                  {collaborators.map((c) => {
                    const cid = Number(c.id);
                    const isChecked = targetUserIds.includes(cid);
                    return (
                      <label
                        key={String(c.id)}
                        className="flex items-center gap-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40 px-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleTargetUser(cid)}
                          className="h-3.5 w-3.5 rounded border-input text-primary"
                        />
                        <span className="font-semibold">
                          {c.first_name} {c.last_name}
                        </span>
                        <span className="text-muted-foreground">({c.email})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <TextAreaField
                label="Observations / Contenu pédagogique"
                value={observations}
                onChange={setObservations}
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
                {save.isPending ? "Enregistrement..." : "Enregistrer la formation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Fiche Détails & Preuves & Évaluation */}
      {detailsItem && (
        <FormationDetailsModal formation={detailsItem} onClose={() => setDetailsItem(null)} />
      )}

      {/* Modal Clôture / Réalisation */}
      {completeItem && (
        <CompleteFormationModal formation={completeItem} onClose={() => setCompleteItem(null)} />
      )}

      {/* Modal Replanification */}
      {rescheduleItem && (
        <RescheduleFormationModal
          formation={rescheduleItem}
          onClose={() => setRescheduleItem(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cette formation ?"
        description="Cette action est irréversible et retirera la formation du plan annuel."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

// ============================================================================
// MODAL CLÔTURE FORMATION
// ============================================================================

function CompleteFormationModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [dateRealisee, setDateRealisee] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("date_realisee", dateRealisee);
      if (file) {
        formData.append("proofs[]", file);
      }
      await backendApi.request(`formations/${formation.id}/complete`, {
        method: "POST",
        body: formData,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["formations"] }),
        queryClient.invalidateQueries({ queryKey: ["formations-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["training-plans"] }),
      ]);
      toast.success("Formation validée et marquée comme réalisée !");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la validation de la formation."));
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
            <p className="text-xs text-muted-foreground">{formation.designation}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <TextField
            label="Date effective de réalisation"
            type="date"
            value={dateRealisee}
            onChange={setDateRealisee}
            required
          />
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
              Preuve de formation (attestation, feuille d'émargement...)
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

// ============================================================================
// MODAL REPLANIFIER FORMATION
// ============================================================================

function RescheduleFormationModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const [dateDebut, setDateDebut] = useState(
    formation.date_debut ?? new Date().toISOString().slice(0, 10),
  );
  const [dateFin, setDateFin] = useState(
    formation.date_fin ?? new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState("");
  const { reschedule } = useFormationMutations();

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
        id: formation.id,
        payload: { date_debut: dateDebut, date_fin: dateFin, comment: reason.trim() },
      });
      toast.success("Formation replanifiée.");
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
            <h3 className="font-display text-lg font-bold">Replanifier la formation</h3>
            <p className="text-xs text-muted-foreground">{formation.designation}</p>
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
            placeholder="Ex: Absence formateur, report d'activité..."
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

// ============================================================================
// MODAL DÉTAILS, PREUVES & ÉVALUATION INTERNE
// ============================================================================

function FormationDetailsModal({
  formation,
  onClose,
}: {
  formation: Formation;
  onClose: () => void;
}) {
  const [subTab, setSubTab] = useState<"infos" | "evaluation" | "proofs" | "history">("infos");
  const [evalData, setEvalData] = useState<FormationInternalEvaluation>({
    formation_id: formation.id,
    scores: { pedagogie: 4, contenu: 4, applicabilite: 4, animation: 4 },
    global_score: 4,
    comment: "",
  });
  const [evalLoaded, setEvalLoaded] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useState(() => {
    backendApi
      .request<unknown>(`formations/${formation.id}/internal-evaluation`)
      .then((payload) => {
        const root =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        if (root["data"]) {
          setEvalData(root["data"] as FormationInternalEvaluation);
        }
      })
      .catch(() => {})
      .finally(() => setEvalLoaded(true));
  });

  const handleSaveEvaluation = async () => {
    setEvalBusy(true);
    try {
      await backendApi.request(`formations/${formation.id}/internal-evaluation`, {
        method: "POST",
        body: JSON.stringify(evalData),
      });
      toast.success("Évaluation interne enregistrée.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de l'évaluation."));
    } finally {
      setEvalBusy(false);
    }
  };

  const handleUploadProof = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("proof", uploadFile);
      await backendApi.request(`formations/${formation.id}/proofs`, {
        method: "POST",
        body: formData,
      });
      toast.success("Preuve téléversée avec succès.");
      setUploadFile(null);
    } catch (error) {
      toast.error(errorMessage(error, "Échec du téléversement de la preuve."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <h3 className="font-display text-lg font-bold">{formation.designation}</h3>
            <p className="text-xs text-muted-foreground font-mono">
              Statut : <span className="font-bold capitalize">{formation.status}</span> · Fréquence
              : {formation.frequency}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Sous-onglets */}
        <div className="mt-4 flex border-b border-border text-sm">
          <button
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              subTab === "infos"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setSubTab("infos")}
          >
            Informations
          </button>
          <button
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              subTab === "evaluation"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setSubTab("evaluation")}
          >
            Évaluation interne
          </button>
          <button
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              subTab === "proofs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setSubTab("proofs")}
          >
            Preuves ({formation.proofs?.length ?? 0})
          </button>
          <button
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              subTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setSubTab("history")}
          >
            Historique
          </button>
        </div>

        <div className="mt-5">
          {subTab === "infos" && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">Dates</span>
                  <p className="font-semibold">
                    {formatDateFR(formation.date_debut)}{" "}
                    {formation.date_fin ? `→ ${formatDateFR(formation.date_fin)}` : ""}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">
                    Formateur
                  </span>
                  <p className="font-semibold">
                    {formation.formateur_type === "interne"
                      ? "Interne"
                      : formation.formateur || "Externe"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">Budget</span>
                  <p className="font-semibold font-mono">
                    {formation.cout ? `${formation.cout.toLocaleString()} FCFA` : "Non renseigné"}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">
                    Participants ciblés
                  </span>
                  <p className="font-semibold">
                    {formation.target_user_ids?.length ?? formation.cibles?.length ?? 0}{" "}
                    collaborateur(s)
                  </p>
                </div>
              </div>
              {formation.observations && (
                <div>
                  <span className="text-xs font-bold uppercase text-muted-foreground">
                    Contenu & Objectifs
                  </span>
                  <p className="mt-1 rounded-xl bg-muted/30 p-3 text-xs leading-relaxed">
                    {formation.observations}
                  </p>
                </div>
              )}
            </div>
          )}

          {subTab === "evaluation" && (
            <div className="space-y-4">
              {formation.status !== "realisee" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                  L'évaluation interne n'est accessible qu'une fois la formation marquée comme{" "}
                  <strong>réalisée</strong>.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Grille d'évaluation qualitative à chaud/à froid (scores de 1 à 5).
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "pedagogie", label: "Pédagogie du formateur" },
                      { key: "contenu", label: "Qualité du contenu et supports" },
                      { key: "applicabilite", label: "Applicabilité au poste" },
                      { key: "animation", label: "Animation et interactivité" },
                    ].map(({ key, label }) => (
                      <div key={key} className="rounded-xl border border-border p-3">
                        <label className="text-xs font-bold">{label}</label>
                        <div className="mt-2 flex gap-1">
                          {[1, 2, 3, 4, 5].map((val) => (
                            <button
                              key={val}
                              type="button"
                              className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                                evalData.scores[key as keyof typeof evalData.scores] === val
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted/40 hover:bg-muted"
                              }`}
                              onClick={() => {
                                const newScores = { ...evalData.scores, [key]: val };
                                const avg = Object.values(newScores).reduce((a, b) => a + b, 0) / 4;
                                setEvalData({
                                  ...evalData,
                                  scores: newScores,
                                  global_score: Number(avg.toFixed(1)),
                                });
                              }}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <TextAreaField
                    label="Commentaire global de l'évaluateur"
                    value={evalData.comment ?? ""}
                    onChange={(v) => setEvalData({ ...evalData, comment: v })}
                    placeholder="Synthèse de l'évaluation interne..."
                  />
                  <div className="flex justify-end">
                    <button
                      className={primary}
                      onClick={() => void handleSaveEvaluation()}
                      disabled={evalBusy}
                    >
                      {evalBusy ? "Enregistrement..." : "Enregistrer la fiche"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {subTab === "proofs" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <label className="text-xs font-bold uppercase text-muted-foreground">
                  Ajouter une pièce justificative
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type="file"
                    className={input}
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                  <button
                    className={primary}
                    onClick={() => void handleUploadProof()}
                    disabled={!uploadFile || uploading}
                  >
                    <Upload className="h-4 w-4" /> Téléverser
                  </button>
                </div>
              </div>
              {formation.proofs && formation.proofs.length > 0 ? (
                <div className="divide-y divide-border">
                  {formation.proofs.map((p) => (
                    <div
                      key={String(p.id)}
                      className="flex items-center justify-between py-2 text-xs"
                    >
                      <span className="font-semibold text-primary">{p.filename}</span>
                      <a href={p.url} target="_blank" rel="noreferrer" className={secondary}>
                        Télécharger
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`py-6 text-center ${muted}`}>Aucune preuve enregistrée.</p>
              )}
            </div>
          )}

          {subTab === "history" && (
            <div className="space-y-3">
              {formation.history && formation.history.length > 0 ? (
                formation.history.map((h) => (
                  <div key={String(h.id)} className="rounded-xl border border-border p-3 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span>{historyActionLabelFR(h.action, h.action_label)}</span>
                      <span className="text-muted-foreground">{formatDateFR(h.created_at)}</span>
                    </div>
                    {h.comment && <p className="mt-1 text-muted-foreground italic">{h.comment}</p>}
                  </div>
                ))
              ) : (
                <p className={`py-6 text-center ${muted}`}>Aucun historique disponible.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <button className={secondary} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ONGLET 2 : PLAN ANNUEL DE FORMATION
// ============================================================================

function TrainingPlansTab({ siteId }: { siteId?: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const { data: plans = [], isLoading } = useTrainingPlans({ site_id: siteId, year: selectedYear });
  const { data: collaborators = [] } = useCollaborators(siteId ?? "");
  const activePlan = plans[0] as TrainingPlan | undefined;

  const [modalOpen, setModalOpen] = useState(false);
  const [totalBudget, setTotalBudget] = useState("5000000");
  const [plannedFormations, setPlannedFormations] = useState("10");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importTargets, setImportTargets] = useState<string[]>([]);
  const { importFile: importFormations } = useFormationMutations();

  const handleCreatePlan = async () => {
    setBusy(true);
    try {
      await backendApi.request("training-plans", {
        method: "POST",
        body: JSON.stringify({
          year: selectedYear,
          status: "active",
          total_budget: Number(totalBudget),
          planned_formations: Number(plannedFormations),
          ...(siteId ? { site_id: Number(siteId) } : {}),
        }),
      });
      toast.success(`Plan annuel ${selectedYear} initialisé.`);
      setModalOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de création du plan annuel."));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (!activePlan) return;
    setBusy(true);
    try {
      await backendApi.request(`training-plans/${activePlan.id}/sync`, { method: "POST" });
      toast.success("Budget et statistiques du plan recalculés.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la synchronisation."));
    } finally {
      setBusy(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!activePlan) return;
    try {
      const blob = await backendApi.blob(`training-plans/${activePlan.id}/export-xlsx`);
      await downloadBlobResponse(blob, `plan_formation_${selectedYear}.xlsx`);
      toast.success("Plan de formation exporté en XLSX.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'export Excel."));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await backendApi.blob("training-plans/template");
      await downloadBlobResponse(blob, "modele_plan_formation.xlsx");
      toast.success("Modèle de plan de formation téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec du téléchargement du gabarit."));
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Sélectionnez le fichier Excel du plan annuel.");
      return;
    }
    if (importTargets.length === 0) {
      toast.error("Sélectionnez au moins un collaborateur cible.");
      return;
    }
    setBusy(true);
    try {
      const result = await importFormations.mutateAsync({
        file: importFile,
        year: selectedYear,
        targetUserIds: importTargets,
      });
      toast.success(
        `Import terminé : ${result.created} création(s), ${result.updated} mise(s) à jour.`,
      );
      setImportOpen(false);
      setImportFile(null);
      setImportTargets([]);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'import du plan annuel."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année et Actions */}
      <div className={`${card} min-w-0 p-4 sm:p-5`}>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-bold">Année de référence :</span>
            <select
              className={`${input} w-32 max-w-full font-bold`}
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              className={`${secondary} w-full justify-center sm:w-auto`}
              onClick={() => void handleDownloadTemplate()}
            >
              <Download className="h-4 w-4" /> Gabarit
            </button>
            <button
              className={`${secondary} w-full justify-center sm:w-auto`}
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" /> Importer plan annuel
            </button>
            {activePlan && (
              <>
                <button
                  className={`${secondary} w-full justify-center sm:w-auto`}
                  onClick={() => void handleSync()}
                  disabled={busy}
                >
                  <RefreshCw className="h-4 w-4" /> Recalculer
                </button>
                <button
                  className={`${secondary} w-full justify-center sm:w-auto`}
                  onClick={() => void handleExportXlsx()}
                >
                  <FileDown className="h-4 w-4" /> Exporter XLSX
                </button>
              </>
            )}
            {!activePlan && (
              <button
                className={`${primary} col-span-2 w-full justify-center sm:col-span-1 sm:w-auto`}
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-4 w-4" /> Initialiser le plan {selectedYear}
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton rows={3} />
      ) : activePlan ? (
        <div className="space-y-6">
          {/* Synthèse Budgétaire */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Budget total alloué"
              value={`${activePlan.total_budget.toLocaleString()} F`}
              tone="text-foreground"
            />
            <Stat
              label="Budget engagé"
              value={`${(activePlan.budget_engaged ?? 0).toLocaleString()} F`}
              tone="text-amber-600"
            />
            <Stat
              label="Budget réalisé (consommé)"
              value={`${(activePlan.spent_amount ?? 0).toLocaleString()} F`}
              tone="text-emerald-600"
            />
            <Stat
              label="Budget restant"
              value={`${(activePlan.budget_remaining ?? 0).toLocaleString()} F`}
              tone="text-primary"
            />
          </div>

          <div className={`${card} p-6`}>
            <h3 className="font-display text-base font-bold">
              Objectifs du plan {activePlan.year}
            </h3>
            <p className={muted}>
              Statut du plan : <strong className="uppercase">{activePlan.status}</strong>
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-muted/40 p-4">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Formations prévues
                </span>
                <p className="font-display text-2xl font-bold">{activePlan.planned_formations}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Taux de réalisation
                </span>
                <p className="font-display text-2xl font-bold text-emerald-600">
                  {activePlan.planned_formations > 0
                    ? `${Math.round(((activePlan.spent_amount ?? 0) / activePlan.total_budget) * 100)}%`
                    : "0%"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${card} p-12 text-center`}>
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-3 font-display text-lg font-bold">
            Aucun plan annuel pour {selectedYear}
          </h3>
          <p className={`mt-1 max-w-md mx-auto ${muted}`}>
            Créez le plan annuel pour définir le budget global de formation et suivre la réalisation
            prévisionnelle.
          </p>
          <button className={`${primary} mt-4`} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Créer le plan {selectedYear}
          </button>
        </div>
      )}

      {/* Modal Initialiser Plan */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <h3 className="font-display text-lg font-bold">Plan annuel {selectedYear}</h3>
              <button onClick={() => setModalOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <TextField
                label="Budget global prévisionnel (FCFA)"
                type="number"
                value={totalBudget}
                onChange={setTotalBudget}
                required
              />
              <TextField
                label="Nombre prévisionnel de formations"
                type="number"
                value={plannedFormations}
                onChange={setPlannedFormations}
                required
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button className={primary} onClick={() => void handleCreatePlan()} disabled={busy}>
                {busy ? "Initialisation..." : "Créer le plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="formation-import-title"
        >
          <div className={`${card} w-full max-w-lg p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 id="formation-import-title" className="font-display text-lg font-bold">
                  Importer le plan annuel {selectedYear}
                </h3>
                <p className={`mt-1 ${muted}`}>
                  Le fichier doit respecter le gabarit téléchargé et être affecté à des
                  collaborateurs.
                </p>
              </div>
              <button onClick={() => setImportOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <TextField
                label="Année du plan"
                type="number"
                value={String(selectedYear)}
                onChange={(value) => setSelectedYear(Number(value) || currentYear)}
                required
              />
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                  Fichier Excel / CSV *
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  className={input}
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                  Collaborateurs cibles *
                </label>
                <select
                  multiple
                  className={`${input} min-h-32`}
                  value={importTargets}
                  onChange={(event) =>
                    setImportTargets(
                      Array.from(event.target.selectedOptions, (option) => option.value),
                    )
                  }
                >
                  {collaborators.map((collaborator) => {
                    const name =
                      collaborator.name ||
                      [collaborator.first_name, collaborator.last_name].filter(Boolean).join(" ") ||
                      collaborator.email ||
                      `Collaborateur #${collaborator.id}`;
                    return (
                      <option key={String(collaborator.id)} value={String(collaborator.id)}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setImportOpen(false)}>
                Annuler
              </button>
              <button className={primary} onClick={() => void handleImport()} disabled={busy}>
                {busy ? "Import en cours..." : "Importer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ONGLET 3 : MATRICE DES COMPÉTENCES
// ============================================================================

function CompetenceMatrixTab() {
  const { data: matrix = [], isLoading } = useCompetenceMatrix();

  const handleExport = async () => {
    try {
      const response = await backendApi.request<{
        data: Record<string, unknown>[];
        filename: string;
      }>("competence-matrix/export");
      const csv = [
        Object.keys(response.data[0] ?? {}).join(";"),
        ...response.data.map((row) =>
          Object.values(row)
            .map((v) => `"${v}"`)
            .join(";"),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      await downloadBlobResponse(blob, response.filename ?? "matrice_competences.csv");
      toast.success("Matrice exportée avec succès.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'export de la matrice."));
    }
  };

  return (
    <div className="space-y-6">
      <div className={`${card} p-5 flex items-center justify-between`}>
        <div>
          <h3 className="font-display text-base font-bold">Grille Employés × Compétences</h3>
          <p className={muted}>
            Croisement des compétences requises par poste avec les acquis enregistrés
          </p>
        </div>
        <button className={secondary} onClick={() => void handleExport()}>
          <FileDown className="h-4 w-4" /> Exporter la matrice
        </button>
      </div>

      {isLoading ? (
        <PageSkeleton rows={4} />
      ) : matrix.length === 0 ? (
        <p className={`py-12 text-center ${muted}`}>
          Aucun collaborateur avec fiche de poste assignée.
        </p>
      ) : (
        <div className="space-y-4">
          {matrix.map((row) => (
            <div key={String(row.user_id)} className={`${card} p-5 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h4 className="font-bold text-base text-foreground">{row.user_name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {row.job_title ?? "Poste non défini"}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {row.competences.length} compétence(s) requise(s)
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {row.competences.map((c) => (
                  <div
                    key={String(c.competence_id)}
                    className="rounded-xl border border-border p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="truncate">{c.competence_name}</span>
                      <span className={statusBadge(c.status)}>{statusLabel(c.status)}</span>
                    </div>
                    <p className="text-muted-foreground">Type : {c.competence_type}</p>
                    <div className="flex justify-between font-mono pt-1 text-[11px]">
                      <span>
                        Requis : <strong>{c.level_required}</strong>
                      </span>
                      <span>
                        Acquis : <strong>{c.level_acquired ?? "Non"}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ONGLET 4 : ANALYSE DES ÉCARTS (GAP ANALYSIS)
// ============================================================================

function GapAnalysisTab() {
  const { data, isLoading } = useGapAnalysis();
  const gaps = data?.data ?? [];
  const summary = data?.summary ?? {};

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Collaborateurs avec écarts"
          value={summary["users_with_gaps"] ?? gaps.length}
          tone="text-amber-600"
        />
        <Stat
          label="Total écarts identifiés"
          value={summary["total_gaps"] ?? 0}
          tone="text-foreground"
        />
        <Stat
          label="Écarts critiques (obligatoires)"
          value={summary["critical_gaps"] ?? 0}
          tone="text-red-600"
        />
      </div>

      {isLoading ? (
        <PageSkeleton rows={3} />
      ) : gaps.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h3 className="mt-3 font-display text-lg font-bold">
            Aucun écart de compétences critique
          </h3>
          <p className={`mt-1 ${muted}`}>
            Tous les collaborateurs évalués satisfont aux compétences requises de leur poste.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gaps.map((item) => (
            <div key={String(item.user_id)} className={`${card} p-5 space-y-3`}>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div>
                  <h4 className="font-bold text-base">{item.user_name}</h4>
                  <p className="text-xs text-muted-foreground">{item.job_title}</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    {item.gap_count} écart(s)
                  </span>
                  {item.critical_gaps > 0 && (
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                      {item.critical_gaps} obligatoire(s)
                    </span>
                  )}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {item.gaps.map((g) => (
                  <div
                    key={String(g.competence_id)}
                    className="rounded-xl bg-muted/30 p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{g.competence_name}</span>
                      <span className={statusBadge(g.gap_type)}>{statusLabel(g.gap_type)}</span>
                    </div>
                    <p className="text-muted-foreground">
                      Niveau requis : {g.level_required} · Acquis :{" "}
                      {g.level_acquired ?? "Non acquis"}
                    </p>
                    {g.suggested_actions && g.suggested_actions.length > 0 && (
                      <p className="text-primary font-semibold pt-1">
                        Action : {g.suggested_actions.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
