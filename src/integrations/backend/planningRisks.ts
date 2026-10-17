import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Risques & opportunités (§6.1 Planification).
 * Contrat Laravel (ProcessController, brut `{data}`, NON paginé, échelle 1-4,
 * criticité auto P×G, niveaux faible<4 / moyen<8 / eleve<12 / critique>=12).
 */

export const RISKS_KEY = ["planning-risks-opportunities"] as const;
export const RISK_USERS_KEY = ["planning-risks-users"] as const;

export type RiskType = "risque" | "opportunite";
export type RiskStatus = "identifie" | "en_cours" | "traite" | "surveille" | "cloture";
export type RiskLevel = "faible" | "moyen" | "eleve" | "critique";
export type RiskStrategy = "accepter" | "reduire" | "transferer" | "eviter" | "exploiter";
export type PlannedActionType = "preventive" | "corrective" | "control";

export type PlannedAction = {
  id?: string | number | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  action_type?: string | null | undefined;
  responsible_user_id?: string | number | null | undefined;
  implicated_user_ids?: Array<string | number> | string | null | undefined;
  deadline?: string | null | undefined;
  implementation_status?: "planned" | "in_progress" | "completed" | null | undefined;
  effectiveness_result?: "efficace" | "partiellement_efficace" | "non_efficace" | null | undefined;
  effectiveness_review?: string | null | undefined;
  effectiveness_review_date?: string | null | undefined;
  effectiveness_reviewed_by?: string | number | null | undefined;
  [key: string]: unknown;
};

export type RiskOpportunity = {
  id: string | number;
  code?: string | null | undefined;
  type?: string | null | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  source_category?: string | null | undefined;
  source_detail?: string | null | undefined;
  assessment_method?: string | null | undefined;
  proportionality_rationale?: string | null | undefined;
  decision_rationale?: string | null | undefined;
  desired_effect?: string | null | undefined;
  opportunity_decision?: string | null | undefined;
  continuity_plan?: string | null | undefined;
  continuity_indicator?: string | null | undefined;
  effectiveness_result?: "efficace" | "partiellement_efficace" | "non_efficace" | null | undefined;
  effectiveness_review?: string | null | undefined;
  effectiveness_review_date?: string | null | undefined;
  effectiveness_reviewed_by?: string | number | null | undefined;
  cause?: string | null | undefined;
  consequence?: string | null | undefined;
  probabilite?: number | null | undefined;
  gravite?: number | null | undefined;
  criticite?: number | null | undefined;
  niveau?: string | null | undefined;
  strategie?: string | null | undefined;
  actions_prevues?: string | null | undefined;
  planned_actions?: PlannedAction[] | null | undefined;
  responsible_user_id?: string | number | null | undefined;
  target_date?: string | null | undefined;
  status?: string | null | undefined;
  probabilite_residuelle?: number | null | undefined;
  gravite_residuelle?: number | null | undefined;
  criticite_residuelle?: number | null | undefined;
  process_id?: string | number | null | undefined;
  process?: Record<string, unknown> | null | undefined;
  responsibleUser?: Record<string, unknown> | null | undefined;
  [key: string]: unknown;
};

export type RiskFilters = {
  site_id?: string | undefined;
  process_id?: string | undefined;
  type?: RiskType | undefined;
  status?: string | undefined;
  search?: string | undefined;
};

export type RiskSavePayload = Record<string, unknown>;

export type RiskEvaluationPayload = {
  probabilite: number;
  gravite: number;
  probabilite_residuelle?: number | undefined;
  gravite_residuelle?: number | null | undefined;
  criticite_residuelle?: number | null | undefined;
};

export type RiskUser = {
  id: string | number;
  name: string;
  email?: string | undefined;
  [key: string]: unknown;
};

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function listOf(payload: unknown, type: RiskType = "risque"): RiskOpportunity[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = root["data"] ?? payload;
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const flat = flattenResource(item) as RiskOpportunity;
    const raw = (item ?? {}) as Record<string, unknown>;
    const result: RiskOpportunity = {
      ...flat,
      id: (flat["id"] ?? "") as string | number,
      type,
    };
    // Conserve les relations imbriquées brutes (process, responsibleUser, planned_actions).
    for (const key of ["process", "responsibleUser", "planned_actions", "process_id"]) {
      const direct = raw[key];
      if (direct !== undefined) result[key] = direct as RiskOpportunity[typeof key];
      else if (flat[key] !== undefined) result[key] = flat[key] as RiskOpportunity[typeof key];
    }
    return result;
  });
}

