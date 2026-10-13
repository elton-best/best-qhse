import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

export const CONTEXT_KEY = ["organisation-context"] as const;
export const STAKEHOLDERS_KEY = ["organisation-stakeholders"] as const;
export const SCOPE_KEY = ["organisation-scope"] as const;
export const PROCESSES_KEY = ["organisation-processes"] as const;
export const CARTOGRAPHY_KEY = ["organisation-cartography"] as const;

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = objectOf(payload);
  if (Array.isArray(root.data)) return root.data;
  const data = objectOf(root.data);
  return Array.isArray(data.data) ? data.data : [];
}

export function flattenResource(item: unknown): Record<string, unknown> {
  const raw = objectOf(item);
  const attributes =
    raw.attributes && typeof raw.attributes === "object"
      ? (raw.attributes as Record<string, unknown>)
      : raw;
  return { ...attributes, id: raw.id ?? attributes.id };
}

async function fetchResources(endpoint: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`${endpoint}${suffix}`);
  return collection(payload).map(flattenResource);
}

export const SWOT_PESTEL_TYPE = "swot_pestel" as const;

/** Internal criteria keys (Vue SWOTPestel parity: culture/values/performance/knowledge/other_internal). */
export const INTERNAL_CRITERIA = [
  "culture",
  "values",
  "performance",
  "knowledge",
  "other_internal",
] as const;
/** External criteria keys (Vue SWOTPestel parity plus the ISO-relevant environmental factor). */
export const EXTERNAL_CRITERIA = [
  "political",
  "economic",
  "social",
  "technological",
  "environmental",
  "legal",
] as const;

export type IssueCriterionData = { favorable: string[]; unfavorable: string[] };

export type SwotPestelIssuesForm = {
  internal: Record<string, IssueCriterionData>;
  external: Record<string, IssueCriterionData>;
  synthesisInternal: string;
  synthesisExternal: string;
  majorIssues: string[];
};

function issueList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [];
}

