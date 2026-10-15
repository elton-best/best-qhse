import { getRouteApi } from "@tanstack/react-router";
import {
  ArrowUpDown,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from "@/components/reui/kanban";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useProcesses } from "@/integrations/backend/context";
import {
  PLAN_ACTION_PRIORITIES,
  PLAN_ACTION_SOURCES,
  PLAN_ACTION_STATUSES,
  PLAN_ACTION_TYPES,
  computePlanActionStats,
  downloadActionBoardTemplate,
  downloadPlanActionTemplate,
  isPlanActionOverdue,
  lastProgressNote,
  planActionPriorityLabel,
  planActionSourceLabel,
  planActionStatusLabel,
  planActionTypeLabel,
  useActionSites,
  useActionSources,
  useActionUsers,
  useCreatePlanAction,
  useDeletePlanAction,
  useImportActionPlan,
  usePlanActionProgress,
  usePlanActionStatus,
  usePlanActions,
  useUpdatePlanAction,
  useVerifyPlanAction,
  type ActionSite,
  type ActionUser,
  type PlanActionItem,
  type PlanActionSource,
} from "@/integrations/backend/planningActions";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import { backendApi } from "@/integrations/backend/client";
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
  primary,
  secondary,
} from "./shared";

const sectionSearchRoute = getRouteApi("/_authenticated/app/$section");

type ProcessOption = { id: string; label: string };

type Filters = {
  search: string;
  type: string;
  priority: string;
  status: string;
  responsibleId: string;
  processId: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  type: "all",
  priority: "all",
  status: "all",
  responsibleId: "all",
  processId: "all",
};

function strOfRecord(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return value === null || value === undefined ? "" : String(value);
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "draft"
      ? "bg-slate-100 text-slate-600"
      : status === "assigned"
        ? "bg-sky-100 text-sky-700"
        : status === "in_progress"
          ? "bg-amber-100 text-amber-800"
          : status === "cancelled"
            ? "bg-red-100 text-red-700"
            : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {planActionStatusLabel(status)}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const tone =
    priority === "urgent" || priority === "high" || priority === "critical"
      ? "bg-red-100 text-red-700"
      : priority === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {planActionPriorityLabel(priority)}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  const tone = type === "preventive" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>
      {planActionTypeLabel(type)}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold text-muted-foreground">{clamped} %</span>
    </div>
  );
}

function dueClass(item: PlanActionItem): string {
  return isPlanActionOverdue(item.due_date, item.status)
    ? "font-bold text-red-600"
    : "text-muted-foreground";
}

// ---------- Carte kanban (ReUI + thème projet) ----------

type BoardColumnKey = "draft" | "assigned" | "in_progress" | "done";

const BOARD_COLUMNS: { key: BoardColumnKey; label: string; hint: string }[] = [
  { key: "draft", label: "Brouillon", hint: "À qualifier" },
  { key: "assigned", label: "Assignée", hint: "Prête à démarrer" },
  { key: "in_progress", label: "En cours", hint: "Suivi actif" },
  { key: "done", label: "Terminées", hint: "Terminée · Annulée" },
];

function columnKeyOf(status: string): BoardColumnKey {
  if (status === "assigned") return "assigned";
  if (status === "in_progress") return "in_progress";
  if (
    status === "completed" ||
    status === "verified" ||
    status === "closed" ||
    status === "cancelled"
  )
    return "done";
  return "draft";
}

function dropStatusOf(column: BoardColumnKey): PlanActionItem["status"] {
  if (column === "assigned") return "assigned";
  if (column === "in_progress") return "in_progress";
  if (column === "done") return "completed";
  return "draft";
}

function priorityBadgeVariant(
  priority: string,
): "destructive-light" | "warning-light" | "success-light" | "primary-light" {
  if (priority === "urgent" || priority === "critical" || priority === "high")
    return "destructive-light";
  if (priority === "medium") return "warning-light";
  if (priority === "low") return "success-light";
  return "primary-light";
}

