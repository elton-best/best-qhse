import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  FileDown,
  Filter,
  GitBranch,
  LayoutGrid,
  PenLine,
  Plus,
  Save,
  Send,
  Table,
  Trash2,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource, useProcesses } from "@/integrations/backend/context";
import { PENDING_DOCUMENTS_KEY } from "@/integrations/backend/documents";
import {
  Header,
  Label,
  PageSkeleton,
  SelectField,
  SiteNotice,
  TextAreaField,
  TextField,
  card,
  errorMessage,
  input,
  join,
  lines,
  muted,
  primary,
  processCodeOf,
  processLabelOf,
  secondary,
  statusBadge,
} from "@/components/app/leadership/shared";
import {
  downloadBlob,
  exportResponsibilitiesDocx,
  exportResponsibilitiesPdf,
  generateResponsibilityDraft,
  useResponsibilities,
  useResponsibilityMutations,
  type Responsibility,
} from "@/integrations/backend/leadership";

type ResponsibilityForm = {
  process_id: string;
  level: string;
  role_title: string;
  roles: string;
  deliverables: string;
  responsibilities: string;
  authorities: string;
};
type CatalogOption = { id: string; name: string; abbreviation: string };
type PendingAction = "preview" | "verify";

const emptyResponsibility: ResponsibilityForm = {
  process_id: "",
  level: "pilote",
  role_title: "",
  roles: "",
  deliverables: "",
  responsibilities: "",
  authorities: "",
};
const LEVELS = [
  { value: "pilote", label: "Pilote" },
  { value: "copilote", label: "Copilote" },
] as const;

function normalizeLevel(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim();
}
function levelLabel(value: unknown): string {
  return normalizeLevel(value) === "copilote" ? "Copilote" : "Pilote";
}
function titleOf(item: Responsibility): string {
  const title = String(item.role_title ?? "").trim() || String(item.roles ?? "").trim();
  return title || "Fiche sans intitulé";
}
function processIdOf(item: Responsibility): string {
  if (item.process_id != null && String(item.process_id) !== "") return String(item.process_id);
  const raw = item.process as Record<string, unknown> | null | undefined;
  const id = raw?.["id"];
  return id == null ? "" : String(id);
}
function documentInfo(payload: unknown): { id: string | undefined; code: string } {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data =
    root["data"] && typeof root["data"] === "object"
      ? (root["data"] as Record<string, unknown>)
      : root;
  const attributes =
    data["attributes"] && typeof data["attributes"] === "object"
      ? (data["attributes"] as Record<string, unknown>)
      : data;
  const id = data["id"] ?? attributes["id"];
  return { id: id == null ? undefined : String(id), code: String(attributes["code"] ?? "") };
}

