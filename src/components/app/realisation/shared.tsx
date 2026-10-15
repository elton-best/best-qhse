import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Eye,
  FileDown,
  FileUp,
  FileWarning,
  Filter,
  LayoutGrid,
  List,
  PenLine,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  Header,
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
  statusBadge,
} from "../planning/shared";
import {
  assertSpreadsheetBlob,
  downloadBlob,
  exportRealisationXlsx,
  normalizeRealisationPayload,
  spreadsheetExtension,
  statusKeyOf,
  statusLabelOf,
  templateRealisationXlsx,
  useRealisationList,
  useRealisationMutations,
  type RealisationItem,
  type RealisationKey,
} from "@/integrations/backend/realisation";
import { useProcesses } from "@/integrations/backend/context";
import { useRelationOptions, type RelationOption, type RelationSource } from "@/integrations/backend/energy";

export type RealisationFieldType =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "number"
  | "process"
  | "relation";

export type RealisationField = {
  key: string;
  label: string;
  type: RealisationFieldType;
  options?: string[];
  /** Liste à valeurs codées (valeur envoyée au backend ≠ libellé affiché). */
  choices?: { value: string; label: string }[];
  /** Champ relationnel : liste chargée depuis l'API (responsable, IPÉ, équipement, prestataire). */
  source?: RelationSource;
  required?: boolean;
  full?: boolean;
  /** Valeur calculée par le serveur : affichée (détail, résumé), jamais saisie ni envoyée. */
  readOnly?: boolean;
};

