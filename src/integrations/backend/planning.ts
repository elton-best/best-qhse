import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Workflow SM / Planification aligné sur `feat/modular-backend-iso-exports` :
 * - modifications : submit-verification -> verify-rq -> approve-ceo -> record-results
 * - actions : my-actions (vue collaborateur)
 * - my-tasks : suivi mensuel multi-sources (parité avec le frontend Vue :
 *   GET /my-tasks, POST /my-tasks/:type/:id/tracking, historique, rapport)
 */

export const MODIFICATIONS_KEY = ["sm-modifications"] as const;
export const MY_ACTIONS_KEY = ["my-actions"] as const;
export const MY_TASKS_KEY = ["my-tasks"] as const;

export async function fetchMyActions(params?: { per_page?: number }) {
  const suffix = `?per_page=${params?.per_page ?? 100}`;
  const payload = await backendApi.request<unknown>(`actions/my-actions${suffix}`);
  return normalizeMyActions(payload);
}

export function useMyActions(params?: { per_page?: number }) {
  return useQuery({
    queryKey: [...MY_ACTIONS_KEY, params ?? {}],
    queryFn: () => fetchMyActions(params),
    staleTime: 20_000,
  });
}

// ---------- Mes actions : types partagés (parité Vue MyActions.vue) ----------

export type MyActionItem = {
  id: string | number;
  reference: string;
  title: string;
  description?: string | undefined;
  type: string;
  priority: string;
  status: string;
  progress: number;
  due_date?: string | null | undefined;
  deadline?: string | null | undefined;
  process_id?: string | number | null | undefined;
  process?: { id?: string | number; title?: string; code?: string } | null | undefined;
  site_id?: string | number | null | undefined;
  site?: { id?: string | number; name?: string } | null | undefined;
  responsible_id?: string | number | null | undefined;
  [key: string]: unknown;
};

export type MyActionStats = {
  total_assigned: number;
  open_count: number;
  in_progress_count: number;
  overdue_count: number;
  due_soon_count: number;
  completed_count: number;
};

export type MyActionsPayload = {
  stats: MyActionStats;
  actions: MyActionItem[];
  by_process: Array<{
    process_id: string | number | null;
    process_label: string;
    process_code?: string | null;
    total_count: number;
    open_count: number;
    overdue_count: number;
  }>;
  pagination?: { current_page: number; last_page: number; per_page: number; total: number };
};

const numberOf = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function normalizeMyActionItem(item: Record<string, unknown>): MyActionItem {
  const process = (item["process"] ?? null) as MyActionItem["process"];
  const site = (item["site"] ?? null) as MyActionItem["site"];
  const deadline =
    (typeof item["due_date"] === "string" && (item["due_date"] as string)) ||
    (typeof item["deadline"] === "string" && (item["deadline"] as string)) ||
    null;
  const rawId = item["id"] ?? "";
  return {
    ...item,
    id: rawId as string | number,
    reference: String(item["reference"] ?? item["ref"] ?? `ACT-${String(rawId)}`),
    title: String(item["title"] ?? ""),
    description:
      typeof item["description"] === "string" ? (item["description"] as string) : undefined,
    type: String(item["type"] ?? "corrective"),
    priority: String(item["priority"] ?? "medium"),
    status: String(item["status"] ?? "planned"),
    progress: numberOf(
      item["progress"] ?? item["progress_percentage"] ?? item["progress_rate"] ?? 0,
    ),
    due_date: deadline,
    deadline,
    process_id: (item["process_id"] ?? process?.id ?? null) as MyActionItem["process_id"],
    process,
    site_id: (item["site_id"] ?? site?.id ?? null) as MyActionItem["site_id"],
    site,
    responsible_id: (item["responsible_id"] ?? null) as MyActionItem["responsible_id"],
  };
}

