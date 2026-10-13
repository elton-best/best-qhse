import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Plan du SM hiérarchique (6.3 : Activité -> Sous-activité -> Action),
 * calendrier global lecture seule (`GET /plan-sm`) et demandes de
 * modification du SM (workflow brouillon -> RQ -> CEO -> résultats).
 *
 * Constats live (site_id=2, 2026-10-13) :
 * - `POST sm-plan-hierarchy/sub-activities` et `POST .../actions` sans
 *   paramètre d'URL : le contrôleur exige désormais `activity_id?` /
 *   `sub_activity_id?` optionnels avec repli sur le corps (fix appliqué).
 * - `ModificationResource` n'expose PAS `workflow_status`, `rq_notes`,
 *   `ceo_notes`, `modification_results`, `surveillance_results` ni
 *   `affected_document_ids` : l'affichage du workflow s'adapte (statut,
 *   `validated_at`, progression locale).
 * - `GET /plan-sm` lève 500 `PermissionDoesNotExist: view_all_tasks` quand
 *   la permission n'existe pas : la section calendrier se masque avec le
 *   message au lieu de bloquer la page.
 */

export const SM_PLAN_HIERARCHY_KEY = ["sm-plan-hierarchy"] as const;
export const PLAN_SM_CALENDAR_KEY = ["plan-sm-calendar"] as const;
export const SM_MODIFICATIONS_KEY = ["sm-modifications"] as const;
export const SM_LOOKUPS_KEY = ["sm-plan-lookups"] as const;

export type SmActionStatus = "a_planifier" | "en_cours" | "realise" | "en_retard" | "replanifie";

export type SmPlanAction = {
  id: string | number;
  sub_activity_id?: string | number | null;
  code?: string | null;
  title: string;
  responsible_id?: string | number | null;
  responsible_name?: string | null;
  responsible?: { id?: string | number; name?: string | null } | null;
  rescheduler?: { id?: string | number; name?: string | null } | null;
  internal_actors?: string | null;
  external_actors?: string | null;
  deliverables?: string | null;
  indicators?: string | null;
  start_date?: string | null;
  deadline?: string | null;
  months?: unknown;
  status: string;
  observations?: string | null;
  rescheduled_count?: number;
  rescheduled_reason?: string | null;
  rescheduled_by?: string | number | null;
  rescheduled_at?: string | null;
};

export type SmPlanSubActivity = {
  id: string | number;
  activity_id?: string | number | null;
  code?: string | null;
  title: string;
  description?: string | null;
  order?: number | null;
  actions?: SmPlanAction[];
};

export type SmPlanActivity = {
  id: string | number;
  site_id?: string | number | null;
  process_id?: string | number | null;
  year?: number | null;
  code?: string | null;
  title: string;
  description?: string | null;
  order?: number | null;
  site?: { id?: string | number; name?: string | null } | null;
  process?: { id?: string | number; code?: string | null; title?: string | null } | null;
  sub_activities?: SmPlanSubActivity[] | null;
  subActivities?: SmPlanSubActivity[] | null;
};

export type SmPlanSummary = {
  total_activities: number;
  total_actions: number;
  completed_actions: number;
  in_progress_actions: number;
  delayed_actions: number;
  completion_rate: number;
};

export type SmPlanHierarchyPayload = {
  activities: SmPlanActivity[];
  summary: SmPlanSummary | null;
};

export type PlanSMCalendarTask = {
  id: string;
  type: string;
  title: string;
  start_date: string;
  deadline: string;
  status: string;
  responsible_id?: number | null;
  responsible_name?: string | null;
  involved_people?: number[];
  frequency?: string | null;
  process_id?: number | null;
  color: string;
};