export type RealisationPageConfig = {
  resource: RealisationKey;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Statuts affichés (filtre, badge, formulaire). */
  statuses: string[];
  statusKey?: string;
  titleKeys?: string[];
  codeKeys?: string[];
  fields: RealisationField[];
  /** Valeurs imposées à la création (ex. type de document). */
  defaults?: Record<string, unknown>;
  /** Filtre client supplémentaire (ex. procédures parmi les documents). */
  clientFilter?: (item: RealisationItem) => boolean;
  /** Champs résumés sous le titre des cartes (en plus de la description). */
  summaryKeys?: string[];
  /** Préfixe des noms de fichiers exportés. */
  filePrefix: string;
  searchPlaceholder?: string;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function firstOf(item: RealisationItem, keys: string[]): string {
  for (const key of keys) {
    const value = str(item[key]);
    if (value) return value;
  }
  return "";
}

/** Capte les crashs de rendu d'une page CH8 au lieu de casser toute la rubrique. */
export class RealisationErrorBoundary extends Component<
  { children: ReactNode; title?: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error("Erreur d'affichage.") };
  }

  override componentDidCatch(error: Error): void {
    console.error("[Realisation] Impossible d'afficher la page.", error);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="mx-auto max-w-3xl p-4 md:p-8">
          <div className={`${card} p-8 text-center`}>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Réalisation des activités
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              {this.props.title ?? "Cette page ne peut pas s'afficher"}
            </h1>
            <p className={`mx-auto mt-3 max-w-xl ${muted}`}>
              Une erreur inattendue a empêché l&apos;affichage. Vous pouvez réessayer : vos
              données sont conservées côté serveur.
            </p>
            <p className="mx-auto mt-4 max-w-xl break-words rounded-xl bg-background p-3 text-xs text-muted-foreground">
              {error.message}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={this.handleRetry} className={primary}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RealisationPage(config: RealisationPageConfig) {
  return (
    <RealisationErrorBoundary title={config.title}>
      <RealisationPageInner config={config} />
    </RealisationErrorBoundary>
  );
}

function RealisationPageInner({ config }: { config: RealisationPageConfig }) {
  const {
    resource,
    eyebrow,
    title,
    description,
    icon,
    statuses,
    fields,
    defaults,
    clientFilter,
    filePrefix,
  } = config;
  // Clé de statut centralisée (codes backend <-> libellés FR) ; un statusKey
  // explicite reste supporté pour les cas particuliers.
  const statusKey = config.statusKey ?? statusKeyOf(resource);
  void statusKey;
  const titleKeys = config.titleKeys ?? ["title", "name", "label"];
  const codeKeys = config.codeKeys ?? ["code", "reference", "ref"];

  const [siteId] = useCurrentSite();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RealisationItem | null>(null);
  const [detail, setDetail] = useState<RealisationItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RealisationItem | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formStatus, setFormStatus] = useState(statuses[0] ?? "");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filters = useMemo(
    () => ({ site_id: siteId || undefined, search: query.trim() || undefined }),
    [siteId, query],
  );
  // Pas de site => pas d'appel (les créations exigent un site côté backend).
  const {
    data: items = [],
    isLoading,
    isError,
    error: listError,
    refetch,
  } = useRealisationList(resource, filters, { enabled: !!siteId });
  const mutations = useRealisationMutations(resource, siteId);

  // Options du champ "processus" (sélecteur plutôt que saisie libre : le
  // backend exige un `process_id` existant pour la maîtrise opérationnelle).
  const { data: processResources = [] } = useProcesses(siteId);
  const processOptions = useMemo(
    () =>
      (processResources as Record<string, unknown>[])
        .map((source) => {
          const item = (source ?? {}) as Record<string, unknown>;
          const id = item["id"];
          const name = str(item["title"] ?? item["name"] ?? item["code"]);
          return { id: id == null ? "" : String(id), name: name || `#${String(id ?? "")}` };
        })
        .filter((option) => option.id !== ""),
    [processResources],
  );

  const editableFields = fields.filter((field) => !field.readOnly);
  const usedSources = new Set(fields.flatMap((f) => (f.source ? [f.source] : [])));
  const relationOptions: Record<RelationSource, RelationOption[]> = {
    users: useRelationOptions("users", siteId, usedSources.has("users")).data ?? [],
    ipe: useRelationOptions("ipe", siteId, usedSources.has("ipe")).data ?? [],
    equipment: useRelationOptions("equipment", siteId, usedSources.has("equipment")).data ?? [],
    provider: useRelationOptions("provider", siteId, usedSources.has("provider")).data ?? [],
  };

  /** Valeur lisible d'un champ : libellé d'un choix codé, nom d'une relation, date FR. */
  const displayValue = (field: RealisationField, item: RealisationItem): string => {
    const raw = str(item[field.key]);
    if (!raw) return "";
    if (field.choices) return field.choices.find((c) => c.value === raw)?.label ?? raw;
    if (field.source) {
      if (field.source === "users") {
        const responsible = item["responsible"];
        if (field.key === "responsible_id" && responsible && typeof responsible === "object") {
          const name = (responsible as Record<string, unknown>)["name"];
          if (typeof name === "string" && name) return name;
        }
      }
      return relationOptions[field.source].find((o) => o.value === raw)?.label ?? `#${raw}`;
    }
    if (field.type === "date") return formatDateFR(item[field.key]);
    return raw;
  };

  const summaryOf = (item: RealisationItem): string =>
    (config.summaryKeys ?? [])
      .flatMap((key) => {
        const field = fields.find((f) => f.key === key);
        const value = field ? displayValue(field, item) : "";
        return field && value ? [`${field.label} : ${value}`] : [];
      })
      .join(" · ");

  const displayStatus = (item: RealisationItem): string => statusLabelOf(resource, item);

  const visible = useMemo(() => {
    const base = clientFilter ? items.filter(clientFilter) : items;
    const q = query.trim().toLowerCase();
    return base.filter((item) => {
      if (statusFilter !== "all" && statusLabelOf(resource, item).toLowerCase() !== statusFilter)
        return false;
      if (q) {
        const haystack =
          `${firstOf(item, titleKeys)} ${firstOf(item, codeKeys)} ${str(item["description"])}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, clientFilter, query, statusFilter, resource, titleKeys, codeKeys]);

  const stats = useMemo(() => {
    const perStatus = new Map<string, number>();
    visible.forEach((item) => {
      const s = statusLabelOf(resource, item) || "—";
      perStatus.set(s, (perStatus.get(s) ?? 0) + 1);
    });
    return { total: visible.length, perStatus: [...perStatus.entries()].slice(0, 3) };
  }, [visible, resource]);

  const resetFilters = (): void => {
    setQuery("");
    setStatusFilter("all");
  };

  const openCreate = (): void => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant de créer un élément.");
      return;
    }
    setEditing(null);
    setForm({});
    setFormStatus(statuses[0] ?? "");
    setFormOpen(true);
  };

  const openEdit = (item: RealisationItem): void => {
    setEditing(item);
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      next[f.key] = str(item[f.key]);
    });
    setForm(next);
    // L'item porte un code backend : reconvertir vers le libellé FR du formulaire.
    setFormStatus(statusLabelOf(resource, item) || (statuses[0] ?? ""));
    setDetail(null);
    setFormOpen(true);
  };

  const touch = (key: string, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (): Promise<void> => {
    for (const field of editableFields) {
      if (field.required && !(form[field.key] ?? "").trim()) {
        toast.error(`Le champ « ${field.label} » est obligatoire.`);
        return;
      }
    }
    if (!(form[titleKeys[0] ?? "title"] ?? "").trim() && !editing) {
      toast.error("L'intitulé est requis.");
      return;
    }
    setBusy(true);
    try {
      const raw: Record<string, unknown> = { ...(defaults ?? {}) };
      editableFields.forEach((field) => {
        const value = (form[field.key] ?? "").trim();
        raw[field.key] = field.type === "number" ? value === "" ? null : Number(value) : value || null;
      });
      const mainTitleKey = titleKeys[0] ?? "title";
      if (!raw[mainTitleKey] || !str(raw[mainTitleKey]).trim()) {
        raw[mainTitleKey] =
          str(raw["description"]).slice(0, 120) || `${title} ${new Date().toLocaleDateString("fr-FR")}`;
      }
      // Aligne le payload sur le contrat backend : clés inconnues retirées,
      // identifiants coercés, enums FR converties, statut FR -> code backend.
      const payload = normalizeRealisationPayload(resource, raw, formStatus);
      if (editing) {
        await mutations.update.mutateAsync({ id: editing.id, payload });
      } else {
        await mutations.create.mutateAsync(payload);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (): Promise<void> => {
    if (!confirmDelete) return;
    try {
      await mutations.remove.mutateAsync(confirmDelete.id);
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    } finally {
      setConfirmDelete(null);
      setDetail(null);
    }
  };

  const doExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const blob = await assertSpreadsheetBlob(
        await exportRealisationXlsx(resource, siteId || undefined),
        "export",
      );
      downloadBlob(blob, `${filePrefix}-${siteId || "tous"}.${spreadsheetExtension(blob)}`);
      toast.success("Export téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setBusy(false);
    }
  };

  const doTemplate = async (): Promise<void> => {
    setBusy(true);
    try {
      const blob = await assertSpreadsheetBlob(await templateRealisationXlsx(resource), "modèle");
      downloadBlob(blob, `modele-${filePrefix}.${spreadsheetExtension(blob)}`);
      toast.success("Modèle d'import téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement du modèle impossible."));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File): Promise<void> => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant d'importer.");
      return;
    }
    setBusy(true);
    try {
      // Via la mutation : invalide la liste après import (rafraîchit l'affichage).
      await mutations.importFile.mutateAsync(file);
    } catch {
      // Message déjà affiché par la mutation (erreur FR du backend).
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const renderActions = (item: RealisationItem) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondary} onClick={() => setDetail(item)}>
        <Eye className="h-4 w-4" /> Détail
      </button>
      <button type="button" className={secondary} onClick={() => openEdit(item)}>
        <PenLine className="h-4 w-4" /> Modifier
      </button>
      <button type="button" className={secondary} onClick={() => setConfirmDelete(item)}>
        <Trash2 className="h-4 w-4" /> Supprimer
      </button>
    </div>
  );

  const Icon = icon;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      {isError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          <p className="font-bold">Impossible de charger les données de cette page.</p>
          <p className="mt-1">{errorMessage(listError, "Une erreur inattendue est survenue.")}</p>
          <button
            type="button"
            className={`${secondary} mt-3`}
            disabled={busy}
            onClick={() => void refetch()}
          >
            Réessayer
          </button>
        </div>
      )}
      <Header eyebrow={eyebrow} title={title} description={description} icon={Icon}>
        <button type="button" className={secondary} disabled={busy} onClick={() => void doTemplate()}>
          <FileWarning className="h-4 w-4" /> Modèle
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" /> Import Excel
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          aria-label="Fichier Excel à importer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doImport(file);
          }}
        />
        <button type="button" className={secondary} disabled={busy} onClick={() => void doExport()}>
          <FileDown className="h-4 w-4" /> {busy ? "Export…" : "Export Excel"}
        </button>
        <button type="button" className={primary} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nouveau
        </button>
      </Header>

      <div className={`${card} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <Stat value={stats.total} label="Total" />
        {stats.perStatus.map(([status, count]) => (
          <Stat key={status} value={count} label={status} />
        ))}
      </div>

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Filtres</span>
          </div>
          <input
            className={`${input} max-w-full sm:max-w-xs`}
            placeholder={config.searchPlaceholder ?? "Rechercher intitulé, code, description…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`${input} max-w-full sm:max-w-[220px]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            {statuses.map((s) => (
              <option key={s} value={s.toLowerCase()}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" className={secondary} onClick={resetFilters}>
            Réinitialiser
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className={view === "grid" ? primary : secondary}
              onClick={() => setView("grid")}
              aria-label="Vue grille"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={view === "list" ? primary : secondary}
              onClick={() => setView("list")}
              aria-label="Vue liste"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4">
            <PageSkeleton rows={4} />
          </div>
        ) : !siteId ? (
          <div className="py-10 text-center">
            <p className={muted}>Sélectionnez un site pour afficher les données.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className={muted}>
              {items.length === 0
                ? "Aucun élément enregistré pour ce périmètre."
                : "Aucun élément ne correspond aux filtres."}
            </p>
            {(query.trim() !== "" || statusFilter !== "all") && items.length > 0 && (
              <button type="button" className={`${secondary} mt-3`} onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <article
                key={String(item.id)}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {firstOf(item, codeKeys) || `#${String(item.id)}`}
                  </span>
                  <span className={statusBadge(displayStatus(item))}>
                    {displayStatus(item) || "—"}
                  </span>
                </div>
                <h3 className="mt-2 font-display font-bold">
                  {firstOf(item, titleKeys) || "Sans intitulé"}
                </h3>
                {summaryOf(item) && (
                  <p className="mt-1 text-xs font-semibold text-foreground/80">{summaryOf(item)}</p>
                )}
                <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>
                  {str(item["description"]) || "—"}
                </p>
                <div className="mt-3">{renderActions(item)}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Référence</th>
                  <th className="px-3 py-2">Intitulé</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Mise à jour</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={String(item.id)} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold">
                      {firstOf(item, codeKeys) || "—"}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {firstOf(item, titleKeys) || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusBadge(displayStatus(item))}>
                        {displayStatus(item) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateFR(item["updated_at"])}</td>
                    <td className="px-3 py-2">{renderActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? `Modifier ${title}` : `Nouveau ${title}`}
        >
          <div className={`${card} my-8 w-full max-w-3xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {editing ? "Modification" : "Création"}
                </p>
                <h2 className="mt-1 font-display text-xl font-bold">
                  {editing ? "Modifier la fiche" : `Nouveau — ${title}`}
                </h2>
              </div>
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
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Statut *
                </label>
                <select
                  className={input}
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {editableFields.map((field) => (
                <div key={field.key} className={field.full ? "sm:col-span-2" : undefined}>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {field.label} {field.required ? "*" : ""}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      className={`${input} min-h-24`}
                      value={form[field.key] ?? ""}
                      onChange={(e) => touch(field.key, e.target.value)}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className={input}
                      value={form[field.key] ?? ""}
                      onChange={(e) => touch(field.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {field.choices
                        ? field.choices.map((choice) => (
                            <option key={choice.value} value={choice.value}>
                              {choice.label}
                            </option>
                          ))
                        : (field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                    </select>
                  ) : field.type === "relation" && field.source ? (
                    <select
                      className={input}
                      value={form[field.key] ?? ""}
                      onChange={(e) => touch(field.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {relationOptions[field.source].map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "process" ? (
                    processOptions.length > 0 ? (
                      <select
                        className={input}
                        value={form[field.key] ?? ""}
                        onChange={(e) => touch(field.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {processOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        className={input}
                        placeholder="Identifiant du processus"
                        value={form[field.key] ?? ""}
                        onChange={(e) => touch(field.key, e.target.value)}
                      />
                    )
                  ) : (
                    <input
                      type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                      className={input}
                      value={form[field.key] ?? ""}
                      onChange={(e) => touch(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setFormOpen(false)}>
                Annuler
              </button>
              <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Détail de la fiche"
        >
          <div className={`${card} my-8 w-full max-w-3xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {firstOf(detail, codeKeys) || `#${String(detail.id)}`}
                </p>
                <h2 className="mt-1 font-display text-xl font-bold">
                  {firstOf(detail, titleKeys) || "Sans intitulé"}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-muted-foreground hover:bg-background"
                onClick={() => setDetail(null)}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={statusBadge(displayStatus(detail))}>
                {displayStatus(detail) || "—"}
              </span>
              <span className={`text-xs ${muted}`}>
                Mise à jour : {formatDateFR(detail["updated_at"])}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key} className={`rounded-xl bg-background p-3 ${field.full ? "sm:col-span-2" : ""}`}>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-sm">
                    {displayValue(field, detail) || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => openEdit(detail)}>
                <PenLine className="h-4 w-4" /> Modifier
              </button>
              <button type="button" className={secondary} onClick={() => setConfirmDelete(detail)}>
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Supprimer cet élément ?"
        description="Cette action est définitive. L'élément sera supprimé du registre."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
