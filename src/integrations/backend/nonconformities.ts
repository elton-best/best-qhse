import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackendApiError, backendApi } from "@/integrations/backend/client";

/**
 * Non-conformités, actions correctives et amélioration continue (ISO 14001:2026 §10).
 * Contrats Laravel : NonConformityHandlingController, NonConformityController (vérification, clôture), ImprovementOpportunityController.
 */

export const REPORT_SOURCES = [
  { value: "audit", label: "Audit" }, { value: "inspection", label: "Inspection" }, { value: "compliance_evaluation", label: "Évaluation de conformité" },
  { value: "complaint", label: "Plainte" }, { value: "incident", label: "Incident" }, { value: "report", label: "Signalement" },
] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number]["value"];
export type Severity = "minor" | "major" | "critical";

export type Nc = {
  id: number; ref: string; title: string; description: string; status: string; severity: Severity; report_source: ReportSource | null; location: string | null;
  environmental_impact: boolean; immediate_action: string | null; impact_mitigation: string | null; corrective_decision: "required" | "not_required" | null;
  decision_justification: string | null; root_cause_method: "five_why" | "cause_effect" | null; is_recurrent: boolean; deadline: string | null; escalation_level: number;
  effectiveness_verified: boolean | null; sme_update_required: boolean; sme_update_done: boolean; sme_update_note: string | null; photos: { name: string }[] | null;
  five_whys: { why: string; answer: string }[] | null; created_at: string; resolution_date: string | null;
};
export type Similar = { id: number; ref: string; title: string; status: string; date: string };
export type NcDashboard = {
  total: number; open: number; closed: number; overdue: number; average_closure_days: number | null; recurrent: number; recurrence_rate: number | null;
  effectiveness_pending: number; not_required: number; by_source: Record<string, number>; by_severity: Record<string, number>; by_site: { site: string; total: number; open: number }[];
};
export type Suggestion = {
  id: number; ref: string; title: string; description: string; status: "pending" | "in_progress" | "adopted" | "rejected"; impact: string;
  source_type: string; source_ref: string | null; decision_note: string | null; site?: { name: string } | null;
};
export type OpportunitySummary = { total: number; by_status: Record<string, number>; by_source: Record<string, number>; adopted_done: number; adopted_open: number; pending: number };
export type Declaration = {
  report_source: ReportSource; description: string; location?: string; occurred_at?: string; severity?: Severity; environmental_impact?: boolean; client_uuid?: string;
};

type Page<T> = { data: T[] };
const KEY = ["nonconformities"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const useNcList = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Page<Nc>>(`non-conformities?per_page=100${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
    enabled, staleTime: 10_000,
  });

export const useSimilar = (id: number | null, enabled: boolean) =>
  useQuery({ queryKey: [...KEY, "similar", id], queryFn: async () => (await backendApi.request<Page<Similar>>(`non-conformities/${id}/similar`)).data, enabled: id !== null && enabled });

export const useNcDashboard = (siteId: string | undefined) =>
  useQuery({ queryKey: [...KEY, "dashboard", siteId ?? ""], queryFn: async () => (await backendApi.request<{ data: NcDashboard }>(`non-conformities/dashboard${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`)).data });

export const useSuggestions = (siteId: string | undefined) =>
  useQuery({
    queryKey: [...KEY, "suggestions", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Page<Suggestion>>(`improvement-suggestions?scope=site&per_page=100${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
  });

export const useOpportunitySummary = () =>
  useQuery({ queryKey: [...KEY, "summary"], queryFn: async () => (await backendApi.request<{ data: OpportunitySummary }>("improvement-suggestions/summary")).data });

export function useNcMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    declare: run(({ input, photos }: { input: Declaration; photos?: File[] }) => {
      if (!photos?.length) return backendApi.request<{ data: Nc }>("non-conformities/quick-declare", json("POST", input));
      const body = new FormData();
      Object.entries(input).forEach(([key, value]) => value !== undefined && body.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value)));
      photos.forEach((photo) => body.append("photos[]", photo));
      return backendApi.request<{ data: Nc }>("non-conformities/quick-declare", { method: "POST", body });
    }),
    immediate: run(({ id, ...input }: { id: number; immediate_action: string; consequences_treatment?: string; impact_mitigation?: string }) => backendApi.request(`non-conformities/${id}/immediate-treatment`, json("PUT", input))),
    decide: run(({ id, ...input }: { id: number; decision: "required" | "not_required"; justification?: string }) => backendApi.request(`non-conformities/${id}/decision`, json("POST", input))),
    rootCause: run(({ id, ...input }: { id: number; method: "five_why" | "cause_effect"; root_cause: string; five_whys?: { why: string; answer: string }[]; cause_effect?: Record<string, string[]> }) =>
      backendApi.request(`non-conformities/${id}/root-cause`, json("PUT", input))),
    plan: run(({ id, ...input }: { id: number; responsible_id: number; deadline: string; description: string; resources_needed?: string; sme_update_required?: boolean; sme_update_note?: string }) =>
      backendApi.request(`non-conformities/${id}/corrective-plan`, json("POST", input))),
    smeDone: run((id: number) => backendApi.request(`non-conformities/${id}/sme-update-done`, json("POST"))),
    verify: run(({ id, ...input }: { id: number; is_effective: boolean; notes?: string }) => backendApi.request(`non-conformities/${id}/verify`, json("POST", input))),
    close: run((id: number) => backendApi.request(`non-conformities/${id}/close`, json("POST"))),
    decideSuggestion: run(({ id, ...input }: { id: number; decision: "adopt" | "reject"; note: string; responsible_id?: number; deadline?: string }) => backendApi.request(`improvement-suggestions/${id}/decide`, json("POST", input))),
    fromSource: run((input: { source_type: "audit_finding" | "review_decision" | "indicator"; source_id: number }) => backendApi.request("improvement-suggestions/from-source", json("POST", input))),
    addSuggestion: run((input: { site_id: string; title: string; description: string; impact: "low" | "medium" | "high" }) => backendApi.request("improvement-suggestions", json("POST", input))),
  };
}

export const isOffline = (error: unknown): boolean => error instanceof BackendApiError && error.status === 0;

export type BatchResult = { client_uuid: string; status: "created" | "exists" | "rejected"; message?: string; ref?: string };
export const syncDeclarations = async (items: Declaration[]): Promise<BatchResult[]> => (await backendApi.request<Page<BatchResult>>("non-conformities/quick-declare/batch", json("POST", { items }))).data;
