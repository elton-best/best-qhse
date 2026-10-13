import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileDiff,
  ListTree,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { flattenResource, useProcesses } from "@/integrations/backend/context";
import {
  PLAN_SM_TYPE_META,
  SM_WORKFLOW_STATUSES,
  downloadSmBlob,
  exportSmPlanXlsx,
  planSmTypeMeta,
  smModificationStatusLabel,
  smWorkflowLabel,
  usePlanSmCalendar,
  useSmDocuments,
  useSmModificationMutations,
  useSmModifications,
  useSmPlanHierarchy,
  useSmPlanMutations,
  useSmResponsables,
  type PlanSMCalendarTask,
  type SmModification,
  type SmPlanAction,
  type SmPlanActivity,
  type SmPlanSubActivity,
} from "@/integrations/backend/planningSm";
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
  statusBadge,
} from "./shared";

// ---------------------------------------------------------------------------
// Utilitaires locaux
// ---------------------------------------------------------------------------

function str(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayISO(): string {
  return toISODate(new Date());
}

function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseISO(value: string): Date {
  const parts = value.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function addDaysISO(value: string, days: number): string {
  const date = parseISO(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function addMonthsISO(value: string, months: number): string {
  const date = parseISO(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  return toISODate(date);
}

function monthRange(anchor: string): [string, string] {
  const date = parseISO(anchor);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return [toISODate(start), toISODate(end)];
}

function weekRange(anchor: string): [string, string] {
  const date = parseISO(anchor);
  const dow = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toISODate(start), toISODate(end)];
}

function rangeLabel(view: string, start: string, end: string): string {
  if (view === "day")
    return new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  if (view === "month")
    return new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  const s = new Date(`${start}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  const e = new Date(`${end}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${s} → ${e}`;
}

function processLabelOf(record: Record<string, unknown>): string {
  const code = str(record["code"]);
  const title = str(record["title"] ?? record["name"]);
  return code ? `${code} — ${title || code}` : title || "Processus non renseigné";
}

const ACTION_STATUS_META: Record<string, { label: string; classes: string }> = {
  a_planifier: { label: "À planifier", classes: "bg-slate-200 text-slate-700" },
  en_cours: { label: "En cours", classes: "bg-sky-100 text-sky-700" },
  realise: { label: "Réalisé", classes: "bg-emerald-100 text-emerald-700" },
  en_retard: { label: "En retard", classes: "bg-red-100 text-red-700" },
  replanifie: { label: "Replanifié", classes: "bg-amber-100 text-amber-700" },
};

function actionStatusMeta(status: unknown): { label: string; classes: string } {
  const key = str(status).toLowerCase();
  return (
    ACTION_STATUS_META[key] ?? {
      label: str(status) || "—",
      classes: "bg-slate-100 text-slate-600",
    }
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`${card} max-h-[90dvh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto p-4 sm:p-5`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            {description && <p className={`mt-1 ${muted}`}>{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            className={`${secondary} h-9 w-9 !px-0`}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page : 3 onglets
// ---------------------------------------------------------------------------

type TabId = "plan" | "calendar" | "changes";

export function SmPlanPage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<TabId>("plan");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1, current + 2].map(String);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        eyebrow="Planification · §6.3"
        title="Plan du SM & Modifications"
        description="Arbre hiérarchique Activité → Sous-activité → Action, calendrier global et demandes de modification du système."
        icon={ListTree}
      >
        <div className="flex items-center gap-2">
          <label
            className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
            htmlFor="sm-year"
          >
            Année
          </label>
          <select
            id="sm-year"
            className={`${input} !w-auto`}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </Header>
      {!siteId && <SiteNotice />}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sections du plan SM">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "plan"}
          className={tab === "plan" ? primary : secondary}
          onClick={() => setTab("plan")}
        >
          <ListTree className="h-4 w-4" /> Plan hiérarchique
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          className={tab === "calendar" ? primary : secondary}
          onClick={() => setTab("calendar")}
        >
          <CalendarDays className="h-4 w-4" /> Calendrier
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "changes"}
          className={tab === "changes" ? primary : secondary}
          onClick={() => setTab("changes")}
        >
          <FileDiff className="h-4 w-4" /> Modifications
        </button>
      </div>

      {tab === "plan" && <HierarchyTab siteId={siteId} year={year} />}
      {tab === "calendar" && <CalendarTab siteId={siteId} />}
      {tab === "changes" && <ChangesTab siteId={siteId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet (a) : plan hiérarchique
// ---------------------------------------------------------------------------

type ActivityDialogState = { mode: "create" } | { mode: "edit"; activity: SmPlanActivity };
type SubDialogState = { activityId: string | number; sub?: SmPlanSubActivity };
type ActionDialogState = { subId: string | number; action?: SmPlanAction };

function HierarchyTab({ siteId, year }: { siteId: string; year: string }) {
  const [processFilter, setProcessFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activityDialog, setActivityDialog] = useState<ActivityDialogState | null>(null);
  const [subDialog, setSubDialog] = useState<SubDialogState | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [reschedule, setReschedule] = useState<SmPlanAction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "activity" | "sub" | "action";
    id: string | number;
    label: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: processes = [] } = useProcesses(siteId);
  const hierarchy = useSmPlanHierarchy({
    year,
    site_id: siteId || undefined,
    process_id: processFilter || undefined,
  });
  const mutations = useSmPlanMutations();
  const busy =
    mutations.createActivity.isPending ||
    mutations.updateActivity.isPending ||
    mutations.deleteActivity.isPending ||
    mutations.createSubActivity.isPending ||
    mutations.updateSubActivity.isPending ||
    mutations.deleteSubActivity.isPending ||
    mutations.createAction.isPending ||
    mutations.updateAction.isPending ||
    mutations.deleteAction.isPending ||
    mutations.rescheduleAction.isPending;

  const activities = hierarchy.data?.activities ?? [];
  const summary = hierarchy.data?.summary ?? null;

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const doExport = async (): Promise<void> => {
    setExporting(true);
    try {
      const blob = await exportSmPlanXlsx({
        year,
        site_id: siteId || undefined,
        process_id: processFilter || undefined,
      });
      downloadSmBlob(blob, `plan_sm_${year}${siteId ? `_site_${siteId}` : "_tous_sites"}.xlsx`);
      toast.success("Export XLSX téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = (): void => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const done = (): void => {
      toast.success("Élément supprimé.");
      setPendingDelete(null);
    };
    const fail = (error: unknown): void => {
      toast.error(errorMessage(error, "Suppression impossible."));
    };
    if (target.kind === "activity")
      mutations.deleteActivity.mutate(target.id, { onSuccess: done, onError: fail });
    else if (target.kind === "sub")
      mutations.deleteSubActivity.mutate(target.id, { onSuccess: done, onError: fail });
    else mutations.deleteAction.mutate(target.id, { onSuccess: done, onError: fail });
  };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-56 flex-1">
          <Label>Processus</Label>
          <select
            className={input}
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
          >
            <option value="">Tous les processus</option>
            {(processes as Record<string, unknown>[]).map((process) => (
              <option key={str(process["id"])} value={str(process["id"])}>
                {processLabelOf(flattenResource(process))}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={secondary}
          disabled={exporting}
          onClick={() => void doExport()}
        >
          <Download className="h-4 w-4" /> {exporting ? "Export…" : "Export XLSX"}
        </button>
        <button
          type="button"
          className={primary}
          onClick={() => setActivityDialog({ mode: "create" })}
        >
          <Plus className="h-4 w-4" /> Activité
        </button>
      </div>

      {summary && (
        <div
          className={`${card} grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`}
        >
          <Stat value={summary.total_activities} label="Activités" />
          <Stat value={summary.total_actions} label="Actions" />
          <Stat value={summary.completed_actions} label="Réalisées" tone="text-emerald-600" />
          <Stat value={summary.in_progress_actions} label="En cours" tone="text-sky-600" />
          <Stat value={summary.delayed_actions} label="En retard" tone="text-red-600" />
          <Stat
            value={`${summary.completion_rate}%`}
            label="Taux de réalisation"
            tone="text-amber-600"
          />
        </div>
      )}

      {hierarchy.isLoading ? (
        <PageSkeleton rows={5} />
      ) : hierarchy.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Le plan hiérarchique ne peut pas être chargé depuis le serveur.
        </div>
      ) : activities.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-display text-lg font-bold">Aucune activité pour {year}</p>
          <p className={`mt-1 ${muted}`}>
            Créez la première activité du plan du système de management.
          </p>
          <button
            type="button"
            className={`${primary} mt-4`}
            onClick={() => setActivityDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" /> Créer une activité
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {activities.map((activity) => {
            const subs = activity.sub_activities ?? activity.subActivities ?? [];
            const key = `a-${str(activity.id)}`;
            const open = expanded.has(key) || expanded.size === 0;
            const actionCount = subs.reduce((total, sub) => total + (sub.actions ?? []).length, 0);
            return (
              <li key={key} className={`${card} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={open ? "Replier" : "Déplier"}
                    className={`${secondary} h-8 w-8 !px-0`}
                    onClick={() => toggle(key)}
                  >
                    <ChevronDown className={`h-4 w-4 transition ${open ? "" : "-rotate-90"}`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {str(activity.code) && (
                        <span className="mr-2 text-xs font-extrabold text-primary">
                          {str(activity.code)}
                        </span>
                      )}
                      {activity.title}
                    </p>
                    <p className={`text-xs ${muted}`}>
                      {subs.length} sous-activité(s) · {actionCount} action(s)
                      {str(activity.process?.title ?? activity.process?.code)
                        ? ` · ${str(activity.process?.code ?? "")} ${str(activity.process?.title ?? "")}`.trim()
                        : ""}
                      {str(activity.site?.name) ? ` · ${str(activity.site?.name)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={`${secondary} h-8 px-2.5 text-xs`}
                      onClick={() => setSubDialog({ activityId: activity.id })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Sous-activité
                    </button>
                    <button
                      type="button"
                      aria-label="Modifier l'activité"
                      className={`${secondary} h-8 w-8 !px-0`}
                      onClick={() => setActivityDialog({ mode: "edit", activity })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer l'activité"
                      className={`${secondary} h-8 w-8 !px-0`}
                      onClick={() =>
                        setPendingDelete({
                          kind: "activity",
                          id: activity.id,
                          label: activity.title,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {str(activity.description) && open && (
                  <p className={`mt-2 text-sm ${muted}`}>{str(activity.description)}</p>
                )}
                {open && (
                  <ul className="mt-3 space-y-2 border-l-2 border-primary/20 pl-3">
                    {subs.length === 0 && (
                      <li className={`text-sm ${muted}`}>
                        Aucune sous-activité — ajoutez-en une pour structurer le plan.
                      </li>
                    )}
                    {subs.map((sub) => (
                      <SubActivityNode
                        key={`s-${str(sub.id)}`}
                        sub={sub}
                        onAddAction={() => setActionDialog({ subId: sub.id })}
                        onEditSub={() => setSubDialog({ activityId: activity.id, sub })}
                        onDeleteSub={() =>
                          setPendingDelete({ kind: "sub", id: sub.id, label: sub.title })
                        }
                        onEditAction={(action) => setActionDialog({ subId: sub.id, action })}
                        onDeleteAction={(action) =>
                          setPendingDelete({ kind: "action", id: action.id, label: action.title })
                        }
                        onReschedule={setReschedule}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {activityDialog && (
        <ActivityFormDialog
          siteId={siteId}
          year={year}
          processes={(processes as Record<string, unknown>[]).map((item) => flattenResource(item))}
          initial={activityDialog.mode === "edit" ? activityDialog.activity : undefined}
          onClose={() => setActivityDialog(null)}
        />
      )}
      {subDialog && (
        <SubActivityFormDialog
          activityId={subDialog.activityId}
          initial={subDialog.sub}
          onClose={() => setSubDialog(null)}
        />
      )}
      {actionDialog && (
        <ActionFormDialog
          siteId={siteId}
          subId={actionDialog.subId}
          initial={actionDialog.action}
          onClose={() => setActionDialog(null)}
        />
      )}
      {reschedule && <RescheduleDialog action={reschedule} onClose={() => setReschedule(null)} />}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Supprimer « ${pendingDelete?.label ?? ""} » ?`}
        description="La suppression est définitive et cascade vers les niveaux inférieurs."
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {busy && <span className="sr-only">Opération en cours…</span>}
    </div>
  );
}

function SubActivityNode({
  sub,
  onAddAction,
  onEditSub,
  onDeleteSub,
  onEditAction,
  onDeleteAction,
  onReschedule,
}: {
  sub: SmPlanSubActivity;
  onAddAction: () => void;
  onEditSub: () => void;
  onDeleteSub: () => void;
  onEditAction: (action: SmPlanAction) => void;
  onDeleteAction: (action: SmPlanAction) => void;
  onReschedule: (action: SmPlanAction) => void;
}) {
  const actions = sub.actions ?? [];
  return (
    <li className="rounded-xl bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {str(sub.code) && (
              <span className="mr-2 text-xs font-extrabold text-primary">{str(sub.code)}</span>
            )}
            {sub.title}
          </p>
          <p className={`text-xs ${muted}`}>{actions.length} action(s)</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={`${secondary} h-8 px-2.5 text-xs`} onClick={onAddAction}>
            <Plus className="h-3.5 w-3.5" /> Action
          </button>
          <button
            type="button"
            aria-label="Modifier la sous-activité"
            className={`${secondary} h-8 w-8 !px-0`}
            onClick={onEditSub}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Supprimer la sous-activité"
            className={`${secondary} h-8 w-8 !px-0`}
            onClick={onDeleteSub}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {actions.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {actions.map((action) => {
            const meta = actionStatusMeta(action.status);
            return (
              <li
                key={`t-${str(action.id)}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{action.title}</p>
                  <p className={`text-xs ${muted}`}>
                    {str(action.responsible?.name ?? action.responsible_name) || "Sans responsable"}
                    {action.deadline ? ` · Échéance : ${formatDateFR(action.deadline)}` : ""}
                    {num(action.rescheduled_count) > 0
                      ? ` · Replanifiée ${num(action.rescheduled_count)}×`
                      : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${meta.classes}`}
                >
                  {meta.label}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    aria-label="Replanifier"
                    title="Replanifier (motif requis)"
                    className={`${secondary} h-8 w-8 !px-0`}
                    onClick={() => onReschedule(action)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Modifier l'action"
                    className={`${secondary} h-8 w-8 !px-0`}
                    onClick={() => onEditAction(action)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer l'action"
                    className={`${secondary} h-8 w-8 !px-0`}
                    onClick={() => onDeleteAction(action)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function ActivityFormDialog({
  siteId,
  year,
  processes,
  initial,
  onClose,
}: {
  siteId: string;
  year: string;
  processes: Record<string, unknown>[];
  initial: SmPlanActivity | undefined;
  onClose: () => void;
}) {
  const mutations = useSmPlanMutations();
  const [title, setTitle] = useState(str(initial?.title));
  const [code, setCode] = useState(str(initial?.code));
  const [processId, setProcessId] = useState(str(initial?.process_id));
  const [description, setDescription] = useState(str(initial?.description));
  const [order, setOrder] = useState(str(initial?.order));
  const pending = mutations.createActivity.isPending || mutations.updateActivity.isPending;

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      toast.error("Le titre de l'activité est requis.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: title.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      order: order.trim() ? Number(order) : null,
      process_id: processId ? Number(processId) : null,
    };
    if (!initial) {
      payload["year"] = Number(year);
      if (siteId) payload["site_id"] = Number(siteId);
    }
    try {
      if (initial) {
        await mutations.updateActivity.mutateAsync({ id: initial.id, payload });
        toast.success("Activité mise à jour.");
      } else {
        await mutations.createActivity.mutateAsync(payload);
        toast.success("Activité créée.");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  return (
    <Modal
      title={initial ? "Modifier l'activité" : "Nouvelle activité"}
      description={`Année ${year}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field
          label={
            <>
              Titre <span className="text-destructive">*</span>
            </>
          }
        >
          <input
            className={input}
            value={title}
            placeholder="Ex : Pilotage du SM"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code">
            <input
              className={input}
              value={code}
              placeholder="Ex : A1"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Ordre">
            <input
              className={input}
              type="number"
              value={order}
              placeholder="Ex : 1"
              onChange={(e) => setOrder(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Processus">
          <select
            className={input}
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {processes.map((process) => (
              <option key={str(process["id"])} value={str(process["id"])}>
                {processLabelOf(process)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            className={`${input} min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SubActivityFormDialog({
  activityId,
  initial,
  onClose,
}: {
  activityId: string | number;
  initial: SmPlanSubActivity | undefined;
  onClose: () => void;
}) {
  const mutations = useSmPlanMutations();
  const [title, setTitle] = useState(str(initial?.title));
  const [code, setCode] = useState(str(initial?.code));
  const [description, setDescription] = useState(str(initial?.description));
  const [order, setOrder] = useState(str(initial?.order));
  const pending = mutations.createSubActivity.isPending || mutations.updateSubActivity.isPending;

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      toast.error("Le titre de la sous-activité est requis.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: title.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      order: order.trim() ? Number(order) : null,
    };
    try {
      if (initial) {
        await mutations.updateSubActivity.mutateAsync({ id: initial.id, payload });
        toast.success("Sous-activité mise à jour.");
      } else {
        await mutations.createSubActivity.mutateAsync({ activity_id: activityId, payload });
        toast.success("Sous-activité créée.");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  return (
    <Modal
      title={initial ? "Modifier la sous-activité" : "Nouvelle sous-activité"}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field
          label={
            <>
              Titre <span className="text-destructive">*</span>
            </>
          }
        >
          <input
            className={input}
            value={title}
            placeholder="Ex : Revue des indicateurs"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code">
            <input
              className={input}
              value={code}
              placeholder="Ex : A1.1"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="Ordre">
            <input
              className={input}
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            className={`${input} min-h-24`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const SM_ACTION_STATUSES = ["a_planifier", "en_cours", "realise", "en_retard", "replanifie"];

function ActionFormDialog({
  siteId,
  subId,
  initial,
  onClose,
}: {
  siteId: string;
  subId: string | number;
  initial: SmPlanAction | undefined;
  onClose: () => void;
}) {
  const mutations = useSmPlanMutations();
  const { data: responsables = [] } = useSmResponsables(siteId);
  const [title, setTitle] = useState(str(initial?.title));
  const [code, setCode] = useState(str(initial?.code));
  const [responsibleId, setResponsibleId] = useState(str(initial?.responsible_id));
  const [startDate, setStartDate] = useState(str(initial?.start_date).slice(0, 10));
  const [deadline, setDeadline] = useState(str(initial?.deadline).slice(0, 10));
  const [status, setStatus] = useState(str(initial?.status, "a_planifier"));
  const [observations, setObservations] = useState(str(initial?.observations));
  const [deliverables, setDeliverables] = useState(str(initial?.deliverables));
  const [indicators, setIndicators] = useState(str(initial?.indicators));
  const pending = mutations.createAction.isPending || mutations.updateAction.isPending;

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      toast.error("Le titre de l'action est requis.");
      return;
    }
    const payload: Record<string, unknown> = {
      title: title.trim(),
      code: code.trim() || null,
      responsible_id: responsibleId ? Number(responsibleId) : null,
      start_date: startDate || null,
      deadline: deadline || null,
      status,
      observations: observations.trim() || null,
      deliverables: deliverables.trim() || null,
      indicators: indicators.trim() || null,
    };
    try {
      if (initial) {
        await mutations.updateAction.mutateAsync({ id: initial.id, payload });
        toast.success("Action mise à jour.");
      } else {
        await mutations.createAction.mutateAsync({ sub_activity_id: subId, payload });
        toast.success("Action créée.");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  return (
    <Modal title={initial ? "Modifier l'action" : "Nouvelle action"} onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="md:col-span-2">
          <Field
            label={
              <>
                Titre <span className="text-destructive">*</span>
              </>
            }
          >
            <input
              className={input}
              value={title}
              placeholder="Ex : Mettre à jour la veille réglementaire"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Code">
          <input className={input} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Statut">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {SM_ACTION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {actionStatusMeta(item).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsable">
          <select
            className={input}
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {responsables.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date de début">
          <input
            className={input}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Échéance">
          <input
            className={input}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>
        <Field label="Livrables">
          <input
            className={input}
            value={deliverables}
            onChange={(e) => setDeliverables(e.target.value)}
          />
        </Field>
        <Field label="Indicateurs">
          <input
            className={input}
            value={indicators}
            onChange={(e) => setIndicators(e.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Observations">
            <textarea
              className={`${input} min-h-20`}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onClose}>
          Annuler
        </button>
        <button type="button" className={primary} disabled={pending} onClick={() => void submit()}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

function RescheduleDialog({ action, onClose }: { action: SmPlanAction; onClose: () => void }) {
  const mutations = useSmPlanMutations();
  const [newDeadline, setNewDeadline] = useState("");
  const [reason, setReason] = useState("");
  const pending = mutations.rescheduleAction.isPending;

  const submit = async (): Promise<void> => {
    if (!newDeadline) {
      toast.error("La nouvelle échéance est requise.");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Le motif doit comporter au moins 5 caractères.");
      return;
    }
    try {
      await mutations.rescheduleAction.mutateAsync({
        id: action.id,
        new_deadline: newDeadline,
        reason: reason.trim(),
      });
      toast.success("Action replanifiée.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Replanification impossible."));
    }
  };

  return (
    <Modal
      title={`Replanifier « ${action.title} »`}
      description="Seuls le responsable en charge, son N+1, le RQ ou la Direction peuvent replanifier."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field
          label={
            <>
              Nouvelle échéance (future) <span className="text-destructive">*</span>
            </>
          }
        >
          <input
            className={input}
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
          />
        </Field>
        <Field
          label={
            <>
              Motif <span className="text-destructive">*</span>
            </>
          }
        >
          <textarea
            className={`${input} min-h-24`}
            value={reason}
            placeholder="Expliquez la raison du report…"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? "Envoi…" : "Replanifier"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Onglet (b) : calendrier lecture seule
// ---------------------------------------------------------------------------

type CalendarView = "day" | "week" | "month";

function CalendarTab({ siteId }: { siteId: string }) {
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<string>(todayISO());
  const [types, setTypes] = useState<string[]>([]);
  const [processId, setProcessId] = useState("");
  const [userId, setUserId] = useState("");
  const [detail, setDetail] = useState<PlanSMCalendarTask | null>(null);

  const [start, end] = useMemo<[string, string]>(() => {
    if (view === "day") return [anchor, anchor];
    if (view === "week") return weekRange(anchor);
    return monthRange(anchor);
  }, [view, anchor]);

  const { data: processes = [] } = useProcesses(siteId);
  const { data: responsables = [] } = useSmResponsables(siteId);
  const calendar = usePlanSmCalendar({
    view,
    start_date: start,
    end_date: end,
    types,
    user_id: userId || undefined,
    process_id: processId || undefined,
  });

  const shift = (direction: -1 | 1): void => {
    if (view === "day") setAnchor(addDaysISO(anchor, direction));
    else if (view === "week") setAnchor(addDaysISO(anchor, direction * 7));
    else setAnchor(addMonthsISO(anchor, direction));
  };

  const toggleType = (type: string): void => {
    setTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type],
    );
  };

  const calendarTasks = calendar.data?.tasks;
  const grouped = useMemo(() => {
    const list = calendarTasks ?? [];
    const map = new Map<string, PlanSMCalendarTask[]>();
    list.forEach((task) => {
      const key = str(task.start_date).slice(0, 10) || str(task.deadline).slice(0, 10) || start;
      const bucket = map.get(key) ?? [];
      bucket.push(task);
      map.set(key, bucket);
    });
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [calendarTasks, start]);
  const tasks = calendarTasks ?? [];

  const gateError = calendar.error;
  const gateMessage = gateError instanceof Error ? gateError.message : "";
  const gateStatusRaw =
    gateError instanceof Error && "status" in gateError
      ? (gateError as unknown as { status?: unknown }).status
      : undefined;
  const gateStatusNum = typeof gateStatusRaw === "number" ? gateStatusRaw : Number(gateStatusRaw);
  const hasGateStatus =
    gateStatusRaw != null && gateStatusRaw !== "" && Number.isFinite(gateStatusNum);
  // Masquage uniquement sur 403 (droits insuffisants). Un 500 remonte en erreur
  // générique ; un 200 avec `data: []` affiche l'état vide normal.
  const isGateClosed =
    calendar.isError &&
    (gateStatusNum === 403 ||
      (!hasGateStatus &&
        /view_all_tasks|permission|autorisation|forbidden|403/i.test(gateMessage)));

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <div className="flex gap-2">
          {(["day", "week", "month"] as CalendarView[]).map((item) => (
            <button
              key={item}
              type="button"
              className={view === item ? primary : secondary}
              onClick={() => setView(item)}
            >
              {item === "day" ? "Jour" : item === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Période précédente"
            className={`${secondary} h-10 w-10 !px-0`}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={secondary} onClick={() => setAnchor(todayISO())}>
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            aria-label="Période suivante"
            className={`${secondary} h-10 w-10 !px-0`}
            onClick={() => shift(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-bold capitalize">{rangeLabel(view, start, end)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${input} !w-auto`}
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            aria-label="Filtrer par processus"
          >
            <option value="">Tous processus</option>
            {(processes as Record<string, unknown>[]).map((process) => (
              <option key={str(process["id"])} value={str(process["id"])}>
                {processLabelOf(flattenResource(process))}
              </option>
            ))}
          </select>
          <select
            className={`${input} !w-auto`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            aria-label="Filtrer par responsable"
          >
            <option value="">Tous responsables</option>
            {responsables.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`${card} p-4`}>
        <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${muted}`}>
          Types {types.length === 0 ? "(tous)" : `(${types.length} sélectionné(s))`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_SM_TYPE_META.map((type) => {
            const active = types.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                aria-pressed={active}
                title={type.label}
                onClick={() => toggleType(type.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary"}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: type.color }}
                />
                {type.label}
              </button>
            );
          })}
          {types.length > 0 && (
            <button
              type="button"
              className="text-xs font-bold text-primary hover:underline"
              onClick={() => setTypes([])}
            >
              Tout afficher
            </button>
          )}
        </div>
      </div>

      {calendar.isLoading ? (
        <PageSkeleton rows={4} />
      ) : isGateClosed ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
          role="alert"
        >
          <p className="font-bold">Calendrier global masqué — permission insuffisante.</p>
          <p className="mt-1">
            {gateMessage ||
              "La permission view_all_tasks est requise pour consulter le calendrier."}
          </p>
        </div>
      ) : calendar.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Le calendrier ne peut pas être chargé : {gateMessage || "erreur inconnue"}.
        </div>
      ) : grouped.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-display text-lg font-bold">Aucune tâche sur la période</p>
          <p className={`mt-1 ${muted}`}>Élargissez la période ou retirez des filtres.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className={`text-sm ${muted}`}>{tasks.length} tâche(s) sur la période.</p>
          {grouped.map(([date, dayTasks]) => (
            <div key={date} className={`${card} p-4`}>
              <p className="text-sm font-extrabold capitalize">
                {new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                <span className={`ml-2 font-semibold ${muted}`}>· {dayTasks.length} tâche(s)</span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {dayTasks.map((task) => {
                  const meta = planSmTypeMeta(task.type);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition hover:border-primary"
                        style={{ borderLeftColor: task.color, borderLeftWidth: 4 }}
                        onClick={() => setDetail(task)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{task.title}</span>
                          <span className={`text-xs ${muted}`}>
                            {meta.label}
                            {task.responsible_name ? ` · ${task.responsible_name}` : ""}
                            {task.deadline && task.deadline.slice(0, 10) !== date
                              ? ` · Échéance : ${formatDateFR(task.deadline)}`
                              : ""}
                          </span>
                        </span>
                        <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className={`${card} p-4`}>
        <p className={`mb-2 text-xs font-bold uppercase tracking-wide ${muted}`}>Légende</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {PLAN_SM_TYPE_META.map((type) => (
            <span
              key={type.id}
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground"
            >
              <span className="h-3 w-3 rounded" style={{ backgroundColor: type.color }} />
              {type.label}
            </span>
          ))}
        </div>
      </div>

      {detail && (
        <Modal
          title={detail.title}
          description={`${planSmTypeMeta(detail.type).label} · ${detail.id}`}
          onClose={() => setDetail(null)}
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Type</dt>
              <dd className="font-semibold">{planSmTypeMeta(detail.type).label}</dd>
            </div>
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Statut</dt>
              <dd>
                <span className={statusBadge(detail.status)}>{str(detail.status) || "—"}</span>
              </dd>
            </div>
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Début</dt>
              <dd>{formatDateFR(detail.start_date)}</dd>
            </div>
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Échéance</dt>
              <dd>{formatDateFR(detail.deadline)}</dd>
            </div>
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Responsable</dt>
              <dd>{str(detail.responsible_name) || "—"}</dd>
            </div>
            <div>
              <dt className={`text-xs font-bold uppercase ${muted}`}>Fréquence</dt>
              <dd>{str(detail.frequency) || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-end">
            <button type="button" className={secondary} onClick={() => setDetail(null)}>
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onglet (c) : modifications du SM (cœur)
// ---------------------------------------------------------------------------

type ModDialogState = { mode: "create" } | { mode: "edit"; item: SmModification };
type WorkflowDialog =
  | { kind: "submit"; item: SmModification }
  | { kind: "verify"; item: SmModification }
  | { kind: "approve"; item: SmModification }
  | { kind: "results"; item: SmModification };

const MOD_STATUS_OPTIONS = ["pending", "approved", "implemented", "rejected"];

function ChangesTab({ siteId }: { siteId: string }) {
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ModDialogState | null>(null);
  const [detail, setDetail] = useState<SmModification | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDialog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SmModification | null>(null);

  const list = useSmModifications({
    site_id: siteId || undefined,
    workflow_status: workflowFilter || undefined,
    per_page: 20,
    page,
  });
  const mutations = useSmModificationMutations();
  const items = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  const runWorkflow = (
    kind: WorkflowDialog["kind"],
    item: SmModification,
    payload: Record<string, unknown>,
  ): void => {
    const fail = (error: unknown): void => {
      toast.error(errorMessage(error, "Action impossible."));
    };
    if (kind === "submit") {
      mutations.submit.mutate(item.id, {
        onSuccess: () => {
          toast.success("Demande soumise au RQ.");
          setWorkflow(null);
        },
        onError: fail,
      });
    } else if (kind === "verify") {
      mutations.verifyRq.mutate(
        { id: item.id, payload },
        {
          onSuccess: () => {
            toast.success("Vérification RQ enregistrée.");
            setWorkflow(null);
          },
          onError: fail,
        },
      );
    } else if (kind === "approve") {
      mutations.approveCeo.mutate(
        { id: item.id, payload },
        {
          onSuccess: () => {
            toast.success("Modification approuvée par la Direction.");
            setWorkflow(null);
          },
          onError: fail,
        },
      );
    } else {
      mutations.recordResults.mutate(
        { id: item.id, payload },
        {
          onSuccess: () => {
            toast.success("Résultats enregistrés.");
            setWorkflow(null);
          },
          onError: fail,
        },
      );
    }
  };

  const confirmDelete = (item: SmModification): void => {
    mutations.remove.mutate(item.id, {
      onSuccess: () => {
        toast.success("Demande supprimée.");
        setPendingDelete(null);
        if (detail && str(detail["id"]) === str(item.id)) setDetail(null);
      },
      onError: (error: unknown) => toast.error(errorMessage(error, "Suppression impossible.")),
    });
  };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-56 flex-1">
          <Label>Statut du workflow (filtre serveur)</Label>
          <select
            className={input}
            value={workflowFilter}
            onChange={(e) => {
              setWorkflowFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous les statuts</option>
            {SM_WORKFLOW_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={primary} onClick={() => setDialog({ mode: "create" })}>
          <Plus className="h-4 w-4" /> Nouvelle demande
        </button>
      </div>

      {list.isLoading ? (
        <PageSkeleton rows={5} />
      ) : list.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Les demandes de modification ne peuvent pas être chargées.
        </div>
      ) : items.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-display text-lg font-bold">Aucune demande de modification</p>
          <p className={`mt-1 ${muted}`}>
            Créez la première demande (numéro auto, statut brouillon).
          </p>
          <button
            type="button"
            className={`${primary} mt-4`}
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="h-4 w-4" /> Créer une demande
          </button>
        </div>
      ) : (
        <div className={`${card} overflow-x-auto [-webkit-overflow-scrolling:touch]`}>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className={`border-b border-border text-xs uppercase ${muted}`}>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Objet</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Validée le</th>
                <th className="px-4 py-3">Circuit</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                return (
                  <tr
                    key={str(item["id"])}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3 font-bold">
                      {str(item["number"] ?? item["ref"]) || "—"}
                    </td>
                    <td className="max-w-64 px-4 py-3">
                      <p className="truncate font-semibold">{str(item["object"]) || "—"}</p>
                      <p className={`truncate text-xs ${muted}`}>{str(item["description"])}</p>
                    </td>
                    <td className="px-4 py-3">{formatDateFR(str(item["date"]).slice(0, 10))}</td>
                    <td className="px-4 py-3">
                      <span className={statusBadge(item["status"])}>
                        {smModificationStatusLabel(item["status"])}
                      </span>
                      {str(item["workflow_status"]) && (
                        <span className={`ml-1 text-xs font-semibold ${muted}`}>
                          · {smWorkflowLabel(item["workflow_status"])}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item["validated_at"] ? formatDateFR(item["validated_at"]) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <WorkflowDots status={item["workflow_status"]} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label="Détail et workflow"
                          title="Détail et workflow"
                          className={`${secondary} h-8 w-8 !px-0`}
                          onClick={() => setDetail(item)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Modifier"
                          className={`${secondary} h-8 w-8 !px-0`}
                          onClick={() => setDialog({ mode: "edit", item })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Supprimer"
                          className={`${secondary} h-8 w-8 !px-0`}
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {pagination && pagination.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className={muted}>
            Page {pagination.current_page} / {pagination.last_page} · {pagination.total} demande(s)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={secondary}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" /> Précédent
            </button>
            <button
              type="button"
              className={secondary}
              disabled={page >= pagination.last_page}
              onClick={() => setPage(page + 1)}
            >
              Suivant <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <ModificationFormDialog
          siteId={siteId}
          initial={dialog.mode === "edit" ? dialog.item : undefined}
          onClose={() => setDialog(null)}
        />
      )}

      {detail && (
        <ModificationDetailDialog
          item={detail}
          onClose={() => setDetail(null)}
          onWorkflow={(kind) => setWorkflow({ kind, item: detail })}
        />
      )}

      {workflow?.kind === "submit" && (
        <ConfirmDialog
          open
          title="Soumettre au RQ ?"
          description="La demande passera en vérification par le Responsable Qualité."
          confirmLabel="Soumettre"
          onConfirm={() => runWorkflow("submit", workflow.item, {})}
          onCancel={() => setWorkflow(null)}
        />
      )}
      {workflow?.kind === "verify" && (
        <VerifyRqDialog
          siteId={siteId}
          onClose={() => setWorkflow(null)}
          onSubmit={(payload) => runWorkflow("verify", workflow.item, payload)}
          pending={mutations.verifyRq.isPending}
        />
      )}
      {workflow?.kind === "approve" && (
        <NotesDialog
          title="Approuver (Direction)"
          label="Notes CEO (optionnel)"
          confirmLabel="Approuver"
          pending={mutations.approveCeo.isPending}
          onClose={() => setWorkflow(null)}
          onSubmit={(notes) =>
            runWorkflow("approve", workflow.item, notes ? { ceo_notes: notes } : {})
          }
        />
      )}
      {workflow?.kind === "results" && (
        <ResultsDialog
          pending={mutations.recordResults.isPending}
          onClose={() => setWorkflow(null)}
          onSubmit={(payload) => runWorkflow("results", workflow.item, payload)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Supprimer la demande ${str(pendingDelete?.["number"] ?? pendingDelete?.["ref"] ?? "")} ?`}
        description="La suppression est définitive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => pendingDelete && confirmDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

const CIRCUIT_STEPS = [
  { id: "brouillon", label: "Brouillon" },
  { id: "en_cours", label: "En cours" },
  { id: "verifie_rq", label: "Vérifié RQ" },
  { id: "approuve_ceo", label: "Approuvé CEO" },
];

function isRejectedWorkflow(status: unknown): boolean {
  const key = str(status).toLowerCase();
  return key === "rejete" || key === "rejetee" || key === "rejete_rq" || key === "rejected";
}

function circuitIndexOf(status: unknown): number {
  const key = str(status).toLowerCase();
  return CIRCUIT_STEPS.findIndex((step) => step.id === key);
}

function WorkflowDots({ status }: { status: unknown }) {
  const rejected = isRejectedWorkflow(status);
  const current = circuitIndexOf(status);
  const reached =
    !rejected && current >= 0 ? CIRCUIT_STEPS.slice(0, current + 1).map((step) => step.label) : [];
  const title = rejected
    ? "Rejeté"
    : reached.length > 0
      ? reached.join(" → ")
      : "Circuit non renseigné par le serveur";
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="inline-flex items-center gap-1">
        {CIRCUIT_STEPS.map((step, index) => {
          const done = !rejected && current >= 0 && index <= current;
          return (
            <span
              key={step.id}
              className={`h-2.5 w-2.5 rounded-full ${
                rejected ? "bg-red-500" : done ? "bg-emerald-500" : "bg-slate-200"
              }`}
              aria-label={`${step.label} : ${rejected ? "rejeté" : done ? "atteint" : "à venir"}`}
            />
          );
        })}
      </span>
      <span
        className={`text-xs font-semibold ${rejected ? "text-red-600" : current >= 0 ? "text-emerald-700" : muted}`}
      >
        {rejected ? "Rejeté" : current >= 0 ? str(CIRCUIT_STEPS[current]?.label) : "Non renseigné"}
      </span>
    </span>
  );
}

function hasText(value: unknown): boolean {
  return value != null && str(value).trim() !== "";
}

function relationLabel(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return str(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["name", "full_name", "label", "title", "email", "username"]) {
      const text = str(record[key]).trim();
      if (text) return text;
    }
    if (record["id"] != null && Object.keys(record).length === 1) return `#${str(record["id"])}`;
  }
  return "";
}

function pickFirst(...values: unknown[]): unknown {
  for (const value of values) {
    if (value != null && str(value).trim() !== "") return value;
  }
  return undefined;
}

function docIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (entry == null) continue;
    if (typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const text = str(record["id"] ?? record["document_id"]).trim();
      if (text) ids.push(text);
    } else {
      const text = str(entry).trim();
      if (text) ids.push(text);
    }
  }
  return ids;
}

function verifiedInfo(
  item: SmModification,
  relationKeys: string[],
  byKeys: string[],
  atKeys: string[],
): { by: string; at: string } {
  let by = "";
  for (const key of [...relationKeys, ...byKeys]) {
    const label = relationLabel(item[key]);
    if (label) {
      by = label;
      break;
    }
  }
  let at = "";
  for (const key of atKeys) {
    const raw = item[key];
    if (raw != null && str(raw).trim() !== "") {
      at = formatDateFR(raw);
      break;
    }
  }
  return { by, at };
}

function ModificationFormDialog({
  siteId,
  initial,
  onClose,
}: {
  siteId: string;
  initial: SmModification | undefined;
  onClose: () => void;
}) {
  const mutations = useSmModificationMutations();
  const { data: responsables = [] } = useSmResponsables(siteId);
  const { data: documents, isError: documentsError } = useSmDocuments(siteId);

  const initialDocs = Array.isArray(initial?.["affected_document_ids"])
    ? (initial?.["affected_document_ids"] as unknown[]).map((item) => str(item))
    : [];
  const [object, setObject] = useState(str(initial?.["object"]));
  const [date, setDate] = useState(str(initial?.["date"]).slice(0, 10) || todayISO());
  const [description, setDescription] = useState(str(initial?.["description"]));
  const [objectives, setObjectives] = useState(str(initial?.["objectives"]));
  const [consequences, setConsequences] = useState(str(initial?.["consequences"]));
  const [resources, setResources] = useState(str(initial?.["required_resources"]));
  const [responsibleId, setResponsibleId] = useState(str(initial?.["responsible_id"]));
  const [status, setStatus] = useState(str(initial?.["status"]));
  const [selectedDocs, setSelectedDocs] = useState<string[]>(initialDocs);
  const [freeDocs, setFreeDocs] = useState(initialDocs.join(", "));
  const [modResults, setModResults] = useState(str(initial?.["modification_results"]));
  const [survResults, setSurvResults] = useState(str(initial?.["surveillance_results"]));
  const pending = mutations.create.isPending || mutations.update.isPending;

  const toggleDoc = (id: string): void => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const submit = async (): Promise<void> => {
    if (!object.trim() || !date || !description.trim()) {
      toast.error("L'objet, la date et la description sont requis.");
      return;
    }
    const rawDocs =
      documents && !documentsError
        ? selectedDocs
        : freeDocs
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    const docIds = rawDocs.map(Number).filter((item) => Number.isFinite(item));
    const payload: Record<string, unknown> = {
      site_id: Number(siteId),
      date,
      object: object.trim(),
      description: description.trim(),
      objectives: objectives.trim() || null,
      consequences: consequences.trim() || null,
      required_resources: resources.trim() || null,
      affected_document_ids: docIds,
      responsible_id: responsibleId ? Number(responsibleId) : null,
    };
    if (status) payload["status"] = status;
    if (initial) {
      if (modResults.trim()) payload["modification_results"] = modResults.trim();
      if (survResults.trim()) payload["surveillance_results"] = survResults.trim();
    }
    try {
      if (initial) {
        await mutations.update.mutateAsync({ id: initial.id, payload });
        toast.success("Demande mise à jour.");
      } else {
        await mutations.create.mutateAsync(payload);
        toast.success("Demande créée (brouillon, numéro auto).");
      }
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  return (
    <Modal
      title={initial ? "Modifier la demande" : "Nouvelle demande de modification"}
      description="Numéro auto, workflow forcé à brouillon."
      onClose={onClose}
      wide
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="md:col-span-2">
          <Field
            label={
              <>
                Objet <span className="text-destructive">*</span>
              </>
            }
          >
            <input
              className={input}
              value={object}
              placeholder="Ex : Modification du processus achats"
              onChange={(e) => setObject(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label={
            <>
              Date <span className="text-destructive">*</span>
            </>
          }
        >
          <input
            className={input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Responsable">
          <select
            className={input}
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {responsables.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field
            label={
              <>
                Description <span className="text-destructive">*</span>
              </>
            }
          >
            <textarea
              className={`${input} min-h-24`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Objectifs">
          <textarea
            className={`${input} min-h-20`}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
          />
        </Field>
        <Field label="Conséquences">
          <textarea
            className={`${input} min-h-20`}
            value={consequences}
            onChange={(e) => setConsequences(e.target.value)}
          />
        </Field>
        <Field label="Ressources requises">
          <input
            className={input}
            value={resources}
            onChange={(e) => setResources(e.target.value)}
          />
        </Field>
        <Field label="Statut (optionnel)">
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">— Non défini —</option>
            {MOD_STATUS_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {smModificationStatusLabel(item)}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          {documents && !documentsError ? (
            <Field label={`Documents liés (${selectedDocs.length})`}>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {documents.length === 0 && (
                  <p className={`text-xs ${muted}`}>Aucun document sur ce site.</p>
                )}
                {documents.map((doc) => (
                  <label
                    key={doc.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-background"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    <span className="font-semibold">{doc.label}</span>
                    {doc.detail && <span className={`text-xs ${muted}`}>{doc.detail}</span>}
                  </label>
                ))}
              </div>
            </Field>
          ) : (
            <Field label="Documents liés (IDs séparés par des virgules)">
              <input
                className={input}
                value={freeDocs}
                placeholder="Ex : 12, 15"
                onChange={(e) => setFreeDocs(e.target.value)}
              />
            </Field>
          )}
        </div>
        {initial && (
          <>
            <Field label="Résultats de la modification">
              <textarea
                className={`${input} min-h-20`}
                value={modResults}
                onChange={(e) => setModResults(e.target.value)}
              />
            </Field>
            <Field label="Résultats de la surveillance">
              <textarea
                className={`${input} min-h-20`}
                value={survResults}
                onChange={(e) => setSurvResults(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className={primary}
          disabled={pending || !siteId}
          title={!siteId ? "Sélectionnez un site." : undefined}
          onClick={() => void submit()}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

function ModificationDetailDialog({
  item,
  onClose,
  onWorkflow,
}: {
  item: SmModification;
  onClose: () => void;
  onWorkflow: (kind: "submit" | "verify" | "approve" | "results") => void;
}) {
  const workflowStatus = item["workflow_status"];
  const rqNotes = hasText(item["rq_notes"]) ? str(item["rq_notes"]).trim() : "";
  const ceoNotes = hasText(item["ceo_notes"]) ? str(item["ceo_notes"]).trim() : "";
  const modResults = hasText(item["modification_results"])
    ? str(item["modification_results"]).trim()
    : "";
  const survResults = hasText(item["surveillance_results"])
    ? str(item["surveillance_results"]).trim()
    : "";
  const rq = verifiedInfo(
    item,
    ["rqVerifier", "rq_verifier"],
    ["rq_verified_by", "rqVerifiedBy"],
    ["rq_verified_at", "rqVerifiedAt"],
  );
  const ceo = verifiedInfo(
    item,
    ["ceoApprover", "ceo_approver"],
    ["ceo_approved_by", "ceoApprovedBy"],
    ["ceo_approved_at", "ceoApprovedAt"],
  );
  const initiator =
    relationLabel(pickFirst(item["initiator"], item["initiator_id"], item["initiatorId"])) || "";
  const initiatorName =
    initiator && /^\d+$/.test(initiator) ? `Utilisateur #${initiator}` : initiator;
  const docIds = docIdList(item["affected_document_ids"]);
  const showRqBlock = rqNotes !== "" || rq.by !== "" || rq.at !== "";
  const showCeoBlock = ceoNotes !== "" || ceo.by !== "" || ceo.at !== "";
  return (
    <Modal
      title={str(item["object"]) || "Demande"}
      description={`Réf : ${str(item["number"] ?? item["ref"]) || "—"}`}
      onClose={onClose}
      wide
    >
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Date</dt>
          <dd>{formatDateFR(str(item["date"]).slice(0, 10))}</dd>
        </div>
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Statut</dt>
          <dd>
            <span className={statusBadge(item["status"])}>
              {smModificationStatusLabel(item["status"])}
            </span>
          </dd>
        </div>
        {hasText(workflowStatus) && (
          <div>
            <dt className={`text-xs font-bold uppercase ${muted}`}>Circuit</dt>
            <dd className="font-semibold">{smWorkflowLabel(workflowStatus)}</dd>
          </div>
        )}
        {initiatorName !== "" && (
          <div>
            <dt className={`text-xs font-bold uppercase ${muted}`}>Initiateur</dt>
            <dd>{initiatorName}</dd>
          </div>
        )}
        <div className="md:col-span-2">
          <dt className={`text-xs font-bold uppercase ${muted}`}>Description</dt>
          <dd>{str(item["description"]) || "—"}</dd>
        </div>
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Objectifs</dt>
          <dd>{str(item["objectives"]) || "—"}</dd>
        </div>
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Conséquences</dt>
          <dd>{str(item["consequences"]) || "—"}</dd>
        </div>
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Ressources</dt>
          <dd>{str(item["required_resources"]) || "—"}</dd>
        </div>
        <div>
          <dt className={`text-xs font-bold uppercase ${muted}`}>Validée le</dt>
          <dd>{item["validated_at"] ? formatDateFR(item["validated_at"]) : "—"}</dd>
        </div>
        {showRqBlock && (
          <div className="md:col-span-2">
            <dt className={`text-xs font-bold uppercase ${muted}`}>Vérification RQ</dt>
            <dd>
              {(rq.by !== "" || rq.at !== "") && (
                <p className="text-xs font-semibold text-muted-foreground">
                  {rq.by !== "" ? `Vérifié par ${rq.by}` : "Vérifié"}
                  {rq.at !== "" ? ` le ${rq.at}` : ""}
                </p>
              )}
              {rqNotes !== "" && <p className="mt-1">{rqNotes}</p>}
            </dd>
          </div>
        )}
        {showCeoBlock && (
          <div className="md:col-span-2">
            <dt className={`text-xs font-bold uppercase ${muted}`}>Approbation Direction</dt>
            <dd>
              {(ceo.by !== "" || ceo.at !== "") && (
                <p className="text-xs font-semibold text-muted-foreground">
                  {ceo.by !== "" ? `Approuvé par ${ceo.by}` : "Approuvé"}
                  {ceo.at !== "" ? ` le ${ceo.at}` : ""}
                </p>
              )}
              {ceoNotes !== "" && <p className="mt-1">{ceoNotes}</p>}
            </dd>
          </div>
        )}
        {modResults !== "" && (
          <div className="md:col-span-2">
            <dt className={`text-xs font-bold uppercase ${muted}`}>Résultats de la modification</dt>
            <dd>{modResults}</dd>
          </div>
        )}
        {survResults !== "" && (
          <div className="md:col-span-2">
            <dt className={`text-xs font-bold uppercase ${muted}`}>Résultats de la surveillance</dt>
            <dd>{survResults}</dd>
          </div>
        )}
        {docIds.length > 0 && (
          <div className="md:col-span-2">
            <dt className={`text-xs font-bold uppercase ${muted}`}>Documents liés</dt>
            <dd>{docIds.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="mt-5 rounded-xl bg-background p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Circuit de validation
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs font-bold">
          <WorkflowDots status={workflowStatus} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => onWorkflow("submit")}>
            <Send className="h-4 w-4" /> Soumettre RQ
          </button>
          <button type="button" className={secondary} onClick={() => onWorkflow("verify")}>
            <ShieldCheck className="h-4 w-4" /> Vérifier RQ
          </button>
          <button type="button" className={secondary} onClick={() => onWorkflow("approve")}>
            <BadgeCheck className="h-4 w-4" /> Approuver CEO
          </button>
          <button type="button" className={secondary} onClick={() => onWorkflow("results")}>
            <ClipboardCheck className="h-4 w-4" /> Résultats
          </button>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={secondary} onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}

function VerifyRqDialog({
  siteId,
  onClose,
  onSubmit,
  pending,
}: {
  siteId: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const { data: responsables = [] } = useSmResponsables(siteId);
  const [rqNotes, setRqNotes] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionResponsible, setActionResponsible] = useState("");
  const [actionDeadline, setActionDeadline] = useState("");

  const submit = (): void => {
    const payload: Record<string, unknown> = {};
    if (rqNotes.trim()) payload["rq_notes"] = rqNotes.trim();
    if (actionTitle.trim()) {
      if (!actionResponsible || !actionDeadline) {
        toast.error("L'action corrective exige un responsable et une échéance.");
        return;
      }
      payload["additional_actions"] = [
        {
          title: actionTitle.trim(),
          responsible_id: Number(actionResponsible),
          deadline: actionDeadline,
        },
      ];
    }
    onSubmit(payload);
  };

  return (
    <Modal
      title="Vérification RQ"
      description="Notes et action corrective optionnelle."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Notes RQ">
          <textarea
            className={`${input} min-h-24`}
            value={rqNotes}
            onChange={(e) => setRqNotes(e.target.value)}
          />
        </Field>
        <div className="rounded-xl bg-background p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Action corrective (optionnelle)
          </p>
          <div className="mt-2 space-y-3">
            <Field label="Titre">
              <input
                className={input}
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Responsable">
                <select
                  className={input}
                  value={actionResponsible}
                  onChange={(e) => setActionResponsible(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {responsables.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Échéance">
                <input
                  className={input}
                  type="date"
                  value={actionDeadline}
                  onChange={(e) => setActionDeadline(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            La création d&apos;action corrective via cet endpoint peut être rejetée par le backend
            (contrainte base) — le message d&apos;erreur sera affiché sans bloquer la vérification.
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={primary} disabled={pending} onClick={submit}>
            {pending ? "Envoi…" : "Vérifier"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NotesDialog({
  title,
  label,
  confirmLabel,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={label}>
        <textarea
          className={`${input} min-h-24`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className={primary}
          disabled={pending}
          onClick={() => onSubmit(notes.trim())}
        >
          {pending ? "Envoi…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function ResultsDialog({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [modResults, setModResults] = useState("");
  const [survResults, setSurvResults] = useState("");
  return (
    <Modal
      title="Enregistrer les résultats"
      description="Résultats de modification (responsable) et de surveillance (RQ)."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Résultats de la modification">
          <textarea
            className={`${input} min-h-24`}
            value={modResults}
            onChange={(e) => setModResults(e.target.value)}
          />
        </Field>
        <Field label="Résultats de la surveillance">
          <textarea
            className={`${input} min-h-24`}
            value={survResults}
            onChange={(e) => setSurvResults(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className={primary}
            disabled={pending}
            onClick={() =>
              onSubmit({
                modification_results: modResults.trim() || null,
                surveillance_results: survResults.trim() || null,
              })
            }
          >
            {pending ? "Envoi…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