export type PlanSMCalendarPayload = {
  tasks: PlanSMCalendarTask[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
  filters: {
    view: string;
    start_date: string;
    end_date: string;
    user_ids: number[];
    process_id: string | number | null;
    types: string[];
  };
};

export type SmModification = Record<string, unknown> & { id: string | number };

export type SmModificationsPayload = {
  items: SmModification[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
};

export type SmLookup = { id: string; label: string; detail?: string };

function str(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectionOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = objectOf(payload);
  if (Array.isArray(root["data"])) return root["data"] as unknown[];
  return [];
}

function idOf(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function nameOf(record: Record<string, unknown>): string {
  const name = record["name"] ?? record["title"] ?? record["code"] ?? record["email"];
  return str(name, `Élément ${idOf(record["id"])}`);
}

// ---------------------------------------------------------------------------
// Hiérarchie du Plan SM (brut {success, data, summary}, NON paginé)
// ---------------------------------------------------------------------------

export type SmHierarchyParams = {
  year: number | string;
  site_id?: string | undefined;
  process_id?: string | undefined;
};

function normalizeAction(item: unknown): SmPlanAction {
  const raw = objectOf(item);
  const responsible = objectOf(raw["responsible"]);
  const rescheduler = objectOf(raw["rescheduler"]);
  const action: SmPlanAction = {
    id: (raw["id"] ?? "") as string | number,
    title: str(raw["title"]),
    status: str(raw["status"], "a_planifier"),
  };
  if (Object.keys(responsible).length > 0) {
    action.responsible = responsible as NonNullable<SmPlanAction["responsible"]>;
  }
  if (Object.keys(rescheduler).length > 0) {
    action.rescheduler = rescheduler as NonNullable<SmPlanAction["rescheduler"]>;
  }
  return action;
}

function normalizeSubActivity(item: unknown): SmPlanSubActivity {
  const raw = objectOf(item);
  const actions = Array.isArray(raw["actions"]) ? (raw["actions"] as unknown[]) : [];
  return {
    ...raw,
    id: (raw["id"] ?? "") as string | number,
    title: str(raw["title"]),
    actions: actions.map(normalizeAction),
  };
}

function normalizeActivity(item: unknown): SmPlanActivity {
  const raw = objectOf(item);
  const subs = raw["sub_activities"] ?? raw["subActivities"] ?? [];
  const list = Array.isArray(subs) ? (subs as unknown[]) : [];
  const normalized = list.map(normalizeSubActivity);
  return {
    ...raw,
    id: (raw["id"] ?? "") as string | number,
    title: str(raw["title"]),
    sub_activities: normalized,
    subActivities: normalized,
  };
}

export async function fetchSmPlanHierarchy(
  params: SmHierarchyParams,
): Promise<SmPlanHierarchyPayload> {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  if (params.site_id) query.set("site_id", params.site_id);
  if (params.process_id) query.set("process_id", params.process_id);
  const payload = await backendApi.request<unknown>(`sm-plan-hierarchy?${query.toString()}`);
  const root = objectOf(payload);
  const data = root["data"] ?? payload;
  const list = Array.isArray(data) ? (data as unknown[]) : [];
  const summaryRaw = objectOf(root["summary"]);
  return {
    activities: list.map(normalizeActivity),
    summary:
      Object.keys(summaryRaw).length > 0
        ? {
            total_activities: num(summaryRaw["total_activities"]),
            total_actions: num(summaryRaw["total_actions"]),
            completed_actions: num(summaryRaw["completed_actions"]),
            in_progress_actions: num(summaryRaw["in_progress_actions"]),
            delayed_actions: num(summaryRaw["delayed_actions"]),
            completion_rate: num(summaryRaw["completion_rate"]),
          }
        : null,
  };
}

export function useSmPlanHierarchy(params: SmHierarchyParams) {
  return useQuery({
    queryKey: [...SM_PLAN_HIERARCHY_KEY, params],
    queryFn: () => fetchSmPlanHierarchy(params),
    staleTime: 60_000,
  });
}

export async function exportSmPlanXlsx(params: SmHierarchyParams): Promise<Blob> {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  if (params.site_id) query.set("site_id", params.site_id);
  if (params.process_id) query.set("process_id", params.process_id);
  return backendApi.blob(`sm-plan-hierarchy/export-xlsx?${query.toString()}`);
}

export function downloadSmBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  window.document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Calendrier global lecture seule
// ---------------------------------------------------------------------------

export const PLAN_SM_TYPE_META: Array<{ id: string; label: string; color: string }> = [
  { id: "action", label: "Actions", color: "#FF5252" },
  { id: "audit", label: "Audits", color: "#FF9800" },
  { id: "formation", label: "Formations", color: "#2196F3" },
  { id: "communication", label: "Communications", color: "#FFC107" },
  { id: "non_conformity", label: "Non-conformités", color: "#E91E63" },
  { id: "objective", label: "Objectifs", color: "#00BCD4" },
  { id: "risk", label: "Risques", color: "#FF6F00" },
  { id: "plan_action", label: "Plans d'action", color: "#8BC34A" },
  { id: "maintenance_plan", label: "Plans de maintenance", color: "#9C27B0" },
  { id: "calibration_plan", label: "Plans d'étalonnage", color: "#4CAF50" },
  { id: "compliance_obligation_action", label: "Actions conformité", color: "#673AB7" },
  { id: "stakeholder_requirement_action", label: "Actions parties prenantes", color: "#009688" },
  { id: "process_risk_opportunity", label: "Risques/opportunités processus", color: "#F57F17" },
  { id: "operational_project_activity", label: "Activités projet", color: "#3F51B5" },
  { id: "operational_project_task", label: "Tâches projet", color: "#512DA8" },
];

export function planSmTypeMeta(type: string): { label: string; color: string } {
  const found = PLAN_SM_TYPE_META.find((entry) => entry.id === type);
  if (found) return { label: found.label, color: found.color };
  return { label: type || "Autre", color: "#9E9E9E" };
}

export type PlanSMCalendarParams = {
  view: "month" | "week" | "day";
  start_date?: string | undefined;
  end_date?: string | undefined;
  types?: string[] | undefined;
  user_id?: string | undefined;
  process_id?: string | undefined;
  page?: number | undefined;
  per_page?: number | undefined;
};

export async function fetchPlanSmCalendar(
  params: PlanSMCalendarParams,
): Promise<PlanSMCalendarPayload> {
  const query = new URLSearchParams();
  query.set("view", params.view);
  if (params.start_date) query.set("start_date", params.start_date);
  if (params.end_date) query.set("end_date", params.end_date);
  (params.types ?? []).forEach((type) => {
    if (type) query.append("type", type);
  });
  if (params.user_id) query.set("user_id", params.user_id);
  if (params.process_id) query.set("process_id", params.process_id);
  query.set("page", String(params.page ?? 1));
  query.set("per_page", String(params.per_page ?? 100));
  const payload = await backendApi.request<unknown>(`plan-sm?${query.toString()}`);
  const root = objectOf(payload);
  const tasks = collectionOf(payload).map((item) => {
    const raw = objectOf(item);
    return {
      id: str(raw["id"]),
      type: str(raw["type"], "action"),
      title: str(raw["title"], "Sans titre"),
      start_date: str(raw["start_date"]),
      deadline: str(raw["deadline"]),
      status: str(raw["status"]),
      responsible_id: raw["responsible_id"] == null ? null : num(raw["responsible_id"]),
      responsible_name: raw["responsible_name"] == null ? null : str(raw["responsible_name"]),
      involved_people: Array.isArray(raw["involved_people"])
        ? (raw["involved_people"] as unknown[]).map((v) => num(v)).filter((v) => v > 0)
        : [],
      frequency: raw["frequency"] == null ? null : str(raw["frequency"]),
      process_id: raw["process_id"] == null ? null : num(raw["process_id"]),
      color: str(raw["color"], "#9E9E9E"),
    } satisfies PlanSMCalendarTask;
  });
  const pagination = objectOf(root["pagination"]);
  const filters = objectOf(root["filters"]);
  const userIds = filters["user_ids"];
  return {
    tasks,
    pagination: {
      total: num(pagination["total"]),
      per_page: num(pagination["per_page"], 100),
      current_page: num(pagination["current_page"], 1),
      last_page: num(pagination["last_page"], 1),
    },
    filters: {
      view: str(filters["view"], params.view),
      start_date: str(filters["start_date"], params.start_date ?? ""),
      end_date: str(filters["end_date"], params.end_date ?? ""),
      user_ids: Array.isArray(userIds) ? (userIds as unknown[]).map((v) => num(v)) : [],
      process_id: filters["process_id"] == null ? null : (filters["process_id"] as string | number),
      types: Array.isArray(filters["types"])
        ? (filters["types"] as unknown[]).map((v) => str(v))
        : [],
    },
  };
}

export function usePlanSmCalendar(params: PlanSMCalendarParams, enabled = true) {
  return useQuery({
    queryKey: [...PLAN_SM_CALENDAR_KEY, params],
    queryFn: () => fetchPlanSmCalendar(params),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Modifications du SM (JSON:API paginé, attributs partiels — voir entête)
// ---------------------------------------------------------------------------

export type SmModificationsParams = {
  site_id?: string | undefined;
  workflow_status?: string | undefined;
  per_page?: number | undefined;
  page?: number | undefined;
};

export async function fetchSmModifications(
  params: SmModificationsParams = {},
): Promise<SmModificationsPayload> {
  const query = new URLSearchParams();
  if (params.site_id) query.set("site_id", params.site_id);
  if (params.workflow_status) query.set("workflow_status", params.workflow_status);
  query.set("per_page", String(params.per_page ?? 20));
  query.set("page", String(params.page ?? 1));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`modifications${suffix}`);
  const root = objectOf(payload);
  const meta = objectOf(root["meta"]);
  return {
    items: collectionOf(payload).map((item) => flattenResource(item) as SmModification),
    pagination: {
      total: num(meta["total"]),
      per_page: num(meta["per_page"], params.per_page ?? 20),
      current_page: num(meta["current_page"], params.page ?? 1),
      last_page: num(meta["last_page"], 1),
    },
  };
}

export function useSmModifications(params: SmModificationsParams) {
  return useQuery({
    queryKey: [...SM_MODIFICATIONS_KEY, params],
    queryFn: () => fetchSmModifications(params),
    staleTime: 60_000,
  });
}

export const SM_WORKFLOW_STATUSES: Array<{ id: string; label: string }> = [
  { id: "brouillon", label: "Brouillon" },
  { id: "en_cours", label: "En cours (vérification RQ)" },
  { id: "verifie_rq", label: "Vérifié RQ" },
  { id: "approuve_ceo", label: "Approuvé CEO" },
];

export function smWorkflowLabel(value: unknown): string {
  const key = str(value).toLowerCase();
  const found = SM_WORKFLOW_STATUSES.find((entry) => entry.id === key);
  if (found) return found.label;
  if (!key) return "Non renseigné (API)";
  return key;
}

export function smModificationStatusLabel(value: unknown): string {
  const key = str(value).toLowerCase();
  if (key === "pending") return "En attente";
  if (key === "approved") return "Approuvée";
  if (key === "implemented") return "Mise en œuvre";
  if (key === "rejected") return "Rejetée";
  return key ? key : "—";
}

// ---------------------------------------------------------------------------
// Listes d'appui : responsables + documents liés
// ---------------------------------------------------------------------------

export async function fetchSmResponsables(siteId: string): Promise<SmLookup[]> {
  const payload = await backendApi.request<unknown>(
    `users?site_id=${encodeURIComponent(siteId)}&per_page=100`,
  );
  return collectionOf(payload)
    .map((item) => flattenResource(item))
    .filter((record) => record["id"] != null)
    .map((record) => ({ id: idOf(record["id"]), label: nameOf(record) }));
}

export function useSmResponsables(siteId: string) {
  return useQuery({
    queryKey: [...SM_LOOKUPS_KEY, "users", siteId],
    queryFn: () => fetchSmResponsables(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}

export async function fetchSmDocuments(siteId: string): Promise<SmLookup[]> {
  const payload = await backendApi.request<unknown>(
    `documents?site_id=${encodeURIComponent(siteId)}&per_page=100`,
  );
  const items = collectionOf(payload);
  const list = items.length > 0 ? items : Array.isArray(payload) ? payload : [];
  return (Array.isArray(list) ? list : [])
    .map((item) => (objectOf(item)["attributes"] ? flattenResource(item) : objectOf(item)))
    .filter((record) => record["id"] != null)
    .map((record) => ({
      id: idOf(record["id"]),
      label: str(record["title"] ?? record["name"] ?? `Document ${idOf(record["id"])}`),
      detail: str(record["code"] ?? record["ref"] ?? ""),
    }));
}

export function useSmDocuments(siteId: string) {
  return useQuery({
    queryKey: [...SM_LOOKUPS_KEY, "documents", siteId],
    queryFn: () => fetchSmDocuments(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Mutations hiérarchie + workflow modifications
// ---------------------------------------------------------------------------

export function useSmPlanMutations() {
  const client = useQueryClient();
  const invalidateHierarchy = () => {
    client.invalidateQueries({ queryKey: SM_PLAN_HIERARCHY_KEY });
  };
  const post = (path: string, body: Record<string, unknown>) =>
    backendApi.request(path, { method: "POST", body: JSON.stringify(body) });
  const put = (path: string, body: Record<string, unknown>) =>
    backendApi.request(path, { method: "PUT", body: JSON.stringify(body) });
  const del = (path: string) => backendApi.request(path, { method: "DELETE" });
  return {
    createActivity: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        post("sm-plan-hierarchy/activities", payload),
      onSuccess: invalidateHierarchy,
    }),
    updateActivity: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        put(`sm-plan-hierarchy/activities/${input.id}`, input.payload),
      onSuccess: invalidateHierarchy,
    }),
    deleteActivity: useMutation({
      mutationFn: (id: string | number) => del(`sm-plan-hierarchy/activities/${id}`),
      onSuccess: invalidateHierarchy,
    }),
    createSubActivity: useMutation({
      mutationFn: (input: { activity_id: string | number; payload: Record<string, unknown> }) =>
        post("sm-plan-hierarchy/sub-activities", {
          activity_id: Number(input.activity_id),
          ...input.payload,
        }),
      onSuccess: invalidateHierarchy,
    }),
    updateSubActivity: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        put(`sm-plan-hierarchy/sub-activities/${input.id}`, input.payload),
      onSuccess: invalidateHierarchy,
    }),
    deleteSubActivity: useMutation({
      mutationFn: (id: string | number) => del(`sm-plan-hierarchy/sub-activities/${id}`),
      onSuccess: invalidateHierarchy,
    }),
    createAction: useMutation({
      mutationFn: (input: { sub_activity_id: string | number; payload: Record<string, unknown> }) =>
        post("sm-plan-hierarchy/actions", {
          sub_activity_id: Number(input.sub_activity_id),
          ...input.payload,
        }),
      onSuccess: invalidateHierarchy,
    }),
    updateAction: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        put(`sm-plan-hierarchy/actions/${input.id}`, input.payload),
      onSuccess: invalidateHierarchy,
    }),
    deleteAction: useMutation({
      mutationFn: (id: string | number) => del(`sm-plan-hierarchy/actions/${id}`),
      onSuccess: invalidateHierarchy,
    }),
    rescheduleAction: useMutation({
      mutationFn: (input: { id: string | number; new_deadline: string; reason: string }) =>
        post(`sm-plan-hierarchy/actions/${input.id}/reschedule`, {
          new_deadline: input.new_deadline,
          reason: input.reason,
        }),
      onSuccess: invalidateHierarchy,
    }),
  };
}

export function useSmModificationMutations() {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: SM_MODIFICATIONS_KEY });
  };
  const post = (path: string, body?: Record<string, unknown>) =>
    backendApi.request(
      path,
      body ? { method: "POST", body: JSON.stringify(body) } : { method: "POST" },
    );
  return {
    create: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        backendApi.request("modifications", { method: "POST", body: JSON.stringify(payload) }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        backendApi.request(`modifications/${input.id}`, {
          method: "PUT",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`modifications/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    submit: useMutation({
      mutationFn: (id: string | number) => post(`modifications/${id}/submit-verification`),
      onSuccess: invalidate,
    }),
    verifyRq: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        post(`modifications/${input.id}/verify-rq`, input.payload),
      onSuccess: invalidate,
    }),
    approveCeo: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        post(`modifications/${input.id}/approve-ceo`, input.payload),
      onSuccess: invalidate,
    }),
    recordResults: useMutation({
      mutationFn: (input: { id: string | number; payload: Record<string, unknown> }) =>
        post(`modifications/${input.id}/record-results`, input.payload),
      onSuccess: invalidate,
    }),
  };
}
