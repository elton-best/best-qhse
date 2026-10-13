import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";
import { MY_ACTIONS_KEY } from "@/integrations/backend/planning";

/**
 * Plans d'actions (GET /actions + workflow) — page isolée « Plans d'actions ».
 *
 * Contrat backend constaté (ActionController + StoreActionRequest) :
 * - index/show : `presentAction` brut (PAS de JSON:API) avec alias `reference`
 *   (= ref) et `due_date` (= deadline). L'index est un paginateur Laravel brut
 *   `{ data: [...] }`. La colonne `status` ne stocke que
 *   planned/in_progress/completed/verified/cancelled : `draft`/`assigned` sont
 *   ramenés vers `planned`, `closed` vers `verified`.
 * - store (POST /actions) : title*, site_id*, process_id*, type*, description*
 *   (min 10), responsible_id*, deadline* (after:today). Priorité acceptée :
 *   low|medium|high|critical (`urgent` accepté en lecture, ramené par le
 *   contrôleur). Types acceptés : corrective|preventive|improvement|
 *   emergency|curative.
 * - POST /actions/:id/progress { progress 0-100*, notes? } (100 => complétée).
 * - POST /actions/:id/status { status*, comments? } avec status dans
 *   draft|assigned|in_progress|completed|verified|closed|cancelled|planned.
 * - POST /actions/:id/verify { is_effective: boolean*, verification_notes? }.
 * - GET /actions/templates/plan : binaire XLSX. POST /actions/import-plan
 *   (FormData file + site_id?) : { success, errors, error_details }.
 * - Registres annexes : users (JSON:API), processes (brut), sites (JSON:API),
 *   non-conformities / audits / risks (200, listes vides sur ce compte).
 */

export const PLAN_ACTIONS_KEY = ["planning-actions"] as const;

export const PLAN_ACTION_STATUSES = [
  "draft",
  "assigned",
  "in_progress",
  "completed",
  "verified",
  "closed",
  "cancelled",
] as const;
export type PlanActionStatus = (typeof PLAN_ACTION_STATUSES)[number];

export const PLAN_ACTION_TYPES = ["corrective", "preventive", "improvement"] as const;
export type PlanActionType = (typeof PLAN_ACTION_TYPES)[number];

export const PLAN_ACTION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type PlanActionPriority = (typeof PLAN_ACTION_PRIORITIES)[number];

export const PLAN_ACTION_SOURCES = ["nc", "audit", "risk"] as const;
export type PlanActionSource = (typeof PLAN_ACTION_SOURCES)[number];

/** Statuts considérés comme clôturés (ni retard, ni suivi). */
export const PLAN_ACTION_CLOSED: readonly string[] = [
  "completed",
  "verified",
  "closed",
  "cancelled",
];

export type PlanActionProgressNote = {
  date: string;
  note: string;
  user_id?: number | undefined;
  user_name?: string | undefined;
};

export type EmbeddedRef = {
  id?: string | number | undefined;
  title?: string | undefined;
  code?: string | undefined;
  name?: string | undefined;
  email?: string | undefined;
};

export type WorkflowStateRef = {
  id?: string | number | undefined;
  code?: string | undefined;
  label?: string | undefined;
  color?: string | undefined;
};

export type PlanActionItem = {
  id: number;
  reference: string;
  title: string;
  description: string;
  /** Statut d'affichage parmi les 7 statuts Vue (planned backend => assigned). */
  status: PlanActionStatus;
  /** Valeur brute de la colonne `status` (planned/in_progress/...). */
  rawStatus: string;
  type: string;
  priority: string;
  progress: number;
  due_date: string | null;
  site_id: number | null;
  site_name: string | null;
  process_id: number | null;
  process_title: string | null;
  process_code: string | null;
  responsible_id: number | null;
  responsible_name: string | null;
  responsible_email: string | null;
  source_type: string | null;
  source_id: number | null;
  source_ref: string | null;
  source_label: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  required_resources: string | null;
  effectiveness_criteria: string | null;
  effectiveness_verified: boolean;
  completion_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  progress_notes: PlanActionProgressNote[];
  workflow_label: string | null;
};

