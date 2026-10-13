import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Objectifs qualité — contrats backend :
 * A. Objectifs centraux (ObjectiveController, brut, NON paginé) :
 *    GET/POST /objectives, PUT/DELETE /objectives/:id,
 *    POST /objectives/:id/progress, POST /objectives/:id/milestone,
 *    GET /objectives/export-xlsx?site_id= (blob).
 * B. Suivi mensuel par processus (ProcessController, brut) :
 *    GET /processes/:id/objectives, PUT .../objectives/:oid
 *    (422 si mois verrouillé — message REQ-6.2-06 affiché tel quel),
 *    GET /objectives/system-summary?site_id=.
 * Référence Vue : frontend1/src/modules/clienta/pages/planning/Objectives.vue.
 */

export const OBJECTIVES_KEY = ["planning-objectives"] as const;
export const PROCESS_OBJECTIVES_KEY = ["planning-process-objectives"] as const;
export const OBJECTIVES_SUMMARY_KEY = ["planning-objectives-summary"] as const;
export const POLICY_AXES_KEY = ["planning-policy-axes"] as const;
export const OBJECTIVE_USERS_KEY = ["planning-objective-users"] as const;

export type ObjectiveType = "strategic" | "operational" | "quality" | "safety" | "environmental";
export type ObjectiveAxis = "Q" | "HS" | "E";
export type ObjectiveFrequency = "mensuel" | "trimestriel" | "semestriel" | "annuel";
export type MonthlyValue = number | "N/A" | null;

export type ObjectiveRecord = Record<string, unknown> & {
  id: string | number;
};

export type PlannedActionInput = {
  title: string;
  description?: string | undefined;
  responsible_user_id?: number | undefined;
  start_date?: string | undefined;
  due_date?: string | undefined;
  status?: string | undefined;
  progress?: number | undefined;
};

export type CreateObjectiveInput = {
  site_id: number;
  process_id?: number | undefined;
  title: string;
  description?: string | undefined;
  type: ObjectiveType;
  target_value: number;
  unit?: string | undefined;
  deadline: string;
  responsible_id: number;
  indicateur_id?: number | undefined;
  axes?: ObjectiveAxis[] | undefined;
  frequency?: ObjectiveFrequency | undefined;
  indicator_name?: string | undefined;
  planned_actions?: PlannedActionInput[] | undefined;
};

export type UpdateObjectiveInput = Partial<Omit<CreateObjectiveInput, "site_id" | "process_id">> & {
  process_id?: number | undefined;
};

export type ProcessObjective = Record<string, unknown> & {
  id: string | number;
  process_id?: string | number | undefined;
  title: string;
};

export type ProcessObjectivesResponse = {
  items: ProcessObjective[];
  process_id: string | number | null;
  process_name: string | null;
};

export type SystemSummary = {
  system_average_rate: number | null;
  total_objectives: number;
  evaluated_objectives: number;
  achieved_count: number;
  warning_count: number;
  current_month: number | null;
  by_process: Array<Record<string, unknown>>;
  by_axis: Array<Record<string, unknown>>;
  by_norm: Array<Record<string, unknown>>;
};

export type Responsable = {
  id: string | number;
  name: string;
  email: string;
};

export type UpdateProcessObjectiveInput = {
  title?: string | undefined;
  period_realizations?: MonthlyValue[] | undefined;
  notes?: string | undefined;
};

const numberOf = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const textOf = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Le contrôleur central renvoie un array brut ; on tolère aussi {data:[...]}. */
export function toObjectiveArray(payload: unknown): ObjectiveRecord[] {
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(objectOf(payload)["data"])
      ? (objectOf(payload)["data"] as unknown[])
      : [];
  return raw
    .map((item) => flattenResource(item) as ObjectiveRecord)
    .filter((item) => item.id !== undefined && item.id !== null && item.id !== "");
}

function toProcessObjectiveArray(payload: unknown): ProcessObjectivesResponse {
  const root = objectOf(payload);
  const raw = Array.isArray(root["data"]) ? (root["data"] as unknown[]) : [];
  return {
    items: raw.map((item) => {
      const flat = flattenResource(item) as ProcessObjective;
      return { ...flat, title: textOf(flat["title"]) || "Objectif" };
    }),
    process_id: (root["process_id"] as string | number | null) ?? null,
    process_name: typeof root["process_name"] === "string" ? root["process_name"] : null,
  };
}