function emptyCriterion(): IssueCriterionData {
  return { favorable: [], unfavorable: [] };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return objectOf(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return objectOf(value);
}

/** Parse a Vue-format criterion map (JSON string or object) into {favorable, unfavorable} lists. */
export function parseCriterionMap(
  value: unknown,
  criteria: readonly string[],
): Record<string, IssueCriterionData> {
  const raw = asRecord(value);
  return Object.fromEntries(
    criteria.map((criterion) => {
      const entry = objectOf(raw[criterion]);
      return [
        criterion,
        { favorable: issueList(entry["favorable"]), unfavorable: issueList(entry["unfavorable"]) },
      ];
    }),
  );
}

/** Parse the Vue-format major-issues JSON array (string or array). */
export function parseMajorIssues(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return issueList(JSON.parse(value) as unknown);
    } catch {
      return value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return issueList(value);
}

export function emptyIssuesForm(): SwotPestelIssuesForm {
  return {
    internal: Object.fromEntries(
      INTERNAL_CRITERIA.map((criterion) => [criterion, emptyCriterion()]),
    ),
    external: Object.fromEntries(
      EXTERNAL_CRITERIA.map((criterion) => [criterion, emptyCriterion()]),
    ),
    synthesisInternal: "",
    synthesisExternal: "",
    majorIssues: [],
  };
}

/** Map a flattened contexts record to the Vue-format issues form (syntheses + internal/external + major). */
export function issuesFormFromRecord(record: Record<string, unknown>): SwotPestelIssuesForm {
  return {
    internal: parseCriterionMap(record["swot_weaknesses"], INTERNAL_CRITERIA),
    external: parseCriterionMap(record["swot_opportunities"], EXTERNAL_CRITERIA),
    synthesisInternal:
      typeof record["swot_strengths"] === "string" ? (record["swot_strengths"] as string) : "",
    synthesisExternal:
      typeof record["pestel_political"] === "string" ? (record["pestel_political"] as string) : "",
    majorIssues: parseMajorIssues(record["swot_threats"]),
  };
}

/** Build the Laravel payload matching the Vue SWOTPestel contract (JSON blobs + syntheses). */
export function buildSwotPestelPayload(
  siteId: string,
  form: SwotPestelIssuesForm,
): Record<string, unknown> {
  return {
    site_id: Number(siteId),
    type: SWOT_PESTEL_TYPE,
    title: "Analyse SWOT/PESTEL",
    category: "other",
    description: "Analyse du contexte de l'organisme",
    swot_strengths: form.synthesisInternal,
    swot_weaknesses: JSON.stringify(form.internal),
    swot_opportunities: JSON.stringify(form.external),
    swot_threats: JSON.stringify(form.majorIssues),
    pestel_political: form.synthesisExternal,
  };
}

export async function fetchContexts(siteId: string) {
  return fetchResources("contexts", { site_id: siteId, type: SWOT_PESTEL_TYPE });
}

export async function fetchStakeholders(siteId: string) {
  return fetchResources("stakeholders", { site_id: siteId, per_page: "100" });
}

export async function fetchScopes(siteId: string) {
  return fetchResources("application-scopes", { site_id: siteId, is_current: "true" });
}

export async function fetchProcesses(siteId: string) {
  // `light=1` : version allégée sans relations coûteuses (12 Mo/12 s sinon).
  return fetchResources("processes", { site_id: siteId, per_page: "100", light: "1" });
}

const CARTOGRAPHY_SKIP = new Set(["categories", "document", "all_processes", "interactions"]);

export async function fetchCartography(siteId: string) {
  const payload = await backendApi.request<unknown>(
    `processes-cartography?site_id=${encodeURIComponent(siteId)}`,
  );
  const root = objectOf(payload);
  const data = objectOf(root.data);
  // Le backend expose `categories` (management/realization/support, sans doublons)
  // en plus des listes par famille (`pilotage`, `operationnel`, …) et des agrégats
  // (`all_processes`, `interactions`) : ne retenir qu'une seule source.
  const categories = objectOf(data["categories"]);
  const hasCategories = Object.values(categories).some((value) => Array.isArray(value));
  const source = hasCategories ? categories : data;
  return Object.entries(source).flatMap(([category, items]) =>
    Array.isArray(items) && !CARTOGRAPHY_SKIP.has(category)
      ? items.map((item) => ({ ...flattenResource(item), category }))
      : [],
  );
}

export function useContexts(siteId: string) {
  return useQuery({
    queryKey: [...CONTEXT_KEY, siteId],
    queryFn: () => fetchContexts(siteId),
    enabled: Boolean(siteId),
    staleTime: 20_000,
  });
}

export function useStakeholders(siteId: string) {
  return useQuery({
    queryKey: [...STAKEHOLDERS_KEY, siteId],
    queryFn: () => fetchStakeholders(siteId),
    enabled: Boolean(siteId),
    staleTime: 20_000,
  });
}

export function useScope(siteId: string) {
  return useQuery({
    queryKey: [...SCOPE_KEY, siteId],
    queryFn: () => fetchScopes(siteId),
    enabled: Boolean(siteId),
    staleTime: 20_000,
  });
}

export function useProcesses(siteId: string) {
  return useQuery({
    queryKey: [...PROCESSES_KEY, siteId],
    queryFn: () => fetchProcesses(siteId),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
}

export function useCartography(siteId: string) {
  return useQuery({
    queryKey: [...CARTOGRAPHY_KEY, siteId],
    queryFn: () => fetchCartography(siteId),
    enabled: Boolean(siteId),
    staleTime: 20_000,
  });
}

export function useContextMutations(siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...CONTEXT_KEY, siteId] });
  return {
    save: useMutation({
      mutationFn: async (input: { id?: string; payload: Record<string, unknown> }) => {
        const path = input.id ? `contexts/${input.id}` : "contexts";
        const defaults = { type: SWOT_PESTEL_TYPE, ...(siteId ? { site_id: Number(siteId) } : {}) };
        return backendApi.request(path, {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify({ ...defaults, ...input.payload }),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => backendApi.request(`contexts/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useStakeholderMutations(siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...STAKEHOLDERS_KEY, siteId] });
  return {
    save: useMutation({
      mutationFn: async (input: { id?: string; payload: Record<string, unknown> }) => {
        const path = input.id ? `stakeholders/${input.id}` : "stakeholders";
        return backendApi.request(path, {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => backendApi.request(`stakeholders/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useScopeMutations(siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...SCOPE_KEY, siteId] });
  return {
    save: useMutation({
      mutationFn: async (input: { id?: string; payload: Record<string, unknown> }) => {
        const path = input.id ? `application-scopes/${input.id}` : "application-scopes";
        return backendApi.request(path, {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        });
      },
      onSuccess: invalidate,
    }),
  };
}