export type ActionUser = { id: number; name: string; email: string };
export type ActionSite = { id: number; name: string };
export type ActionSourceItem = { id: number; reference: string; title: string };

export type PlanActionStats = {
  total: number;
  draft: number;
  inProgress: number;
  completed: number;
  overdue: number;
};

export type PlanActionsParams = {
  site_id?: string | number | undefined;
  per_page?: number | undefined;
};

export type PlanActionForm = {
  title: string;
  description: string;
  type: string;
  priority: string;
  site_id: number;
  process_id: number;
  responsible_id: number;
  /** Échéance au format YYYY-MM-DD (envoyée comme `deadline`). */
  due_date: string;
  source_type?: PlanActionSource | undefined;
  source_id?: number | undefined;
  source_ref?: string | undefined;
  estimated_cost?: number | undefined;
  actual_cost?: number | undefined;
  required_resources?: string | undefined;
  effectiveness_criteria?: string | undefined;
};

export type ImportPlanResult = {
  success: number;
  errors: number;
  error_details: Array<{ row: number; errors: string[] }>;
};

// ---------- Petits parseurs tolérants (brut ou JSON:API aplati) ----------

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numOrUndefined(value: unknown): number | undefined {
  const parsed = numOrNull(value);
  return parsed === null ? undefined : parsed;
}

function embedded(value: unknown): EmbeddedRef | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as EmbeddedRef;
}

function collectionOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = asRecord(payload);
  if (Array.isArray(root["data"])) return root["data"] as unknown[];
  const nested = asRecord(root["data"]);
  if (Array.isArray(nested["data"])) return nested["data"] as unknown[];
  return [];
}