function emptySummary(): SystemSummary {
  return {
    system_average_rate: null,
    total_objectives: 0,
    evaluated_objectives: 0,
    achieved_count: 0,
    warning_count: 0,
    current_month: null,
    by_process: [],
    by_axis: [],
    by_norm: [],
  };
}

function toSystemSummary(payload: unknown): SystemSummary {
  const root = objectOf(payload);
  const summary = objectOf(root["summary"]);
  const rate = summary["system_average_rate"];
  return {
    system_average_rate:
      typeof rate === "number" && Number.isFinite(rate)
        ? rate
        : rate == null
          ? null
          : numberOf(rate),
    total_objectives: numberOf(summary["total_objectives"]),
    evaluated_objectives: numberOf(summary["evaluated_objectives"]),
    achieved_count: numberOf(summary["achieved_count"]),
    warning_count: numberOf(summary["warning_count"]),
    current_month: typeof summary["current_month"] === "number" ? summary["current_month"] : null,
    by_process: Array.isArray(summary["by_process"])
      ? (summary["by_process"] as Array<Record<string, unknown>>)
      : [],
    by_axis: Array.isArray(summary["by_axis"])
      ? (summary["by_axis"] as Array<Record<string, unknown>>)
      : [],
    by_norm: Array.isArray(summary["by_norm"])
      ? (summary["by_norm"] as Array<Record<string, unknown>>)
      : [],
  };
}

// ---------- Contrat A : objectifs centraux ----------

export async function fetchObjectives(siteId: string): Promise<ObjectiveRecord[]> {
  const payload = await backendApi.request<unknown>(
    `objectives?site_id=${encodeURIComponent(siteId)}`,
  );
  return toObjectiveArray(payload);
}

function buildCentralPayload(input: CreateObjectiveInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    site_id: input.site_id,
    title: input.title.trim(),
    type: input.type,
    target_value: input.target_value,
    deadline: input.deadline,
    responsible_id: input.responsible_id,
  };
  if (input.process_id != null) payload["process_id"] = input.process_id;
  if (input.description?.trim()) payload["description"] = input.description.trim();
  if (input.unit?.trim()) payload["unit"] = input.unit.trim();
  if (input.indicateur_id != null) payload["indicateur_id"] = input.indicateur_id;
  if (input.axes && input.axes.length > 0) payload["axes"] = input.axes;
  if (input.planned_actions && input.planned_actions.length > 0) {
    payload["planned_actions"] = input.planned_actions.map((action) => {
      const entry: Record<string, unknown> = { title: action.title.trim() };
      if (action.description?.trim()) entry["description"] = action.description.trim();
      if (action.responsible_user_id != null)
        entry["responsible_user_id"] = action.responsible_user_id;
      if (action.start_date) entry["start_date"] = action.start_date;
      if (action.due_date) entry["due_date"] = action.due_date;
      if (action.status) entry["status"] = action.status;
      if (action.progress != null) entry["progress"] = action.progress;
      return entry;
    });
  }
  return payload;
}

export async function createObjective(input: CreateObjectiveInput): Promise<ObjectiveRecord> {
  const payload = await backendApi.request<unknown>("objectives", {
    method: "POST",
    body: JSON.stringify(buildCentralPayload(input)),
  });
  const [first] = toObjectiveArray(payload);
  return first ?? (flattenResource(payload) as ObjectiveRecord);
}

