import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Réalisation des activités (§8 ISO 9001).
 * Contrats Laravel attendus (endpoints dédiés, préfixe `/api/v1`) :
 * - opcontrol    -> operational-controls
 * - requirement   -> product-service-requirements
 * - design        -> design-developments
 * - operation     -> production-operations
 * - release       -> product-releases
 * - nonconforming -> nonconforming-outputs
 * - procedure     -> documents (filtre type=Procédure côté page)
 * Conventions : `?site_id=&search=&per_page=100`, blobs
 * `{endpoint}/export-xlsx?site_id=`, `{endpoint}/template`,
 * import `POST {endpoint}/import-xlsx` (FormData site_id + file).
 */

export const REALISATION_RESOURCES = {
  opcontrol: "operational-controls",
  requirement: "product-service-requirements",
  design: "design-developments",
  operation: "production-operations",
  release: "product-releases",
  nonconforming: "nonconforming-outputs",
  procedure: "documents",
} as const;

export type RealisationKey = keyof typeof REALISATION_RESOURCES;

export const REALISATION_KEY = ["realisation"] as const;

export type RealisationItem = Record<string, unknown> & {
  id: string | number;
};

export type RealisationFilters = {
  site_id?: string | undefined;
  search?: string | undefined;
};

export type RealisationSavePayload = Record<string, unknown>;

export type OperationalOverview = {
  projects: RealisationItem[];
  totalProjects: number;
  totalActivities: number;
  totalTasks: number;
  completedTasks: number;
  progressRate: number;
  raw: Record<string, unknown>;
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toItemArray(payload: unknown): RealisationItem[] {
  const root = objectOf(payload);
  const data = root["data"] ?? payload;
  const list = Array.isArray(data) ? data : [];
  return list.map((entry) => {
    const flat = flattenResource(entry) as RealisationItem;
    return { ...flat, id: (flat["id"] ?? "") as string | number };
  });
}

function toOneItem(payload: unknown): RealisationItem | null {
  const root = objectOf(payload);
  const data = root["data"] ?? payload;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const flat = flattenResource(data) as RealisationItem;
  return { ...flat, id: (flat["id"] ?? "") as string | number };
}

function endpointOf(key: RealisationKey): string {
  return REALISATION_RESOURCES[key];
}

function querySuffix(filters: RealisationFilters): string {
  const query = new URLSearchParams({ per_page: "100" });
  if (filters.site_id) query.set("site_id", filters.site_id);
  if (filters.search) query.set("search", filters.search);
  return `?${query.toString()}`;
}

export async function fetchRealisationList(
  key: RealisationKey,
  filters: RealisationFilters = {},
): Promise<RealisationItem[]> {
  const payload = await backendApi.request<unknown>(
    `${endpointOf(key)}${querySuffix(filters)}`,
  );
  return toItemArray(payload);
}

export async function fetchRealisationOne(
  key: RealisationKey,
  id: string | number,
): Promise<RealisationItem | null> {
  const payload = await backendApi.request<unknown>(
    `${endpointOf(key)}/${encodeURIComponent(String(id))}`,
  );
  return toOneItem(payload);
}

export async function createRealisationItem(
  key: RealisationKey,
  payload: RealisationSavePayload,
): Promise<RealisationItem | null> {
  const result = await backendApi.request<unknown>(endpointOf(key), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toOneItem(result);
}

export async function updateRealisationItem(
  key: RealisationKey,
  id: string | number,
  payload: RealisationSavePayload,
): Promise<RealisationItem | null> {
  const result = await backendApi.request<unknown>(
    `${endpointOf(key)}/${encodeURIComponent(String(id))}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  return toOneItem(result);
}

export async function deleteRealisationItem(
  key: RealisationKey,
  id: string | number,
): Promise<unknown> {
  return backendApi.request<unknown>(
    `${endpointOf(key)}/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export async function exportRealisationXlsx(
  key: RealisationKey,
  siteId?: string,
): Promise<Blob> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  return backendApi.blob(`${endpointOf(key)}/export-xlsx${suffix}`);
}

export async function templateRealisationXlsx(key: RealisationKey): Promise<Blob> {
  return backendApi.blob(`${endpointOf(key)}/template`);
}

export async function importRealisationXlsx(
  key: RealisationKey,
  siteId: string,
  file: File,
): Promise<unknown> {
  const formData = new FormData();
  formData.append("site_id", siteId);
  formData.append("file", file);
  return backendApi.request<unknown>(`${endpointOf(key)}/import-xlsx`, {
    method: "POST",
    body: formData,
  });
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

// ---------- Vue d'ensemble des projets opérationnels (§8.1) ----------

function overviewProjectsOf(raw: Record<string, unknown>): RealisationItem[] {
  const candidates = [
    raw["projects"],
    raw["operational_projects"],
    objectOf(raw["data"])["projects"],
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry) => {
        const flat = flattenResource(entry) as RealisationItem;
        return { ...flat, id: (flat["id"] ?? "") as string | number };
      });
    }
  }
  return [];
}

function numberOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchOperationalOverview(siteId?: string): Promise<OperationalOverview> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  const payload = await backendApi.request<unknown>(`operational-planning/overview${suffix}`);
  const raw = objectOf(objectOf(payload)["data"] ?? payload);
  const projects = overviewProjectsOf(raw);
  const totalTasks =
    numberOf(raw["total_tasks"]) ||
    projects.reduce((sum, p) => sum + numberOf(p["tasks_count"] ?? p["total_tasks"]), 0);
  const completedTasks =
    numberOf(raw["completed_tasks"]) ||
    projects.reduce(
      (sum, p) => sum + numberOf(p["completed_tasks_count"] ?? p["completed_tasks"]),
      0,
    );
  const totalActivities =
    numberOf(raw["total_activities"]) ||
    projects.reduce(
      (sum, p) => sum + numberOf(p["activities_count"] ?? p["total_activities"]),
      0,
    );
  return {
    projects,
    totalProjects: numberOf(raw["total_projects"]) || projects.length,
    totalActivities,
    totalTasks,
    completedTasks,
    progressRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    raw,
  };
}

