import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck,
  FileDown,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderGit2,
  GitPullRequest,
  Grid,
  Layers,
  List,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import { backendApi } from "@/integrations/backend/client";
import { useProcesses } from "@/integrations/backend/context";
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
  formatFileSize,
} from "@/components/app/support/shared";
import {
  exportDocumentsInventory,
  exportPyramideLevel,
  downloadInventoryTemplate,
  fetchDocumentPreviewBlob,
  useDocumentMutations,
  useInventoryImport,
  useDocumentStats,
  useDocumentsList,
  usePyramideStats,
  type GedDocument,
} from "@/integrations/backend/support";

const PYRAMIDE_LEVELS = [
  { key: "all", label: "Tous les niveaux" },
  { key: "N1", label: "N1 — Manuel Qualité & Politiques" },
  { key: "N2", label: "N2 — Procédures" },
  { key: "N3", label: "N3 — Instructions & Modes opératoires" },
  { key: "N4", label: "N4 — Enregistrements & Formulaires" },
  { key: "N5", label: "N5 — Documents externes" },
];

// L'interface affiche les niveaux ISO, tandis que l'API filtre sur les
// abréviations de nomenclature configurées côté Laravel.
const DOCUMENT_LEVEL_TYPES: Record<string, string> = {
  N1: "POL",
  N2: "MAN",
  N3: "PRC",
  N4: "PRD",
  N5: "ENR",
};

