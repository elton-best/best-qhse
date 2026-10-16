import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * DUERP — Code du travail R.4121-1 à R.4121-4, méthode INRS, ISO 45001 §6.1.2.
 * Contrat Laravel : DuerpController (document, risques, unités, familles, échelles, versions, conformité).
 */

export type WorkflowStatus = "draft" | "submitted_by_rq" | "approved_by_ceo";
export type RiskLevel = "Faible" | "Moyen" | "Significatif";
export type ActionStatus = "en_continu" | "en_cours" | "realise";
export type RevisionReason = "annual" | "significant_change" | "new_information" | "accident" | "other";

export const REVISION_REASONS: { value: RevisionReason; label: string }[] = [
  { value: "annual", label: "Mise à jour annuelle" },
  { value: "significant_change", label: "Aménagement important des conditions de travail" },
  { value: "new_information", label: "Information nouvelle sur un risque" },
  { value: "accident", label: "Suite à un accident du travail" },
  { value: "other", label: "Autre motif" },
];

export type Participant = { name: string; role?: string | undefined };

export type Duerp = {
  id: number;
  site_id: number;
  title: string | null;
  version: string | null;
  workflow_status: WorkflowStatus;
  is_current: boolean;
  evaluation_date: string;
  next_evaluation_date: string | null;
  revision_reason: string | null;
  previous_version_id: number | null;
  participants: Participant[] | null;
  consultation_notes: string | null;
  methodology_notes: string | null;
  update_required: boolean;
  update_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  submission_notes: string | null;
  site?: { id: number; name: string } | null;
  approver?: { id: number; name: string } | null;
  submitter?: { id: number; name: string } | null;
  dangers_count?: number;
  work_units_count?: number;
  work_units?: WorkUnit[];
  dangers?: Danger[];
};

export type WorkUnit = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  headcount: number | null;
  duerp_id: number | null;
  dangers_count?: number;
};

export type Danger = {
  id: number;
  duerp_id: number;
  work_unit_id: number | null;
  risk_family_id: number | null;
  work_unit: string | null;
  inrs_family: string | null;
  activity: string | null;
  dangerous_situation: string | null;
  identified_risks: string | null;
  consequences: string | null;
  gravity: number | null;
  frequency: number | null;
  mitigation_level: string | null;
  raw_risk_score: number | null;
  raw_risk_level: RiskLevel | null;
  assessed_risk_score: number | null;
  assessed_risk_level: RiskLevel | null;
  residual_gravity: number | null;
  residual_frequency: number | null;
  residual_risk_score: number | null;
  residual_risk_level: RiskLevel | null;
  exposed_workers_count: number | null;
  existing_preventions: string | null;
  prevention_actions: string | null;
  prevention_type: string | null;
  responsible_name: string | null;
  deadline: string | null;
  action_status: ActionStatus | null;
  action_done_at: string | null;
  observations: string | null;
  needs_review: boolean;
  review_reason: string | null;
};

export type DangerInput = Partial<{
  work_unit_id: number | null;
  work_unit: string | null;
  risk_family_id: number | null;
  inrs_family: string | null;
  activity: string | null;
  dangerous_situation: string;
  identified_risks: string;
  consequences: string | null;
  gravity: number;
  frequency: number;
  mitigation_level: number;
  exposed_workers_count: number | null;
  existing_preventions: string | null;
  prevention_actions: string | null;
  prevention_type: string | null;
  responsible_name: string | null;
  deadline: string | null;
  action_status: ActionStatus | null;
  action_done_at: string | null;
  residual_gravity: number | null;
  residual_frequency: number | null;
  residual_mitigation_level: number | null;
  observations: string | null;
  confirm_reviewed: boolean;
}>;

export type ScaleRow = { level: number; label: string; score_value: number; description?: string | null };
export type Scales = { gravity: ScaleRow[]; frequency: ScaleRow[]; maitrise: ScaleRow[] };
export type RiskFamily = { id: number; code: string | null; name: string; enterprise_id: number | null };

export type ConformityCheck = { code: string; label: string; ok: boolean; blocking: boolean; detail: string | null };
export type Conformity = {
  ready: boolean;
  checks: ConformityCheck[];
  summary: {
    dangers: number; units: number; by_level: Record<RiskLevel, number>; residual_by_level: Record<RiskLevel, number>;
    actions_overdue: number; actions_done: number; families_missing: string[];
  };
};

