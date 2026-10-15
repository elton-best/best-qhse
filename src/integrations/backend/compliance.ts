import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Registre de conformité unifié (ISO 14001:2026 §6.1.3 et §9.1.2).
 * Contrats Laravel : ComplianceObligationController (registre) et ComplianceRegisterController
 * (applicabilité, évaluations, veille, accords, échéances, tableau de bord).
 */

export type SourceType =
  | "law" | "decree" | "order" | "permit" | "licence" | "court_decision"
  | "contract" | "agreement" | "voluntary_code" | "sector_standard";

export type ComplianceStatus = "compliant" | "partial" | "non_compliant" | "not_applicable" | "not_evaluated";
export type Frequency = "monthly" | "quarterly" | "semiannual" | "annual" | "on_demand";

export type Obligation = {
  id: number;
  ref: string;
  title: string | null;
  source_type: SourceType;
  authority: string | null;
  source_url: string | null;
  site_id: number | null;
  aspect: { id: number | null; site_id: number | null; name: string | null; norms: { id: number; code: string; name: string }[] };
  regulatory_reference: string;
  description: string | null;
  applicable_requirement: string | null;
  watch_source: string | null;
  entry_into_force_date: string | null;
  regulatory_change_status: "existing" | "new" | "modified" | null;
  validity_status: "in_force" | "obsolete" | null;
  compliance_status: ComplianceStatus;
  is_applicable: boolean | null;
  applicability_justification: string | null;
  permit_number: string | null;
  expiry_date: string | null;
  last_evaluation_date: string | null;
  next_evaluation_date: string | null;
  evaluation_frequency: Frequency | null;
  responsible_id: number | null;
  responsible_name: string | null;
  analysis_status: "to_analyze" | "analyzed";
  analysis_note: string | null;
  agreement_parent_id: number | null;
  comments: string | null;
  environmental_aspects: { id: number; aspect_number: string | null; aspect: string }[];
  actions: { id: number; title: string; status: string; due_date: string | null; responsible_name: string | null }[];
};

export type ObligationInput = {
  site_id?: string | number | undefined;
  aspect_name?: string | undefined;
  aspect_id?: number | undefined;
  title?: string | null | undefined;
  source_type?: SourceType | undefined;
  authority?: string | null | undefined;
  source_url?: string | null | undefined;
  regulatory_reference?: string | undefined;
  description?: string | null | undefined;
  applicable_requirement?: string | null | undefined;
  watch_source?: string | null | undefined;
  entry_into_force_date?: string | null | undefined;
  regulatory_change_status?: "existing" | "new" | "modified" | null | undefined;
  validity_status?: "in_force" | "obsolete" | null | undefined;
  responsible_id?: number | null | undefined;
  evaluation_frequency?: Frequency | null | undefined;
  permit_number?: string | null | undefined;
  expiry_date?: string | null | undefined;
  comments?: string | null | undefined;
  environmental_aspect_ids?: number[] | undefined;
};

export type ObligationFilters = {
  site_id?: string | undefined;
  q?: string | undefined;
  source_type?: string | undefined;
  compliance_status?: string | undefined;
  is_applicable?: string | undefined;
  analysis_status?: string | undefined;
};

export type Evaluation = {
  id: number;
  evaluated_at: string;
  result: "compliant" | "partial" | "non_compliant";
  method: string | null;
  evidence: string | null;
  evidence_path: string | null;
  external: boolean;
  external_body: string | null;
  comment: string | null;
  gap_status: "none" | "nc_opened" | "gap_treated";
  nonconformity_id: number | null;
  evaluator?: { id: number; name: string } | null;
};

export type EvaluationInput = {
  result: "compliant" | "partial" | "non_compliant";
  evaluated_at?: string;
  method?: string;
  evidence?: string;
  evidence_file?: File | null;
  external?: boolean;
  external_body?: string;
  comment?: string;
  gap_already_treated?: boolean;
};

export type ComplianceDashboard = {
  total: number;
  applicable: number;
  not_applicable: number;
  to_qualify: number;
  evaluated: number;
  compliance_rate: number | null;
  by_status: Record<string, number>;
  never_evaluated: ObligationSummary[];
  overdue_evaluations: ObligationSummary[];
  due_in_30_days: number;
  to_analyze: ObligationSummary[];
  expirations: Record<"expired" | "d7" | "d30" | "d90", number>;
  by_site: GroupRow[];
  by_domain: GroupRow[];
  linked_aspects_at_risk: number;
};