export function DocumentsPage() {
  const [siteId] = useCurrentSite();

  // Filtres
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processFilter, setProcessFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Données
  const {
    data: documents = [],
    isLoading,
    refetch,
  } = useDocumentsList({
    site_id: siteId || undefined,
    type: levelFilter !== "all" ? DOCUMENT_LEVEL_TYPES[levelFilter] : undefined,
    workflow_status: statusFilter !== "all" ? statusFilter : undefined,
    process_id: processFilter !== "all" ? processFilter : undefined,
    search: search || undefined,
  });

  const { data: stats } = useDocumentStats(siteId || undefined);
  const { data: pyramide } = usePyramideStats(siteId || undefined);
  const { data: rawProcesses = [] } = useProcesses(siteId);
  const { save, remove, uploadVersion, submitForApproval, confirmRejectionDecision, archive } =
    useDocumentMutations();
  const inventoryImport = useInventoryImport();
  const [importingInventory, setImportingInventory] = useState(false);

  // Modales
  const [createOpen, setCreateOpen] = useState(false);
  const [versionModalDoc, setVersionModalDoc] = useState<GedDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<GedDocument | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rejectionModalDoc, setRejectionModalDoc] = useState<GedDocument | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | number | null>(null);
  const [confirmArchiveDoc, setConfirmArchiveDoc] = useState<GedDocument | null>(null);

  // Formulaire Nouveau Document
  const [docTitle, setDocTitle] = useState("");
  const [docLevel, setDocLevel] = useState("procedure");
  const [docProcessId, setDocProcessId] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docEffectiveDate, setDocEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [docPeriodicite, setDocPeriodicite] = useState("12");
  const [docDescription, setDocDescription] = useState("");

  // Formulaire Nouvelle Version
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNotes, setVersionNotes] = useState("");
  const [versionNumber, setVersionNumber] = useState("");

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const handleOpenPreview = async (doc: GedDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    try {
      const blob = await fetchDocumentPreviewBlob(doc.id);
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de charger l'aperçu du document."));
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!docTitle.trim()) {
      toast.error("Le titre du document est obligatoire.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("title", docTitle.trim());
      formData.append("type", docLevel);
      if (siteId) formData.append("site_id", siteId);
      if (docProcessId) formData.append("process_id", docProcessId);
      if (docEffectiveDate) formData.append("effective_date", docEffectiveDate);
      if (docPeriodicite) formData.append("periodicite_revision", docPeriodicite);
      if (docDescription.trim()) formData.append("description", docDescription.trim());
      if (docFile) formData.append("file", docFile);

      await save.mutateAsync({ payload: formData });
      toast.success("Document créé et enregistré dans l'inventaire.");
      setCreateOpen(false);
      setDocTitle("");
      setDocFile(null);
      setDocDescription("");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement du document."));
    }
  };

  const handleUploadNewVersion = async () => {
    if (!versionModalDoc || !versionFile) {
      toast.error("Veuillez sélectionner le fichier de la nouvelle version.");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("file", versionFile);
      if (versionNotes.trim()) formData.append("version_notes", versionNotes.trim());
      if (versionNumber.trim()) formData.append("version", versionNumber.trim());

      await uploadVersion.mutateAsync({ id: versionModalDoc.id, formData });
      toast.success("Nouvelle version du document importée avec succès !");
      setVersionModalDoc(null);
      setVersionFile(null);
      setVersionNotes("");
      setVersionNumber("");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de l'enregistrement de la nouvelle version."));
    }
  };

  const handleSubmitWorkflow = async (doc: GedDocument) => {
    try {
      await submitForApproval.mutateAsync(doc.id);
      toast.success(`Le document ${doc.code} a été soumis pour validation.`);
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la soumission au circuit d'approbation."));
    }
  };

  const handleRejectionDecision = async (releaseCode: boolean, comment?: string) => {
    if (!rejectionModalDoc) return;
    try {
      await confirmRejectionDecision.mutateAsync({
        id: rejectionModalDoc.id,
        release_code: releaseCode,
        comment: comment || undefined,
      });
      toast.success(releaseCode ? "Code document libéré." : "Décision enregistrée.");
      setRejectionModalDoc(null);
    } catch (error) {
      toast.error(errorMessage(error, "Échec du traitement de la décision."));
    }
  };

  const handleArchive = async () => {
    if (!confirmArchiveDoc) return;
    try {
      await archive.mutateAsync(confirmArchiveDoc.id);
      toast.success(`Le document ${confirmArchiveDoc.code} a été archivé.`);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'archiver ce document."));
    } finally {
      setConfirmArchiveDoc(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await remove.mutateAsync(confirmDeleteId);
      toast.success("Document supprimé de l'inventaire.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de supprimer ce document."));
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleExportInventory = async () => {
    try {
      await exportDocumentsInventory(siteId || undefined);
      toast.success("Inventaire documentaire exporté avec succès.");
    } catch {
      toast.error("Échec du téléchargement de l'inventaire.");
    }
  };

  const handleExportPyramide = async (level: string) => {
    try {
      await exportPyramideLevel(level, siteId || undefined);
      toast.success(`Export du niveau ${level} réussi.`);
    } catch {
      toast.error(`Échec de l'export pour le niveau ${level}.`);
    }
  };

  const handleDownloadInventoryTemplate = async () => {
    try {
      await downloadInventoryTemplate();
      toast.success("Gabarit d'inventaire téléchargé.");
    } catch {
      toast.error("Échec du téléchargement du gabarit.");
    }
  };

  const handleInventoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!siteId) {
      toast.error("Sélectionnez un site avant d'importer l'inventaire.");
      return;
    }
    setImportingInventory(true);
    try {
      const result = await inventoryImport.mutateAsync({ file, siteId });
      if (result.errors > 0) {
        toast.warning(
          `Import partiel : ${result.success} document(s) créé(s), ${result.errors} erreur(s).`,
        );
      } else {
        toast.success(`Import réussi : ${result.success} document(s) créé(s).`);
      }
      void refetch();
    } catch (error) {
      toast.error(errorMessage(error, "Import de l'inventaire impossible."));
    } finally {
      setImportingInventory(false);
    }
  };

  return (
    <div className="space-y-6">
      <Header
        eyebrow="Support — ISO 9001 §7.5"
        title="Information documentée"
        description="Inventaire, cycle de vie, validation hiérarchique et pyramide documentaire ISO 9001 / QHSE"
        icon={BookOpen}
      />

      <SiteNotice siteId={siteId} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total documents" value={stats?.total ?? documents.length} />
        <Stat label="Brouillons" value={stats?.draft ?? 0} />
        <Stat label="En vérification" value={stats?.pending_verification ?? 0} />
        <Stat label="En approbation" value={stats?.pending_approval ?? 0} />
        <Stat label="Approuvés & En vigueur" value={stats?.approved ?? 0} />
        <Stat label="Obsolètes / Rejetés" value={(stats?.obsolete ?? 0) + (stats?.rejected ?? 0)} />
      </div>

      {/* Pyramide Documentaire Interactive (N1 à N5) */}
      <div className={`${card} p-5 space-y-4 bg-muted/20 border-border`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Pyramide Documentaire (Niveaux N1 à N5)
            </h3>
          </div>
          <button className={secondary} onClick={() => void handleExportInventory()}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Exporter inventaire complet (Excel)
          </button>
          <button className={secondary} onClick={() => void handleDownloadInventoryTemplate()}>
            <Download className="h-4 w-4 text-primary" />
            Gabarit d'import
          </button>
          <label className={`${secondary} cursor-pointer`}>
            <UploadCloud className="h-4 w-4 text-primary" />
            {importingInventory ? "Import…" : "Importer"}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importingInventory}
              onChange={(e) => void handleInventoryFile(e)}
              aria-label="Fichier d'inventaire documentaire à importer"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { key: "N1", data: pyramide?.n1, label: "N1 — Manuel & Politiques" },
            { key: "N2", data: pyramide?.n2, label: "N2 — Procédures" },
            { key: "N3", data: pyramide?.n3, label: "N3 — Modes opératoires" },
            { key: "N4", data: pyramide?.n4, label: "N4 — Formulaires" },
            { key: "N5", data: pyramide?.n5, label: "N5 — Docs externes" },
          ].map(({ key, data, label }) => {
            const isSelected = levelFilter === key;
            return (
              <div
                key={key}
                onClick={() => setLevelFilter(isSelected ? "all" : key)}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-xs"
                    : "border-border bg-background hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-xs uppercase text-primary">
                    {key}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {data?.approved ?? 0} / {data?.count ?? 0} validés
                  </span>
                </div>
                <h4 className="mt-1 font-semibold text-xs leading-snug line-clamp-1">{label}</h4>
                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                  <span className="text-muted-foreground">
                    {isSelected ? "Filtre actif" : "Cliquer pour filtrer"}
                  </span>
                  <button
                    className="text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleExportPyramide(key);
                    }}
                    title={`Télécharger l'inventaire ${key}`}
                  >
                    <Download className="h-3 w-3 inline" />
                  </button>
                </div>
              </div>
            );
          })}
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
                placeholder="Rechercher par code (DOC-001) ou titre..."
                className={`${input} w-full min-w-0 pl-9`}
              />
            </div>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className={`${input} w-full min-w-0`}
            >
              {PYRAMIDE_LEVELS.map((lvl) => (
                <option key={lvl.key} value={lvl.key}>
                  {lvl.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${input} w-full min-w-0`}
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="pending_verification">En vérification</option>
              <option value="pending_approval">En approbation</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
              <option value="obsolete">Obsolète</option>
            </select>
            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className={`${input} w-full min-w-0`}
            >
              <option value="all">Tous les processus</option>
              {rawProcesses.map((p) => {
                const id = String(p["id"] ?? "");
                const title = String(p["title"] ?? p["name"] ?? `Processus #${id}`);
                return (
                  <option key={id} value={id}>
                    {title}
                  </option>
                );
              })}
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
              onClick={() => setCreateOpen(true)}
            >
              <FilePlus className="h-4 w-4" />
              Nouveau document
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      {isLoading ? (
        <PageSkeleton />
      ) : documents.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <h3 className="mt-4 font-display text-base font-semibold">Aucun document trouvé</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Enregistrez les manuels, procédures, modes opératoires ou formulaires de votre
            organisation.
          </p>
          <button className={`${primary} mt-4`} onClick={() => setCreateOpen(true)}>
            <FilePlus className="h-4 w-4" />
            Créer un premier document
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <div
              key={String(doc.id)}
              className={`${card} p-5 space-y-4 hover:border-primary/50 transition-colors`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {doc.code}
                  </span>
                  <h4 className="font-display font-bold text-base leading-snug mt-1.5">
                    {doc.title}
                  </h4>
                </div>
                <span className={statusBadge(doc.workflow_status || doc.status)}>
                  {statusLabel(doc.workflow_status || doc.status)}
                </span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  <strong className="text-foreground">Version :</strong> v{doc.version}
                </p>
                <p>
                  <strong className="text-foreground">Type / Niveau :</strong> {doc.type ?? "—"}
                </p>
                <p>
                  <strong className="text-foreground">Processus :</strong> {doc.process_label}
                </p>
                <p>
                  <strong className="text-foreground">Auteur :</strong> {doc.author_name}
                </p>
                {doc.file_name && (
                  <p className="font-mono text-[11px] truncate">
                    Fichier : {doc.file_name}{" "}
                    {doc.file_size ? `(${formatFileSize(doc.file_size)})` : ""}
                  </p>
                )}
              </div>

              {doc.workflow_status === "rejected" && doc.rejection_reason && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Document rejeté
                  </div>
                  <p>{doc.rejection_reason}</p>
                  <button
                    className="text-xs font-bold underline mt-1 block"
                    onClick={() => setRejectionModalDoc(doc)}
                  >
                    Gérer la décision de rejet
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    onClick={() => void handleOpenPreview(doc)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Aperçu
                  </button>
                  {doc.file_url && (
                    <a
                      href={`/api/v1/documents/${doc.id}/download`}
                      download
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Télécharger
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {doc.workflow_status === "draft" && (
                    <button
                      className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      onClick={() => void handleSubmitWorkflow(doc)}
                      title="Soumettre pour validation"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setVersionModalDoc(doc)}
                    title="Uploader une nouvelle version"
                  >
                    <UploadCloud className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setConfirmArchiveDoc(doc)}
                    title="Archiver"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteId(doc.id)}
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
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Titre du document</th>
                <th className="px-4 py-3">Niveau</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Processus</th>
                <th className="px-4 py-3">Auteur</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => (
                <tr key={String(doc.id)} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-bold text-xs text-primary">{doc.code}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div>{doc.title}</div>
                    {doc.file_name && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {doc.file_name} {doc.file_size ? `(${formatFileSize(doc.file_size)})` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold">{doc.type ?? "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono">v{doc.version}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{doc.process_label}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{doc.author_name}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <span className={statusBadge(doc.workflow_status || doc.status)}>
                        {statusLabel(doc.workflow_status || doc.status)}
                      </span>
                      {doc.workflow_status === "rejected" && (
                        <button
                          className="text-[11px] text-destructive underline block font-semibold"
                          onClick={() => setRejectionModalDoc(doc)}
                        >
                          Décision rejet
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1 text-primary hover:bg-primary/10"
                        onClick={() => void handleOpenPreview(doc)}
                        title="Prévisualiser"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <a
                        href={`/api/v1/documents/${doc.id}/download`}
                        download
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        title="Télécharger fichier"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {doc.workflow_status === "draft" && (
                        <button
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          onClick={() => void handleSubmitWorkflow(doc)}
                          title="Soumettre pour validation"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => setVersionModalDoc(doc)}
                        title="Uploader une nouvelle version"
                      >
                        <UploadCloud className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        onClick={() => setConfirmArchiveDoc(doc)}
                        title="Archiver"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded p-1 text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(doc.id)}
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

      {/* Modal Nouveau Document */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">Nouveau document</h3>
                <p className="text-xs text-muted-foreground">
                  Création et codification d'une information documentée
                </p>
              </div>
              <button onClick={() => setCreateOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <TextField
                label="Titre du document"
                value={docTitle}
                onChange={setDocTitle}
                required
                placeholder="Ex: Procédure de maîtrise des non-conformités..."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Niveau de pyramide documentaire"
                  value={docLevel}
                  onChange={setDocLevel}
                  required
                >
                  <option value="policy">N1 — Politique qualité</option>
                  <option value="manual">N2 — Manuel qualité</option>
                  <option value="procedure">N3 — Procédure organisationnelle</option>
                  <option value="instruction">N4 — Instruction & mode opératoire</option>
                  <option value="record">N5 — Enregistrement</option>
                </SelectField>

                <SelectField
                  label="Processus de rattachement"
                  value={docProcessId}
                  onChange={setDocProcessId}
                >
                  <option value="">Sélectionner un processus</option>
                  {rawProcesses.map((p) => {
                    const id = String(p["id"] ?? "");
                    const title = String(p["title"] ?? p["name"] ?? `Processus #${id}`);
                    return (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    );
                  })}
                </SelectField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                  label="Date d'application prévue"
                  type="date"
                  value={docEffectiveDate}
                  onChange={setDocEffectiveDate}
                />
                <TextField
                  label="Périodicité de révision (mois)"
                  type="number"
                  value={docPeriodicite}
                  onChange={setDocPeriodicite}
                  placeholder="12"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                  Fichier du document (PDF, Word, Excel - Max 20 Mo)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className={input}
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <TextAreaField
                label="Objet ou description sommaire"
                value={docDescription}
                onChange={setDocDescription}
                placeholder="Finalité de ce document, champ d'application..."
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setCreateOpen(false)}>
                Annuler
              </button>
              <button
                className={primary}
                onClick={() => void handleCreateDocument()}
                disabled={save.isPending}
              >
                {save.isPending ? "Création..." : "Créer le document"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload Nouvelle Version */}
      {versionModalDoc && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-lg p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">Nouvelle version</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {versionModalDoc.code} — Actuelle: v{versionModalDoc.version}
                </p>
              </div>
              <button onClick={() => setVersionModalDoc(null)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <TextField
                label="Indice de version (optionnel)"
                value={versionNumber}
                onChange={setVersionNumber}
                placeholder="Ex: 2.0"
              />

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                  Nouveau fichier (PDF, Word, Excel)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className={input}
                  onChange={(e) => setVersionFile(e.target.files?.[0] ?? null)}
                  required
                />
              </div>

              <TextAreaField
                label="Notes de révision / Modifications apportées"
                value={versionNotes}
                onChange={setVersionNotes}
                placeholder="Détaillez les évolutions par rapport à la version précédente..."
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className={secondary} onClick={() => setVersionModalDoc(null)}>
                Annuler
              </button>
              <button
                className={primary}
                onClick={() => void handleUploadNewVersion()}
                disabled={uploadVersion.isPending}
              >
                {uploadVersion.isPending ? "Upload..." : "Enregistrer la version"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aperçu In-App (Modal avec iframe Blob URL, zéro window.open) */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-5xl h-[88vh] flex flex-col p-6 shadow-2xl`}>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-primary px-2.5 py-1 rounded bg-primary/10">
                  {previewDoc.code}
                </span>
                <h3 className="font-display text-base font-bold truncate max-w-xl">
                  {previewDoc.title}
                </h3>
                <span className="text-xs text-muted-foreground font-mono">
                  v{previewDoc.version}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/v1/documents/${previewDoc.id}/download`}
                  download
                  className={secondary}
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </a>
                <button onClick={() => setPreviewDoc(null)} aria-label="Fermer">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="flex-1 mt-4 overflow-hidden rounded-xl border border-border bg-muted/10 relative">
              {previewLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Génération de l'aperçu du document...
                  </p>
                </div>
              ) : previewBlobUrl ? (
                <iframe
                  key={String(previewDoc.id)}
                  src={previewBlobUrl}
                  className="w-full h-full border-0 rounded-xl"
                  title={`Aperçu - ${previewDoc.title}`}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
                  <FileText className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-semibold">Aucun aperçu disponible</p>
                  <p className="text-xs text-muted-foreground">
                    Le format de ce fichier ne permet pas de rendu visuel direct. Veuillez le
                    télécharger.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Décision suite à rejet */}
      {rejectionModalDoc && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Décision suite au rejet
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{rejectionModalDoc.code}</p>
              </div>
              <button onClick={() => setRejectionModalDoc(null)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <p className="text-muted-foreground">
                Ce document a été rejeté lors du circuit d'approbation.
                {rejectionModalDoc.rejection_reason && (
                  <span className="block mt-1 font-semibold text-foreground">
                    Motif : {rejectionModalDoc.rejection_reason}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Vous pouvez choisir de <strong>libérer le code</strong> (le document sera annulé et
                son code pourra être réattribué) ou de <strong>conserver le document</strong> pour
                préparer une correction.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                className="w-full rounded-lg bg-destructive px-4 py-2.5 text-xs font-bold text-white hover:bg-destructive/90"
                onClick={() => void handleRejectionDecision(true)}
              >
                Libérer le code et annuler le document
              </button>
              <button
                className={`${secondary} w-full`}
                onClick={() => void handleRejectionDecision(false)}
              >
                Conserver le code (en vue d'une correction)
              </button>
              <button
                className="text-xs text-muted-foreground hover:underline text-center mt-2"
                onClick={() => setRejectionModalDoc(null)}
              >
                Fermer sans décision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Archivage */}
      <ConfirmDialog
        open={confirmArchiveDoc !== null}
        title="Archiver ce document ?"
        description={`Le document ${confirmArchiveDoc?.code ?? ""} passera à l'état archivé et ne sera plus disponible dans les documents en vigueur.`}
        confirmLabel="Archiver"
        onConfirm={() => void handleArchive()}
        onCancel={() => setConfirmArchiveDoc(null)}
      />

      {/* Confirmation Suppression */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer ce document ?"
        description="Cette action retirera définitivement ce document de la base de données."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
