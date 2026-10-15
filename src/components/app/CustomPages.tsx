import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Plus,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
  Minus,
  RotateCcw,
  Search,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/profile.functions";
import { backendApi } from "@/integrations/backend/client";
import {
  downloadTaskReport,
  fetchTaskHistory,
  useMyTasks,
  useTaskTracking,
  type MyTask,
  type MyTaskStatus,
  type TaskHistoryEntry,
} from "@/integrations/backend/planning";
import { useProcesses } from "@/integrations/backend/context";
import {
  historyActionLabel,
  historyOf,
  RECORDS_KEY,
  useRecords,
  useSaveRecord,
  useTransition,
  type QRecord,
} from "@/hooks/use-records";
import {
  useEnterpriseNorms,
  useNorm,
  fetchNormChapters,
  flattenNormSections,
  type NormSection,
} from "@/integrations/backend/norms";
import {
  useDocumentWorkflow,
  usePendingDocuments,
  useWorkflowHistory,
  previewDocumentBlob,
  downloadDocumentBlob,
  workflowActionLabel,
  type PendingDocument,
  type WorkflowHistoryEntry,
} from "@/integrations/backend/documents";
import { downloadCsv, useCurrentSite, useWorkspace } from "@/hooks/use-workspace";
import { sectionForKind } from "./sections";
import { RecordActions, StatusBadge } from "./SectionView";
import { ListLoading } from "./LoadingState";

const appRoute = getRouteApi("/_authenticated/app");