export function useOperationalOverview(siteId: string) {
  return useQuery({
    queryKey: [...REALISATION_KEY, "operational-overview", siteId],
    queryFn: () => fetchOperationalOverview(siteId || undefined),
    staleTime: 60_000,
  });
}

// ---------- Hooks génériques ----------

export function useRealisationList(key: RealisationKey, filters: RealisationFilters) {
  return useQuery({
    queryKey: [...REALISATION_KEY, key, filters],
    queryFn: () => fetchRealisationList(key, filters),
    staleTime: 60_000,
  });
}

export function useRealisationItem(key: RealisationKey, id: string | number | null) {
  return useQuery({
    queryKey: [...REALISATION_KEY, key, "detail", id],
    queryFn: () => fetchRealisationOne(key, id as string | number),
    enabled: id != null && String(id) !== "",
    staleTime: 60_000,
  });
}

export function useRealisationMutations(key: RealisationKey, siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...REALISATION_KEY, key] });
  };
  return {
    create: useMutation({
      mutationFn: (payload: RealisationSavePayload) =>
        createRealisationItem(key, { ...payload, ...(siteId ? { site_id: siteId } : {}) }),
      onSuccess: () => {
        invalidate();
        toast.success("Élément créé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Création impossible."),
    }),
    update: useMutation({
      mutationFn: (input: { id: string | number; payload: RealisationSavePayload }) =>
        updateRealisationItem(key, input.id, input.payload),
      onSuccess: () => {
        invalidate();
        toast.success("Modifications enregistrées.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible."),
    }),
    remove: useMutation({
      mutationFn: (id: string | number) => deleteRealisationItem(key, id),
      onSuccess: () => {
        invalidate();
        toast.success("Élément supprimé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Suppression impossible."),
    }),
    importFile: useMutation({
      mutationFn: (file: File) => importRealisationXlsx(key, siteId, file),
      onSuccess: () => {
        invalidate();
        toast.success("Import terminé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Import impossible."),
    }),
  };
}

// ---------- Hooks nommés par module ----------

export function useOperationalControls(filters: RealisationFilters) {
  return useRealisationList("opcontrol", filters);
}
export function useOperationalControlMutations(siteId: string) {
  return useRealisationMutations("opcontrol", siteId);
}

export function useRequirements(filters: RealisationFilters) {
  return useRealisationList("requirement", filters);
}
export function useRequirementMutations(siteId: string) {
  return useRealisationMutations("requirement", siteId);
}

export function useDesigns(filters: RealisationFilters) {
  return useRealisationList("design", filters);
}
export function useDesignMutations(siteId: string) {
  return useRealisationMutations("design", siteId);
}

export function useOperations(filters: RealisationFilters) {
  return useRealisationList("operation", filters);
}
export function useOperationMutations(siteId: string) {
  return useRealisationMutations("operation", siteId);
}

export function useReleases(filters: RealisationFilters) {
  return useRealisationList("release", filters);
}
export function useReleaseMutations(siteId: string) {
  return useRealisationMutations("release", siteId);
}

export function useNonconformingOutputs(filters: RealisationFilters) {
  return useRealisationList("nonconforming", filters);
}
export function useNonconformingMutations(siteId: string) {
  return useRealisationMutations("nonconforming", siteId);
}

export function useProcedures(filters: RealisationFilters) {
  return useRealisationList("procedure", filters);
}
export function useProcedureMutations(siteId: string) {
  return useRealisationMutations("procedure", siteId);
}