function isPlanActionStatus(value: string): value is PlanActionStatus {
  return (PLAN_ACTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Statut d'affichage : privilégie le code du workflow quand il fait partie
 * des 7 statuts Vue, sinon ramène la colonne stockée (`planned` => assigned).
 */
export function displayStatusOf(input: {
  status?: string | null | undefined;
  workflow_state?: WorkflowStateRef | null | undefined;
}): PlanActionStatus {
  const code = (input.workflow_state?.code ?? "").toLowerCase().trim();
  if (code !== "" && isPlanActionStatus(code)) return code;
  const raw = (input.status ?? "").toLowerCase().trim();
  if (raw === "planned" || raw === "assigned") return "assigned";
  if (isPlanActionStatus(raw)) return raw;
  return "draft";
}

function normalizeNotes(value: unknown): PlanActionProgressNote[] {
  if (!Array.isArray(value)) return [];
  const out: PlanActionProgressNote[] = [];
  for (const entry of value) {
    const raw = asRecord(entry);
    const note = strOrNull(raw["note"]);
    if (!note) continue;
    out.push({
      date: strOrNull(raw["date"]) ?? "",
      note,
      user_id: numOrUndefined(raw["user_id"]),
      user_name: strOrNull(raw["user_name"]) ?? undefined,
    });
  }
  return out;
}

const SOURCE_BACKEND: Record<PlanActionSource, string> = {
  nc: "non_conformity",
  audit: "audit",
  risk: "risk",
};

function sourceLabelOf(sourceType: string | null, sourceId: number | null): string | null {
  if (!sourceType && sourceId === null) return null;
  const kind =
    sourceType === "non_conformity" || sourceType === "nc"
      ? "NC"
      : sourceType === "audit"
        ? "Audit"
        : sourceType === "risk"
          ? "Risque"
          : sourceType;
  return `${kind ?? "Source"}${sourceId !== null ? ` #${sourceId}` : ""}`;
}

export function normalizePlanActionItem(input: unknown): PlanActionItem | null {
  const raw = asRecord(input);
  const id = numOrNull(raw["id"]);
  if (id === null) return null;
  const reference = strOrNull(raw["reference"]) ?? strOrNull(raw["ref"]) ?? `ACT-${String(id)}`;
  const process = embedded(raw["process"]);
  const site = embedded(raw["site"]);
  const responsible = embedded(raw["responsible"]);
  const workflow = embedded(raw["workflow_state"]) as WorkflowStateRef | null;
  const priorityRaw = (strOrNull(raw["priority"]) ?? "medium").toLowerCase();
  return {
    id,
    reference,
    title: strOrNull(raw["title"]) ?? "",
    description: strOrNull(raw["description"]) ?? "",
    status: displayStatusOf({
      status: strOrNull(raw["status"]),
      workflow_state: workflow,
    }),
    rawStatus: (strOrNull(raw["status"]) ?? "planned").toLowerCase(),
    type: (strOrNull(raw["type"]) ?? "corrective").toLowerCase(),
    priority: priorityRaw === "critical" ? "urgent" : priorityRaw,
    progress: numOrNull(raw["progress"]) ?? numOrNull(raw["progress_rate"]) ?? 0,
    due_date: strOrNull(raw["due_date"]) ?? strOrNull(raw["deadline"]),
    site_id: numOrNull(raw["site_id"]) ?? numOrNull(site?.id),
    site_name: strOrNull(site?.name),
    process_id: numOrNull(raw["process_id"]) ?? numOrNull(process?.id),
    process_title: strOrNull(process?.title),
    process_code: strOrNull(process?.code),
    responsible_id: numOrNull(raw["responsible_id"]) ?? numOrNull(responsible?.id),
    responsible_name: strOrNull(responsible?.name),
    responsible_email: strOrNull(responsible?.email),
    source_type: strOrNull(raw["source_type"]) ?? strOrNull(raw["source"]),
    source_id: numOrNull(raw["source_id"]),
    source_ref: strOrNull(raw["source_ref"]),
    source_label: sourceLabelOf(
      strOrNull(raw["source_type"]) ?? strOrNull(raw["source"]),
      numOrNull(raw["source_id"]),
    ),
    estimated_cost: numOrNull(raw["estimated_cost"]),
    actual_cost: numOrNull(raw["actual_cost"]),
    required_resources: strOrNull(raw["required_resources"]),
    effectiveness_criteria:
      strOrNull(raw["effectiveness_comments"]) ?? strOrNull(raw["effectiveness_criteria"]),
    effectiveness_verified: raw["effectiveness_verified"] === true,
    completion_date: strOrNull(raw["completion_date"]),
    created_at: strOrNull(raw["created_at"]),
    updated_at: strOrNull(raw["updated_at"]),
    progress_notes: normalizeNotes(raw["progress_notes"]),
    workflow_label: strOrNull(workflow?.label),
  };
}

// ---------- Libellés / stats ----------

export function planActionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Brouillon",
    assigned: "Assignée",
    in_progress: "En cours",
    completed: "Terminée",
    verified: "Vérifiée",
    closed: "Fermée",
    cancelled: "Annulée",
    planned: "Assignée",
  };
  return labels[status] ?? status;
}

export function planActionTypeLabel(type: string): string {
  if (type === "preventive") return "Préventive";
  if (type === "corrective") return "Corrective";
  if (type === "improvement") return "Amélioration";
  if (type === "emergency") return "Urgence";
  if (type === "curative") return "Curative";
  return type;
}

export function planActionPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: "Basse",
    medium: "Moyenne",
    high: "Haute",
    urgent: "Urgente",
    critical: "Urgente",
  };
  return labels[priority] ?? priority;
}

export function planActionSourceLabel(source: string): string {
  if (source === "nc" || source === "non_conformity") return "Non-conformité";
  if (source === "audit") return "Audit";
  if (source === "risk") return "Risque";
  if (source === "complaint") return "Plainte";
  if (source === "suggestion") return "Suggestion";
  if (source === "management_review") return "Revue de direction";
  return source;
}

export function isPlanActionOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || PLAN_ACTION_CLOSED.includes(status)) return false;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return false;
  return date < new Date(new Date().toDateString());
}