export function ResponsibilitiesPage() {
  const [siteId] = useCurrentSite();
  const queryClient = useQueryClient();
  const { data: responsibilities = [], isLoading } = useResponsibilities(siteId);
  const { data: processes = [] } = useProcesses(siteId);
  const { save, remove } = useResponsibilityMutations(siteId);

  const [form, setForm] = useState<ResponsibilityForm>(emptyResponsibility);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [processFilter, setProcessFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "matrix">("cards");

  const [catalogs, setCatalogs] = useState<CatalogOption[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [genProcessId, setGenProcessId] = useState("");
  const [genDialog, setGenDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>("preview");
  const [lastDocId, setLastDocId] = useState<string | undefined>(undefined);
  const [docCode, setDocCode] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewKey, setPreviewKey] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const catalogQuery = new URLSearchParams({ is_active: "true" });
    if (siteId) catalogQuery.set("site_id", siteId);
    backendApi
      .request<unknown>(`document-type-catalogs?${catalogQuery.toString()}`)
      .then((payload) => {
        const root =
          payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
        const values = Array.isArray(payload)
          ? payload
          : Array.isArray(root["data"])
            ? (root["data"] as unknown[])
            : [];
        if (cancelled) return;
        const options = values
          .map((entry) => {
            const value = flattenResource(entry);
            return {
              id: String(value["id"] ?? ""),
              name: String(value["name"] ?? value["title"] ?? ""),
              abbreviation: String(value["abbreviation"] ?? ""),
            };
          })
          .filter((option) => option.id && option.name);
        setCatalogs(options);
        setCatalogId((current) => current || options[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setCatalogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const processName = (item: Responsibility): string => {
    if (item.process && typeof item.process === "object")
      return processLabelOf(item.process as Record<string, unknown>);
    const found = processes.find((p) => String(p["id"]) === processIdOf(item));
    return found ? processLabelOf(found) : "Processus non renseigné";
  };
  const codeOf = (processId: string): string => {
    const found = processes.find((p) => String(p["id"]) === processId);
    return found ? processCodeOf(found) || "—" : "—";
  };
  const optionLabel = (p: Record<string, unknown>): string => {
    const code = processCodeOf(p);
    const label = processLabelOf(p);
    return code ? `${code} - ${label}` : label;
  };
  const processOptions = processes.map((p) => (
    <option key={String(p["id"])} value={String(p["id"] ?? "")}>
      {optionLabel(p)}
    </option>
  ));
  const levelOptions = LEVELS.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));

  const change = (key: keyof ResponsibilityForm, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));
  const openCreate = (): void => {
    setEditingId(undefined);
    const first = processes[0];
    setForm({
      ...emptyResponsibility,
      process_id: first && first["id"] != null ? String(first["id"]) : "",
    });
    setOpen(true);
  };
  const fillFrom = (item: Responsibility): ResponsibilityForm => ({
    process_id: processIdOf(item),
    level: normalizeLevel(item.level) === "copilote" ? "copilote" : "pilote",
    role_title: String(item.role_title ?? ""),
    roles: String(item.roles ?? ""),
    deliverables: String(item.deliverables ?? ""),
    responsibilities: join(item.responsibilities),
    authorities: join(item.authorities),
  });
  const edit = (item: Responsibility): void => {
    setEditingId(item.id != null ? String(item.id) : undefined);
    setForm(fillFrom(item));
    setOpen(true);
  };
  const duplicate = (item: Responsibility): void => {
    setEditingId(undefined);
    setForm(fillFrom(item));
    setOpen(true);
    toast.info("Fiche dupliquée — vérifiez puis enregistrez.");
  };

  const submit = async (keepOpen: boolean): Promise<void> => {
    const level = normalizeLevel(form.level);
    if (!form.process_id) {
      toast.error("Sélectionnez un processus pour la fiche.");
      return;
    }
    if (level !== "pilote" && level !== "copilote") {
      toast.error(
        "Le niveau doit être « Pilote » ou « Copilote » (valeur normalisée en minuscule).",
      );
      return;
    }
    if (!form.roles.trim()) {
      toast.error("Le rôle est requis.");
      return;
    }
    if (!form.deliverables.trim()) {
      toast.error("Les livrables sont requis.");
      return;
    }
    if (!processes.some((p) => String(p["id"]) === form.process_id)) {
      toast.error(`Le processus sélectionné (ID: ${form.process_id}) n'existe pas.`);
      return;
    }
    try {
      await save.mutateAsync({
        id: editingId,
        payload: {
          ...(siteId ? { site_id: Number(siteId) } : {}),
          process_id: Number(form.process_id),
          level,
          role_title: form.role_title,
          roles: form.roles,
          deliverables: form.deliverables,
          responsibilities: lines(form.responsibilities),
          authorities: lines(form.authorities),
        },
      });
      toast.success("Fiche de responsabilité enregistrée.");
      if (keepOpen) {
        setEditingId(undefined);
        setForm({ ...emptyResponsibility, process_id: form.process_id });
      } else {
        setOpen(false);
        setEditingId(undefined);
        setForm(emptyResponsibility);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'enregistrer la responsabilité."));
    }
  };
  const destroy = (id: string): void => {
    setConfirmDeleteId(id);
  };
  const doDestroy = async (id: string): Promise<void> => {
    try {
      await remove.mutateAsync(id);
      toast.success("Fiche supprimée.");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };
  const exportFile = async (kind: "pdf" | "docx"): Promise<void> => {
    try {
      const blob =
        kind === "pdf"
          ? await exportResponsibilitiesPdf(siteId)
          : await exportResponsibilitiesDocx(siteId);
      downloadBlob(blob, `fiches-responsabilite.${kind}`);
      toast.success(kind === "pdf" ? "PDF exporté." : "Document Word exporté.");
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    }
  };

  const openGen = (action: PendingAction): void => {
    if (!catalogs.length) {
      toast.error("Aucun type documentaire actif n'est disponible pour ce site.");
      return;
    }
    setPendingAction(action);
    setCatalogId((current) => current || catalogs[0]?.id || "");
    setGenProcessId((current) => {
      if (current) return current;
      const first = responsibilities[0];
      return first ? processIdOf(first) : "";
    });
    setGenDialog(true);
  };
  const previewById = async (id: string): Promise<void> => {
    try {
      const blob = await backendApi.blob(`documents/${id}/preview`);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewKey((current) => current + 1);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de prévisualiser le document."));
    }
  };
  const requestDoc = (action: PendingAction): void => {
    if (!lastDocId) {
      openGen(action);
      return;
    }
    if (action === "verify") {
      setVerifyOpen(true);
      return;
    }
    setDocBusy(true);
    void previewById(lastDocId).finally(() => setDocBusy(false));
  };
  const generate = async (): Promise<void> => {
    if (!catalogId) {
      toast.error("Sélectionnez un type documentaire.");
      return;
    }
    setDocBusy(true);
    try {
      const payload: Record<string, unknown> = {
        document_type_catalog_id: Number(catalogId),
        ...(genProcessId ? { process_id: Number(genProcessId) } : {}),
      };
      if (siteId) payload["site_id"] = Number(siteId);
      const response = await generateResponsibilityDraft(payload);
      const info = documentInfo(response);
      if (!info.id || !info.code)
        throw new Error("Le brouillon n'a pas retourné de code documentaire.");
      setLastDocId(info.id);
      setDocCode(info.code);
      setGenDialog(false);
      toast.success("Brouillon documentaire généré.");
      if (pendingAction === "preview") await previewById(info.id);
      else setVerifyOpen(true);
    } catch (error) {
      const message = errorMessage(error, "Impossible de générer le brouillon.");
      if (message.toLowerCase().includes("nomenclature")) {
        toast.error(
          "Aucun template de nomenclature publié pour ce site — publiez un template dans Référentiels > Nomenclature, puis réessayez.",
        );
      } else {
        toast.error(message);
      }
    } finally {
      setDocBusy(false);
    }
  };
  const submitVerify = async (): Promise<void> => {
    if (!lastDocId || !docCode) return;
    setDocBusy(true);
    try {
      await backendApi.request(`documents/${lastDocId}/confirm-code`, {
        method: "POST",
        body: JSON.stringify({ needs_verification: true, confirmed_code: docCode }),
      });
      setVerifyOpen(false);
      setLastDocId(undefined);
      setDocCode("");
      await queryClient.invalidateQueries({ queryKey: PENDING_DOCUMENTS_KEY });
      toast.success("Document envoyé pour vérification.");
    } catch (error) {
      toast.error(errorMessage(error, "Échec de la soumission pour vérification."));
    } finally {
      setDocBusy(false);
    }
  };

  const resetFilters = (): void => {
    setQuery("");
    setLevelFilter("all");
    setProcessFilter("all");
  };
  const hasActiveFilters = query.trim() !== "" || levelFilter !== "all" || processFilter !== "all";
  const visible = responsibilities.filter((item) => {
    const pid = processIdOf(item);
    const haystack =
      `${String(item.role_title ?? "")} ${String(item.roles ?? "")} ${String(item.deliverables ?? "")} ${processName(item)} ${codeOf(pid)}`.toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (levelFilter !== "all" && normalizeLevel(item.level) !== levelFilter) return false;
    if (processFilter !== "all" && pid !== processFilter) return false;
    return true;
  });
  const pilots = responsibilities.filter((i) => normalizeLevel(i.level) === "pilote");
  const copilots = responsibilities.filter((i) => normalizeLevel(i.level) === "copilote");
  const codesOf = (items: Responsibility[]): string => {
    const codes = Array.from(new Set(items.map((i) => codeOf(processIdOf(i))))).filter(
      (code) => code !== "—",
    );
    return codes.length > 0 ? codes.join(", ") : "—";
  };
  const renderSummary = (title: string, tone: string, items: Responsibility[]) => (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <span className={statusBadge(tone)}>{items.length} fiche(s)</span>
      </div>
      <p className={`mt-2 ${muted}`}>Processus couverts : {codesOf(items)}</p>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={String(item.id)} className="rounded-lg bg-background px-3 py-1.5 text-xs">
              <span className="font-bold">{codeOf(processIdOf(item))}</span>
              <span className="text-muted-foreground"> — {titleOf(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Leadership"
        title="Fiches de responsabilité"
        description="Reliez les rôles, autorités et livrables aux processus réellement enregistrés pour le site."
        icon={GitBranch}
      >
        <button className={secondary} onClick={() => void exportFile("pdf")}>
          <FileDown className="h-4 w-4" /> PDF
        </button>
        <button className={secondary} onClick={() => void exportFile("docx")}>
          <FileDown className="h-4 w-4" /> Word
        </button>
        <button className={secondary} disabled={docBusy} onClick={() => requestDoc("preview")}>
          <Eye className="h-4 w-4" /> Prévisualiser
        </button>
        <button className={secondary} disabled={docBusy} onClick={() => requestDoc("verify")}>
          <Send className="h-4 w-4" /> Vérifier
        </button>
        <button className={primary} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nouvelle fiche
        </button>
      </Header>

      <div className="grid gap-3 sm:grid-cols-2">
        {renderSummary("Pilotes", "Pilote", pilots)}
        {renderSummary("Copilotes", "Copilote", copilots)}
      </div>

      {open && (
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Modifier la fiche" : "Nouvelle fiche de responsabilité"}
              </h2>
              <p className={muted}>La fiche est reliée au processus sélectionné.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField
              label="Processus *"
              value={form.process_id}
              onChange={(v) => change("process_id", v)}
            >
              <option value="">Sélectionner un processus</option>
              {processOptions}
            </SelectField>
            <SelectField label="Niveau *" value={form.level} onChange={(v) => change("level", v)}>
              {levelOptions}
            </SelectField>
            <TextField
              label="Intitulé du rôle"
              value={form.role_title}
              onChange={(v) => change("role_title", v)}
              placeholder="Pilote du processus…"
            />
            <TextField
              label="Rôles *"
              value={form.roles}
              onChange={(v) => change("roles", v)}
              placeholder="Responsable du processus…"
            />
            <TextAreaField
              label="Livrables *"
              value={form.deliverables}
              onChange={(v) => change("deliverables", v)}
              placeholder="Documents, résultats attendus…"
            />
            <TextAreaField
              label="Responsabilités (une par ligne)"
              value={form.responsibilities}
              onChange={(v) => change("responsibilities", v)}
            />
            <TextAreaField
              label="Autorités (une par ligne)"
              value={form.authorities}
              onChange={(v) => change("authorities", v)}
              span
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className={primary}
              disabled={save.isPending}
              onClick={() => void submit(false)}
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              className={secondary}
              disabled={save.isPending}
              onClick={() => void submit(true)}
              title="Enregistre puis prépare une nouvelle fiche en conservant le processus"
            >
              <Plus className="h-4 w-4" /> Ajouter et continuer
            </button>
            {editingId && (
              <button
                className={secondary}
                onClick={() => {
                  setEditingId(undefined);
                  toast.info("Fiche dupliquée — modifiez puis enregistrez.");
                }}
              >
                <Copy className="h-4 w-4" /> Dupliquer
              </button>
            )}
            <button className={secondary} onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Filtres</span>
          </div>
          <input
            className={`${input} max-w-full sm:max-w-xs`}
            placeholder="Rechercher rôle, livrable, processus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`${input} max-w-full sm:max-w-[180px]`}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="all">Tous les niveaux</option>
            {levelOptions}
          </select>
          <select
            className={`${input} max-w-full sm:max-w-[240px]`}
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
          >
            <option value="all">Tous les processus</option>
            {processOptions}
          </select>
          <button className={secondary} onClick={resetFilters}>
            Réinitialiser
          </button>

          <div className="ml-auto flex rounded-lg border border-border p-1 bg-muted/20">
            <button
              className={`p-1.5 rounded ${viewMode === "cards" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"}`}
              onClick={() => setViewMode("cards")}
              title="Vue Cartes"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={`p-1.5 rounded ${viewMode === "matrix" ? "bg-background shadow-xs text-primary font-bold" : "text-muted-foreground"}`}
              onClick={() => setViewMode("matrix")}
              title="Tableau Matriciel"
            >
              <Table className="h-4 w-4" />
            </button>
          </div>
        </div>
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className={muted}>
              {responsibilities.length === 0
                ? "Aucune fiche de responsabilité enregistrée pour ce site."
                : "Aucune fiche ne correspond aux filtres."}
            </p>
            {hasActiveFilters && responsibilities.length > 0 && (
              <button className={`${secondary} mt-3`} onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : viewMode === "matrix" ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3" style={{ width: "25%" }}>
                    Processus
                  </th>
                  <th className="px-4 py-3" style={{ width: "15%" }}>
                    Niveau
                  </th>
                  <th className="px-4 py-3" style={{ width: "30%" }}>
                    Rôle et responsabilités
                  </th>
                  <th className="px-4 py-3" style={{ width: "20%" }}>
                    Livrables
                  </th>
                  <th className="px-4 py-3 text-right" style={{ width: "10%" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((item) => (
                  <tr key={String(item.id)} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs font-medium">
                      <span className="font-mono font-bold text-primary mr-1.5">
                        {codeOf(processIdOf(item))}
                      </span>
                      <span>{processName(item)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(normalizeLevel(item.level) || "Pilote")}>
                        {levelLabel(item.level)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-semibold text-foreground">{titleOf(item)}</div>
                      {item.responsibilities && (
                        <div className="text-muted-foreground mt-0.5 line-clamp-2">
                          {String(item.responsibilities)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {String(item.deliverables || "—")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => edit(item)}
                          title="Modifier"
                        >
                          <PenLine className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => duplicate(item)}
                          title="Dupliquer"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded p-1 text-destructive hover:bg-destructive/10"
                          onClick={() => void destroy(String(item.id))}
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
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((item) => (
              <li
                key={String(item.id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{titleOf(item)}</p>
                    <span className={statusBadge(normalizeLevel(item.level) || "Pilote")}>
                      {levelLabel(item.level)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {processName(item)} · Livrables : {String(item.deliverables ?? "—")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={secondary} onClick={() => edit(item)}>
                    <PenLine className="h-4 w-4" /> Modifier
                  </button>
                  <button className={secondary} onClick={() => duplicate(item)}>
                    <Copy className="h-4 w-4" /> Dupliquer
                  </button>
                  <button className={secondary} onClick={() => void destroy(String(item.id))}>
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {genDialog && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="responsibility-gen-title"
        >
          <div
            className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 shadow-2xl sm:max-w-xl sm:p-6`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Fiche de responsabilité
                </p>
                <h2 id="responsibility-gen-title" className="mt-1 font-display text-xl font-bold">
                  Paramètres du brouillon
                </h2>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-muted-foreground hover:bg-background"
                onClick={() => setGenDialog(false)}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className={`mt-3 ${muted}`}>
              Sélectionnez le type documentaire et le processus lié avant de générer le document.
            </p>
            <div className="mt-5 space-y-4">
              <div>
                <Label>Type documentaire</Label>
                <select
                  className={input}
                  value={catalogId}
                  onChange={(e) => setCatalogId(e.target.value)}
                >
                  <option value="">Sélectionner un type</option>
                  {catalogs.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.abbreviation})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Processus lié</Label>
                <select
                  className={input}
                  value={genProcessId}
                  onChange={(e) => setGenProcessId(e.target.value)}
                >
                  <option value="">Tous les processus</option>
                  {processOptions}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setGenDialog(false)}>
                Annuler
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => void generate()}
                disabled={docBusy || !catalogId}
              >
                {docBusy ? "Génération…" : "Générer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && previewUrl && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Prévisualisation PDF"
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-card p-2 text-foreground"
              onClick={() => {
                setPreviewOpen(false);
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(undefined);
              }}
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <iframe
            key={previewKey}
            title="Prévisualisation de la fiche de responsabilité"
            src={previewUrl}
            className="mx-auto h-full w-full max-w-5xl rounded-2xl bg-white"
          />
        </div>
      )}

      {verifyOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="responsibility-verify-title"
        >
          <div
            className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 shadow-2xl sm:max-w-lg sm:p-6`}
          >
            <h2 id="responsibility-verify-title" className="font-display text-xl font-bold">
              Soumettre pour vérification
            </h2>
            <p className={`mt-3 ${muted}`}>
              Le code du document généré est <strong className="text-foreground">{docCode}</strong>.
              Confirmez-le pour lancer le workflow de validation.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setVerifyOpen(false)}>
                Annuler
              </button>
              <button
                type="button"
                className={primary}
                onClick={() => void submitVerify()}
                disabled={docBusy}
              >
                {docBusy ? "Envoi…" : "Envoyer pour vérification"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer cette fiche de responsabilité ?"
        description="La fiche sera définitivement supprimée."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) void doDestroy(id);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
