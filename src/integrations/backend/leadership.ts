import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

export const POLICY_KEY = ["qhse-policy"] as const;
export const POLICY_HISTORY_KEY = ["qhse-policy-history"] as const;
export const POLICY_PUBLICATION_KEY = ["qhse-policy-publication"] as const;
export const POLICY_ACKNOWLEDGEMENTS_KEY = ["qhse-policy-acknowledgements"] as const;
export const ETHICS_REPORTS_KEY = ["qhse-ethics-reports"] as const;
export const STRATEGIC_AXES_KEY = ["strategic-axes"] as const;
export const ORG_CHART_KEY = ["org-chart"] as const;
export const JOB_DESCRIPTIONS_KEY = ["job-descriptions"] as const;
export const JOB_COLLABORATORS_KEY = ["job-description-collaborators"] as const;
export const JOB_IMPORT_LOGS_KEY = ["job-import-logs"] as const;
export const RESPONSIBILITIES_KEY = ["responsibilities"] as const;
export const COLLABORATORS_KEY = ["leadership-collaborators"] as const;

export type EntityId = string | number;

export type QhsePolicy = {
  id?: string | number;
  site_id?: string | number | null;
  version?: string | null;
  is_current?: boolean;
  based_on_policy_id?: string | number | null;
  effective_date?: string | null;
  validated_by_direction_at?: string | null;
  validated_by_user_id?: string | number | null;
  validated_by_name?: string | null;
  mission: string;
  vision?: string | null;
  values?: string[];
  axes?: string[];
  commitments?: string[];
  quality_policy?: string | null;
  environmental_policy?: string | null;
  health_safety_policy?: string | null;
  ethics_charter?: string | null;
  status?: string | null;
  updated_at?: string | null;
  leadership_reviews?: unknown[] | null;
  customer_orientation_reviews?: unknown[] | null;
};

