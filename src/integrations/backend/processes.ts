import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

export const PROCESS_KEY = ["organisation-process"] as const;
export const PROCESSES_KEY = ["organisation-processes"] as const;

function resource(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const item = (root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data
    : payload) as Record<string, unknown>;
  const attributes = item.attributes && typeof item.attributes === "object"
    ? item.attributes as Record<string, unknown>
    : item;
  const result: Record<string, unknown> = {
    ...attributes,
    id: item.id ?? attributes.id,
  };
  const relationships = item.relationships && typeof item.relationships === "object"
    ? item.relationships as Record<string, unknown>
    : {};
  Object.entries(relationships).forEach(([key, value]) => {
    const relation = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : value;
    const data = relation && typeof relation === "object" && "data" in relation
      ? relation.data
      : relation;
    if (Array.isArray(data)) {
      result[key] = data.map((entry) => resource(entry));
    } else if (data && typeof data === "object") {
      result[key] = resource(data);
    } else {
      result[key] = data;
    }
  });
  return result;
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

export async function fetchProcess(id: string) {
  const payload = await backendApi.request<unknown>(`processes/${id}`);
  return resource(payload);
}

export function useProcess(id?: string) {
  return useQuery({
    queryKey: [...PROCESS_KEY, id ?? "new"],
    queryFn: () => fetchProcess(id!),
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}

export function normalizeProcessSequences(value: unknown) {
  return arrayValue(value).map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const list = (candidate: unknown): string[] => {
      if (Array.isArray(candidate)) {
        return candidate.map((entry) => {
          if (entry && typeof entry === "object") {
            const object = entry as Record<string, unknown>;
            return String(object.name ?? object.title ?? object.label ?? object.code ?? object.id ?? "").trim();
          }
          return String(entry ?? "").trim();
        }).filter(Boolean);
      }
      if (typeof candidate === "string") {
        const parsed = arrayValue(candidate);
        return parsed.length > 0 ? list(parsed) : candidate.split(",").map((entry) => entry.trim()).filter(Boolean);
      }
      return [];
    };
    return {
      id: source.id == null ? undefined : String(source.id),
      sequence_order: Number(source.sequence_order ?? source.order ?? index + 1),
      input_description: String(source.input_description ?? source.inputDescription ?? source.inputs ?? ""),
      activity_description: String(source.activity_description ?? source.activityDescription ?? source.activities ?? ""),
      output_description: String(source.output_description ?? source.outputDescription ?? source.outputs ?? ""),
      sub_activities: list(source.sub_activities ?? source.subActivities),
      supplier_processes: list(source.supplier_processes ?? source.supplierProcesses),
      client_processes: list(source.client_processes ?? source.clientProcesses),
      responsible_user_id: source.responsible_user_id == null ? undefined : String(source.responsible_user_id),
      duration_minutes: source.duration_minutes == null ? undefined : Number(source.duration_minutes),
      documents: Array.isArray(source.documents) ? source.documents : [],
    };
  });
}

export type ProcessSequencePayload = {
  sequence_order?: number;
  input_description?: string;
  activity_description: string;
  output_description?: string;
  sub_activities?: string[];
  supplier_processes?: string[];
  client_processes?: string[];
  responsible_user_id?: number | null;
  duration_minutes?: number | null;
  document_ids?: number[];
};

export async function createProcessSequence(processId: string, payload: ProcessSequencePayload) {
  return backendApi.request(`processes/${processId}/sequences`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProcessSequence(processId: string, sequenceId: string, payload: ProcessSequencePayload) {
  return backendApi.request(`processes/${processId}/sequences/${sequenceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteProcessSequence(processId: string, sequenceId: string) {
  return backendApi.request(`processes/${processId}/sequences/${sequenceId}`, { method: "DELETE" });
}

export function useProcessMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: PROCESSES_KEY });
    void client.invalidateQueries({ queryKey: ["organisation-cartography", siteId] });
  };
  return {
    save: useMutation({
      mutationFn: (input: { id?: string; payload: Record<string, unknown> }) => backendApi.request(input.id ? `processes/${input.id}` : "processes", { method: input.id ? "PUT" : "POST", body: JSON.stringify(input.payload) }),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id: string) => backendApi.request(`processes/${id}`, { method: "DELETE" }), onSuccess: invalidate }),
  };
}

export const PROCESS_REVIEWS_KEY = ["process-reviews"] as const;

/** Collection REST des revues de processus (backend feat/modular-backend-iso-exports). */
export async function fetchProcessReviews(processId: string) {
  const payload = await backendApi.request<unknown>(`processes/${processId}/reviews`);
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = root.data ?? payload;
  if (Array.isArray(data)) return data.map(flattenResource);
  return [];
}

export function useProcessReviews(processId?: string) {
  return useQuery({
    queryKey: [...PROCESS_REVIEWS_KEY, processId ?? "all"],
    queryFn: () => fetchProcessReviews(processId!),
    enabled: Boolean(processId),
    staleTime: 20_000,
  });
}

export function useProcessReviewMutations(processId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: [...PROCESS_REVIEWS_KEY, processId] });
  return {
    save: useMutation({
      mutationFn: (input: { id?: string | number; payload: Record<string, unknown> }) =>
        backendApi.request(
          input.id
            ? `processes/${processId}/reviews/${input.id}`
            : `processes/${processId}/reviews`,
          { method: input.id ? "PUT" : "POST", body: JSON.stringify(input.payload) },
        ),
      onSuccess: invalidate,
    }),
    submitSuggestions: useMutation({
      mutationFn: (payload?: Record<string, unknown>) =>
        backendApi.request(`processes/${processId}/reviews/current/submit-suggestions`, {
          method: "POST",
          body: JSON.stringify(payload ?? {}),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function downloadProcessReview(
  processId: string,
  reviewId: string | number | "current",
  format: "pdf" | "docx",
) {
  const path =
    reviewId === "current"
      ? `processes/${processId}/reviews/current/export-${format}`
      : `processes/${processId}/reviews/${reviewId}/export-${format}`;
  return backendApi.blob(path);
}

// ---------------------------------------------------------------------------
// Cartographie du système de management (contrat `processes-cartography`).
// Référence Vue : ProcessCartographyViewer (lanes management/réalisation/
// support, matrice des interactions, tableau officiel 4 colonnes, exports
// PDF/DOCX, codification via generate-draft) + ManagementSystem (stats).
// Ces helpers structurés remplacent l'aplatissement générique de context.ts
// qui mélangeait `all_processes`, les doublons par catégorie et les
// interactions dans une seule liste.
// ---------------------------------------------------------------------------

export type CartographyProcess = Record<string, unknown> & {
  id: string | number;
  code?: string;
  title?: string;
  name?: string;
  category?: string;
  normalized_category?: string;
};

export type CartographyInteraction = {
  id?: string | number;
  source_id: string | number;
  target_id: string | number;
  source_code?: string;
  target_code?: string;
  source_title?: string;
  target_title?: string;
  label?: string;
  nature?: string;
};

export type CartographyDocument = {
  id: string | number;
  code?: string;
  version?: string;
  workflow_status?: string;
  title?: string;
  effective_date?: string;
} | null;

export type CartographyData = {
  enterprise_name: string;
  site_name: string;
  total_count: number;
  document: CartographyDocument;
  processes: CartographyProcess[];
  interactions: CartographyInteraction[];
  management: CartographyProcess[];
  realization: CartographyProcess[];
  support: CartographyProcess[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cartographyList(value: unknown): CartographyProcess[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({ ...resource(item), id: (asRecord(resource(item)).id ?? "") as string | number }) as CartographyProcess);
}

function parseCartography(payload: unknown): CartographyData {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? payload);
  const all = cartographyList(data.all_processes);
  const interactions = Array.isArray(data.interactions)
    ? (data.interactions as CartographyInteraction[])
    : [];
  const byLane = (lane: string) =>
    all.filter((item) => String(item.normalized_category ?? "").toLowerCase() === lane);
  const doc = asRecord(data.document);
  const hasDoc = doc.id !== undefined && doc.id !== "";
  return {
    enterprise_name: String(data.enterprise_name ?? "Système de Management de la Qualité"),
    site_name: String(data.site_name ?? ""),
    total_count: Number(data.total_count ?? all.length),
    document: hasDoc ? ({ ...doc, id: doc.id as string | number } as CartographyDocument) : null,
    processes: all,
    interactions,
    management: byLane("management"),
    realization: byLane("realization"),
    support: byLane("support"),
  };
}

/** Contrat structuré GET `processes-cartography?site_id=…` (toujours filtré par site). */
export async function fetchCartographyData(siteId: string): Promise<CartographyData> {
  const payload = await backendApi.request<unknown>(
    `processes-cartography?site_id=${encodeURIComponent(siteId)}`,
  );
  return parseCartography(payload);
}

export const CARTOGRAPHY_DATA_KEY = ["organisation-cartography-data"] as const;

export function useCartographyData(siteId: string) {
  return useQuery({
    queryKey: [...CARTOGRAPHY_DATA_KEY, siteId],
    queryFn: () => fetchCartographyData(siteId),
    enabled: Boolean(siteId),
    staleTime: 20_000,
  });
}

/** Export PDF de la cartographie (même contrat que Vue : `preview=1` pour l'aperçu). */
export function downloadCartographyPdf(siteId: string) {
  return backendApi.blob(
    `processes-cartography/export-pdf?site_id=${encodeURIComponent(siteId)}&preview=1`,
  );
}

/** Export DOCX de la cartographie (canevas 4 colonnes côté Laravel). */
export function downloadCartographyDocx(siteId: string) {
  return backendApi.blob(
    `processes-cartography/export-docx?site_id=${encodeURIComponent(siteId)}`,
  );
}

/** Codification du document SMQ (POST `processes-cartography/generate-draft`). */
export async function generateCartographyDraft(input: Record<string, unknown>) {
  return backendApi.request<unknown>("processes-cartography/generate-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type IsoCoverageRow = Record<string, unknown> & {
  process?: string;
  process_code?: string;
  clause?: string;
  clause_title?: string;
  coverage?: string;
  conformity?: string;
};

/** Matrice de couverture ISO (contrat `iso-coverage-matrix?site_id=…&norme=…`). */
export async function fetchIsoCoverageMatrix(siteId: string, norme = "9001") {
  const payload = await backendApi.request<unknown>(
    `iso-coverage-matrix?site_id=${encodeURIComponent(siteId)}&norme=${encodeURIComponent(norme)}`,
  );
  const root = asRecord(payload);
  const data = root.data ?? [];
  return {
    rows: (Array.isArray(data) ? data : []) as IsoCoverageRow[],
    norme: String(root.norme ?? norme),
    total: Number(root.total ?? (Array.isArray(data) ? data.length : 0)),
  };
}

export const ISO_COVERAGE_KEY = ["organisation-iso-coverage"] as const;

export function useIsoCoverageMatrix(siteId: string, norme = "9001") {
  return useQuery({
    queryKey: [...ISO_COVERAGE_KEY, siteId, norme],
    queryFn: () => fetchIsoCoverageMatrix(siteId, norme),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
}