function Header({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <Link to="/app" className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Vue d'ensemble
        </Link>
        <h1 className="mt-1 min-w-0 break-words font-display text-xl font-extrabold text-foreground sm:text-2xl md:text-3xl">
          {title}
        </h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">{desc}</p>
      </div>
      {children && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap lg:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}

const ghostBtn =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary";
const primaryBtn =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-60";

function useWs() {
  const profile = appRoute.useLoaderData();
  const { data: records = [], isLoading } = useRecords();
  const ws = useWorkspace(records, profile.created_at, profile.email ?? "");
  return { profile, records, isLoading, ws };
}

function OpenLink({ r }: { r: QRecord }) {
  const slug = sectionForKind(r.kind);
  if (!slug) return null;
  return (
    <Link
      to="/app/$section"
      params={{ section: slug }}
      search={{ open: r.id }}
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary hover:text-primary"
    >
      <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
    </Link>
  );
}

// ---------- Mes tâches (GET /my-tasks, parité Vue) ----------
const MY_TASK_STATUS_OPTIONS = [
  { value: "all", label: "Tous les statuts" },
  { value: "non_demarre", label: "Non démarré" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
] as const;

const MY_TASK_TYPE_OPTIONS = [
  { value: "", label: "Tous les types" },
  { value: "action", label: "Action" },
  { value: "audit", label: "Audit" },
  { value: "formation", label: "Formation" },
  { value: "communication", label: "Communication" },
  { value: "non_conformity", label: "Non-conformité" },
  { value: "objective", label: "Objectif" },
  { value: "risk", label: "Risque" },
  { value: "plan_action", label: "Plan d'action" },
  { value: "maintenance_plan", label: "Maintenance" },
  { value: "calibration_plan", label: "Calibration" },
  { value: "operational_project_activity", label: "Activité projet" },
  { value: "operational_project_task", label: "Tâche projet" },
  { value: "compliance_obligation_action", label: "Obligation de conformité" },
  { value: "stakeholder_requirement_action", label: "Exigence partie intéressée" },
  { value: "process_risk_opportunity", label: "Risque / opportunité" },
  { value: "reclamation", label: "Réclamation" },
];

const MY_TASK_STATUS_TONE: Record<string, string> = {
  non_demarre: "bg-secondary text-muted-foreground",
  en_cours: "bg-info/15 text-info",
  termine: "bg-success/15 text-success",
};

function myTaskStatusLabel(status: string): string {
  return (
    (
      {
        non_demarre: "Non démarré",
        en_cours: "En cours",
        termine: "Terminé",
        planned: "Non démarré",
        in_progress: "En cours",
        completed: "Terminé",
        done: "Terminé",
        todo: "Non démarré",
        a_faire: "Non démarré",
      } as Record<string, string>
    )[status] ?? status
  );
}

function myTaskTypeLabel(type: string): string {
  return MY_TASK_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

const fmtDay = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fr-FR");
};

const monthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month
    : date.toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
};

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y || 2026, (m || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export function TasksPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("");
  const [processId, setProcessId] = useState<string>("");
  const [q, setQ] = useState("");
  const [currentSite] = useCurrentSite();
  const [siteFilter, setSiteFilter] = useState<string>(currentSite);
  const [sites, setSites] = useState<{ id: string | number; name: string }[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [trackingTask, setTrackingTask] = useState<MyTask | null>(null);
  const [trackingForm, setTrackingForm] = useState<{
    status: MyTaskStatus;
    progress_rate: number;
    notes: string;
  }>({
    status: "non_demarre",
    progress_rate: 0,
    notes: "",
  });
  const [reportBusy, setReportBusy] = useState<string | null>(null);

  const {
    data: tasks = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useMyTasks({
    month,
    status: status === "all" ? undefined : status,
    type: type || undefined,
    process_id: processId || undefined,
  });
  const tracking = useTaskTracking();

  useEffect(() => {
    setSiteFilter(currentSite);
  }, [currentSite]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await backendApi.request<unknown>("sites?per_page=100");
        const root = (payload ?? {}) as Record<string, unknown>;
        const node = root["data"] ?? payload;
        const items = Array.isArray(node)
          ? node
          : Array.isArray((node as Record<string, unknown>)["data"])
            ? ((node as Record<string, unknown>)["data"] as unknown[])
            : [];
        if (!cancelled) {
          setSites(
            (items as Record<string, unknown>[]).map((item) => {
              const source = (item ?? {}) as Record<string, unknown>;
              const attrs = (source["attributes"] ?? source) as Record<string, unknown>;
              const id = (source["id"] ?? attrs["id"] ?? "") as string | number;
              return {
                id,
                name: String(attrs["name"] ?? attrs["title"] ?? `Site #${String(id)}`),
              };
            }),
          );
        }
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { data: processResources = [] } = useProcesses(siteFilter || currentSite);
  const processes = useMemo(
    () =>
      (processResources as Record<string, unknown>[]).map((item) => {
        const source = (item ?? {}) as Record<string, unknown>;
        const id = (source["id"] ?? "") as string | number;
        return {
          id,
          name: String(
            source["title"] ?? source["name"] ?? source["code"] ?? `Processus ${String(id)}`,
          ),
        };
      }),
    [processResources],
  );

  const siteNameOf = (task: MyTask): string => {
    const raw = task["site_id"];
    if (raw === null || raw === undefined || String(raw) === "") return "";
    const found = sites.find((s) => String(s.id) === String(raw));
    return found ? found.name : `Site #${String(raw)}`;
  };

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...tasks]
      .filter((t) => !siteFilter || String(t["site_id"] ?? "") === siteFilter)
      .filter(
        (t) =>
          !query ||
          `${t.title} ${t.responsible ?? ""} ${t.process_name ?? ""}`.toLowerCase().includes(query),
      )
      .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  }, [tasks, q, siteFilter]);

  const openTracking = (task: MyTask) => {
    setTrackingTask(task);
    setTrackingForm({
      status: (task.status as MyTaskStatus) || "non_demarre",
      progress_rate: task.progress_rate ?? 0,
      notes: "",
    });
  };

  const progressBounds =
    trackingForm.status === "non_demarre"
      ? { min: 0, max: 0, disabled: true }
      : trackingForm.status === "termine"
        ? { min: 100, max: 100, disabled: true }
        : { min: 1, max: 99, disabled: false };

  const submitTracking = async () => {
    if (!trackingTask) return;
    const rate = progressBounds.disabled ? progressBounds.min : trackingForm.progress_rate;
    try {
      await tracking.mutateAsync({
        type: trackingTask.type,
        id: trackingTask.id,
        form: {
          status: trackingForm.status,
          progress_rate: rate,
          notes: trackingForm.notes || undefined,
        },
      });
      toast.success("Suivi mis à jour");
      setTrackingTask(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible.");
    }
  };

  const quickComplete = async (task: MyTask) => {
    try {
      await tracking.mutateAsync({
        type: task.type,
        id: task.id,
        form: { status: "termine", progress_rate: 100 },
      });
      toast.success("Tâche marquée comme terminée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible.");
    }
  };

  const toggleHistory = async (task: MyTask) => {
    const key = `${task.type}-${task.id}`;
    if (expandedHistory === key) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(key);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await fetchTaskHistory(task.type, task.id));
    } catch {
      toast.error("Historique indisponible.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadReport = async (task: MyTask) => {
    const key = `${task.type}-${task.id}`;
    setReportBusy(key);
    try {
      await downloadTaskReport(task.type, task.id);
      toast.success("Rapport téléchargé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Téléchargement impossible.");
    } finally {
      setReportBusy(null);
    }
  };

  const exportCsv = () => {
    downloadCsv("mes-taches.csv", [
      ["Activité", "Type", "Début", "Fin", "Échéance", "Responsable", "Statut", "Taux (%)"],
      ...filtered.map((t) => [
        t.title,
        myTaskTypeLabel(t.type),
        fmtDay(t.start_date),
        fmtDay(t.end_date),
        fmtDay(t.deadline),
        t.responsible ?? "—",
        myTaskStatusLabel(t.status),
        t.progress_rate ?? 0,
      ]),
    ]);
    toast.success("Export téléchargé");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Header
        title="Mes tâches"
        desc="Suivi mensuel de tout ce qui vous est confié : actions, audits, formations, objectifs, risques et projets."
      >
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className={`${ghostBtn} disabled:opacity-50`}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}{" "}
          {isFetching ? "Actualisation…" : "Actualiser"}
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className={`${ghostBtn} disabled:opacity-50`}
        >
          <Download className="h-4 w-4" /> Exporter
        </button>
        <Link
          to="/app/$section"
          params={{ section: "actions" }}
          search={{ new: 1 }}
          className={primaryBtn}
        >
          <Plus className="h-4 w-4" /> Créer une tâche
        </Link>
      </Header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          className={ghostBtn}
          aria-label="Mois précédent"
        >
          ←
        </button>
        <p className="min-w-[150px] text-center font-display font-bold capitalize text-foreground">
          {monthLabel(month)}
        </p>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          className={ghostBtn}
          aria-label="Mois suivant"
        >
          →
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filtrer par statut"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold outline-none focus:border-primary"
        >
          {MY_TASK_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold outline-none focus:border-primary"
        >
          {MY_TASK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrer par site"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          className="h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold outline-none focus:border-primary"
        >
          <option value="">Tous les sites</option>
          {sites.map((s) => (
            <option key={String(s.id)} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
        {processes.length > 0 && (
          <select
            aria-label="Filtrer par processus"
            value={processId}
            onChange={(e) => setProcessId(e.target.value)}
            className="h-11 rounded-xl border border-input bg-card px-4 text-sm font-semibold outline-none focus:border-primary"
          >
            <option value="">Tous les processus</option>
            {processes.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {(status !== "all" || type || processId || siteFilter !== currentSite) && (
          <button
            onClick={() => {
              setStatus("all");
              setType("");
              setProcessId("");
              setSiteFilter(currentSite);
            }}
            className={ghostBtn}
          >
            Réinitialiser
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une tâche par titre, responsable ou processus…"
          className="h-11 w-full rounded-xl border border-input bg-card pl-11 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Impossible de charger vos tâches depuis le serveur.
        </p>
      )}
      {isLoading || (isFetching && tasks.length === 0) ? (
        <ListLoading rows={5} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-display font-bold text-foreground">Aucune tâche pour cette période</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            Les éléments qui vous sont attribués apparaîtront ici.
          </p>
          {siteFilter !== "" && tasks.length > 0 && (
            <button onClick={() => setSiteFilter("")} className={`${ghostBtn} mt-4`}>
              Élargir à tous les sites
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden overflow-x-auto [-webkit-overflow-scrolling:touch] md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Activité</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Début</th>
                  <th className="px-4 py-3">Fin</th>
                  <th className="px-4 py-3">Échéance</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Taux</th>
                  <th className="sticky right-0 bg-card px-4 py-3 text-right shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                    Suivi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const key = `${t.type}-${t.id}`;
                  const siteName = siteNameOf(t);
                  return (
                    <Fragment key={key}>
                      <tr className="align-top hover:bg-primary-soft/30">
                        <td className="max-w-[240px] px-4 py-3 font-semibold text-foreground">
                          {t.title}
                          {t.process_name && (
                            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {t.process_name}
                            </span>
                          )}
                          {siteName && (
                            <span
                              title={siteName}
                              className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {siteName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {myTaskTypeLabel(t.type)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {fmtDay(t.start_date)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {fmtDay(t.end_date)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                          {fmtDay(t.deadline)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{t.responsible ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${MY_TASK_STATUS_TONE[t.status] ?? "bg-secondary text-muted-foreground"}`}
                          >
                            {myTaskStatusLabel(t.status)}
                          </span>
                        </td>
                        <td className="min-w-[130px] px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-secondary">
                              <div
                                className="h-2 rounded-full bg-primary"
                                style={{ width: `${t.progress_rate ?? 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold">{t.progress_rate ?? 0}%</span>
                          </div>
                        </td>
                        <td className="sticky right-0 bg-card px-4 py-3 shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                          <div className="flex justify-end gap-2">
                            <button
                              title="Marquer comme terminée"
                              disabled={
                                !t.tracking_available ||
                                t.status === "termine" ||
                                tracking.isPending
                              }
                              onClick={() => void quickComplete(t)}
                              className="flex h-8 items-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40"
                            >
                              <Check className="h-3.5 w-3.5" /> Terminer
                            </button>
                            <button
                              disabled={!t.tracking_available}
                              title={
                                t.tracking_available
                                  ? "Mettre à jour le suivi"
                                  : "Hors fenêtre d'activation"
                              }
                              onClick={() => openTracking(t)}
                              className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40"
                            >
                              Suivi
                            </button>
                            {t.has_tracking && (
                              <button
                                onClick={() => void toggleHistory(t)}
                                className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary"
                              >
                                {expandedHistory === key ? "Masquer" : "Historique"}
                              </button>
                            )}
                            {t.status === "termine" && (
                              <button
                                disabled={reportBusy === key}
                                onClick={() => void downloadReport(t)}
                                className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-40"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedHistory === key && (
                        <tr key={`${key}-history`}>
                          <td colSpan={9} className="bg-background/60 px-4 py-3">
                            {historyLoading ? (
                              <p className="text-xs text-muted-foreground">
                                Chargement de l'historique…
                              </p>
                            ) : history.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucun historique.</p>
                            ) : (
                              <ul className="space-y-1 border-l-2 border-primary/20 pl-3 text-xs">
                                {history.map((h, i) => (
                                  <li key={i}>
                                    <span className="text-muted-foreground">
                                      {new Date(h.changed_at).toLocaleString("fr-FR")}
                                    </span>{" "}
                                    — {myTaskStatusLabel(h.status_old ?? "—")} →{" "}
                                    <strong>{myTaskStatusLabel(h.status_new ?? "—")}</strong>{" "}
                                    ({h.rate_old ?? 0}% → {h.rate_new ?? 0}%){" "}
                                    {h.changed_by ? `par ${h.changed_by}` : ""}
                                    {h.notes ? ` — ${h.notes}` : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {filtered.map((t) => (
              <li key={`${t.type}-${t.id}`} className="p-4">
                <p className="font-semibold text-foreground">
                  {t.title}
                  {siteNameOf(t) && (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {siteNameOf(t)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {myTaskTypeLabel(t.type)} · Échéance {fmtDay(t.deadline)} · {t.progress_rate ?? 0}
                  %
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={!t.tracking_available}
                    onClick={() => openTracking(t)}
                    className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    Suivi
                  </button>
                  <button
                    title="Marquer comme terminée"
                    disabled={!t.tracking_available || t.status === "termine" || tracking.isPending}
                    onClick={() => void quickComplete(t)}
                    className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    Terminer
                  </button>
                  {t.status === "termine" && (
                    <button
                      disabled={reportBusy === `${t.type}-${t.id}`}
                      onClick={() => void downloadReport(t)}
                      className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-40"
                    >
                      Rapport
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trackingTask &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-5">
              <h2 className="font-display text-lg font-bold text-foreground">
                Mise à jour du suivi
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                <strong className="text-foreground">{trackingTask.title}</strong> ·{" "}
                {myTaskTypeLabel(trackingTask.type)}
              </p>
              <div className="mt-4 space-y-1">
                {(["non_demarre", "en_cours", "termine"] as MyTaskStatus[]).map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold"
                  >
                    <input
                      type="radio"
                      name="task-status"
                      checked={trackingForm.status === s}
                      onChange={() =>
                        setTrackingForm((f) => ({
                          ...f,
                          status: s,
                          progress_rate:
                            s === "non_demarre"
                              ? 0
                              : s === "termine"
                                ? 100
                                : f.progress_rate === 0 || f.progress_rate === 100
                                  ? 50
                                  : f.progress_rate,
                        }))
                      }
                      className="h-4 w-4 accent-primary"
                    />{" "}
                    {myTaskStatusLabel(s)}
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-bold">
                  Taux de progression :{" "}
                  {progressBounds.disabled ? progressBounds.min : trackingForm.progress_rate}%
                </label>
                <input
                  type="range"
                  min={progressBounds.min}
                  max={progressBounds.max}
                  step={1}
                  disabled={progressBounds.disabled}
                  value={progressBounds.disabled ? progressBounds.min : trackingForm.progress_rate}
                  onChange={(e) =>
                    setTrackingForm((f) => ({ ...f, progress_rate: Number(e.target.value) }))
                  }
                  className="w-full accent-primary disabled:opacity-40"
                />
              </div>
              <textarea
                value={trackingForm.notes}
                onChange={(e) => setTrackingForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Remarques (facultatif)"
                className="mt-4 h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setTrackingTask(null)}
                  className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
                >
                  Annuler
                </button>
                <button
                  disabled={tracking.isPending}
                  onClick={() => void submitTracking()}
                  className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {tracking.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------- Vérification / Approbation ----------
function formatDocVersion(version: string | null | undefined): string {
  const value = String(version ?? "1").trim() || "1";
  return value.replace(/\.0+$/, "");
}

function businessStatusLabel(document: PendingDocument): string {
  const status = document.workflow_status || document.status || "draft";
  const version = formatDocVersion(document.version);
  if (status === "approved") return `Validé - version ${version}`;
  if (status === "pending_approval") return `Version ${version} - en attente de validation`;
  if (status === "pending_verification") return `Version ${version} - en cours de vérification`;
  if (status === "awaiting_submitter_confirmation")
    return "Rejeté - décision soumissionnaire requise";
  if (status === "rejected") return "Rejeté";
  if (status === "obsolete") return "Obsolète";
  if (status === "draft") return "Brouillon en attente de vérification";
  return status;
}

function errorStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function docStatusLabelFR(status: string | null): string {
  if (!status) return "";
  const labels: Record<string, string> = {
    verified: "Vérifié",
    approved: "Approuvé",
    rejected: "Rejeté",
    submitted: "Soumis",
    draft: "Brouillon",
    pending_verification: "En vérification",
    pending_approval: "En approbation",
    awaiting_submitter_confirmation: "En attente du soumissionnaire",
  };
  return labels[status] ?? status;
}

function docActionLabelFR(event: Pick<WorkflowHistoryEntry, "action" | "action_label">): string {
  const code = event.action?.trim();
  if (code) return workflowActionLabel(code);
  return event.action_label || "Événement";
}

function normalizeWorkflowText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTechnicalWorkflowEvent(
  event: Pick<WorkflowHistoryEntry, "action" | "action_label">,
): boolean {
  const haystack = `${normalizeWorkflowText(event.action)} ${normalizeWorkflowText(event.action_label)}`;
  return (
    haystack.includes("generated") ||
    haystack.includes("regenerated") ||
    haystack.includes("previewed") ||
    haystack.includes("previsualise") ||
    haystack.includes("downloaded") ||
    haystack.includes("telecharge")
  );
}

function isAutoTransitionWorkflowEvent(event: WorkflowHistoryEntry): boolean {
  if (!event.from_status || !event.to_status) return false;
  if (event.from_status !== event.to_status) return false;
  return !event.comment?.trim();
}

export function QueuePage({ mode }: { mode: "verification" | "approbation" }) {
  const workflowStatus = mode === "verification" ? "pending_verification" : "pending_approval";
  // La file est portée par l'entreprise : un vérificateur/approbateur habilité
  // doit voir les documents de tous ses sites, même si son site courant diffère.
  const {
    data: documents = [],
    isLoading,
    isError,
    error,
    refetch,
  } = usePendingDocuments(workflowStatus);
  const workflow = useDocumentWorkflow();
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { data: history = [], isLoading: historyLoading } = useWorkflowHistory(open);
  const visibleHistory = useMemo(
    () =>
      history.filter(
        (event) => !isTechnicalWorkflowEvent(event) && !isAutoTransitionWorkflowEvent(event),
      ),
    [history],
  );
  const hiddenHistoryCount = history.length - visibleHistory.length;
  const busy = workflow.verify.isPending || workflow.approve.isPending || workflow.reject.isPending;
  const forbidden = isError && errorStatus(error) === 403;

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const verify = async (id: string) => {
    try {
      await workflow.verify.mutateAsync(id);
      toast.success("Vérification validée avec succès");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la vérification.");
    }
  };
  const approve = async (id: string) => {
    try {
      await workflow.approve.mutateAsync({ id });
      toast.success("Document validé avec succès");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la validation.");
    }
  };
  const reject = async () => {
    if (!rejecting || !rejectionReason.trim()) return;
    try {
      await workflow.reject.mutateAsync({
        id: rejecting,
        rejection_reason: rejectionReason.trim(),
      });
      toast.success("Rejet enregistré. En attente de la confirmation du soumissionnaire.");
      setRejecting(null);
      setRejectionReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du rejet.");
    }
  };

  const openPreview = async (id: string) => {
    setPreviewId(id);
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const blob = await previewDocumentBlob(id);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Aperçu indisponible.");
    } finally {
      setPreviewLoading(false);
    }
  };
  const closePreview = () => {
    setPreviewId(null);
    setPreviewError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };
  const downloadPreview = async () => {
    if (!previewId) return;
    const document = documents.find((item) => item.id === previewId);
    try {
      const blob = await downloadDocumentBlob(previewId);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${document?.code ?? "document"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du téléchargement.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        title={mode === "verification" ? "Vérification" : "Approbation"}
        desc={
          mode === "verification"
            ? "Documents soumis au contrôle. Vérifiez, rejetez avec un motif ou transmettez à l'approbation."
            : "Documents vérifiés prêts à décision. Approuvez ou rejetez avec traçabilité."
        }
      />
      {forbidden && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          Action non autorisée. Vous n'avez pas les permissions nécessaires.
        </p>
      )}
      {isError && !forbidden && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <span>
            Impossible de charger la file documentaire. Vérifiez vos permissions et votre connexion,
            puis réessayez.
          </span>
          <button
            onClick={() => void refetch()}
            className="h-9 rounded-xl border border-destructive/30 px-3 text-xs font-semibold"
          >
            Réessayer
          </button>
        </div>
      )}
      {isLoading ? (
        <ListLoading rows={5} />
      ) : documents.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-display font-bold text-foreground">File vide</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            Aucun document en attente de {mode === "verification" ? "vérification" : "approbation"}.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden overflow-x-auto [-webkit-overflow-scrolling:touch] md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Titre</th>
                  <th className="px-4 py-3">Processus</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Auteur</th>
                  <th className="px-4 py-3">
                    {mode === "verification" ? "Approbateur" : "Vérificateur"}
                  </th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((document) => (
                  <tr key={document.id} className="align-top hover:bg-primary-soft/30">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-primary">
                      {document.code}
                      <span className="ml-1 text-muted-foreground">v{document.version}</span>
                    </td>
                    <td className="max-w-[230px] px-4 py-3 font-semibold text-foreground">
                      {document.title}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{document.process_label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{document.source_label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{document.author_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {mode === "verification" ? document.approver_name : document.verifier_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                        {businessStatusLabel(document)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={busy || forbidden}
                          onClick={() =>
                            mode === "verification"
                              ? void verify(document.id)
                              : void approve(document.id)
                          }
                          className="h-8 rounded-xl bg-success px-3 text-xs font-semibold text-success-foreground disabled:opacity-50"
                        >
                          {mode === "verification" ? "Valider" : "Approuver"}
                        </button>
                        <button
                          disabled={busy || forbidden}
                          onClick={() => void openPreview(document.id)}
                          className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-50"
                        >
                          Visualiser
                        </button>
                        <button
                          disabled={busy || forbidden}
                          onClick={() => {
                            setRejecting(document.id);
                            setRejectionReason("");
                          }}
                          className="h-8 rounded-xl border border-destructive/30 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
                        >
                          Rejeter
                        </button>
                        <button
                          onClick={() => setOpen(open === document.id ? null : document.id)}
                          className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary"
                        >
                          {open === document.id ? "Masquer" : "Détails"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {documents.map((document) => (
              <li key={document.id} className="p-4">
                <p className="font-mono text-xs font-bold text-primary">
                  {document.code} · v{document.version}
                </p>
                <p className="mt-1 font-semibold text-foreground">{document.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {document.process_label} · {document.source_label} · {document.author_name}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={busy || forbidden}
                    onClick={() =>
                      mode === "verification" ? void verify(document.id) : void approve(document.id)
                    }
                    className="h-9 rounded-xl bg-success px-3 text-xs font-semibold text-success-foreground disabled:opacity-50"
                  >
                    {mode === "verification" ? "Valider" : "Approuver"}
                  </button>
                  <button
                    disabled={busy || forbidden}
                    onClick={() => void openPreview(document.id)}
                    className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    Visualiser
                  </button>
                  <button
                    disabled={busy || forbidden}
                    onClick={() => {
                      setRejecting(document.id);
                      setRejectionReason("");
                    }}
                    className="h-9 rounded-xl border border-destructive/30 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open &&
        (() => {
          const document = documents.find((item) => item.id === open);
          return document ? (
            <div
              className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-foreground/60 p-4"
              role="dialog"
              aria-modal="true"
              aria-label={`Détail du document ${document.code}`}
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(null);
              }}
            >
              <div className="my-8 max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-primary">
                      {document.code} · v{formatDocVersion(document.version)}
                    </p>
                    <h2 className="mt-1 font-display text-lg font-bold text-foreground">
                      {document.title}
                    </h2>
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {businessStatusLabel(document)}
                    </p>
                  </div>
                  <button
                    onClick={() => setOpen(null)}
                    className="text-sm font-semibold text-primary"
                  >
                    Fermer
                  </button>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Auteur</dt>
                    <dd className="font-semibold">{document.author_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Approbateur</dt>
                    <dd className="font-semibold">{document.approver_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Vérificateur</dt>
                    <dd className="font-semibold">{document.verifier_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Processus</dt>
                    <dd className="font-semibold">{document.process_label}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="font-semibold">{document.source_label}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => void openPreview(document.id)}
                    className="h-9 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary"
                  >
                    Visualiser le fichier
                  </button>
                </div>
                <div className="mt-5 border-t border-border pt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Historique du workflow
                  </p>
                  {hiddenHistoryCount > 0 && !historyLoading && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hiddenHistoryCount} événement{hiddenHistoryCount > 1 ? "s" : ""} masqué
                      {hiddenHistoryCount > 1 ? "s" : ""} : seuls les événements significatifs sont
                      affichés.
                    </p>
                  )}
                  {historyLoading ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Chargement de l'historique…
                    </p>
                  ) : visibleHistory.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Aucun événement enregistré pour ce document.
                    </p>
                  ) : (
                    <ol className="mt-3 space-y-3">
                      {visibleHistory.map((event) => (
                        <li key={event.id} className="border-l-2 border-primary/40 pl-3">
                          <p className="text-sm font-semibold text-foreground">
                            {docActionLabelFR(event)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.from_status && event.to_status
                              ? `${docStatusLabelFR(event.from_status)} → ${docStatusLabelFR(event.to_status)} · `
                              : ""}
                            {event.actor_name}
                            {event.created_at
                              ? ` · ${new Date(event.created_at).toLocaleString("fr-FR")}`
                              : ""}
                          </p>
                          {event.comment && (
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {event.comment}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          ) : null;
        })()}

      {previewId && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-foreground/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu du document"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-background">
              {documents.find((item) => item.id === previewId)?.code ?? "Aperçu du document"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void downloadPreview()}
                className="h-9 rounded-xl bg-card px-3 text-xs font-semibold"
              >
                Télécharger
              </button>
              <button
                onClick={closePreview}
                className="h-9 rounded-xl bg-card px-3 text-xs font-semibold"
                aria-label="Fermer"
              >
                Fermer
              </button>
            </div>
          </div>
          {previewLoading ? (
            <p className="mx-auto rounded-2xl bg-card p-8 text-sm text-muted-foreground">
              Chargement de l'aperçu…
            </p>
          ) : previewError ? (
            <div className="mx-auto w-full max-w-md rounded-2xl bg-card p-6 text-center">
              <p className="text-sm text-destructive">{previewError}</p>
              <button
                onClick={() => void openPreview(previewId)}
                className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold"
              >
                Réessayer
              </button>
            </div>
          ) : previewUrl ? (
            <iframe
              title="Aperçu du document"
              src={previewUrl}
              className="mx-auto h-full w-full max-w-5xl rounded-2xl bg-white"
            />
          ) : null}
        </div>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-5">
            <h2 className="font-display text-lg font-bold text-foreground">Motif du rejet</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              Le soumissionnaire recevra le motif et devra choisir : libérer le code ou garder le
              code pour correction.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className="mt-4 h-28 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary"
              placeholder="Expliquez la correction attendue…"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
              >
                Annuler
              </button>
              <button
                disabled={!rejectionReason.trim() || busy}
                onClick={() => void reject()}
                className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Bibliothèque des normes ----------
export function NormsPage() {
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [sections, setSections] = useState<NormSection[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);
  const [currentSite] = useCurrentSite();
  const {
    data: catalog,
    isLoading,
    isError,
  } = useEnterpriseNorms({
    site_id: currentSite || undefined,
    search: search.trim() || undefined,
  });
  const norms = catalog?.norms ?? [];
  const { data: selectedNorm, isLoading: detailLoading } = useNorm(selectedId);

  useEffect(() => {
    if (norms.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId === null || !norms.some((norm) => String(norm.id) === String(selectedId))) {
      setSelectedId(norms[0]!.id);
    }
  }, [norms, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function loadSections() {
      if (!selectedNorm) {
        setSections([]);
        return;
      }
      setSectionsError(null);
      const inline =
        selectedNorm.currentVersion?.sections ??
        selectedNorm.current_version?.sections ??
        selectedNorm.versions?.[0]?.sections ??
        [];
      if (inline.length > 0) {
        setSections(inline);
        setExpanded(
          new Set(
            flattenNormSections(inline)
              .slice(0, 8)
              .map((section) => String(section.id)),
          ),
        );
        return;
      }
      setSectionsLoading(true);
      try {
        const chapters = await fetchNormChapters(selectedNorm.id);
        if (!cancelled) {
          setSections(chapters);
          setExpanded(
            new Set(
              flattenNormSections(chapters)
                .slice(0, 8)
                .map((section) => String(section.id)),
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setSections([]);
          setSectionsError("La structure détaillée de cette norme n’est pas disponible.");
        }
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    }
    void loadSections();
    return () => {
      cancelled = true;
    };
  }, [selectedNorm]);

  const filteredSections = useMemo(() => {
    const query = sectionSearch.trim().toLowerCase();
    if (!query) return sections;
    const filter = (items: NormSection[]): NormSection[] =>
      items.flatMap((section) => {
        const text =
          `${section.number ?? ""} ${section.title ?? ""} ${section.content ?? ""}`.toLowerCase();
        const children = Array.isArray(section.children) ? filter(section.children) : [];
        return text.includes(query) || children.length > 0 ? [{ ...section, children }] : [];
      });
    return filter(sections);
  }, [sections, sectionSearch]);

  const toggleSection = (id: string | number) => {
    setExpanded((current) => {
      const next = new Set(current);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const ids = new Set<string>();
    const collect = (items: NormSection[]) => {
      for (const section of items) {
        ids.add(String(section.id));
        const children = Array.isArray(section.children) ? section.children : [];
        if (children.length > 0) collect(children);
      }
    };
    collect(sections);
    setExpanded(ids);
  };

  const collapseAll = () => setExpanded(new Set());

  const versionLabel =
    selectedNorm?.currentVersion?.version_code ??
    selectedNorm?.current_version?.version_code ??
    selectedNorm?.versions?.[0]?.version_code ??
    "";
  const isPdf = Boolean(selectedNorm?.has_pdf_document && selectedNorm?.pdf_file_url);
  const siteName = catalog?.meta?.siteName ?? null;
  const emptyHint = useMemo(() => {
    const activeSubs = catalog?.meta?.activeSubscriptionsCount ?? 0;
    const linkedNorms = catalog?.meta?.linkedNormsCount ?? 0;
    if (activeSubs <= 0) {
      return "Ce site ne dispose d’aucun abonnement actif. Souscrivez une offre pour activer la bibliothèque.";
    }
    if (linkedNorms <= 0) {
      return "Aucune norme n’est liée à l’offre active de ce site.";
    }
    return "Les normes liées existent mais ne sont pas encore visibles pour ce site. Vérifiez le rattachement offre/norme et le contexte de site actif.";
  }, [catalog]);

  const exportCsv = () => {
    const rows = [
      ["Code", "Nom", "Domaine", "Statut"],
      ...norms.map((norm) => [norm.code, norm.name, norm.domain ?? "—", norm.status ?? "—"]),
    ];
    downloadCsv("bibliotheque-normes.csv", rows);
    toast.success("Export téléchargé");
  };

  const renderSections = (items: NormSection[], depth = 0): React.ReactNode =>
    items.map((section) => {
      const key = String(section.id);
      const hasChildren = Array.isArray(section.children) && section.children.length > 0;
      const isOpen = expanded.has(key);
      return (
        <li key={key} className="border-l border-border pl-3" style={{ marginLeft: depth * 8 }}>
          <button
            onClick={() => toggleSection(key)}
            className="flex w-full items-start gap-2 py-2 text-left hover:text-primary"
          >
            <span className="mt-0.5 w-4 shrink-0 text-xs text-muted-foreground">
              {hasChildren ? (isOpen ? "−" : "+") : "·"}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {section.number ? `${section.number} ` : ""}
              {section.title ?? "Section"}
            </span>
          </button>
          {isOpen && (
            <div className="pb-2 pl-6 text-sm text-muted-foreground">
              {section.content && <p className="whitespace-pre-wrap">{section.content}</p>}
              {hasChildren && <ul>{renderSections(section.children!, depth + 1)}</ul>}
            </div>
          )}
        </li>
      );
    });

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        title="Bibliothèque des normes"
        desc={`Lecture seule${siteName ? ` • Site courant : ${siteName}` : ""} — référentiels accessibles et structure issue du référentiel.`}
      >
        <button
          onClick={exportCsv}
          disabled={norms.length === 0}
          className={`${ghostBtn} disabled:opacity-50`}
        >
          <Download className="h-4 w-4" /> Exporter
        </button>
      </Header>

      {catalog?.trialPeriod && (
        <p className="rounded-xl border border-primary/30 bg-primary-soft/60 p-4 text-sm text-foreground">
          Période d’essai active
          {catalog.trialDaysRemaining > 0
            ? ` · ${catalog.trialDaysRemaining} jour(s) restant(s)`
            : ""}
          . Les normes accessibles dépendent de votre abonnement.
        </p>
      )}
      {isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Impossible de charger la bibliothèque des normes depuis le serveur.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une norme par code ou nom…"
            className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-sm outline-none focus:border-primary"
          />
        </div>
        <input
          value={sectionSearch}
          onChange={(event) => setSectionSearch(event.target.value)}
          placeholder="Rechercher dans la structure…"
          className="h-11 min-w-[240px] flex-1 rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {isLoading ? (
        <ListLoading rows={6} />
      ) : norms.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-display font-bold text-foreground">
            Aucune norme accessible pour le site courant.
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{emptyHint}</p>
          <Link
            to="/app/$section"
            params={{ section: "abonnement" }}
            className={`${primaryBtn} mt-4`}
          >
            <CreditCard className="h-4 w-4" /> Gérer l’abonnement
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Normes accessibles ({norms.length})
            </p>
            <ul className="mt-3 space-y-2">
              {norms.map((norm) => (
                <li key={String(norm.id)}>
                  <button
                    onClick={() => setSelectedId(norm.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${String(selectedId) === String(norm.id) ? "border-primary bg-primary-soft/60" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-display font-extrabold text-foreground">
                        {norm.code}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {norm.status ?? "Accessible"}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">{norm.name}</p>
                    {norm.domain && (
                      <p className="mt-1 text-xs text-muted-foreground">{norm.domain}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="min-h-[420px] rounded-2xl border border-border bg-card p-5">
            {detailLoading || sectionsLoading ? (
              <ListLoading rows={5} />
            ) : selectedNorm ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <p className="font-display text-xl font-extrabold text-foreground">
                      {selectedNorm.code}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">{selectedNorm.name}</h2>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {selectedNorm.domain ?? "Référentiel QHSE"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{selectedNorm.status ?? "Accessible"}</p>
                    {versionLabel && (
                      <p className="mt-1 inline-block rounded-full bg-primary-soft px-2.5 py-1 font-bold text-primary">
                        Version {versionLabel}
                      </p>
                    )}
                  </div>
                </div>
                {isPdf ? (
                  <>
                    <p className="mt-4 rounded-xl border border-primary/30 bg-primary-soft/40 p-4 text-sm text-foreground">
                      Cette norme est disponible sous forme de fichier PDF importé par le
                      super-admin
                      {selectedNorm.pdf_original_name ? ` (${selectedNorm.pdf_original_name})` : ""}
                      .
                    </p>
                    <div className="mt-3 flex justify-end">
                      <a
                        href={String(selectedNorm.pdf_file_url)}
                        target="_blank"
                        rel="noopener"
                        className={ghostBtn}
                      >
                        <ExternalLink className="h-4 w-4" /> Ouvrir le PDF
                      </a>
                    </div>
                    <iframe
                      src={String(selectedNorm.pdf_file_url)}
                      title={`Norme ${selectedNorm.code} (PDF)`}
                      className="mt-3 min-h-[70vh] w-full rounded-xl border border-border bg-white"
                    />
                  </>
                ) : (
                  <>
                    {sectionsError && (
                      <p className="mt-4 rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">
                        {sectionsError}
                      </p>
                    )}
                    {!sectionsError && filteredSections.length === 0 && (
                      <p className="mt-5 text-sm text-muted-foreground">
                        Aucune section à afficher pour cette norme.
                      </p>
                    )}
                    {filteredSections.length > 0 && (
                      <>
                        <div className="mt-4 flex justify-end gap-2">
                          <button onClick={expandAll} className={ghostBtn}>
                            <Plus className="h-4 w-4" /> Tout ouvrir
                          </button>
                          <button onClick={collapseAll} className={ghostBtn}>
                            <Minus className="h-4 w-4" /> Tout fermer
                          </button>
                        </div>
                        <ul className="mt-3 space-y-1">{renderSections(filteredSections)}</ul>
                      </>
                    )}
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sélectionnez une norme dans la colonne de gauche.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

// ---------- Fiche entreprise / Paramètres ----------
export function CompanyPage() {
  const profile = appRoute.useLoaderData();
  const router = useRouter();
  const { data: records = [] } = useRecords();
  const initial = {
    company_name: profile.company_name ?? "",
    company_rccm: profile.company_rccm ?? "",
    company_ifu: profile.company_ifu ?? "",
    company_address: profile.company_address ?? "",
    phone: profile.phone ?? "",
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
  };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyProfile(form);
      toast.success("Paramètres de l'organisation enregistrés");
    } catch {
      toast.error("Enregistrement impossible. Vos saisies sont conservées.");
    }
    setBusy(false);
    router.invalidate();
  };

  const fields: [keyof typeof form, string][] = [
    ["company_name", "Raison sociale"],
    ["company_rccm", "N° RCCM"],
    ["company_ifu", "N° IFU"],
    ["company_address", "Adresse du siège"],
    ["phone", "Téléphone"],
    ["first_name", "Prénom de l'administrateur"],
    ["last_name", "Nom de l'administrateur"],
  ];
  const missing = fields.filter(([k]) => !form[k].trim());
  const stats = [
    ["Sites", records.filter((r) => r.kind === "site").length],
    ["Collaborateurs", records.filter((r) => r.kind === "collaborator").length],
    ["Processus", records.filter((r) => r.kind === "process").length],
    [
      "Normes actives",
      records.filter((r) => r.kind === "norm" && r.status === "Active").length || 1,
    ],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Header
        title="Paramètres de l'organisation"
        desc="Identité légale, contacts, sites et normes de l'entreprise."
      >
        <Link
          to="/app/$section"
          params={{ section: "sites" }}
          search={{ new: 1 }}
          className={ghostBtn}
        >
          Ajouter un site
        </Link>
        <Link to="/app/$section" params={{ section: "normes" }} className={ghostBtn}>
          Gérer les normes
        </Link>
      </Header>
      {missing.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-bold text-destructive">Configuration incomplète</p>
          <p className="mt-1 text-muted-foreground">
            À compléter : {missing.map(([, l]) => l).join(", ")}.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-display text-2xl font-extrabold text-foreground">{v}</p>
            <p className="text-xs font-semibold text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <form onSubmit={save} className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold text-foreground">
              {form.company_name || "Votre entreprise"}
            </p>
            <p className="text-xs text-muted-foreground">
              {profile.email} · Compte {profile.status === "active" ? "actif" : profile.status}
            </p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(([k, l]) => (
            <label key={k} className="block">
              <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{l}</span>
              <input
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className={`h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none focus:border-primary ${!form[k].trim() ? "border-destructive/40" : "border-input"}`}
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          <button disabled={busy} className={primaryBtn}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={() => setForm(initial)} className={ghostBtn}>
            <RotateCcw className="h-4 w-4" /> Réinitialiser
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Utilisateurs & permissions ----------
const PERMS = [
  "Documents",
  "Processus",
  "Non-conformités",
  "Actions",
  "Audits",
  "Indicateurs",
  "Sites & utilisateurs",
  "Abonnement",
];
const ROLES: { name: string; desc: string; rights: ("full" | "read" | "none")[] }[] = [
  {
    name: "Administrateur",
    desc: "Gère l'entreprise, les sites, les utilisateurs et les droits.",
    rights: ["full", "full", "full", "full", "full", "full", "full", "full"],
  },
  {
    name: "Responsable de site",
    desc: "Pilote les activités de son ou ses sites.",
    rights: ["full", "full", "full", "full", "full", "full", "read", "none"],
  },
  {
    name: "Collaborateur",
    desc: "Consulte et contribue selon ses affectations.",
    rights: ["read", "read", "full", "full", "read", "read", "none", "none"],
  },
  {
    name: "Auditeur",
    desc: "Accès en lecture et saisie des constats d'audit.",
    rights: ["read", "read", "read", "read", "full", "read", "none", "none"],
  },
];

export function RolesPage() {
  const { data: records = [] } = useRecords();
  const save = useSaveRecord();
  const collabs = records.filter((r) => r.kind === "collaborator");
  const sites = records.filter((r) => r.kind === "site");
  const assign = (r: QRecord, key: string, value: string, label: string) => {
    toast.info(`${label} pour ${r.title}.`);
    save.mutate({
      id: r.id,
      kind: r.kind,
      title: r.title,
      status: r.status,
      data: { ...r.data, [key]: value },
      previous: r,
    });
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Header
        title="Utilisateurs & permissions"
        desc="Rôles, affectations aux sites et matrice des droits. Chaque changement est inscrit au journal."
      >
        <Link
          to="/app/$section"
          params={{ section: "collaborateurs" }}
          search={{ new: 1 }}
          className={primaryBtn}
        >
          Inviter un collaborateur
        </Link>
        <button
          onClick={() =>
            downloadCsv("utilisateurs.csv", [
              ["Nom", "E-mail", "Rôle", "Site", "Statut"],
              ...collabs.map((c) => [
                c.title,
                String(c.data["email"] ?? ""),
                String(c.data["role"] ?? ""),
                sites.find((s) => s.id === c.data["site_id"])?.title ?? "",
                c.status,
              ]),
            ])
          }
          className={ghostBtn}
        >
          <Download className="h-4 w-4" /> Exporter
        </button>
      </Header>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Collaborateur</th>
              <th className="px-4 py-3">Rôle</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {collabs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun collaborateur. Invitez votre première personne.
                </td>
              </tr>
            )}
            {collabs.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{String(c.data["email"] ?? "")}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={String(c.data["role"] ?? "")}
                    onChange={(e) =>
                      assign(c, "role", e.target.value, `Attribuer le rôle « ${e.target.value} »`)
                    }
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="">—</option>
                    {ROLES.map((r) => (
                      <option key={r.name}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={String(c.data["site_id"] ?? "")}
                    onChange={(e) => assign(c, "site_id", e.target.value, "Affecter au site")}
                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— Aucun —</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge kind="collaborator" status={c.status} />
                </td>
                <td className="px-4 py-3">
                  <RecordActions record={c} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Rôle</th>
              {PERMS.map((p) => (
                <th key={p} className="px-3 py-3 text-center">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROLES.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.desc}</p>
                </td>
                {r.rights.map((v, i) => (
                  <td key={i} className="px-3 py-3 text-center">
                    {v === "full" ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : v === "read" ? (
                      <span className="text-xs font-bold text-primary">Lecture</span>
                    ) : (
                      <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Note : les collaborateurs n'ont pas encore leur propre connexion ; la matrice décrit les
        droits qui s'appliqueront à leurs comptes.
      </p>
    </div>
  );
}

// ---------- Préférences ----------
const PREF_KEY = "lq-prefs";
const DEFAULT_PREFS = {
  notif_tasks: true,
  notif_deadlines: true,
  notif_validation: true,
  widget_kpis: true,
  widget_priorities: true,
  widget_activity: true,
  widget_processes: true,
};
type Prefs = typeof DEFAULT_PREFS;
const PREF_LABELS: Record<keyof Prefs, string> = {
  notif_tasks: "Notifier les nouvelles tâches",
  notif_deadlines: "Alerter avant les échéances",
  notif_validation: "Notifier les retours de validation",
  widget_kpis: "Tableau de bord : indicateurs clés",
  widget_priorities: "Tableau de bord : priorités",
  widget_activity: "Tableau de bord : activité",
  widget_processes: "Tableau de bord : processus",
};

export function PreferencesPage() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFS;
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}") };
    } catch {
      return DEFAULT_PREFS;
    }
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <Header
        title="Préférences"
        desc="Vos préférences personnelles : elles ne modifient pas l'affichage des autres utilisateurs."
      />
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {(Object.keys(PREF_LABELS) as (keyof Prefs)[]).map((k) => (
          <label
            key={k}
            className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-sm"
          >
            <span className="font-semibold text-foreground">{PREF_LABELS[k]}</span>
            <input
              type="checkbox"
              checked={prefs[k]}
              onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
            toast.success("Préférences enregistrées");
          }}
          className={primaryBtn}
        >
          Enregistrer
        </button>
        <button
          onClick={() => {
            setPrefs(DEFAULT_PREFS);
            localStorage.removeItem(PREF_KEY);
            toast.success("Préférences réinitialisées");
          }}
          className={ghostBtn}
        >
          <RotateCcw className="h-4 w-4" /> Réinitialiser
        </button>
        <button
          onClick={() => toast.info("Ceci est une notification de test LOGIQUALI.")}
          className={ghostBtn}
        >
          Tester la notification
        </button>
      </div>
    </div>
  );
}

// ---------- Journal sécurité ----------
export function JournalPage() {
  const { records } = useWs();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const events = useMemo(
    () =>
      records
        .flatMap((r) => historyOf(r).map((h) => ({ ...h, r })))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [records],
  );
  const types = [...new Set(events.map((e) => e.action))].sort();
  const list = events.filter(
    (e) =>
      (!type || e.action === type) &&
      (!from || e.at >= from) &&
      (!q ||
        `${e.by} ${e.action} ${historyActionLabel(e.action)} ${e.r.reference} ${e.r.title} ${e.comment ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Header
        title="Journal sécurité"
        desc="Créations, modifications, validations, changements de statut et de droits. Lecture seule."
      >
        <button
          onClick={() =>
            downloadCsv("journal.csv", [
              ["Date", "Utilisateur", "Événement", "Élément", "De", "Vers", "Commentaire"],
              ...list.map((e) => [
                new Date(e.at).toLocaleString("fr-FR"),
                e.by,
                historyActionLabel(e.action),
                `${e.r.reference} ${e.r.title}`,
                e.from ?? "",
                e.to ?? "",
                e.comment ?? "",
              ]),
            ])
          }
          className={ghostBtn}
        >
          <Download className="h-4 w-4" /> Exporter
        </button>
      </Header>
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un événement…"
          className="h-10 min-w-[220px] flex-1 rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-primary"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
        >
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t} value={t}>{historyActionLabel(t)}</option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
          aria-label="Depuis le"
        />
      </div>
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch] rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Événement</th>
              <th className="px-4 py-3">Élément</th>
              <th className="px-4 py-3">Détail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun événement.
                </td>
              </tr>
            )}
            {list.slice(0, 300).map((e, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                  {new Date(e.at).toLocaleString("fr-FR")}
                </td>
                <td className="px-4 py-2.5">{e.by || "—"}</td>
                <td className="px-4 py-2.5 font-semibold text-foreground">
                  {historyActionLabel(e.action)}
                  {e.to && e.from !== e.to ? ` → ${e.to}` : ""}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs font-bold text-primary">{e.r.reference}</span>{" "}
                  {e.r.title}
                </td>
                <td
                  className="max-w-[280px] truncate px-4 py-2.5 text-muted-foreground"
                  title={e.comment}
                >
                  {e.comment ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Abonnement ----------
const OFFERS = [
  {
    name: "Essentiel",
    price: "49 000 FCFA / mois",
    norms: 1,
    sites: 1,
    users: 10,
    desc: "1 norme au choix, 1 site.",
  },
  {
    name: "Pack Intégré",
    price: "89 000 FCFA / mois",
    norms: 3,
    sites: 3,
    users: 30,
    desc: "Jusqu'à 3 normes (QSE), 3 sites.",
  },
  {
    name: "Enterprise",
    price: "Sur devis",
    norms: 6,
    sites: 99,
    users: 999,
    desc: "Toutes les normes, sites illimités.",
  },
];

export function SubscriptionPage() {
  const { records, ws } = useWs();
  const save = useSaveRecord();
  const qc = useQueryClient();
  const requests = records.filter((r) => r.kind === "subscription_request");
  const users = records.filter((r) => r.kind === "collaborator").length;
  const sites = records.filter((r) => r.kind === "site").length;
  const request = (offer: string, price: string, what: string) => {
    toast.info(`${what} : ${offer}.`);
    save.mutate({
      kind: "subscription_request",
      title: `${what} — ${offer}`,
      status: "En attente",
      data: { offer, amount: price },
    });
  };
  const activeNorms = ws.norms.filter((n) => n.status === "Active");
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Header title="Abonnement" desc="Offre, normes actives, échéances et historique." />
      <div
        className={`rounded-3xl border-[1.5px] bg-card p-6 shadow-xl shadow-primary/10 ${ws.expired ? "border-destructive" : "border-primary"}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <CreditCard className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">
                Offre actuelle
              </p>
              <p className="font-display text-xl font-extrabold text-foreground">
                {ws.inTrial ? "Période d'essai" : "Abonnement"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ws.expired
                  ? "Expiré — les rubriques normatives sont verrouillées, vos données sont conservées."
                  : `${ws.daysLeft} jour(s) restant(s) · expiration le ${ws.nextExpiry?.toLocaleDateString("fr-FR")}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => request(OFFERS[1]!.name, OFFERS[1]!.price, "Renouvellement")}
            className={primaryBtn}
          >
            Renouveler
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {(
            [
              ["Utilisateurs", users, 10],
              ["Sites", sites, 3],
              ["Normes actives", activeNorms.length, 3],
            ] as const
          ).map(([l, v, max]) => (
            <div key={l}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold text-foreground">{l}</span>
                <span className="text-muted-foreground">
                  {v} / {max}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {ws.norms
            .filter((n) => n.status !== "Inactive")
            .map((n) => (
              <span
                key={n.code}
                className={`rounded-full px-3 py-1 text-xs font-bold ${n.status === "Active" ? "bg-primary-soft text-primary" : "bg-destructive/10 text-destructive"}`}
              >
                {n.code} · {n.status}
                {n.expiresAt ? ` · ${n.expiresAt.toLocaleDateString("fr-FR")}` : ""}
              </span>
            ))}
          <Link
            to="/app/$section"
            params={{ section: "normes" }}
            className="rounded-full border border-primary px-3 py-1 text-xs font-bold text-primary"
          >
            Ajouter une norme
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {OFFERS.map((o) => (
          <div key={o.name} className="rounded-2xl border border-border bg-card p-5">
            <p className="font-display font-bold text-foreground">{o.name}</p>
            <p className="mt-1 text-sm font-semibold text-primary">{o.price}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {o.desc} {o.users} utilisateurs.
            </p>
            <button
              onClick={() => request(o.name, o.price, "Souscription")}
              className="mt-4 h-10 w-full rounded-xl border border-border text-sm font-semibold hover:border-primary hover:text-primary"
            >
              Choisir cette offre
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-foreground">Historique & paiements</p>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: RECORDS_KEY });
              toast.success("Statut des paiements actualisé");
            }}
            className="text-xs font-bold text-primary"
          >
            Vérifier le paiement
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Le paiement en ligne n'est pas encore activé : chaque demande est transmise à notre
          équipe, qui vous recontacte pour le règlement.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {requests.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">Aucune demande pour le moment.</li>
          )}
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span>
                <span className="font-mono text-xs font-bold text-primary">{r.reference}</span>{" "}
                {r.title} · {String(r.data["amount"] ?? "")}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("fr-FR")}
                </span>
                <StatusBadge kind={r.kind} status={r.status} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