export function computePlanActionStats(items: PlanActionItem[]): PlanActionStats {
  return {
    total: items.length,
    draft: items.filter((item) => item.status === "draft").length,
    inProgress: items.filter((item) => item.status === "in_progress").length,
    completed: items.filter(
      (item) =>
        item.status === "completed" || item.status === "verified" || item.status === "closed",
    ).length,
    overdue: items.filter((item) => isPlanActionOverdue(item.due_date, item.status)).length,
  };
}

/** Colonne kanban Vue (draft|assigned|in_progress|completed+verified+closed). `null` = hors kanban (annulée). */
export function kanbanOf(
  status: string,
): "draft" | "assigned" | "in_progress" | "completed" | null {
  if (status === "draft") return "draft";
  if (status === "assigned") return "assigned";
  if (status === "in_progress") return "in_progress";
  if (status === "completed" || status === "verified" || status === "closed") return "completed";
  return null;
}

/** Dernière note de suivi (parité Vue `latestProgressNote`). */
export function lastProgressNote(item: PlanActionItem): string | null {
  if (item.progress_notes.length === 0) return null;
  const latest = item.progress_notes[item.progress_notes.length - 1];
  if (!latest) return null;
  const author = latest.user_name ? `${latest.user_name} · ` : "";
  return `${author}${latest.note}`;
}

// ---------- Requêtes ----------

export async function fetchPlanActions(params: PlanActionsParams = {}): Promise<PlanActionItem[]> {
  const query = new URLSearchParams();
  if (params.site_id !== undefined && params.site_id !== "") {
    query.set("site_id", String(params.site_id));
  }
  query.set("per_page", String(params.per_page ?? 100));
  const payload = await backendApi.request<unknown>(`actions?${query.toString()}`);
  return collectionOf(payload)
    .map((item) => normalizePlanActionItem(flattenResource(item)))
    .filter((item): item is PlanActionItem => item !== null);
}

export function usePlanActions(params: PlanActionsParams = {}) {
  return useQuery({
    queryKey: [...PLAN_ACTIONS_KEY, "list", params.site_id ?? "all", params.per_page ?? 100],
    queryFn: () => fetchPlanActions(params),
    staleTime: 60_000,
  });
}

export async function fetchPlanAction(id: string | number): Promise<PlanActionItem | null> {
  const payload = await backendApi.request<unknown>(`actions/${String(id)}`);
  return normalizePlanActionItem(flattenResource(payload));
}

export function usePlanAction(id: string | number | null | undefined) {
  return useQuery({
    queryKey: [...PLAN_ACTIONS_KEY, "detail", id ?? "none"],
    queryFn: () => fetchPlanAction(id as string | number),
    enabled: id !== null && id !== undefined && id !== "",
    staleTime: 60_000,
  });
}

function useInvalidatePlanActions() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: PLAN_ACTIONS_KEY });
    client.invalidateQueries({ queryKey: MY_ACTIONS_KEY });
  };
}

/** Construit le payload de création (due_date -> deadline, urgent -> critical, nc -> non_conformity). */
export function buildPlanActionPayload(form: PlanActionForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    description: form.description.trim(),
    type: form.type,
    priority: form.priority === "urgent" ? "critical" : form.priority,
    site_id: form.site_id,
    process_id: form.process_id,
    responsible_id: form.responsible_id,
    deadline: form.due_date,
  };
  if (form.source_type) {
    const mapped = SOURCE_BACKEND[form.source_type];
    payload["source_type"] = mapped;
    payload["source"] = mapped;
  }
  if (form.source_id !== undefined) payload["source_id"] = form.source_id;
  if (form.source_ref !== undefined) payload["source_ref"] = form.source_ref;
  if (form.estimated_cost !== undefined) payload["estimated_cost"] = form.estimated_cost;
  if (form.actual_cost !== undefined) payload["actual_cost"] = form.actual_cost;
  if (form.required_resources) payload["required_resources"] = form.required_resources;
  // NB backend : `effectiveness_comments` est fillable mais absent des règles
  // Store/Update, donc ignoré côté serveur (écart signalé). Envoyé pour traçabilité.
  if (form.effectiveness_criteria) payload["effectiveness_comments"] = form.effectiveness_criteria;
  return payload;
}

