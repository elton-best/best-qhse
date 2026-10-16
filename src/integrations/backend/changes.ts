import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Gestion des changements (ISO 14001:2026 §6.3 et §8.1).
 * Contrat Laravel : ManagementChangeController (fiche, analyse d'impact, décision, tâches, revue).
 */

export const CHANGE_TYPES = [
  { value: "new_product", label: "Nouveau produit" },
  { value: "new_service", label: "Nouveau service" },
  { value: "new_process", label: "Nouveau processus" },
  { value: "new_equipment", label: "Nouvel équipement" },
  { value: "new_site", label: "Nouveau site" },
  { value: "obligation_change", label: "Évolution d'une obligation" },
  { value: "knowledge_technology", label: "Évolution des connaissances ou technologies" },
  { value: "material_specification", label: "Modification de spécification matière" },
  { value: "merger_divestment", label: "Fusion ou cession" },
  { value: "personnel_supplier", label: "Changement de personnel ou de fournisseur" },
  { value: "activity_interruption", label: "Interruption d'activité" },
] as const;

export const IMPACT_DIMENSIONS = [
  { key: "aspects", label: "Aspects environnementaux" },
  { key: "obligations", label: "Obligations de conformité" },
  { key: "risks", label: "Risques et opportunités" },
  { key: "competences", label: "Compétences" },
  { key: "documents", label: "Informations documentées" },
  { key: "emergencies", label: "Situations d'urgence" },
  { key: "suppliers", label: "Fournisseurs et prestataires" },
] as const;

export type ChangeStatus = "requested" | "in_analysis" | "awaiting_approval" | "approved" | "rejected" | "implementing" | "implemented" | "closed";
export type ImpactAnalysis = Record<string, { impacted: boolean; note: string }>;
export type ResourcesRequested = { human?: string; financial?: string; technical?: string; infrastructure?: string };

export type ChangeTask = {
  id: number;
  change_id: number;
  dimension: string;
  title: string;
  status: "todo" | "done";
  due_date: string | null;
  done_at: string | null;
  done_note: string | null;
  responsible?: { id: number; name: string } | null;
  change?: { id: number; ref: string; title: string; status: ChangeStatus };
};

export type Change = {
  id: number;
  ref: string;
  title: string;
  site_id: number;
  change_type: string;
  origin: "internal" | "external";
  duration: "temporary" | "permanent";
  is_planned: boolean;
  description: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  responsible_id: number | null;
  impact_analysis: ImpactAnalysis | null;
  affected_aspect_ids: number[] | null;
  resources_requested: ResourcesRequested | null;
  resources_decision: "granted" | "refused" | null;
  resources_decision_note: string | null;
  unplanned_consequences: string | null;
  mitigation_measures: string | null;
  status: ChangeStatus;
  decision_note: string | null;
  decided_at: string | null;
  review_result: "effective" | "partial" | "ineffective" | null;
  review_note: string | null;
  responsible?: { id: number; name: string } | null;
  decider?: { id: number; name: string } | null;
  tasks?: ChangeTask[];
};

export type ChangeInput = {
  site_id?: string | undefined;
  title: string;
  change_type: string;
  origin?: string | undefined;
  duration?: string | undefined;
  is_planned?: boolean | undefined;
  description?: string | null | undefined;
  planned_start_date?: string | null | undefined;
  planned_end_date?: string | null | undefined;
  unplanned_consequences?: string | null | undefined;
  mitigation_measures?: string | null | undefined;
};

export type PeriodSummary = {
  from: string;
  to: string;
  total: number;
  unplanned: number;
  by_status: Record<string, number>;
  by_dimension: Record<string, number>;
};

const KEY = ["management-changes"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const useChanges = (siteId: string | undefined, status: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", siteId ?? "", status ?? ""],
    queryFn: async () => (await backendApi.request<{ data: Change[] }>(`management-changes${query({ site_id: siteId, status, per_page: "200" })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useChange = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "one", id],
    queryFn: async () => backendApi.request<Change>(`management-changes/${id}`),
    enabled: id !== null,
  });

export const useChangeTasks = (all: boolean) =>
  useQuery({
    queryKey: [...KEY, "tasks", all],
    queryFn: async () => (await backendApi.request<{ data: ChangeTask[] }>(`management-change-tasks${all ? "?all=1" : ""}`)).data,
    staleTime: 15_000,
  });

export const usePeriodSummary = (enabled = true) =>
  useQuery({
    queryKey: [...KEY, "period"],
    queryFn: async () => (await backendApi.request<{ data: PeriodSummary }>("management-changes/period-summary")).data,
    enabled,
    staleTime: 30_000,
  });

export function useChangeMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ["aes"] });
  };
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    save: run(({ id, input }: { id?: number | undefined; input: ChangeInput }) =>
      backendApi.request<Change>(id ? `management-changes/${id}` : "management-changes", json(id ? "PUT" : "POST", input))),
    remove: run((id: number) => backendApi.request(`management-changes/${id}`, json("DELETE"))),
    saveAnalysis: run(({ id, ...input }: { id: number; impact_analysis: ImpactAnalysis; affected_aspect_ids: number[]; resources_requested: ResourcesRequested }) =>
      backendApi.request<Change>(`management-changes/${id}/analysis`, json("PUT", input))),
    submit: run((id: number) => backendApi.request<Change>(`management-changes/${id}/submit`, json("POST"))),
    decide: run(({ id, ...input }: { id: number; decision: "approve" | "reject"; note?: string; resources_decision?: "granted" | "refused"; resources_decision_note?: string }) =>
      backendApi.request<Change>(`management-changes/${id}/decision`, json("POST", input))),
    completeTask: run(({ id, note }: { id: number; note: string }) => backendApi.request<Change>(`management-change-tasks/${id}/complete`, json("POST", { note }))),
    review: run(({ id, ...input }: { id: number; result: "effective" | "partial" | "ineffective"; note: string }) =>
      backendApi.request<Change>(`management-changes/${id}/review`, json("POST", input))),
  };
}
