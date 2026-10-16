import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Audits internes (ISO 14001:2026 §9.2, ISO 19011).
 * Contrats Laravel : AuditController (plans, constats, rapport) et AuditFieldworkController (propositions, indépendance, preuves).
 */

export type FindingType = "conforming" | "good_practice" | "observation" | "opportunity" | "nc_minor" | "nc_major";
export const FINDING_TYPES: { value: FindingType; label: string; tone: string }[] = [
  { value: "conforming", label: "Conforme", tone: "bg-emerald-100 text-emerald-700" },
  { value: "good_practice", label: "Point fort", tone: "bg-sky-100 text-sky-700" },
  { value: "observation", label: "Observation", tone: "bg-amber-100 text-amber-800" },
  { value: "opportunity", label: "Piste d'amélioration", tone: "bg-indigo-100 text-indigo-700" },
  { value: "nc_minor", label: "Non-conformité mineure", tone: "bg-orange-100 text-orange-800" },
  { value: "nc_major", label: "Non-conformité majeure", tone: "bg-red-100 text-red-700" },
];

export type AuditRow = {
  id: number; ref: string; title: string; type: string; status: string; planned_date: string; actual_date: string | null; scope: string | null;
  objectives: string | null; conformity_rate: number | null;
  site?: { id: number; name: string } | null; lead_auditor?: { id: number; name: string } | null; leadAuditor?: { id: number; name: string } | null;
};

export type Finding = {
  id: number; ref: string; type: FindingType; title: string; description: string; evidence: string | null; clause_iso: string | null;
  severity: string; priority: number; nc_created: boolean; non_conformity_id: number | null; attachments: { name: string; label: string | null }[] | null;
};

export type Proposal = {
  process_id: number; process: string; code: string | null; score: number; priority: "high" | "medium" | "low";
  suggested_frequency: string; last_audited_at: string | null; reasons: string[];
};

export type EligibleAuditor = { id: number; name: string; qualified: boolean; independent: boolean; conflicts: string[] };
export type ProcessOption = { id: number; title: string; code: string | null };
export type Clause = { clause: string; questions: number };
export type ChecklistItem = { question: string; clause_iso: string; conformity: string | null };

export type AuditInput = {
  site_id: string; title: string; planned_date: string; lead_auditor_id: number; objectives: string; reference_documents: string; scope?: string;
  auditor_ids?: number[]; auditee_ids?: number[]; process_ids?: number[];
};

type Page<T> = { data: T[] };
const KEY = ["audits"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const rows = <T,>(payload: unknown): T[] => {
  const root = (payload ?? {}) as { data?: unknown };
  if (Array.isArray(root.data)) return root.data as T[];
  const nested = (root.data as { data?: unknown } | undefined)?.data;
  return Array.isArray(nested) ? (nested as T[]) : Array.isArray(payload) ? (payload as T[]) : [];
};

export const useAuditList = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "list", siteId ?? ""],
    queryFn: async () => rows<AuditRow>(await backendApi.request<unknown>(`audits?per_page=100${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}`)),
    enabled, staleTime: 10_000,
  });

export const useAudit = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "one", id], queryFn: async () => backendApi.request<AuditRow & { checklist: ChecklistItem[] | null }>(`audits/${id}`), enabled: id !== null });

export const useFindings = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "findings", id], queryFn: async () => rows<Finding>(await backendApi.request<unknown>(`audits/${id}/findings`)), enabled: id !== null });

export const useProposals = (siteId: string | undefined, year: number, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "proposals", siteId ?? "", year],
    queryFn: async () => (await backendApi.request<Page<Proposal>>(`audit-programs/proposals?year=${year}${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
    enabled,
  });

export const useClauses = () =>
  useQuery({ queryKey: [...KEY, "clauses"], queryFn: async () => (await backendApi.request<Page<Clause>>("audits/iso-clauses")).data, staleTime: Infinity });

export const useProcessOptions = (enabled = true) =>
  useQuery({ queryKey: [...KEY, "processes"], queryFn: async () => rows<ProcessOption>(await backendApi.request<unknown>("processes?per_page=200")), enabled, staleTime: 60_000 });

export const useEligibleAuditors = (siteId: string | undefined, processIds: number[], auditeeIds: number[], enabled = true) =>
  useQuery({
    queryKey: [...KEY, "eligible", siteId ?? "", processIds, auditeeIds],
    queryFn: async () => {
      const search = new URLSearchParams();
      if (siteId) search.set("site_id", siteId);
      processIds.forEach((id) => search.append("process_ids[]", String(id)));
      auditeeIds.forEach((id) => search.append("auditee_ids[]", String(id)));
      return (await backendApi.request<Page<EligibleAuditor>>(`audits/eligible-auditors?${search.toString()}`)).data;
    },
    enabled,
  });

export function useAuditMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    create: run((input: AuditInput) => backendApi.request<AuditRow>("audits", json("POST", { ...input, type: "internal", assigned_to: input.lead_auditor_id }))),
    start: run((id: number) => backendApi.request(`audits/${id}/start`, json("POST", { actual_date: new Date().toISOString().slice(0, 10) }))),
    generateChecklist: run(({ id, clauses }: { id: number; clauses: string[] }) =>
      backendApi.request<{ count: number }>(`audits/${id}/generate-checklist`, json("POST", { norm: "ISO 14001", iso_clauses: clauses, include_process_risks: false }))),
    addFinding: run(({ id, input }: { id: number; input: Record<string, unknown> }) => backendApi.request<Finding>(`audits/${id}/finding`, json("POST", input))),
    setStatus: run(({ id, status }: { id: number; status: string }) => backendApi.request(`audits/${id}/status`, json("POST", { status }))),
    approve: run((id: number) => backendApi.request(`audits/${id}/approve`, json("POST"))),
    complete: run((id: number) => backendApi.request(`audits/${id}/complete`, json("POST"))),
    addEvidence: run(({ id, findingId, file, label }: { id: number; findingId: number; file: File; label?: string }) => {
      const body = new FormData();
      body.append("file", file);
      if (label) body.append("label", label);
      return backendApi.request(`audits/${id}/findings/${findingId}/evidence`, { method: "POST", body });
    }),
  };
}

export const downloadAuditReport = (id: number, format: "pdf" | "docx"): Promise<Blob> => backendApi.blob(`audits/${id}/download-report?format=${format}`);