export function buildPlanActionUpdatePayload(
  form: Partial<PlanActionForm>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.title !== undefined) payload["title"] = form.title.trim();
  if (form.description !== undefined) payload["description"] = form.description.trim();
  if (form.type !== undefined) payload["type"] = form.type;
  if (form.priority !== undefined) {
    payload["priority"] = form.priority === "urgent" ? "critical" : form.priority;
  }
  if (form.site_id !== undefined) payload["site_id"] = form.site_id;
  if (form.process_id !== undefined) payload["process_id"] = form.process_id;
  if (form.responsible_id !== undefined) payload["responsible_id"] = form.responsible_id;
  if (form.due_date !== undefined) payload["deadline"] = form.due_date;
  if (form.source_type !== undefined) {
    payload["source_type"] = form.source_type ? SOURCE_BACKEND[form.source_type] : null;
    payload["source"] = form.source_type ? SOURCE_BACKEND[form.source_type] : null;
  }
  if (form.source_id !== undefined) payload["source_id"] = form.source_id;
  if (form.source_ref !== undefined) payload["source_ref"] = form.source_ref;
  if (form.estimated_cost !== undefined) payload["estimated_cost"] = form.estimated_cost;
  if (form.actual_cost !== undefined) payload["actual_cost"] = form.actual_cost;
  if (form.required_resources !== undefined)
    payload["required_resources"] = form.required_resources || null;
  if (form.effectiveness_criteria !== undefined)
    payload["effectiveness_comments"] = form.effectiveness_criteria || null;
  return payload;
}

export function useCreatePlanAction() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (form: PlanActionForm) =>
      backendApi.request(`actions`, {
        method: "POST",
        body: JSON.stringify(buildPlanActionPayload(form)),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlanAction() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (input: { id: string | number; payload: Record<string, unknown> }) =>
      backendApi.request(`actions/${String(input.id)}`, {
        method: "PUT",
        body: JSON.stringify(input.payload),
      }),
    onSuccess: invalidate,
  });
}

export function useDeletePlanAction() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (id: string | number) =>
      backendApi.request(`actions/${String(id)}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function usePlanActionProgress() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (input: {
      id: string | number;
      progress: number;
      notes?: string | undefined;
    }) =>
      backendApi.request(`actions/${String(input.id)}/progress`, {
        method: "POST",
        body: JSON.stringify({ progress: input.progress, notes: input.notes }),
      }),
    onSuccess: invalidate,
  });
}

export function usePlanActionStatus() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (input: {
      id: string | number;
      status: string;
      comments?: string | undefined;
    }) =>
      backendApi.request(`actions/${String(input.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status: input.status, comments: input.comments }),
      }),
    onSuccess: invalidate,
  });
}

/**
 * Vérification d'efficacité (parité Vue : note 1-5, efficace si >= 3).
 * Le backend exige { is_effective: boolean*, verification_notes? }.
 */
export function useVerifyPlanAction() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: async (input: {
      id: string | number;
      rating: number;
      comments?: string | undefined;
    }) =>
      backendApi.request(`actions/${String(input.id)}/verify`, {
        method: "POST",
        body: JSON.stringify({
          is_effective: input.rating >= 3,
          verification_notes: input.comments,
        }),
      }),
    onSuccess: invalidate,
  });
}

// ---------- Modèle Excel + import ----------