export async function updateObjective(
  id: string | number,
  input: UpdateObjectiveInput,
): Promise<ObjectiveRecord> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body["title"] = input.title.trim();
  if (input.description !== undefined) body["description"] = input.description;
  if (input.type !== undefined) body["type"] = input.type;
  if (input.target_value !== undefined) body["target_value"] = input.target_value;
  if (input.unit !== undefined) body["unit"] = input.unit;
  if (input.deadline !== undefined) body["deadline"] = input.deadline;
  if (input.responsible_id !== undefined) body["responsible_id"] = input.responsible_id;
  if (input.indicateur_id !== undefined) body["indicateur_id"] = input.indicateur_id;
  if (input.axes !== undefined) body["axes"] = input.axes;
  if (input.process_id !== undefined) body["process_id"] = input.process_id;
  if (input.planned_actions !== undefined) {
    body["planned_actions"] = input.planned_actions.map((action) => ({
      title: action.title.trim(),
      description: action.description,
      responsible_user_id: action.responsible_user_id,
      start_date: action.start_date,
      due_date: action.due_date,
      status: action.status,
      progress: action.progress,
    }));
  }
  const payload = await backendApi.request<unknown>(
    `objectives/${encodeURIComponent(String(id))}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  const [first] = toObjectiveArray(payload);
  return first ?? (flattenResource(payload) as ObjectiveRecord);
}

export async function deleteObjective(id: string | number): Promise<void> {
  await backendApi.request(`objectives/${encodeURIComponent(String(id))}`, { method: "DELETE" });
}

export async function recordObjectiveProgress(
  id: string | number,
  input: { current_value: number; notes?: string | undefined },
): Promise<ObjectiveRecord> {
  const payload = await backendApi.request<unknown>(
    `objectives/${encodeURIComponent(String(id))}/progress`,
    {
      method: "POST",
      body: JSON.stringify({ current_value: input.current_value, notes: input.notes }),
    },
  );
  const [first] = toObjectiveArray(payload);
  return first ?? (flattenResource(payload) as ObjectiveRecord);
}

export async function addObjectiveMilestone(
  id: string | number,
  input: { title: string; target_date: string; target_value?: number | undefined },
): Promise<ObjectiveRecord> {
  const payload = await backendApi.request<unknown>(
    `objectives/${encodeURIComponent(String(id))}/milestone`,
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title.trim(),
        target_date: input.target_date,
        ...(input.target_value !== undefined ? { target_value: input.target_value } : {}),
      }),
    },
  );
  const [first] = toObjectiveArray(payload);
  return first ?? (flattenResource(payload) as ObjectiveRecord);
}

export async function exportObjectivesXlsx(siteId: string): Promise<Blob> {
  return backendApi.blob(`objectives/export-xlsx?site_id=${encodeURIComponent(siteId)}`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  window.document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useObjectives(siteId: string) {
  return useQuery({
    queryKey: [...OBJECTIVES_KEY, siteId],
    queryFn: () => fetchObjectives(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}

export function useObjectiveMutations(siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...OBJECTIVES_KEY, siteId] });
    queryClient.invalidateQueries({ queryKey: OBJECTIVES_SUMMARY_KEY });
  };
  return {
    create: useMutation({
      mutationFn: (input: CreateObjectiveInput) => createObjective(input),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: { id: string | number; patch: UpdateObjectiveInput }) =>
        updateObjective(input.id, input.patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) => deleteObjective(id),
      onSuccess: invalidate,
    }),
    progress: useMutation({
      mutationFn: (input: {
        id: string | number;
        current_value: number;
        notes?: string | undefined;
      }) => recordObjectiveProgress(input.id, input),
      onSuccess: invalidate,
    }),
    milestone: useMutation({
      mutationFn: (input: {
        id: string | number;
        title: string;
        target_date: string;
        target_value?: number | undefined;
      }) => addObjectiveMilestone(input.id, input),
      onSuccess: invalidate,
    }),
  };
}

// ---------- Contrat B : suivi mensuel par processus ----------

export function normalizeMonthly(values: unknown, length = 12): MonthlyValue[] {
  const raw: unknown[] = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => {
    const value: unknown = raw[index];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && ["na", "n/a"].includes(value.trim().toLowerCase()))
      return "N/A";
    if (typeof value === "object" && value !== null) {
      const entry = value as Record<string, unknown>;
      if (entry["is_na"]) return "N/A";
      const inner: unknown = entry["value"];
      if (typeof inner === "string" && ["na", "n/a"].includes(inner.trim().toLowerCase()))
        return "N/A";
      const n = Number(inner);
      if (!Number.isFinite(n)) return null;
      return Math.min(100, Math.max(0, n));
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  });
}

export function isMonthNA(value: MonthlyValue): boolean {
  return value === "N/A";
}

export async function fetchProcessObjectives(
  processId: string | number,
): Promise<ProcessObjectivesResponse> {
  const payload = await backendApi.request<unknown>(
    `processes/${encodeURIComponent(String(processId))}/objectives`,
  );
  return toProcessObjectiveArray(payload);
}

export async function updateProcessObjective(
  processId: string | number,
  objectiveId: string | number,
  input: UpdateProcessObjectiveInput,
): Promise<ProcessObjective> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body["title"] = input.title;
  if (input.period_realizations !== undefined)
    body["period_realizations"] = input.period_realizations;
  if (input.notes !== undefined) body["notes"] = input.notes;
  const payload = await backendApi.request<unknown>(
    `processes/${encodeURIComponent(String(processId))}/objectives/${encodeURIComponent(String(objectiveId))}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  const data = objectOf(payload)["data"];
  const flat = flattenResource(data ?? payload) as ProcessObjective;
  return { ...flat, title: textOf(flat["title"]) || "Objectif" };
}