function oneOf(payload: unknown, type: RiskType = "risque"): RiskOpportunity | null {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = root["data"] ?? payload;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const flat = flattenResource(data) as RiskOpportunity;
  const raw = data as Record<string, unknown>;
  const result: RiskOpportunity = {
    ...flat,
    id: (flat["id"] ?? "") as string | number,
    type,
  };
  for (const key of ["process", "responsibleUser", "planned_actions", "process_id"]) {
    const direct = raw[key];
    if (direct !== undefined) result[key] = direct as RiskOpportunity[typeof key];
  }
  return result;
}

export function riskCriticite(probabilite: unknown, gravite: unknown): number | null {
  const p = numberOrNull(probabilite);
  const g = numberOrNull(gravite);
  if (p == null || g == null) return null;
  return p * g;
}

/** Niveaux Laravel : faible<4 / moyen<8 / eleve<12 / critique>=12. */
export function riskNiveau(criticite: unknown): RiskLevel {
  const c = numberOrNull(criticite);
  if (c == null) return "faible";
  if (c < 4) return "faible";
  if (c < 8) return "moyen";
  if (c < 12) return "eleve";
  return "critique";
}

export function riskNiveauOf(item: RiskOpportunity): RiskLevel {
  if (typeof item["niveau"] === "string") {
    const n = item["niveau"].toLowerCase().trim();
    if (n === "faible" || n === "moyen" || n === "eleve" || n === "élevé" || n === "critique") {
      return (n === "élevé" ? "eleve" : n) as RiskLevel;
    }
  }
  const criticite = item["criticite"] ?? riskCriticite(item["probabilite"], item["gravite"]);
  return riskNiveau(criticite);
}

export function riskCriticiteOf(item: RiskOpportunity): number | null {
  const direct = numberOrNull(item["criticite"]);
  if (direct != null) return direct;
  return riskCriticite(item["probabilite"], item["gravite"]);
}

export async function fetchRisks(filters: RiskFilters = {}): Promise<RiskOpportunity[]> {
  if (filters.type === "opportunite") {
    return fetchOpportunities(filters);
  }

  const query = new URLSearchParams();
  if (filters.site_id) query.set("site_id", filters.site_id);
  if (filters.process_id) query.set("process_id", filters.process_id);
  query.set("type", "risque");
  if (filters.status) query.set("status", filters.status);
  if (filters.search) query.set("search", filters.search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`risks-opportunities${suffix}`);
  const risks = listOf(payload, "risque");
  if (filters.type === "risque") return risks;

  const opportunities = await fetchOpportunities(filters);
  return [...risks, ...opportunities];
}

async function fetchOpportunities(filters: RiskFilters): Promise<RiskOpportunity[]> {
  const query = new URLSearchParams({ per_page: "100" });
  if (filters.site_id) query.set("site_id", filters.site_id);
  if (filters.process_id) query.set("process_id", filters.process_id);
  if (filters.status) query.set("status", filters.status);
  if (filters.search) query.set("search", filters.search);

  const items: RiskOpportunity[] = [];
  for (let page = 1; page <= 1000; page += 1) {
    query.set("page", String(page));
    const payload = await backendApi.request<unknown>(`opportunities?${query.toString()}`);
    const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    items.push(...listOf(payload, "opportunite"));

    const meta =
      root["meta"] && typeof root["meta"] === "object"
        ? (root["meta"] as Record<string, unknown>)
        : {};
    const lastPage = Number(meta["last_page"] ?? 0);
    if (
      lastPage > 0 ? page >= lastPage : !Array.isArray(root["data"]) || root["data"].length < 100
    ) {
      break;
    }
  }

  return items;
}

export async function fetchRisk(
  id: string | number,
  type: RiskType = "risque",
): Promise<RiskOpportunity | null> {
  const resource = type === "opportunite" ? "opportunities" : "risks-opportunities";
  const payload = await backendApi.request<unknown>(
    `${resource}/${encodeURIComponent(String(id))}`,
  );
  return oneOf(payload, type);
}