type Data<T> = { success?: boolean; data: T };
const KEY = ["duerp"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const useDuerpList = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Data<Duerp[]>>(`duerp${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
    enabled,
    staleTime: 10_000,
  });

export const useDuerp = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: async () => (await backendApi.request<Data<Duerp>>(`duerp/${id}`)).data,
    enabled: id !== null,
  });

export const useConformity = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "conformity", id],
    queryFn: async () => (await backendApi.request<Data<Conformity>>(`duerp/${id}/conformity`)).data,
    enabled: id !== null,
  });

export const useVersions = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "versions", id],
    queryFn: async () => (await backendApi.request<Data<Duerp[]>>(`duerp/${id}/versions`)).data,
    enabled: id !== null,
  });

export const useScales = () =>
  useQuery({
    queryKey: [...KEY, "scales"],
    queryFn: async () => {
      const response = await backendApi.request<Data<Scales> & { is_custom: boolean }>("duerp-scoring-scales");
      return { scales: response.data, isCustom: response.is_custom };
    },
    staleTime: 60_000,
  });

export const useRiskFamilies = () =>
  useQuery({
    queryKey: [...KEY, "families"],
    queryFn: async () => (await backendApi.request<Data<RiskFamily[]>>("duerp-risk-families")).data,
    staleTime: 60_000,
  });

export function useDuerpMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ["management-system-overview"] });
  };
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    create: run((input: { site_id: string; evaluation_date?: string; next_evaluation_date?: string; participants?: Participant[]; consultation_notes?: string }) =>
      backendApi.request<Data<Duerp>>("duerp", json("POST", input))),
    update: run(({ id, ...input }: { id: number; evaluation_date?: string; next_evaluation_date?: string; participants?: Participant[]; consultation_notes?: string | null; methodology_notes?: string | null }) =>
      backendApi.request<Data<Duerp>>(`duerp/${id}`, json("PUT", input))),
    remove: run((id: number) => backendApi.request(`duerp/${id}`, json("DELETE"))),
    submit: run((id: number) => backendApi.request(`duerp/${id}/submit`, json("POST"))),
    approve: run(({ id, notes }: { id: number; notes?: string }) => backendApi.request(`duerp/${id}/approve`, json("POST", { notes }))),
    reject: run(({ id, reason }: { id: number; reason: string }) => backendApi.request(`duerp/${id}/reject`, json("POST", { reason }))),
    revise: run(({ id, revision_reason, notes }: { id: number; revision_reason: RevisionReason; notes?: string }) =>
      backendApi.request<Data<Duerp>>(`duerp/${id}/revise`, json("POST", { revision_reason, notes }))),
    saveDanger: run(({ duerpId, id, input }: { duerpId: number; id?: number | undefined; input: DangerInput }) =>
      backendApi.request<Data<Danger>>(id ? `duerp/${duerpId}/dangers/${id}` : `duerp/${duerpId}/dangers`, json(id ? "PUT" : "POST", input))),
    removeDanger: run(({ duerpId, id }: { duerpId: number; id: number }) => backendApi.request(`duerp/${duerpId}/dangers/${id}`, json("DELETE"))),
    saveUnit: run(({ id, input }: { id?: number | undefined; input: { name: string; code?: string | null; headcount?: number | null; description?: string | null; duerp_id?: number; site_id?: string } }) =>
      backendApi.request<Data<WorkUnit>>(id ? `duerp-work-units/${id}` : "duerp-work-units", json(id ? "PUT" : "POST", input))),
    removeUnit: run((id: number) => backendApi.request(`duerp-work-units/${id}`, json("DELETE"))),
    saveScales: run((scales: Scales) =>
      backendApi.request("duerp-scoring-scales", json("PUT", {
        gravity: scales.gravity.map(({ level, label, score_value }) => ({ level, label, score_value })),
        frequency: scales.frequency.map(({ level, label, score_value }) => ({ level, label, score_value })),
        maitrise: scales.maitrise.map(({ level, label, score_value }) => ({ level, label, score_value })),
      }))),
  };
}

export const downloadDuerpExport = (duerpId: number): Promise<Blob> => backendApi.blob(`duerp/export-xlsx?duerp_id=${duerpId}`);