export function useProcessObjectives(processId: string | number | null) {
  return useQuery({
    queryKey: [...PROCESS_OBJECTIVES_KEY, String(processId ?? "")],
    queryFn: () => fetchProcessObjectives(processId as string | number),
    enabled: processId !== null && processId !== "",
    staleTime: 60_000,
  });
}

export function useProcessObjectiveMutations(processId: string | number | null, siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [...PROCESS_OBJECTIVES_KEY, String(processId ?? "")],
    });
    queryClient.invalidateQueries({ queryKey: [...OBJECTIVES_SUMMARY_KEY, siteId] });
    queryClient.invalidateQueries({ queryKey: OBJECTIVES_SUMMARY_KEY });
  };
  return {
    update: useMutation({
      mutationFn: (input: { objectiveId: string | number; patch: UpdateProcessObjectiveInput }) =>
        updateProcessObjective(processId as string | number, input.objectiveId, input.patch),
      onSuccess: invalidate,
    }),
  };
}

export async function fetchSystemSummary(siteId: string): Promise<SystemSummary> {
  if (!siteId) return emptySummary();
  const payload = await backendApi.request<unknown>(
    `objectives/system-summary?site_id=${encodeURIComponent(siteId)}`,
  );
  return toSystemSummary(payload);
}

export function useSystemSummary(siteId: string) {
  return useQuery({
    queryKey: [...OBJECTIVES_SUMMARY_KEY, siteId],
    queryFn: () => fetchSystemSummary(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}

// ---------- Dépendances : politique (axes), responsables ----------

export async function fetchPolicyAxes(siteId: string): Promise<string[]> {
  if (!siteId) return [];
  const payload = await backendApi.request<unknown>(
    `qhse-policies/current?site_id=${encodeURIComponent(siteId)}`,
  );
  const root = objectOf(payload);
  const source = Array.isArray(root["axes"])
    ? root["axes"]
    : Array.isArray(objectOf(root["data"])["axes"])
      ? (objectOf(root["data"])["axes"] as unknown[])
      : [];
  return (source as unknown[]).map((axis) => textOf(axis).trim()).filter((axis) => axis.length > 0);
}

export function usePolicyAxes(siteId: string) {
  return useQuery({
    queryKey: [...POLICY_AXES_KEY, siteId],
    queryFn: () => fetchPolicyAxes(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}

export async function fetchResponsables(siteId: string): Promise<Responsable[]> {
  if (!siteId) return [];
  const payload = await backendApi.request<unknown>(
    `users?site_id=${encodeURIComponent(siteId)}&per_page=100`,
  );
  const root = objectOf(payload);
  const raw: unknown[] = Array.isArray(payload)
    ? (payload as unknown[])
    : Array.isArray(root["data"])
      ? (root["data"] as unknown[])
      : [];
  return raw.map((item) => {
    const flat = flattenResource(item);
    const name =
      textOf(flat["name"]).trim() ||
      [textOf(flat["first_name"]), textOf(flat["last_name"])].join(" ").trim() ||
      textOf(flat["email"]).trim() ||
      `Utilisateur #${textOf(flat["id"])}`;
    return {
      id: (flat["id"] as string | number) ?? "",
      name,
      email: textOf(flat["email"]),
    };
  });
}

export function useResponsables(siteId: string) {
  return useQuery({
    queryKey: [...OBJECTIVE_USERS_KEY, siteId],
    queryFn: () => fetchResponsables(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}