export type GroupRow = { name: string; total: number; applicable: number; non_compliant: number; rate: number | null };

export type ObligationSummary = {
  id: number;
  ref: string;
  title: string;
  source_type: SourceType;
  compliance_status: ComplianceStatus;
  next_evaluation_date: string | null;
  expiry_date: string | null;
  days_left?: number;
  bucket?: "expired" | "d7" | "d30" | "d90" | "later" | null;
};

type Envelope<T> = { success?: boolean; data: T; meta?: { current_page: number; last_page: number; per_page: number; total: number } };

const KEY = ["compliance-register"] as const;

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const useObligations = (filters: ObligationFilters, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: async () => (await backendApi.request<Envelope<Obligation[]>>(`compliance-obligations${query({ per_page: "200", ...filters })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useComplianceDashboard = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "dashboard", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Envelope<ComplianceDashboard>>(`compliance-obligations/dashboard${query({ site_id: siteId })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useExpirations = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "expirations", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Envelope<ObligationSummary[]>>(`compliance-obligations/expirations${query({ site_id: siteId })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useEvaluations = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "evaluations", id],
    queryFn: async () => (await backendApi.request<Envelope<Evaluation[]>>(`compliance-obligations/${id}/evaluations`)).data,
    enabled: id !== null,
  });

export function useComplianceMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number | undefined; input: ObligationInput }) =>
        backendApi.request<Envelope<Obligation>>(id ? `compliance-obligations/${id}` : "compliance-obligations", json(id ? "PUT" : "POST", input)),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => backendApi.request(`compliance-obligations/${id}`, json("DELETE")),
      onSuccess: refresh,
    }),
    qualify: useMutation({
      mutationFn: ({ id, isApplicable, justification }: { id: number; isApplicable: boolean; justification: string }) =>
        backendApi.request(`compliance-obligations/${id}/applicability`, json("POST", { is_applicable: isApplicable, justification })),
      onSuccess: refresh,
    }),
    evaluate: useMutation({
      mutationFn: async ({ id, input }: { id: number; input: EvaluationInput }) => {
        const body = new FormData();
        Object.entries(input).forEach(([key, value]) => {
          if (value === undefined || value === null || value === "") return;
          body.append(key, value instanceof File ? value : typeof value === "boolean" ? (value ? "1" : "0") : String(value));
        });
        return backendApi.request<Envelope<{ evaluation: Evaluation; obligation: ObligationSummary }>>(`compliance-obligations/${id}/evaluations`, { method: "POST", body });
      },
      onSuccess: () => {
        void refresh();
        void client.invalidateQueries({ queryKey: ["management-system-overview"] });
      },
    }),
    analyze: useMutation({
      mutationFn: ({ id, note }: { id: number; note: string }) =>
        backendApi.request<Envelope<{ aspects_flagged: number }>>(`compliance-obligations/${id}/analysis`, json("POST", { note })),
      onSuccess: () => {
        void refresh();
        void client.invalidateQueries({ queryKey: ["aes"] });
      },
    }),
    agreementPlan: useMutation({
      mutationFn: ({ id, ...input }: { id: number; title: string; authority?: string; expiry_date?: string; actions: { title: string; due_date?: string }[] }) =>
        backendApi.request(`compliance-obligations/${id}/agreement-plan`, json("POST", input)),
      onSuccess: refresh,
    }),
  };
}

export const downloadComplianceTemplate = (): Promise<Blob> => backendApi.blob("compliance-obligations/template");
export const downloadComplianceExport = (siteId: string | undefined): Promise<Blob> =>
  backendApi.blob(`compliance-obligations/export-xlsx${query({ site_id: siteId })}`);
export const downloadEvidence = (evaluationId: number): Promise<Blob> => backendApi.blob(`compliance-evaluations/${evaluationId}/evidence`);

export async function importComplianceRegister(file: File, siteId: string): Promise<unknown> {
  const body = new FormData();
  body.append("file", file);
  body.append("site_id", siteId);
  return backendApi.request("compliance-obligations/import-xlsx", { method: "POST", body });
}
