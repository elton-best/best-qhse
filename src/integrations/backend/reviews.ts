import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Revue de direction (ISO 14001:2026 §9.3).
 * Contrats Laravel : ManagementReviewController (CRUD) et ManagementReviewIsoController (planification, dossier, sorties, signature).
 */

export type ReviewRow = { id: number; ref: string | null; title: string | null; status: string; scheduled_date: string | null; actual_date: string | null; site?: { name: string } | null };
export type Schedule = {
  interval_months: number; state: "never_done" | "overdue" | "due_soon" | "planned" | "ok"; next_due: string | null;
  last: { id: number; ref: string; date: string } | null; planned: { id: number; ref: string; title: string; scheduled_date: string }[];
};
export type Assessment = "adequate" | "partly" | "inadequate";
export type Conclusions = Record<"suitability" | "adequacy" | "effectiveness", { assessment: Assessment; comment: string }>;
export type Decision = {
  id: number; output_type: string; text: string; not_applicable: boolean; due_date: string | null;
  responsible?: { id: number; name: string } | null; action?: { id: number; ref: string; status: string; deadline: string | null } | null;
};
export type Dossier = {
  generated_at: string;
  previous_actions: { previous_review: { ref: string; date: string } | null; done: number; open: number; overdue: number; items: { text: string; action_ref: string | null; status: string | null }[] };
  changes: {
    significant_aspects: { total: number; new_12m: number; to_reassess: number }; obligations: { new_or_modified_12m: number; to_analyze: number };
    stakeholders_new_12m: number; risks_opportunities: { risks: number; opportunities: number; high_criticality: number };
    system_changes: { total_12m: number; unplanned: number; in_progress: number };
  };
  objectives: { total: number; achieved: number; not_achieved: number; rate: number | null; not_achieved_items: { title: string; progress: number | null; deadline: string | null }[] };
  trends: {
    nonconformities: { total_12m: number; open: number; recurring: number };
    monitoring: { by_state: Record<string, number>; alerts: { indicator: string; last_value: number | null; unit: string }[]; instruments_not_valid: number };
    compliance: { applicable: number; by_status: Record<string, number> };
    audits: { completed_12m: number; findings_by_type: Record<string, number>; open_nonconformities: number };
  };
  resources: { resources_refused_12m: number; instruments_not_valid: number; emergency_resources_defective: number; emergency_resources_overdue: number };
  communications: { complaints_12m: number; complaints_open: number; average_satisfaction: number | null };
  improvement: { suggestions_12m: number; audit_opportunities: { title: string; type: string }[] };
};
export type Workspace = {
  review: { id: number; ref: string | null; title: string | null; status: string; actual_date: string | null };
  dossier: Dossier | null; sessions: { id: number; held_on: string; notes: string; attendees: string[] | null }[]; conclusions: Conclusions | null;
  decisions: Decision[]; output_types: Record<string, string>; readiness: string[];
  record: { signed_at: string; signed_by: string | null; sha256: string; intact: boolean } | null;
};

type Data<T> = { data: T };
const KEY = ["management-review"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const useReviews = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", siteId ?? ""],
    queryFn: async () => (await backendApi.request<{ data: ReviewRow[] }>(`management-reviews${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
    enabled,
  });

export const useSchedule = (siteId: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...KEY, "schedule", siteId ?? ""], queryFn: async () => (await backendApi.request<Data<Schedule>>(`management-reviews/schedule${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`)).data, enabled });

export const useWorkspace = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "workspace", id], queryFn: async () => (await backendApi.request<Data<Workspace>>(`management-reviews/${id}/workspace`)).data, enabled: id !== null });

export function useReviewMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    create: run((input: { site_id: string; title: string; scheduled_date: string; year: number }) => backendApi.request<Data<{ id: number }>>("management-reviews", json("POST", input))),
    dossier: run((id: number) => backendApi.request(`management-reviews/${id}/dossier`, json("POST"))),
    addSession: run(({ id, ...input }: { id: number; held_on: string; notes: string; attendees?: string[] }) => backendApi.request(`management-reviews/${id}/sessions`, json("POST", input))),
    saveConclusions: run(({ id, conclusions }: { id: number; conclusions: Conclusions }) => backendApi.request(`management-reviews/${id}/conclusions`, json("PUT", conclusions))),
    addDecision: run(({ id, ...input }: { id: number; output_type: string; text: string; not_applicable?: boolean; responsible_id?: number; due_date?: string }) =>
      backendApi.request(`management-reviews/${id}/decisions`, json("POST", input))),
    removeDecision: run(({ id, decisionId }: { id: number; decisionId: number }) => backendApi.request(`management-reviews/${id}/decisions/${decisionId}`, json("DELETE"))),
    sign: run((id: number) => backendApi.request(`management-reviews/${id}/sign`, json("POST"))),
  };
}