export function normalizeMyActions(payload: unknown): MyActionsPayload {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root["data"] ?? root) as Record<string, unknown>;
  // Le paginateur Laravel historique expose les lignes sous `data.data`.
  const rawActions = Array.isArray(data["actions"])
    ? (data["actions"] as Record<string, unknown>[])
    : Array.isArray(data["data"])
      ? (data["data"] as Record<string, unknown>[])
      : Array.isArray(root["data"])
        ? (root["data"] as Record<string, unknown>[])
        : [];
  const stats = (data["stats"] ?? {}) as Record<string, unknown>;
  const counts = (root["counts"] ?? {}) as Record<string, unknown>;
  const rawPagination = (data["pagination"] ?? data["meta"] ?? {}) as Record<string, unknown>;
  const result: MyActionsPayload = {
    stats: {
      total_assigned: numberOf(stats["total_assigned"] ?? counts["total"]),
      open_count: numberOf(
        stats["open_count"] ?? numberOf(counts["total"]) - numberOf(counts["completed"]),
      ),
      in_progress_count: numberOf(stats["in_progress_count"] ?? counts["in_progress"]),
      overdue_count: numberOf(stats["overdue_count"] ?? counts["overdue"]),
      due_soon_count: numberOf(stats["due_soon_count"]),
      completed_count: numberOf(stats["completed_count"] ?? counts["completed"]),
    },
    actions: rawActions.map((item) =>
      normalizeMyActionItem((item ?? {}) as Record<string, unknown>),
    ),
    by_process: Array.isArray(data["by_process"])
      ? (data["by_process"] as MyActionsPayload["by_process"])
      : [],
  };
  if (rawPagination["current_page"]) {
    result.pagination = {
      current_page: numberOf(rawPagination["current_page"]),
      last_page: numberOf(rawPagination["last_page"]),
      per_page: numberOf(rawPagination["per_page"]),
      total: numberOf(rawPagination["total"]),
    };
  }
  return result;
}

export const MY_ACTION_CLOSED = ["completed", "verified", "closed", "cancelled"];

export function isMyActionOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate || MY_ACTION_CLOSED.includes(status)) return false;
  const date = new Date(dueDate);
  return !Number.isNaN(date.getTime()) && date < new Date(new Date().toDateString());
}

export function myActionStatusLabel(status: string, overdue: boolean): string {
  if (overdue) return "En retard";
  return (
    (
      {
        planned: "À faire",
        draft: "À faire",
        assigned: "À faire",
        in_progress: "En cours",
        completed: "Terminée",
        verified: "Vérifiée",
        closed: "Fermée",
        cancelled: "Annulée",
      } as Record<string, string>
    )[status] ?? status
  );
}

export function myActionTypeLabel(type: string): string {
  return (
    (
      { corrective: "Corrective", preventive: "Préventive", improvement: "Amélioration" } as Record<
        string,
        string
      >
    )[type] ?? type
  );
}

export function myActionPriorityLabel(priority: string): string {
  return (
    (
      {
        low: "Basse",
        medium: "Moyenne",
        high: "Haute",
        critical: "Urgente",
        urgent: "Urgente",
      } as Record<string, string>
    )[priority] ?? priority
  );
}

export function useActionProgress() {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: MY_ACTIONS_KEY });
  };
  return useMutation({
    mutationFn: async (input: {
      id: string | number;
      progress: number;
      notes?: string | undefined;
    }) =>
      backendApi.request(`actions/${input.id}/progress`, {
        method: "POST",
        body: JSON.stringify({ progress: input.progress, notes: input.notes }),
      }),
    onSuccess: invalidate,
  });
}