export async function downloadPlanActionTemplate(): Promise<void> {
  const blob = await backendApi.blob("actions/templates/plan");
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.setAttribute("download", "Template_Plan_Actions.xlsx");
  window.document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function normalizeImportResult(payload: unknown): ImportPlanResult {
  const root = asRecord(payload);
  const details = Array.isArray(root["error_details"]) ? root["error_details"] : [];
  return {
    success: Number(root["success"] ?? 0),
    errors: Number(root["errors"] ?? details.length),
    error_details: details.map((entry) => {
      const raw = asRecord(entry);
      const messages = Array.isArray(raw["errors"]) ? raw["errors"].map(String) : [];
      return { row: Number(raw["row"] ?? 0), errors: messages };
    }),
  };
}

export async function importActionPlan(
  file: File,
  siteId?: string | number | undefined,
): Promise<ImportPlanResult> {
  const form = new FormData();
  form.append("file", file);
  if (siteId !== undefined && siteId !== "") form.append("site_id", String(siteId));
  const payload = await backendApi.request<unknown>("actions/import-plan", {
    method: "POST",
    body: form,
  });
  return normalizeImportResult(payload);
}

export function useImportActionPlan() {
  const invalidate = useInvalidatePlanActions();
  return useMutation({
    mutationFn: (input: { file: File; siteId?: string | number | undefined }) =>
      importActionPlan(input.file, input.siteId),
    onSuccess: invalidate,
  });
}

// ---------- Registres annexes : utilisateurs, sites, sources ----------

export async function fetchActionUsers(
  siteId?: string | number | undefined,
): Promise<ActionUser[]> {
  const suffix =
    siteId !== undefined && siteId !== ""
      ? `?site_id=${encodeURIComponent(String(siteId))}&per_page=100`
      : "?per_page=100";
  const payload = await backendApi.request<unknown>(`users${suffix}`);
  const out: ActionUser[] = [];
  for (const item of collectionOf(payload)) {
    const raw = asRecord(flattenResource(item));
    const id = numOrNull(raw["id"]);
    if (id === null) continue;
    const direct = strOrNull(raw["name"]);
    const composed =
      `${strOrNull(raw["first_name"]) ?? ""} ${strOrNull(raw["last_name"]) ?? ""}`.trim();
    out.push({
      id,
      name: direct ?? (composed === "" ? `Utilisateur #${String(id)}` : composed),
      email: strOrNull(raw["email"]) ?? "",
    });
  }
  return out;
}

export function useActionUsers(siteId?: string | number | undefined) {
  return useQuery({
    queryKey: [...PLAN_ACTIONS_KEY, "users", siteId ?? "all"],
    queryFn: () => fetchActionUsers(siteId),
    staleTime: 60_000,
  });
}

export async function fetchActionSites(): Promise<ActionSite[]> {
  const payload = await backendApi.request<unknown>("sites?per_page=100");
  const out: ActionSite[] = [];
  for (const item of collectionOf(payload)) {
    const raw = asRecord(flattenResource(item));
    const id = numOrNull(raw["id"]);
    if (id === null) continue;
    out.push({ id, name: strOrNull(raw["name"]) ?? `Site #${String(id)}` });
  }
  return out;
}

export function useActionSites() {
  return useQuery({
    queryKey: [...PLAN_ACTIONS_KEY, "sites"],
    queryFn: fetchActionSites,
    staleTime: 60_000,
  });
}

const SOURCE_ENDPOINTS: Record<PlanActionSource, string> = {
  nc: "non-conformities",
  audit: "audits",
  risk: "risks",
};

/** Éléments sources rattachables (listes vides sur ce compte => champ libre côté page). */
export async function fetchActionSources(kind: PlanActionSource): Promise<ActionSourceItem[]> {
  const payload = await backendApi.request<unknown>(`${SOURCE_ENDPOINTS[kind]}?per_page=100`);
  const out: ActionSourceItem[] = [];
  for (const item of collectionOf(payload)) {
    const raw = asRecord(flattenResource(item));
    const id = numOrNull(raw["id"]);
    if (id === null) continue;
    out.push({
      id,
      reference: strOrNull(raw["reference"]) ?? strOrNull(raw["ref"]) ?? `#${String(id)}`,
      title: strOrNull(raw["title"]) ?? strOrNull(raw["name"]) ?? "",
    });
  }
  return out;
}

export function useActionSources(kind: PlanActionSource | "") {
  return useQuery({
    queryKey: [...PLAN_ACTIONS_KEY, "sources", kind === "" ? "none" : kind],
    queryFn: () => fetchActionSources(kind as PlanActionSource),
    enabled: kind === "nc" || kind === "audit" || kind === "risk",
    staleTime: 60_000,
    retry: 1,
  });
}