function ActionKanbanCard({
  item,
  canChange,
  onView,
  onProgress,
  onQuickStatus,
}: {
  item: PlanActionItem;
  canChange: boolean;
  onView: () => void;
  onProgress: () => void;
  onQuickStatus: () => void;
}) {
  const overdue = isPlanActionOverdue(item.due_date, item.status);
  const processLabel = item.process_title ?? item.process_code ?? null;
  const responsibleLabel = item.responsible_name ?? item.responsible_email ?? "Non assigné";
  const progress = Math.min(100, Math.max(0, Math.round(item.progress)));
  const cardContent = (
    <Card
      className={`cursor-pointer ${overdue ? "border-destructive/60" : ""}`}
      onClick={onView}
    >
      <CardContent className="space-y-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold text-primary">{item.reference}</span>
          <Badge variant={priorityBadgeVariant(item.priority)} className="shrink-0 text-xs">
            {planActionPriorityLabel(item.priority)}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[11px]">
            {planActionTypeLabel(item.type)}
          </Badge>
          {processLabel && (
            <span className="max-w-full truncate text-[11px] font-semibold text-muted-foreground">
              {processLabel}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar className="size-5 shrink-0">
              <AvatarFallback className="text-[10px] font-bold">
                {(responsibleLabel.trim().charAt(0) || "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate font-semibold text-foreground">{responsibleLabel}</span>
          </span>
          {item.due_date && (
            <time
              className={`shrink-0 tabular-nums ${overdue ? "font-bold text-destructive" : ""}`}
            >
              {overdue ? "En retard · " : ""}
              {formatDateFR(item.due_date)}
            </time>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
            {progress} %
          </span>
        </div>
        <div className="flex items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5">
            <StatusPill status={item.status} />
            {item.effectiveness_verified && (
              <span title="Efficacité vérifiée">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </span>
            )}
          </span>
          {item.source_label && (
            <span className="truncate text-[11px] font-semibold text-muted-foreground">
              {item.source_label}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={!canChange}
            title={
              canChange
                ? "Changer le statut"
                : "Réservé au responsable de l'action (ou droit actions.update)"
            }
            onClick={(e) => {
              e.stopPropagation();
              onQuickStatus();
            }}
          >
            <Check className="h-3.5 w-3.5" /> Statut
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            title="Voir le détail"
            aria-label="Voir le détail"
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            title="Mettre à jour le suivi"
            aria-label="Mettre à jour le suivi"
            onClick={(e) => {
              e.stopPropagation();
              onProgress();
            }}
          >
            <TrendingUp className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <KanbanItem value={String(item.id)}>
      <KanbanItemHandle className="cursor-grab">{cardContent}</KanbanItemHandle>
    </KanbanItem>
  );
}

// ---------- Dialog changement de statut rapide (cartes + drag-and-drop) ----------

function QuickStatusDialog({
  item,
  preset,
  onClose,
  onChanged,
}: {
  item: PlanActionItem;
  preset: PlanActionItem["status"];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const statusMutation = usePlanActionStatus();
  const [status, setStatus] = useState<PlanActionItem["status"]>(preset);
  const [comment, setComment] = useState("");

  const submit = () => {
    statusMutation.mutate(
      { id: item.id, status, comments: comment.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Statut mis à jour : ${planActionStatusLabel(status)}`);
          onChanged?.();
          onClose();
        },
        onError: (error) => {
          const code = (error as { status?: unknown } | null)?.status;
          toast.error(
            code === 403
              ? "Changement impossible : vous n'avez pas la permission (responsable de l'action ou droit actions.update requis)."
              : errorMessage(error, "Changement impossible."),
          );
        },
      },
    );
  };

  return typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
          onClick={() => {
            if (!statusMutation.isPending) onClose();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Changer le statut"
          >
            <p className="font-mono text-xs font-bold text-primary">{item.reference}</p>
            <h2 className="mt-1 font-display text-lg font-bold text-foreground">
              Changer le statut
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.title} — statut actuel « {planActionStatusLabel(item.status)} ».
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Nouveau statut
              </span>
              <select
                className={input}
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanActionItem["status"])}
                aria-label="Nouveau statut"
              >
                {PLAN_ACTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {planActionStatusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Commentaire (optionnel)
              </span>
              <textarea
                className={`${input} min-h-24`}
                value={comment}
                maxLength={1000}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Motif du changement…"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={statusMutation.isPending}
                className={`${secondary} flex-1`}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={statusMutation.isPending}
                className={`${primary} flex-1`}
              >
                {statusMutation.isPending ? "Application…" : "Appliquer"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}

// ---------- Dialog création / édition ----------

type FormState = {
  title: string;
  description: string;
  type: string;
  priority: string;
  siteId: string;
  processId: string;
  responsibleId: string;
  dueDate: string;
  sourceType: "" | PlanActionSource;
  sourceIdText: string;
  estimatedCost: string;
  actualCost: string;
  requiredResources: string;
  effectivenessCriteria: string;
};

function tomorrowISO(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

/** L'origine (?origin=) n'est reprise comme identifiant source que si elle est numérique. */
function numericSourceId(value: string | undefined): string {
  if (!value) return "";
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.trunc(parsed)) : "";
}

function isPlanActionSource(value: unknown): value is PlanActionSource {
  return value === "nc" || value === "audit" || value === "risk";
}

function ActionFormDialog({
  editing,
  prefillSourceId,
  prefillSourceType,
  defaultSiteId,
  defaultResponsibleId,
  siteOptions,
  userOptions,
  processOptions,
  onClose,
}: {
  editing: PlanActionItem | null;
  prefillSourceId?: string | undefined;
  prefillSourceType?: PlanActionSource | undefined;
  defaultSiteId: string;
  defaultResponsibleId?: string | undefined;
  siteOptions: ActionSite[];
  userOptions: ActionUser[];
  processOptions: ProcessOption[];
  onClose: () => void;
}) {
  const create = useCreatePlanAction();
  const update = useUpdatePlanAction();
  const [form, setForm] = useState<FormState>(() => ({
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    type: editing?.type ?? "corrective",
    priority: editing?.priority ?? "medium",
    siteId:
      editing?.site_id !== null && editing?.site_id !== undefined
        ? String(editing.site_id)
        : defaultSiteId,
    processId:
      editing?.process_id !== null && editing?.process_id !== undefined
        ? String(editing.process_id)
        : "",
    responsibleId:
      editing?.responsible_id !== null && editing?.responsible_id !== undefined
        ? String(editing.responsible_id)
        : (defaultResponsibleId ?? ""),
    dueDate: editing?.due_date ? editing.due_date.slice(0, 10) : "",
    sourceType:
      editing?.source_type === "non_conformity" || editing?.source_type === "nc"
        ? "nc"
        : editing?.source_type === "audit" || editing?.source_type === "risk"
          ? editing.source_type
          : (prefillSourceType ?? ""),
    sourceIdText:
      editing?.source_id !== null && editing?.source_id !== undefined
        ? String(editing.source_id)
        : numericSourceId(prefillSourceId),
    estimatedCost:
      editing?.estimated_cost !== null && editing?.estimated_cost !== undefined
        ? String(editing.estimated_cost)
        : "",
    actualCost:
      editing?.actual_cost !== null && editing?.actual_cost !== undefined
        ? String(editing.actual_cost)
        : "",
    requiredResources: editing?.required_resources ?? "",
    effectivenessCriteria: editing?.effectiveness_criteria ?? "",
  }));
  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const sourcesQuery = useActionSources(form.sourceType);
  const sourceItems = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data]);
  const busy = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title) {
      toast.error("Le titre est requis.");
      return;
    }
    if (description.length < 10) {
      toast.error("La description est requise (10 caractères minimum).");
      return;
    }
    if (!form.siteId) {
      toast.error("Le site est requis.");
      return;
    }
    if (!form.processId) {
      toast.error("Le processus est requis.");
      return;
    }
    if (!form.responsibleId) {
      toast.error("Le responsable est requis par le backend.");
      return;
    }
    if (!form.dueDate) {
      toast.error("La date d'échéance est requise.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const dateChanged = !editing || editing.due_date?.slice(0, 10) !== form.dueDate;
    if (dateChanged && form.dueDate <= today) {
      toast.error("L'échéance doit être postérieure à aujourd'hui.");
      return;
    }
    let sourceId: number | undefined;
    let sourceRef: string | undefined;
    if (form.sourceType && form.sourceIdText.trim() !== "") {
      const raw = form.sourceIdText.trim();
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed)) {
        sourceId = Math.trunc(parsed);
      } else {
        // Référence libre (ex. "AUD-2024-001") : conservée telle quelle.
        sourceRef = raw;
      }
    }
    const estimated = form.estimatedCost.trim() === "" ? undefined : Number(form.estimatedCost);
    if (estimated !== undefined && (!Number.isFinite(estimated) || estimated < 0)) {
      toast.error("Le coût estimé doit être un nombre positif.");
      return;
    }
    const actual = form.actualCost.trim() === "" ? undefined : Number(form.actualCost);
    if (actual !== undefined && (!Number.isFinite(actual) || actual < 0)) {
      toast.error("Le coût réel doit être un nombre positif.");
      return;
    }
    if (!editing) {
      create.mutate(
        {
          title,
          description,
          type: form.type,
          priority: form.priority,
          site_id: Number(form.siteId),
          process_id: Number(form.processId),
          responsible_id: Number(form.responsibleId),
          due_date: form.dueDate,
          source_type: form.sourceType === "" ? undefined : form.sourceType,
          source_id: sourceId,
          source_ref: sourceRef,
          estimated_cost: estimated,
          required_resources: form.requiredResources.trim() || undefined,
          effectiveness_criteria: form.effectivenessCriteria.trim() || undefined,
        },
        {
          onSuccess: () => {
            toast.success("Action créée");
            onClose();
          },
          onError: (error) => toast.error(errorMessage(error, "Création impossible.")),
        },
      );
      return;
    }
    const payload: Record<string, unknown> = {
      title,
      description,
      type: form.type,
      priority: form.priority === "urgent" ? "critical" : form.priority,
      site_id: Number(form.siteId),
      process_id: Number(form.processId),
      responsible_id: Number(form.responsibleId),
      source_type:
        form.sourceType === ""
          ? null
          : form.sourceType === "nc"
            ? "non_conformity"
            : form.sourceType,
      source:
        form.sourceType === ""
          ? null
          : form.sourceType === "nc"
            ? "non_conformity"
            : form.sourceType,
      source_id: sourceId ?? null,
      source_ref: sourceRef ?? null,
      estimated_cost: estimated ?? null,
      actual_cost: actual ?? null,
      required_resources: form.requiredResources.trim() || null,
      effectiveness_comments: form.effectivenessCriteria.trim() || null,
    };
    if (dateChanged) payload["deadline"] = form.dueDate;
    update.mutate(
      { id: editing.id, payload },
      {
        onSuccess: () => {
          toast.success("Action mise à jour");
          onClose();
        },
        onError: (error) => toast.error(errorMessage(error, "Mise à jour impossible.")),
      },
    );
  };

  return (
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
            onClick={onClose}
          >
            <form
              onSubmit={submit}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xl"
            >
              <h2 className="font-display text-lg font-bold text-foreground">
                {editing ? `Modifier ${editing.reference}` : "Nouvelle action"}
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {editing
                  ? "Les champs modifiés sont enregistrés via PUT /actions/:id."
                  : "Créée au statut brouillon via POST /actions."}
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <Label>Titre *</Label>
                  <input
                    autoFocus
                    className={input}
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Ex : Révision des procédures de sécurité"
                  />
                </div>
                <div>
                  <Label>Description * (10 caractères minimum)</Label>
                  <textarea
                    className={`${input} min-h-24`}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Décrivez l'action en détail…"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Type *</Label>
                    <select
                      className={input}
                      value={form.type}
                      onChange={(e) => set("type", e.target.value)}
                    >
                      {PLAN_ACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {planActionTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Priorité *</Label>
                    <select
                      className={input}
                      value={form.priority}
                      onChange={(e) => set("priority", e.target.value)}
                    >
                      {PLAN_ACTION_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {planActionPriorityLabel(priority)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Site *</Label>
                    {siteOptions.length > 0 ? (
                      <select
                        className={input}
                        value={form.siteId}
                        onChange={(e) => set("siteId", e.target.value)}
                      >
                        <option value="">— Sélectionner —</option>
                        {siteOptions.map((site) => (
                          <option key={site.id} value={String(site.id)}>
                            {site.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                        {defaultSiteId ? `Site courant #${defaultSiteId}` : "Aucun site disponible"}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Processus *</Label>
                    <select
                      className={input}
                      value={form.processId}
                      onChange={(e) => set("processId", e.target.value)}
                    >
                      <option value="">— Sélectionner —</option>
                      {processOptions.map((process) => (
                        <option key={process.id} value={process.id}>
                          {process.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Responsable *</Label>
                    <select
                      className={input}
                      value={form.responsibleId}
                      onChange={(e) => set("responsibleId", e.target.value)}
                    >
                      <option value="">— Sélectionner —</option>
                      {userOptions.map((user) => (
                        <option key={user.id} value={String(user.id)}>
                          {user.name}
                          {user.email ? ` · ${user.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Échéance * (après aujourd'hui)</Label>
                    <input
                      type="date"
                      className={input}
                      min={tomorrowISO()}
                      value={form.dueDate}
                      onChange={(e) => set("dueDate", e.target.value)}
                    />
                  </div>
                </div>

                <fieldset className="rounded-xl border border-border p-4">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Origine (optionnel)
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Type de source</Label>
                      <select
                        className={input}
                        value={form.sourceType}
                        onChange={(e) => {
                          set("sourceType", e.target.value as "" | PlanActionSource);
                          set("sourceIdText", "");
                        }}
                      >
                        <option value="">Aucune source</option>
                        {PLAN_ACTION_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {planActionSourceLabel(source)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {form.sourceType !== "" && (
                      <div>
                        <Label>Élément source</Label>
                        {sourceItems.length > 0 ? (
                          <select
                            className={input}
                            value={form.sourceIdText}
                            onChange={(e) => set("sourceIdText", e.target.value)}
                          >
                            <option value="">— Sélectionner —</option>
                            {sourceItems.map((item) => (
                              <option key={item.id} value={String(item.id)}>
                                {item.reference}
                                {item.title ? ` — ${item.title}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className={input}
                            inputMode="numeric"
                            value={form.sourceIdText}
                            onChange={(e) => set("sourceIdText", e.target.value)}
                            placeholder={
                              sourcesQuery.isLoading
                                ? "Chargement des éléments…"
                                : "N° ou référence (ex. 12 ou AUD-2024-001)"
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                </fieldset>

                <fieldset className="rounded-xl border border-border p-4">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Ressources et coûts
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Coût estimé</Label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={input}
                        value={form.estimatedCost}
                        onChange={(e) => set("estimatedCost", e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    {editing && (
                      <div>
                        <Label>Coût réel</Label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={input}
                          value={form.actualCost}
                          onChange={(e) => set("actualCost", e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <Label>Ressources nécessaires</Label>
                    <textarea
                      className={`${input} min-h-20`}
                      value={form.requiredResources}
                      onChange={(e) => set("requiredResources", e.target.value)}
                      placeholder="Ressources humaines, matérielles, financières…"
                    />
                  </div>
                </fieldset>

                <div>
                  <Label>Critères d'efficacité</Label>
                  <textarea
                    className={`${input} min-h-20`}
                    value={form.effectivenessCriteria}
                    onChange={(e) => set("effectivenessCriteria", e.target.value)}
                    placeholder="Comment l'efficacité de cette action sera évaluée…"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button type="button" onClick={onClose} className={`${secondary} flex-1`}>
                  Annuler
                </button>
                <button type="submit" disabled={busy} className={`${primary} flex-1`}>
                  {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer l'action"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
      : null
  );
}

// ---------- Dialog progression ----------

function ProgressDialog({ item, onClose }: { item: PlanActionItem; onClose: () => void }) {
  const progress = usePlanActionProgress();
  const [value, setValue] = useState(item.progress);
  const [note, setNote] = useState("");
  const submit = () => {
    progress.mutate(
      {
        id: item.id,
        progress: Math.min(100, Math.max(0, Math.round(value))),
        notes: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Progression mise à jour");
          onClose();
        },
        onError: (error) => toast.error(errorMessage(error, "Mise à jour impossible.")),
      },
    );
  };
  return (
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
            onClick={onClose}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6"
            >
              <h2 className="font-display text-lg font-bold text-foreground">Mettre à jour le suivi</h2>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {item.reference} · {item.title}
              </p>
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <Label>Progression</Label>
                  <span className="text-sm font-extrabold text-primary">{value} %</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="mt-1 w-full accent-primary"
                  aria-label="Progression en pourcent"
                />
                <ProgressBar value={value} />
                {value === 100 && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Passer à 100 % termine l'action côté backend.
                  </p>
                )}
              </div>
              <div className="mt-4">
                <Label>Observation</Label>
                <textarea
                  className={`${input} min-h-20`}
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note de suivi (optionnel, 1000 caractères max)…"
                />
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={onClose} className={`${secondary} flex-1`}>
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={progress.isPending}
                  onClick={submit}
                  className={`${primary} flex-1`}
                >
                  {progress.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null
  );
}

// ---------- Dialog détail (voir) ----------

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[38%_1fr] gap-3 px-4 py-2.5 text-sm">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-foreground">{value}</dd>
    </div>
  );
}

export function ActionDetailDialog({
  item,
  onClose,
  onEdit,
  onProgress,
  onDelete,
  onChanged,
  canChange,
}: {
  item: PlanActionItem;
  onClose: () => void;
  onEdit: () => void;
  onProgress: () => void;
  onDelete: () => void;
  onChanged?: () => void;
  canChange?: boolean;
}) {
  const statusMutation = usePlanActionStatus();
  const verifyMutation = useVerifyPlanAction();
  const [targetStatus, setTargetStatus] = useState(item.status);
  const [statusPrompt, setStatusPrompt] = useState(false);
  const [rating, setRating] = useState(3);
  const [verifyComment, setVerifyComment] = useState("");
  const overdue = isPlanActionOverdue(item.due_date, item.status);
  const allowed = canChange ?? true;

  // Après un changement (refetch), le sélecteur suit le statut réel de l'action.
  useEffect(() => {
    setTargetStatus((prev) => (statusPrompt ? prev : item.status));
  }, [item.status, statusPrompt]);

  const applyStatus = (comments: string) => {
    statusMutation.mutate(
      { id: item.id, status: targetStatus, comments: comments || undefined },
      {
        onSuccess: () => {
          toast.success(`Statut mis à jour : ${planActionStatusLabel(targetStatus)}`);
          setStatusPrompt(false);
          onChanged?.();
        },
        onError: (error) => {
          const status = (error as { status?: unknown } | null)?.status;
          toast.error(
            status === 403
              ? "Changement impossible : vous n'avez pas la permission (responsable de l'action ou droit actions.update requis)."
              : errorMessage(error, "Changement impossible."),
          );
        },
      },
    );
  };

  const applyVerify = () => {
    verifyMutation.mutate(
      { id: item.id, rating, comments: verifyComment.trim() || undefined },
      {
        onSuccess: () =>
          toast.success(rating >= 3 ? "Efficacité vérifiée" : "Action renvoyée en cours"),
        onError: (error) => toast.error(errorMessage(error, "Vérification impossible.")),
      },
    );
  };

  const notes = [...item.progress_notes].reverse();

  return (
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
            onClick={onClose}
          >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xl"
      >
        <p className="font-mono text-xs font-bold text-primary">
          {item.reference}
          {item.workflow_label ? ` · ${item.workflow_label}` : ""}
        </p>
        <h2 className="mt-1 font-display text-xl font-bold text-foreground">{item.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={item.status} />
          <PriorityPill priority={item.priority} />
          <TypePill type={item.type} />
          {overdue && <span className="text-xs font-bold text-destructive">En retard</span>}
        </div>
        {item.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{item.description}</p>
        )}
        <div className="mt-3">
          <ProgressBar value={item.progress} />
        </div>

        <dl className="mt-4 divide-y divide-border rounded-2xl border border-border">
          <DetailRow label="Référence" value={item.reference} />
          <DetailRow label="Source" value={item.source_label ?? "—"} />
          <DetailRow
            label="Site"
            value={item.site_name ?? (item.site_id !== null ? `Site #${item.site_id}` : "—")}
          />
          <DetailRow
            label="Processus"
            value={
              item.process_title ??
              item.process_code ??
              (item.process_id !== null ? `Processus #${item.process_id}` : "—")
            }
          />
          <DetailRow
            label="Responsable"
            value={
              item.responsible_name ??
              (item.responsible_id !== null ? `Utilisateur #${item.responsible_id}` : "—")
            }
          />
          <DetailRow label="Échéance" value={formatDateFR(item.due_date)} />
          <DetailRow label="Terminée le" value={formatDateFR(item.completion_date)} />
          <DetailRow
            label="Coûts (estimé / réel)"
            value={`${item.estimated_cost !== null ? String(item.estimated_cost) : "—"} / ${item.actual_cost !== null ? String(item.actual_cost) : "—"}`}
          />
          <DetailRow label="Ressources" value={item.required_resources ?? "—"} />
          <DetailRow label="Critères d'efficacité" value={item.effectiveness_criteria ?? "—"} />
          <DetailRow
            label="Efficacité vérifiée"
            value={item.effectiveness_verified ? "Oui" : "Non"}
          />
        </dl>

        <div className="mt-5 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Changer le statut
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <select
              className={input}
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as PlanActionItem["status"])}
              aria-label="Nouveau statut"
            >
              {PLAN_ACTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {planActionStatusLabel(status)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={statusMutation.isPending || !allowed}
              onClick={() => setStatusPrompt(true)}
              title={
                allowed
                  ? "Appliquer le nouveau statut"
                  : "Réservé au responsable de l'action (ou droit actions.update)"
              }
              className={`${primary} shrink-0 disabled:opacity-50`}
            >
              {statusMutation.isPending ? "Application…" : "Appliquer"}
            </button>
          </div>
        </div>

        {item.status === "completed" && (
          <div className="mt-4 rounded-2xl border border-border p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Vérifier l'efficacité (note 1-5)
            </p>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  aria-label={`Note ${star} sur 5`}
                  className="rounded-lg p-1"
                >
                  <Star
                    className={`h-6 w-6 ${star <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-foreground">{rating}/5</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Note ≥ 3 : efficace (vérifiée). Note &lt; 3 : renvoyée en cours.
            </p>
            <textarea
              className={`${input} mt-2 min-h-20`}
              value={verifyComment}
              onChange={(e) => setVerifyComment(e.target.value)}
              placeholder="Commentaire de vérification (optionnel)…"
            />
            <button
              type="button"
              disabled={verifyMutation.isPending}
              onClick={applyVerify}
              className={`${primary} mt-2 w-full`}
            >
              {verifyMutation.isPending ? "Vérification…" : "Valider la vérification"}
            </button>
          </div>
        )}

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Suivi ({item.progress_notes.length})
          </p>
          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Aucune note de suivi.</p>
          ) : (
            <ol className="mt-2 space-y-3 border-l-2 border-primary/15 pl-4">
              {notes.map((entry, index) => (
                <li key={`${entry.date}-${index}`} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <p className="whitespace-pre-wrap text-foreground">{entry.note}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.date ? new Date(entry.date).toLocaleString("fr-FR") : "—"}
                    {entry.user_name ? ` · ${entry.user_name}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={onProgress} className={`${secondary} flex-1`}>
            <TrendingUp className="h-4 w-4" /> Suivi
          </button>
          <button type="button" onClick={onEdit} className={`${secondary} flex-1`}>
            <Pencil className="h-4 w-4" /> Modifier
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </button>
          <button type="button" onClick={onClose} className={`${secondary} flex-1`}>
            Fermer
          </button>
        </div>
      </div>

      {statusPrompt
        ? createPortal(
            <PromptDialog
              open={statusPrompt}
              title="Changer le statut"
              description={`Passer ${item.reference} au statut « ${planActionStatusLabel(targetStatus)} ». Commentaire optionnel.`}
              label="Commentaire"
              placeholder="Motif du changement…"
              multiline
              confirmLabel="Appliquer"
              busy={statusMutation.isPending}
              onSubmit={applyStatus}
              onCancel={() => {
                if (!statusMutation.isPending) setStatusPrompt(false);
              }}
            />,
            document.body,
          )
        : null}
          </div>,
          document.body,
        )
      : null
  );
}

// ---------- Page ----------

export function ActionsPage() {
  const search = sectionSearchRoute.useSearch({ shouldThrow: false });
  const origin =
    typeof search?.origin === "string" && search.origin.trim() !== ""
      ? search.origin.trim()
      : undefined;
  const openNew = search?.new === 1;

  const [site] = useCurrentSite();
  const actionsQuery = usePlanActions({ site_id: site === "" ? undefined : site, per_page: 100 });
  const usersQuery = useActionUsers(site === "" ? undefined : site);
  const sitesQuery = useActionSites();
  const processesQuery = useProcesses(site);

  const deleteMutation = useDeletePlanAction();
  const importMutation = useImportActionPlan();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlanActionItem | null>(null);
  const [prefillSourceId, setPrefillSourceId] = useState<string | undefined>(undefined);
  const [prefillSourceType, setPrefillSourceType] = useState<PlanActionSource | undefined>(
    undefined,
  );
  const [detailId, setDetailId] = useState<number | null>(null);
  const [progressId, setProgressId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sortBy, setSortBy] = useState<"priority" | "due" | "recent">("priority");
  const [quickItem, setQuickItem] = useState<PlanActionItem | null>(null);
  const [quickPreset, setQuickPreset] = useState<PlanActionItem["status"]>("in_progress");
  const [myId, setMyId] = useState("");
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const autoOpened = useRef(false);

  // Responsable par défaut = soi-même (l'action apparaît alors dans Mes actions).
  useEffect(() => {
    let off = false;
    backendApi.auth
      .me()
      .then((profile) => {
        if (!off) {
          setMyId(String(profile.id ?? ""));
          setMyPermissions(Array.isArray(profile.permissions) ? profile.permissions : []);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, []);

  // Changement de statut autorisé : responsable de l'action ou droit global.
  // Le backend reste l'arbitre (périmètre, workflow fermé) : ceci n'est qu'un
  // garde-fou d'affichage pour éviter les 403 incompris.
  const canChangeStatus = (item: PlanActionItem): boolean => {
    if (myId === "") return true;
    if (String(item.responsible_id ?? "") === myId) return true;
    return myPermissions.some((p) => p === "actions.update" || p === "actions.manage");
  };

  const items = useMemo(() => actionsQuery.data ?? [], [actionsQuery.data]);
  const userOptions = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const siteOptions = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);

  const processOptions: ProcessOption[] = useMemo(() => {
    const fromQuery = (processesQuery.data ?? [])
      .map((record) => ({
        id: strOfRecord(record, "id"),
        label:
          strOfRecord(record, "title") ||
          strOfRecord(record, "code") ||
          `Processus #${strOfRecord(record, "id")}`,
      }))
      .filter((option) => option.id !== "");
    if (fromQuery.length > 0) return fromQuery;
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.process_id === null) continue;
      const key = String(item.process_id);
      if (!seen.has(key)) {
        seen.set(key, item.process_title ?? item.process_code ?? `Processus #${key}`);
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [processesQuery.data, items]);

  const stats = useMemo(() => computePlanActionStats(items), [items]);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const rank: Record<string, number> = { urgent: 0, critical: 0, high: 1, medium: 2, low: 3 };
    const list = items.filter((item) => {
      if (filters.type !== "all" && item.type !== filters.type) return false;
      if (filters.priority !== "all" && item.priority !== filters.priority) return false;
      if (filters.status !== "all" && item.status !== filters.status) return false;
      if (
        filters.responsibleId !== "all" &&
        String(item.responsible_id ?? "") !== filters.responsibleId
      )
        return false;
      if (filters.processId !== "all" && String(item.process_id ?? "") !== filters.processId)
        return false;
      if (query) {
        const haystack = [
          item.reference,
          item.title,
          item.description,
          item.process_title,
          item.process_code,
          item.responsible_name,
          item.site_name,
        ]
          .filter((part): part is string => part !== null && part !== "")
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sortBy === "priority") {
      sorted.sort((a, b) => (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9));
    } else if (sortBy === "due") {
      sorted.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    } else {
      sorted.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    }
    return sorted;
  }, [items, filters, sortBy]);

  // Colonnes du board ReUI (4) : les statuts vérifiée/clôturée rejoignent
  // « Terminées », qui accueille aussi les annulées.
  const boardColumns = useMemo(() => {
    const groups: Record<BoardColumnKey, PlanActionItem[]> = {
      draft: [],
      assigned: [],
      in_progress: [],
      done: [],
    };
    for (const item of filtered) groups[columnKeyOf(item.status)].push(item);
    return groups;
  }, [filtered]);

  const detailItem =
    detailId === null ? null : (items.find((item) => item.id === detailId) ?? null);
  const progressItem =
    progressId === null ? null : (items.find((item) => item.id === progressId) ?? null);
  const deleteItem =
    deleteId === null ? null : (items.find((item) => item.id === deleteId) ?? null);

  // Création liée : ?new=1 ou ?origin=<id> => ouvre le dialog pré-rempli (sans toucher au routeur).
  useEffect(() => {
    if (autoOpened.current) return;
    autoOpened.current = true;
    if (openNew || origin !== undefined) {
      setEditing(null);
      setPrefillSourceId(origin);
      setPrefillSourceType(isPlanActionSource(search?.kind) ? search.kind : undefined);
      setFormOpen(true);
    }
  }, [openNew, origin]);

  const openCreate = () => {
    setEditing(null);
    setPrefillSourceId(undefined);
    setPrefillSourceType(undefined);
    setFormOpen(true);
  };

  const openQuickStatus = (item: PlanActionItem, preset?: PlanActionItem["status"]) => {
    setQuickItem(item);
    setQuickPreset(preset ?? item.status);
  };

  // Après un changement de statut réussi, on lève le filtre de statut pour
  // que la carte déplacée reste visible (sinon elle « disparaît » de la vue).
  const revealAfterStatusChange = () => setFilter("status", "all");

  // Déplacement inter-colonnes (ReUI `onMove`) : on n'applique jamais le
  // déplacement localement (la valeur du board est dérivée des données) ;
  // on ouvre l'invite de statut avec commentaire (traçabilité).
  const handleKanbanMove = (event: KanbanMoveEvent) => {
    if (event.activeContainer === event.overContainer) return;
    const from =
      boardColumns[event.activeContainer as BoardColumnKey] ??
      ([] as PlanActionItem[]);
    const target = from[event.activeIndex];
    if (!target) return;
    if (columnKeyOf(target.status) === event.overContainer) return;
    if (!canChangeStatus(target)) {
      toast.error(
        "Changement impossible : réservé au responsable de l'action (ou droit actions.update).",
      );
      return;
    }
    openQuickStatus(target, dropStatusOf(event.overContainer as BoardColumnKey));
  };

  const overlayItem = (id: string | number): PlanActionItem | null => {
    for (const key of Object.keys(boardColumns)) {
      const found = boardColumns[key as BoardColumnKey]?.find(
        (item: PlanActionItem) => String(item.id) === String(id),
      );
      if (found) return found;
    }
    return null;
  };

  const confirmDelete = () => {
    if (deleteId === null) return;
    deleteMutation.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Action supprimée");
        if (detailId === deleteId) setDetailId(null);
        setDeleteId(null);
      },
      onError: (error) => toast.error(errorMessage(error, "Suppression impossible.")),
    });
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadPlanActionTemplate();
      toast.success("Modèle d'import Excel téléchargé");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    } finally {
      setDownloading(false);
    }
  };

  const downloadBoard = async () => {
    setDownloading(true);
    try {
      await downloadActionBoardTemplate();
      toast.success("Canevas M10-D1 téléchargé");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    } finally {
      setDownloading(false);
    }
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    importMutation.mutate(
      { file, siteId: site === "" ? undefined : site },
      {
        onSuccess: (result) => {
          if (result.errors > 0) {
            toast.warning(
              `Import partiel : ${result.success} créée(s), ${result.errors} erreur(s).`,
            );
          } else {
            toast.success(`Import réussi : ${result.success} action(s) créée(s).`);
          }
        },
        onError: (error) => toast.error(errorMessage(error, "Import impossible.")),
      },
    );
  };

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  if (actionsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
        <PageSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        eyebrow="Amélioration continue"
        title="Plans d'actions"
        description="Actions correctives et préventives : kanban, suivi d'avancement, changements de statut et vérification d'efficacité."
        icon={ClipboardList}
      >
        <button
          type="button"
          disabled={downloading}
          onClick={downloadTemplate}
          className={secondary}
          title="Télécharger le modèle Excel d'import (colonnes = import)"
        >
          <Download className="h-4 w-4" /> {downloading ? "Téléchargement…" : "Modèle d'import"}
        </button>
        <button
          type="button"
          disabled={downloading}
          onClick={downloadBoard}
          className={secondary}
          title="Canevas M10-D1 : tableau de bord et maîtrise des actions (Logi files)"
        >
          <Download className="h-4 w-4" /> Canevas M10-D1
        </button>
        <button
          type="button"
          disabled={importMutation.isPending}
          onClick={() => fileRef.current?.click()}
          className={secondary}
          title="Importer un plan d'actions (XLSX)"
        >
          <Upload className="h-4 w-4" /> {importMutation.isPending ? "Import…" : "Importer"}
        </button>
        <button type="button" onClick={openCreate} className={primary}>
          <Plus className="h-4 w-4" /> Nouvelle action
        </button>
      </Header>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onImportFile}
        aria-label="Fichier de plan d'actions à importer"
      />

      {site === "" && <SiteNotice />}

      {origin !== undefined && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Création liée à l'élément <span className="font-mono font-bold">{origin}</span> — précisez
          le type de source dans le formulaire.
        </div>
      )}

      {actionsQuery.isError ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-display text-lg font-bold text-foreground">
            Impossible de charger les actions
          </p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {errorMessage(actionsQuery.error, "Réessayez dans un instant.")}
          </p>
          <button
            type="button"
            onClick={() => actionsQuery.refetch()}
            className={`${secondary} mt-4`}
          >
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <div className={`${card} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5`}>
            <Stat value={stats.total} label="Total" />
            <Stat value={stats.draft} label="Brouillon" tone="text-slate-500" />
            <Stat value={stats.inProgress} label="En cours" tone="text-amber-600" />
            <Stat value={stats.completed} label="Terminées" tone="text-emerald-600" />
            <Stat value={stats.overdue} label="En retard" tone="text-destructive" />
          </div>

          <div className={`${card} space-y-3 p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                <input
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  placeholder="Rechercher (référence, titre, description)…"
                  className={`${input} pl-11`}
                  aria-label="Rechercher une action"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("kanban")}
                  aria-label="Vue kanban"
                  title="Vue kanban"
                  className={`rounded-xl p-2.5 transition ${viewMode === "kanban" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="Vue liste"
                  title="Vue liste"
                  className={`rounded-xl p-2.5 transition ${viewMode === "list" ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  <ListIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label>Type</Label>
                <select
                  className={input}
                  value={filters.type}
                  onChange={(e) => setFilter("type", e.target.value)}
                >
                  <option value="all">Tous les types</option>
                  {PLAN_ACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {planActionTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Priorité</Label>
                <select
                  className={input}
                  value={filters.priority}
                  onChange={(e) => setFilter("priority", e.target.value)}
                >
                  <option value="all">Toutes priorités</option>
                  {PLAN_ACTION_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {planActionPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Statut</Label>
                <select
                  className={input}
                  value={filters.status}
                  onChange={(e) => setFilter("status", e.target.value)}
                >
                  <option value="all">Tous les statuts</option>
                  {PLAN_ACTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {planActionStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Responsable</Label>
                <select
                  className={input}
                  value={filters.responsibleId}
                  onChange={(e) => setFilter("responsibleId", e.target.value)}
                >
                  <option value="all">Tous responsables</option>
                  {userOptions.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Processus</Label>
                <select
                  className={input}
                  value={filters.processId}
                  onChange={(e) => setFilter("processId", e.target.value)}
                >
                  <option value="all">Tous processus</option>
                  {processOptions.map((process) => (
                    <option key={process.id} value={process.id}>
                      {process.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold">
                {filtered.length} action{filtered.length > 1 ? "s" : ""} affichée
                {filtered.length > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="ml-auto font-semibold text-primary hover:underline"
              >
                Tout effacer
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={`${card} px-6 py-14 text-center`}>
              <p className="font-display text-base font-bold text-foreground">
                {items.length === 0 ? "Aucune action pour l'instant" : "Aucun résultat"}
              </p>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {items.length === 0
                  ? "Commencez par créer votre première action."
                  : "Modifiez votre recherche ou vos filtres."}
              </p>
              {items.length === 0 && (
                <button type="button" onClick={openCreate} className={`${primary} mt-5`}>
                  <Plus className="h-4 w-4" /> Créer une action
                </button>
              )}
            </div>
          ) : viewMode === "kanban" ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Board des actions{" "}
                    <span className="ml-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                      {filtered.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Glissez les cartes entre colonnes pour changer leur statut (avec
                    commentaire).
                  </p>
                </div>
                <label className="flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-semibold">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as "priority" | "due" | "recent")
                    }
                    aria-label="Trier les cartes"
                    className="bg-transparent outline-none"
                  >
                    <option value="priority">Tri : Priorité</option>
                    <option value="due">Tri : Échéance</option>
                    <option value="recent">Tri : Récent</option>
                  </select>
                </label>
              </div>
              <Kanban
                value={boardColumns}
                onValueChange={() => {}}
                getItemValue={(item) => String(item.id)}
                onMove={handleKanbanMove}
              >
                <KanbanBoard className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {BOARD_COLUMNS.map((column) => {
                    const tasks = boardColumns[column.key];
                    return (
                      <KanbanColumn key={column.key} value={column.key}>
                        <Card className="flex h-full flex-col">
                          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                            <div>
                              <p className="text-sm font-bold text-foreground">
                                {column.label}
                              </p>
                              <p className="text-[11px] font-semibold text-muted-foreground">
                                {column.hint}
                              </p>
                            </div>
                            <Badge variant="outline">{tasks.length}</Badge>
                          </CardHeader>
                          <CardContent className="flex-1">
                            <KanbanColumnContent
                              value={column.key}
                              className="flex min-h-24 flex-col gap-2.5"
                            >
                              {tasks.map((item) => (
                                <ActionKanbanCard
                                  key={item.id}
                                  item={item}
                                  canChange={canChangeStatus(item)}
                                  onView={() => setDetailId(item.id)}
                                  onProgress={() => setProgressId(item.id)}
                                  onQuickStatus={() => openQuickStatus(item)}
                                />
                              ))}
                              {tasks.length === 0 && (
                                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                                  Déposez une carte ici
                                </p>
                              )}
                            </KanbanColumnContent>
                          </CardContent>
                        </Card>
                      </KanbanColumn>
                    );
                  })}
                </KanbanBoard>
                <KanbanOverlay className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/60">
                  {({ value }) => {
                    const overlay = overlayItem(value);
                    if (!overlay) return null;
                    return (
                      <Card className="w-64 opacity-90 shadow-xl">
                        <CardContent className="space-y-1.5 p-3.5">
                          <p className="font-mono text-[11px] font-bold text-primary">
                            {overlay.reference}
                          </p>
                          <p className="line-clamp-2 text-sm font-semibold">
                            {overlay.title}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  }}
                </KanbanOverlay>
              </Kanban>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">
                Astuce : le changement de statut demande toujours un commentaire (traçabilité).
              </p>
            </div>
          ) : (
            <div className={`${card} overflow-x-auto [-webkit-overflow-scrolling:touch]`}>
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Référence</th>
                    <th className="px-4 py-3">Titre</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Priorité</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Progression</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => {
                    const note = lastProgressNote(item);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setDetailId(item.id)}
                        className="cursor-pointer transition-colors hover:bg-primary-soft/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-primary">
                          {item.reference}
                        </td>
                        <td className="max-w-[240px] px-4 py-3">
                          <p className="font-semibold text-foreground">{item.title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.process_title ?? item.process_code ?? ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <TypePill type={item.type} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityPill priority={item.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={item.status} />
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-3 text-muted-foreground">
                          {item.responsible_name ?? "—"}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 ${dueClass(item)}`}>
                          {item.due_date ? formatDateFR(item.due_date) : "—"}
                        </td>
                        <td className="min-w-[160px] px-4 py-3">
                          <ProgressBar value={item.progress} />
                          {note && (
                            <p className="mt-1 max-w-[220px] truncate text-[11px] text-muted-foreground">
                              {note}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Voir le détail"
                              aria-label="Voir le détail"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailId(item.id);
                              }}
                              className="rounded-lg p-1.5 text-primary hover:bg-primary-soft"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Mettre à jour le suivi"
                              aria-label="Mettre à jour le suivi"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProgressId(item.id);
                              }}
                              className="rounded-lg p-1.5 text-primary hover:bg-primary-soft"
                            >
                              <TrendingUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Supprimer"
                              aria-label="Supprimer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(item.id);
                              }}
                              className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {formOpen && (
        <ActionFormDialog
          editing={editing}
          prefillSourceId={prefillSourceId}
          prefillSourceType={prefillSourceType}
          defaultSiteId={site}
          defaultResponsibleId={myId}
          siteOptions={siteOptions}
          userOptions={userOptions}
          processOptions={processOptions}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
            setPrefillSourceId(undefined);
            setPrefillSourceType(undefined);
          }}
        />
      )}

      {detailItem && (
        <ActionDetailDialog
          item={detailItem}
          onClose={() => setDetailId(null)}
          onChanged={revealAfterStatusChange}
          canChange={canChangeStatus(detailItem)}
          onEdit={() => {
            setEditing(detailItem);
            setPrefillSourceId(undefined);
            setDetailId(null);
            setFormOpen(true);
          }}
          onProgress={() => setProgressId(detailItem.id)}
          onDelete={() => setDeleteId(detailItem.id)}
        />
      )}

      {progressItem && <ProgressDialog item={progressItem} onClose={() => setProgressId(null)} />}

      {quickItem && (
        <QuickStatusDialog
          item={quickItem}
          preset={quickPreset}
          onClose={() => setQuickItem(null)}
          onChanged={revealAfterStatusChange}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Supprimer cette action ?"
        description={
          deleteItem
            ? `${deleteItem.reference} · ${deleteItem.title}. Cette action est irréversible.`
            : "Cette action est irréversible."
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