export function useActionStatus() {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: MY_ACTIONS_KEY });
  };
  return useMutation({
    mutationFn: async (input: {
      id: string | number;
      status: string;
      comments?: string | undefined;
    }) =>
      backendApi.request(`actions/${input.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: input.status, comments: input.comments }),
      }),
    onSuccess: invalidate,
  });
}

// ---------- Mes tâches : suivi mensuel (parité Vue useMyTasks) ----------

export type MyTaskStatus = "non_demarre" | "en_cours" | "termine";

export type MyTask = {
  id: number;
  type: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  deadline?: string | null;
  status: string;
  progress_rate: number;
  responsible_id?: number | null;
  responsible?: string | null;
  process_id?: number | null;
  process_name?: string | null;
  tracking_available: boolean;
  has_tracking: boolean;
  frequency?: string | null;
  [key: string]: unknown;
};

export type MyTasksParams = {
  month?: string | undefined;
  status?: string | undefined;
  type?: string | string[] | undefined;
  process_id?: string | number | undefined;
};

export async function fetchMyTasks(params: MyTasksParams = {}): Promise<MyTask[]> {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.status) query.set("status", params.status);
  if (params.type) {
    if (Array.isArray(params.type)) params.type.forEach((t) => query.append("type", t));
    else query.set("type", params.type);
  }
  if (params.process_id) query.set("process_id", String(params.process_id));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`my-tasks${suffix}`);
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = root["data"] ?? payload;
  return Array.isArray(data) ? (data as MyTask[]) : [];
}

export function useMyTasks(params: MyTasksParams = {}) {
  return useQuery({
    queryKey: [...MY_TASKS_KEY, params],
    queryFn: () => fetchMyTasks(params),
    staleTime: 20_000,
    retry: 1,
  });
}

export type TaskTrackingInput = {
  status: MyTaskStatus;
  progress_rate: number;
  notes?: string | undefined;
};

export function useTaskTracking() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: string; id: number; form: TaskTrackingInput }) =>
      backendApi.request(`my-tasks/${input.type}/${input.id}/tracking`, {
        method: "POST",
        body: JSON.stringify({
          status: input.form.status,
          progress_rate: input.form.progress_rate,
          notes: input.form.notes,
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: MY_TASKS_KEY });
    },
  });
}

export type TaskHistoryEntry = {
  changed_at: string;
  changed_by?: string;
  status_old?: string | null;
  status_new?: string | null;
  rate_old?: number | null;
  rate_new?: number | null;
  notes?: string | null;
};

export async function fetchTaskHistory(type: string, id: number): Promise<TaskHistoryEntry[]> {
  const payload = await backendApi.request<unknown>(`my-tasks/${type}/${id}/history`);
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = root["data"] ?? payload;
  return Array.isArray(data) ? (data as TaskHistoryEntry[]) : [];
}

export async function downloadTaskReport(type: string, id: number): Promise<void> {
  const token = localStorage.getItem("lq-backend-token");
  const base = (import.meta.env["VITE_API_BASE_URL"] || "/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/my-tasks/${type}/${id}/report`, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" } : {},
  });
  if (!response.ok) throw new Error("Le téléchargement du rapport a échoué.");
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.setAttribute("download", `rapport-${type}-${id}.docx`);
  window.document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useModificationWorkflow() {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: MODIFICATIONS_KEY });
    client.invalidateQueries({ queryKey: ["qhse-records"] });
  };
  return {
    submit: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`modifications/${id}/submit-verification`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    verifyRq: useMutation({
      mutationFn: (input: { id: string | number; comment?: string; decision?: string }) =>
        backendApi.request(`modifications/${input.id}/verify-rq`, {
          method: "POST",
          body: JSON.stringify({ comment: input.comment, decision: input.decision }),
        }),
      onSuccess: invalidate,
    }),
    approveCeo: useMutation({
      mutationFn: (input: { id: string | number; comment?: string; decision?: string }) =>
        backendApi.request(`modifications/${input.id}/approve-ceo`, {
          method: "POST",
          body: JSON.stringify({ comment: input.comment, decision: input.decision }),
        }),
      onSuccess: invalidate,
    }),
    recordResults: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        backendApi.request(`modifications/${input.id}/record-results`, {
          method: "POST",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
  };
}