export async function createRisk(
  processId: string | number,
  payload: RiskSavePayload,
): Promise<RiskOpportunity | null> {
  if (payload["type"] === "opportunite") {
    const result = await backendApi.request<unknown>("opportunities", {
      method: "POST",
      body: JSON.stringify({ ...payload, process_id: processId }),
    });
    return oneOf(result, "opportunite");
  }

  const result = await backendApi.request<unknown>(
    `processes/${encodeURIComponent(String(processId))}/risks-opportunities`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return oneOf(result);
}

export async function updateRisk(
  id: string | number,
  payload: RiskSavePayload,
  type: RiskType = payload["type"] === "opportunite" ? "opportunite" : "risque",
): Promise<RiskOpportunity | null> {
  if (type === "opportunite") {
    const result = await backendApi.request<unknown>(
      `opportunities/${encodeURIComponent(String(id))}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return oneOf(result, "opportunite");
  }

  const result = await backendApi.request<unknown>(
    `risks-opportunities/${encodeURIComponent(String(id))}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  return oneOf(result);
}

export async function deleteRisk(id: string | number, type: RiskType = "risque"): Promise<unknown> {
  const resource = type === "opportunite" ? "opportunities" : "risks-opportunities";
  return backendApi.request<unknown>(`${resource}/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

export async function evaluateRisk(
  id: string | number,
  payload: RiskEvaluationPayload,
  type: RiskType = "risque",
): Promise<RiskOpportunity | null> {
  if (type === "opportunite") {
    const result = await backendApi.request<unknown>(
      `opportunities/${encodeURIComponent(String(id))}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return oneOf(result, "opportunite");
  }

  const result = await backendApi.request<unknown>(
    `risks-opportunities/${encodeURIComponent(String(id))}/evaluation`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  return oneOf(result);
}

export async function exportRisksXlsx(siteId?: string): Promise<Blob> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  return backendApi.blob(`risks-opportunities/export-xlsx${suffix}`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchRiskUsers(siteId: string): Promise<RiskUser[]> {
  const query = new URLSearchParams({ per_page: "100" });
  if (siteId) query.set("site_id", siteId);
  const payload = await backendApi.request<unknown>(`users?${query.toString()}`);
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = root["data"] ?? payload;
  if (!Array.isArray(data)) return [];
  return data.map((entry) => {
    const flat = flattenResource(entry);
    const first = typeof flat["first_name"] === "string" ? (flat["first_name"] as string) : "";
    const last = typeof flat["last_name"] === "string" ? (flat["last_name"] as string) : "";
    const full = `${first} ${last}`.trim();
    const name =
      full ||
      (typeof flat["name"] === "string" && (flat["name"] as string).trim()) ||
      (typeof flat["email"] === "string" ? (flat["email"] as string) : "") ||
      `Utilisateur ${String(flat["id"] ?? "")}`;
    return {
      ...flat,
      id: (flat["id"] ?? "") as string | number,
      name,
      email: typeof flat["email"] === "string" ? (flat["email"] as string) : undefined,
    };
  });
}

export function useRisks(filters: RiskFilters) {
  return useQuery({
    queryKey: [...RISKS_KEY, filters],
    queryFn: () => fetchRisks(filters),
    staleTime: 60_000,
  });
}

export function useRisk(id: string | number | null, type: RiskType = "risque") {
  return useQuery({
    queryKey: [...RISKS_KEY, "detail", type, id],
    queryFn: () => fetchRisk(id as string | number, type),
    enabled: id != null && String(id) !== "",
    staleTime: 60_000,
  });
}

export function useRiskUsers(siteId: string) {
  return useQuery({
    queryKey: [...RISK_USERS_KEY, siteId],
    queryFn: () => fetchRiskUsers(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useRiskMutations() {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: RISKS_KEY });
  };
  return {
    create: useMutation({
      mutationFn: (input: { processId: string | number; payload: RiskSavePayload }) =>
        createRisk(input.processId, input.payload),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (input: {
        id: string | number;
        payload: RiskSavePayload;
        type?: RiskType | undefined;
      }) => updateRisk(input.id, input.payload, input.type),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (input: { id: string | number; type: RiskType }) =>
        deleteRisk(input.id, input.type),
      onSuccess: invalidate,
    }),
    evaluate: useMutation({
      mutationFn: (input: {
        id: string | number;
        payload: RiskEvaluationPayload;
        type?: RiskType | undefined;
      }) => evaluateRisk(input.id, input.payload, input.type),
      onSuccess: invalidate,
    }),
  };
}