export type QhsePolicyHistoryItem = {
  id?: string | number;
  site_id?: string | number | null;
  version?: string | null;
  status?: string | null;
  is_current?: boolean;
  effective_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type PolicyQuizQuestion = {
  id: "mission" | "quality_policy" | "commitment";
  prompt: string;
  options: string[];
};

export type PolicyAcknowledgement = {
  id: number;
  user_id: number;
  notified_at: string | null;
  acknowledged_at: string | null;
  quiz_score: number | null;
  quiz_passed: boolean | null;
  quiz_completed_at: string | null;
  user?: { id: number; name: string; email: string };
};

export type PolicyPublication = {
  policy: QhsePolicy | null;
  acknowledgement: PolicyAcknowledgement | null;
  quiz: PolicyQuizQuestion[];
};

export type PolicyAcknowledgementReport = {
  policy_id: number;
  total: number;
  acknowledged: number;
  quiz_passed: number;
  items: PolicyAcknowledgement[];
};

export type EthicsReportStatus =
  "received" | "investigating" | "action_taken" | "closed" | "rejected";

export type EthicsReport = {
  id: string;
  category: string;
  subject: string;
  status: EthicsReportStatus;
  public_update: string | null;
  is_anonymous: boolean;
  submitted_at: string | null;
  updated_at: string | null;
  tracking_code?: string;
  description?: string;
  incident_date?: string | null;
  handling_notes?: string | null;
  handled_at?: string | null;
  handled_by?: string | null;
  site?: string | null;
  reporter?: { name: string | null; email: string | null } | null;
};

export type CultureSurveyAnswers = {
  quality_integration: number;
  speak_up_safety: number;
  management_listening: number;
  role_clarity: number;
  change_communication: number;
};

export type CultureSurveySummary = {
  available: boolean;
  minimum_responses?: number;
  response_count?: number;
  scale?: { min: number; max: number };
  questions?: Record<keyof CultureSurveyAnswers, string>;
  averages?: CultureSurveyAnswers;
};

export type StrategicAxis = {
  id?: string | number;
  site_id?: string | number | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type OrgChart = {
  id: string | number;
  file_name: string;
  file_path?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  is_current?: boolean;
  download_url?: string | null;
  updated_at?: string | null;
};

export type JobDescription = {
  id?: string | number;
  site_id?: string | number | null;
  enterprise_id?: string | number | null;
  job_title?: string | null;
  title?: string | null;
  ref?: string | null;
  user_id?: string | number | null;
  reports_to_id?: string | number | null;
  replacement_job_title?: string | null;
  department?: string | null;
  mission?: string | null;
  activities?: string | string[] | null;
  main_activities?: string | string[] | null;
  secondary_activities?: string | string[] | null;
  internal_relations?: string | string[] | null;
  external_relations?: string | string[] | null;
  work_location?: string | null;
  work_schedule?: string | null;
  travel_required?: boolean | string | null;
  physical_requirements?: string | null;
  required_skills?: string[] | string | null;
  required_experience?: string | null;
  required_education?: string | null;
  certifications_required?: string[] | string | null;
  employee_signature_data?: string | null;
  employee_signed_at?: string | null;
  ceo_signature_data?: string | null;
  ceo_signed_at?: string | null;
  is_fully_signed?: boolean;
  site?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  history?: Record<string, unknown>[] | null;
  [key: string]: unknown;
};

export type Responsibility = {
  id?: string | number;
  site_id?: string | number | null;
  process_id?: string | number | null;
  level?: string | null;
  role_title?: string | null;
  roles?: string | null;
  deliverables?: string | null;
  responsibilities?: string[] | string | null;
  authorities?: string[] | string | null;
  process?: Record<string, unknown> | null;
  title?: string | null;
  name?: string | null;
  [key: string]: unknown;
};

export type Collaborator = {
  id?: string | number;
  site_id?: string | number | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  job_title?: string | null;
  role?: string | null;
  phone?: string | null;
  start_date?: string | null;
  is_active?: boolean;
  collaborator_approval_status?: string | null;
  [key: string]: unknown;
};

export type JobImportMode = "strict" | "flexible";

export type JobImportUploadResult = {
  import_id?: string | number;
  file_name?: string | null;
  total_rows?: number | null;
  import_mode?: JobImportMode | string | null;
  status?: string | null;
  warning?: string | null;
  [key: string]: unknown;
};

export type JobImportPreview = {
  import_id?: string | number;
  file_name?: string | null;
  file_size?: number | null;
  total_rows?: number | null;
  processed_rows?: number | null;
  successful_rows?: number | null;
  failed_rows?: number | null;
  status?: string | null;
  [key: string]: unknown;
};

export type JobImportLog = {
  id?: string | number;
  file_name?: string | null;
  file_size?: number | null;
  total_rows?: number | null;
  processed_rows?: number | null;
  successful_rows?: number | null;
  failed_rows?: number | null;
  status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type FetchJobImportLogsParams = {
  status?: string | undefined;
  page?: number | undefined;
  per_page?: number | undefined;
};

export type SaveInput = {
  id?: string | undefined;
  payload: Record<string, unknown>;
};

function dataOf<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  return (root["data"] ?? payload) as T;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function flattenLeadershipResource(value: unknown): Record<string, unknown> {
  const raw = objectOf(value);
  const attributes = objectOf(raw["attributes"] ?? raw);
  const result: Record<string, unknown> = {
    ...attributes,
    ...(raw["id"] != null ? { id: raw["id"] } : {}),
  };
  const relationships = objectOf(raw["relationships"]);

  for (const [name, relationship] of Object.entries(relationships)) {
    const relation = objectOf(relationship);
    const related = relation["data"] ?? relationship;
    if (Array.isArray(related)) {
      result[name] = related.map((item) => flattenLeadershipResource(item));
    } else if (related != null && typeof related === "object") {
      result[name] = flattenLeadershipResource(related);
    } else {
      result[name] = related;
    }
  }

  return result;
}

function listOf<T = Record<string, unknown>>(payload: unknown): T[] {
  const data = dataOf<unknown>(payload);
  if (!Array.isArray(data)) return [];
  return data.map((item) => flattenLeadershipResource(item) as T);
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

// ---------------------------------------------------------------------------
// Politique QHSE (§5.2)
// ---------------------------------------------------------------------------

export async function fetchCurrentPolicy(siteId: string): Promise<QhsePolicy | null> {
  const payload = await backendApi.request<unknown>(
    `qhse-policies/current?site_id=${encodeURIComponent(siteId)}`,
  );
  return dataOf<QhsePolicy>(payload);
}

export async function fetchPublishedPolicy(siteId: string): Promise<PolicyPublication> {
  return backendApi.request<PolicyPublication>(
    `qhse-policies/published?site_id=${encodeURIComponent(siteId)}`,
  );
}

export async function fetchPolicyAcknowledgements(
  policyId: EntityId,
): Promise<PolicyAcknowledgementReport> {
  return backendApi.request<PolicyAcknowledgementReport>(
    `qhse-policies/${encodeURIComponent(String(policyId))}/acknowledgements`,
  );
}

export async function fetchPolicyHistory(siteId: string): Promise<QhsePolicyHistoryItem[]> {
  const payload = await backendApi.request<unknown>(
    `qhse-policies/history?site_id=${encodeURIComponent(siteId)}`,
  );
  return listOf<QhsePolicyHistoryItem>(payload);
}

export async function fetchMyEthicsReports(): Promise<EthicsReport[]> {
  return listOf<EthicsReport>(await backendApi.request<unknown>("ethics-reports/mine"));
}

export async function fetchManagedEthicsReports(siteId: string): Promise<EthicsReport[]> {
  const query = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  return listOf<EthicsReport>(await backendApi.request<unknown>(`ethics-reports${query}`));
}

export async function fetchCultureSurveySummary(siteId: string): Promise<CultureSurveySummary> {
  return backendApi.request<CultureSurveySummary>(
    `qhse-culture-survey/summary?site_id=${encodeURIComponent(siteId)}`,
  );
}

export async function exportPolicyPdf(id: EntityId): Promise<Blob> {
  return backendApi.blob(`qhse-policies/${encodeURIComponent(String(id))}/export-pdf`);
}

export async function exportPolicyDocx(id: EntityId): Promise<Blob> {
  return backendApi.blob(`qhse-policies/${encodeURIComponent(String(id))}/export-docx`);
}

export async function generatePolicyDraft(
  id: EntityId,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return backendApi.request(`qhse-policies/${encodeURIComponent(String(id))}/generate-draft`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Axes stratégiques (§5.1)
// ---------------------------------------------------------------------------

export async function fetchStrategicAxes(siteId: string): Promise<StrategicAxis[]> {
  const query = new URLSearchParams({ per_page: "100" });
  if (siteId) query.set("site_id", siteId);
  const payload = await backendApi.request<unknown>(`strategic-axes?${query.toString()}`);
  return listOf<StrategicAxis>(payload);
}

// ---------------------------------------------------------------------------
// Organigramme (§5.3)
// ---------------------------------------------------------------------------

export async function fetchOrgChart(siteId: string): Promise<OrgChart | null> {
  const payload = await backendApi.request<unknown>(
    `org-chart/current?site_id=${encodeURIComponent(siteId)}`,
  );
  return dataOf<OrgChart>(payload);
}

// ---------------------------------------------------------------------------
// Fiches de poste (§5.3 / §7.2)
// ---------------------------------------------------------------------------

export async function fetchJobDescriptions(siteId: string): Promise<JobDescription[]> {
  // Le backend scoppe les fiches au niveau entreprise : siteId sert uniquement
  // à la cohérence des queryKeys React Query.
  void siteId;
  const payload = await backendApi.request<unknown>("job-descriptions?per_page=100");
  return listOf<JobDescription>(payload);
}

export async function fetchJobCollaborators(siteId: string): Promise<Collaborator[]> {
  const payload = await backendApi.request<unknown>(
    `users/job-description-collaborators?site_id=${encodeURIComponent(siteId)}`,
  );
  return listOf<Collaborator>(payload);
}

export async function downloadJobDescriptionPdf(id: EntityId): Promise<Blob> {
  return backendApi.blob(`job-descriptions/${encodeURIComponent(String(id))}/pdf`);
}

export async function generateJobDraft(
  id: EntityId,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return backendApi.request(`job-descriptions/${encodeURIComponent(String(id))}/generate-draft`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Import fiches de poste
// ---------------------------------------------------------------------------

export async function uploadJobImport(
  file: File,
  mode: JobImportMode,
): Promise<JobImportUploadResult | null> {
  const body = new FormData();
  body.append("file", file);
  body.append("import_mode", mode);
  const payload = await backendApi.request<unknown>("job-descriptions/import/upload", {
    method: "POST",
    body,
  });
  return dataOf<JobImportUploadResult>(payload);
}

export async function previewJobImport(importId: EntityId): Promise<JobImportPreview | null> {
  const payload = await backendApi.request<unknown>(
    `job-descriptions/import/preview/${encodeURIComponent(String(importId))}`,
  );
  return dataOf<JobImportPreview>(payload);
}

export async function confirmJobImport(importId: EntityId, mode: JobImportMode): Promise<unknown> {
  return backendApi.request(
    `job-descriptions/import/confirm/${encodeURIComponent(String(importId))}`,
    { method: "POST", body: JSON.stringify({ import_mode: mode }) },
  );
}

export async function downloadJobImportTemplate(): Promise<Blob> {
  return backendApi.blob("job-descriptions/import/template");
}

export async function fetchJobImportLogs(
  params?: FetchJobImportLogsParams,
): Promise<JobImportLog[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.page != null) query.set("page", String(params.page));
  query.set("per_page", String(params?.per_page ?? 20));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`job-descriptions/import/logs${suffix}`);
  return listOf<JobImportLog>(payload);
}

export async function downloadJobImportErrors(logId: EntityId): Promise<Blob> {
  return backendApi.blob(
    `job-descriptions/import/logs/${encodeURIComponent(String(logId))}/errors`,
  );
}

export function getJobImportStatusLabel(status: unknown): string {
  switch (String(status ?? "").toLowerCase()) {
    case "pending":
      return "En attente";
    case "validating":
      return "Validation en cours";
    case "processing":
      return "Traitement en cours";
    case "completed":
      return "Terminé";
    case "failed":
      return "Échoué";
    default:
      return String(status ?? "Inconnu") || "Inconnu";
  }
}

export function getJobImportStatusColor(status: unknown): string {
  switch (String(status ?? "").toLowerCase()) {
    case "pending":
      return "amber";
    case "validating":
    case "processing":
      return "blue";
    case "completed":
      return "green";
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

// ---------------------------------------------------------------------------
// Responsabilités & autorités (§5.3)
// ---------------------------------------------------------------------------

export async function fetchResponsibilities(siteId: string): Promise<Responsibility[]> {
  const query = new URLSearchParams({ per_page: "100" });
  if (siteId) query.set("site_id", siteId);
  const payload = await backendApi.request<unknown>(`responsibilities?${query.toString()}`);
  return listOf<Responsibility>(payload);
}

export async function exportResponsibilitiesPdf(siteId?: string | number): Promise<Blob> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(String(siteId))}` : "";
  return backendApi.blob(`responsibilities/export-pdf${suffix}`);
}

export async function exportResponsibilitiesDocx(siteId?: string | number): Promise<Blob> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(String(siteId))}` : "";
  return backendApi.blob(`responsibilities/export-docx${suffix}`);
}

export async function generateResponsibilityDraft(
  payload: Record<string, unknown>,
): Promise<unknown> {
  return backendApi.request("responsibilities/generate-draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Collaborateurs / personnel (registre users)
// ---------------------------------------------------------------------------

export async function fetchCollaborators(siteId: string): Promise<Collaborator[]> {
  const query = new URLSearchParams({ per_page: "100" });
  if (siteId) query.set("site_id", siteId);
  const payload = await backendApi.request<unknown>(`users?${query.toString()}`);
  return listOf<Collaborator>(payload);
}

export async function fetchPendingApprovals(siteId: string): Promise<Collaborator[]> {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<unknown>(`users/pending-approvals${suffix}`);
  return listOf<Collaborator>(payload);
}

export async function approveCollaborator(id: EntityId): Promise<unknown> {
  return backendApi.request(`users/${encodeURIComponent(String(id))}/approve`, { method: "POST" });
}

export async function rejectCollaborator(id: EntityId, reason: string): Promise<unknown> {
  return backendApi.request(`users/${encodeURIComponent(String(id))}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function toggleCollaboratorActive(id: EntityId): Promise<unknown> {
  return backendApi.request(`users/${encodeURIComponent(String(id))}/toggle-active`, {
    method: "POST",
  });
}

export async function exportPersonnelDocx(siteId: string): Promise<Blob> {
  return backendApi.blob(`users/export-docx?site_id=${encodeURIComponent(siteId)}`);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCurrentPolicy(siteId: string) {
  return useQuery({
    queryKey: [...POLICY_KEY, siteId],
    queryFn: () => fetchCurrentPolicy(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function usePolicyHistory(siteId: string) {
  return useQuery({
    queryKey: [...POLICY_HISTORY_KEY, siteId],
    queryFn: () => fetchPolicyHistory(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function usePublishedPolicy(siteId: string) {
  return useQuery({
    queryKey: [...POLICY_PUBLICATION_KEY, siteId],
    queryFn: () => fetchPublishedPolicy(siteId),
    enabled: true,
    staleTime: 30_000,
  });
}

export function usePolicyAcknowledgements(siteId: string, policyId?: EntityId) {
  return useQuery({
    queryKey: [...POLICY_ACKNOWLEDGEMENTS_KEY, siteId, policyId ?? "none"],
    queryFn: () => fetchPolicyAcknowledgements(policyId!),
    enabled: Boolean(siteId && policyId),
    staleTime: 30_000,
  });
}

export function useMyEthicsReports() {
  return useQuery({
    queryKey: [...ETHICS_REPORTS_KEY, "mine"],
    queryFn: fetchMyEthicsReports,
    staleTime: 30_000,
  });
}

export function useManagedEthicsReports(siteId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...ETHICS_REPORTS_KEY, "managed", siteId],
    queryFn: () => fetchManagedEthicsReports(siteId),
    enabled,
    staleTime: 15_000,
  });
}

export function useStrategicAxes(siteId: string) {
  return useQuery({
    queryKey: [...STRATEGIC_AXES_KEY, siteId],
    queryFn: () => fetchStrategicAxes(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useOrgChart(siteId: string) {
  return useQuery({
    queryKey: [...ORG_CHART_KEY, siteId],
    queryFn: () => fetchOrgChart(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useJobDescriptions(siteId: string) {
  return useQuery({
    queryKey: [...JOB_DESCRIPTIONS_KEY, siteId],
    queryFn: () => fetchJobDescriptions(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useJobCollaborators(siteId: string) {
  return useQuery({
    queryKey: [...JOB_COLLABORATORS_KEY, siteId],
    queryFn: () => fetchJobCollaborators(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useJobImportLogs(siteId: string, params?: FetchJobImportLogsParams) {
  return useQuery({
    queryKey: [...JOB_IMPORT_LOGS_KEY, siteId, params ?? null],
    queryFn: () => fetchJobImportLogs(params),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useResponsibilities(siteId: string) {
  return useQuery({
    queryKey: [...RESPONSIBILITIES_KEY, siteId],
    queryFn: () => fetchResponsibilities(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function useCollaborators(siteId: string) {
  return useQuery({
    queryKey: [...COLLABORATORS_KEY, siteId],
    queryFn: () => fetchCollaborators(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

export function usePendingApprovals(siteId: string) {
  return useQuery({
    queryKey: [...COLLABORATORS_KEY, "pending-approvals", siteId],
    queryFn: () => fetchPendingApprovals(siteId),
    enabled: true,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function usePolicyMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...POLICY_KEY, siteId] });
    void client.invalidateQueries({ queryKey: [...POLICY_HISTORY_KEY, siteId] });
    void client.invalidateQueries({ queryKey: [...POLICY_PUBLICATION_KEY, siteId] });
    void client.invalidateQueries({ queryKey: [...POLICY_ACKNOWLEDGEMENTS_KEY, siteId] });
  };
  return {
    save: useMutation({
      mutationFn: (input: SaveInput) =>
        backendApi.request(input.id ? `qhse-policies/${input.id}` : "qhse-policies", {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
    submit: useMutation({
      mutationFn: (id: string) =>
        backendApi.request(`qhse-policies/${id}/submit`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    validate: useMutation({
      mutationFn: (id: string) =>
        backendApi.request(`qhse-policies/${id}/validate`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    acknowledge: useMutation({
      mutationFn: (input: { policyId: string; answers: Record<string, string> }) =>
        backendApi.request<PolicyAcknowledgement & { message: string }>(
          `qhse-policies/${encodeURIComponent(input.policyId)}/acknowledge`,
          {
            method: "POST",
            body: JSON.stringify({ answers: input.answers }),
          },
        ),
      onSuccess: invalidate,
    }),
  };
}

export function useEthicsReportMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...ETHICS_REPORTS_KEY] });
  };
  return {
    submit: useMutation({
      mutationFn: (payload: Record<string, unknown>) =>
        backendApi.request<EthicsReport>("ethics-reports", {
          method: "POST",
          body: JSON.stringify({ ...payload, ...(siteId ? { site_id: Number(siteId) } : {}) }),
        }),
      onSuccess: invalidate,
    }),
    track: useMutation({
      mutationFn: (trackingCode: string) =>
        backendApi.request<EthicsReport>("ethics-reports/track", {
          method: "POST",
          body: JSON.stringify({ tracking_code: trackingCode }),
        }),
    }),
    update: useMutation({
      mutationFn: (input: {
        id: string;
        status: EthicsReportStatus;
        handling_notes: string;
        public_update: string;
      }) =>
        backendApi.request<EthicsReport>(`ethics-reports/${encodeURIComponent(input.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: input.status,
            handling_notes: input.handling_notes,
            public_update: input.public_update || null,
          }),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useCultureSurveyMutations(siteId: string) {
  const client = useQueryClient();
  const key = ["qhse-culture-survey", siteId] as const;
  return {
    submit: useMutation({
      mutationFn: (answers: CultureSurveyAnswers) =>
        backendApi.request<{ message: string; recorded_with_user_identity: false }>(
          "qhse-culture-survey",
          {
            method: "POST",
            body: JSON.stringify({ ...answers, site_id: Number(siteId) }),
          },
        ),
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: key });
      },
    }),
  };
}

export function useCultureSurveySummary(siteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["qhse-culture-survey", siteId],
    queryFn: () => fetchCultureSurveySummary(siteId),
    enabled: enabled && Boolean(siteId),
    staleTime: 60_000,
  });
}

export function useOrgChartMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: [...ORG_CHART_KEY, siteId] });
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const body = new FormData();
        body.append("file", file);
        body.append("site_id", siteId);
        return backendApi.request<OrgChart>("org-chart/upload", { method: "POST", body });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => backendApi.request(`org-chart/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useJobDescriptionMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...JOB_DESCRIPTIONS_KEY, siteId] });
    void client.invalidateQueries({ queryKey: [...JOB_COLLABORATORS_KEY, siteId] });
  };
  return {
    save: useMutation({
      mutationFn: (input: SaveInput) =>
        backendApi.request(input.id ? `job-descriptions/${input.id}` : "job-descriptions", {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        backendApi.request(`job-descriptions/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    signEmployee: useMutation({
      mutationFn: (input: { id: string; payload?: Record<string, unknown> | undefined }) =>
        backendApi.request(`job-descriptions/${input.id}/sign-employee`, {
          method: "POST",
          body: JSON.stringify(input.payload ?? {}),
        }),
      onSuccess: invalidate,
    }),
    signCeo: useMutation({
      mutationFn: (input: { id: string; payload?: Record<string, unknown> | undefined }) =>
        backendApi.request(`job-descriptions/${input.id}/sign-ceo`, {
          method: "POST",
          body: JSON.stringify(input.payload ?? {}),
        }),
      onSuccess: invalidate,
    }),
    downloadPdf: useMutation({
      mutationFn: async (id: string) => {
        const blob = await downloadJobDescriptionPdf(id);
        downloadBlob(blob, `fiche-poste-${id}.pdf`);
        return blob;
      },
    }),
    generateDraft: useMutation({
      mutationFn: (input: { id: string; payload: Record<string, unknown> }) =>
        generateJobDraft(input.id, input.payload),
      onSuccess: invalidate,
    }),
  };
}

export function useJobImportMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...JOB_DESCRIPTIONS_KEY, siteId] });
    void client.invalidateQueries({ queryKey: [...JOB_IMPORT_LOGS_KEY, siteId] });
  };
  return {
    upload: useMutation({
      mutationFn: (input: { file: File; mode: JobImportMode }) =>
        uploadJobImport(input.file, input.mode),
      onSuccess: invalidate,
    }),
    confirm: useMutation({
      mutationFn: (input: { importId: EntityId; mode: JobImportMode }) =>
        confirmJobImport(input.importId, input.mode),
      onSuccess: invalidate,
    }),
  };
}

export function useResponsibilityMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () =>
    client.invalidateQueries({ queryKey: [...RESPONSIBILITIES_KEY, siteId] });
  return {
    save: useMutation({
      mutationFn: (input: SaveInput) =>
        backendApi.request(input.id ? `responsibilities/${input.id}` : "responsibilities", {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        backendApi.request(`responsibilities/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useCollaboratorMutations(siteId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: COLLABORATORS_KEY });
  void siteId;
  return {
    save: useMutation({
      mutationFn: (input: SaveInput) =>
        backendApi.request(input.id ? `users/${input.id}` : "users", {
          method: input.id ? "PUT" : "POST",
          body: JSON.stringify(input.payload),
        }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => backendApi.request(`users/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (id: string) => approveCollaborator(id),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: (input: { id: string; reason: string }) =>
        rejectCollaborator(input.id, input.reason),
      onSuccess: invalidate,
    }),
    toggleActive: useMutation({
      mutationFn: (id: string) => toggleCollaboratorActive(id),
      onSuccess: invalidate,
    }),
  };
}
