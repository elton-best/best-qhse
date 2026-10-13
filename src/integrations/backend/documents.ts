import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

export const PENDING_DOCUMENTS_KEY = ["pending-workflow-documents"] as const;

export type PendingDocument = {
  id: string;
  code: string;
  title: string;
  workflow_status: string;
  status: string;
  version: string;
  source_label: string;
  process_label: string;
  author_name: string;
  approver_name: string;
  verifier_name: string;
  created_at: string | null;
  metadata: Record<string, unknown>;
};

export type WorkflowHistoryEntry = {
  id: string;
  action: string;
  action_label: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  actor_name: string;
  created_at: string | null;
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relationValue(value: unknown): Record<string, unknown> {
  const raw = objectOf(value);
  return raw.attributes && typeof raw.attributes === "object"
    ? (raw.attributes as Record<string, unknown>)
    : raw;
}

function collection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = objectOf(payload);
  if (Array.isArray(root.data)) return root.data;
  if (root.data && typeof root.data === "object") {
    const nested = objectOf(root.data);
    if (Array.isArray(nested.data)) return nested.data;
  }
  return [];
}

function normalizeDocument(item: unknown): PendingDocument | null {
  const raw = objectOf(item);
  const attrs =
    raw.attributes && typeof raw.attributes === "object"
      ? (raw.attributes as Record<string, unknown>)
      : raw;
  const id = raw.id ?? attrs.id;
  if (id == null) return null;
  const relationships = objectOf(raw.relationships);
  const author = relationValue(attrs.author ?? raw.author ?? relationships.author);
  const approver = relationValue(attrs.approver ?? raw.approver ?? relationships.approver);
  const verifier = relationValue(attrs.verifier ?? raw.verifier ?? relationships.verifier);
  const process = relationValue(attrs.process ?? raw.process ?? relationships.process);
  const site = relationValue(attrs.site ?? raw.site ?? relationships.site);
  const source = [attrs.source_module, attrs.source_submodule, attrs.source_section]
    .filter(Boolean)
    .join(" > ");
  return {
    id: String(id),
    code: String(attrs.code ?? `DOC-${id}`),
    title: String(attrs.title ?? attrs.name ?? "Document sans titre"),
    workflow_status: String(attrs.workflow_status ?? attrs.status ?? ""),
    status: String(attrs.status ?? ""),
    version: String(attrs.version ?? "1.0"),
    source_label:
      source ||
      String(
        attrs.module_type
          ? `${attrs.module_type}${attrs.module_id ? ` #${attrs.module_id}` : ""}`
          : (attrs.source_type ?? "—"),
      ),
    process_label: String(
      process.code && process.title
        ? `${process.code} — ${process.title}`
        : (process.code ?? process.title ?? "—"),
    ),
    author_name: String(author.name ?? author.email ?? "—"),
    approver_name: String(approver.name ?? approver.email ?? "—"),
    verifier_name: String(verifier.name ?? verifier.email ?? "—"),
    created_at: attrs.created_at == null ? null : String(attrs.created_at),
    metadata: objectOf(attrs.metadata),
  };
}

export async function fetchPendingDocuments(
  workflowStatus: "pending_verification" | "pending_approval",
  siteId?: string,
) {
  const payload = await backendApi.request<unknown>(
    `document-code-workflow/${workflowStatus === "pending_verification" ? "pending-verification" : "pending-approval"}${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`,
  );
  return collection(payload)
    .map(normalizeDocument)
    .filter((item): item is PendingDocument => item !== null);
}

export function usePendingDocuments(workflowStatus: "pending_verification" | "pending_approval", siteId?: string) {
  return useQuery({
    queryKey: [...PENDING_DOCUMENTS_KEY, workflowStatus, siteId ?? "all-sites"],
    queryFn: () => fetchPendingDocuments(workflowStatus, siteId),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useDocumentWorkflow() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PENDING_DOCUMENTS_KEY });
    queryClient.invalidateQueries({ queryKey: ["workflow-history"] });
  };
  return {
    verify: useMutation({
      mutationFn: (input: string | { id: string; comment?: string }) =>
        backendApi.request(
          `documents/${typeof input === "string" ? input : input.id}/verify`,
          {
            method: "POST",
            body: JSON.stringify(
              typeof input === "string" || !input.comment ? {} : { comment: input.comment },
            ),
          },
        ),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (input: { id: string; comment?: string }) =>
        backendApi.request(`documents/${input.id}/approve`, {
          method: "POST",
          body: JSON.stringify(input.comment ? { comment: input.comment } : {}),
        }),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: (input: { id: string; rejection_reason: string }) =>
        backendApi.request(`documents/${input.id}/reject`, {
          method: "POST",
          body: JSON.stringify({ rejection_reason: input.rejection_reason }),
        }),
      onSuccess: invalidate,
    }),
    submit: useMutation({
      mutationFn: (id: string) =>
        backendApi.request(`documents/${id}/submit-for-approval`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    confirmRejectionDecision: useMutation({
      mutationFn: (input: { id: string; release_code: boolean; comment?: string }) =>
        backendApi.request(`documents/${input.id}/confirm-rejection-decision`, {
          method: "POST",
          body: JSON.stringify({
            release_code: input.release_code,
            ...(input.comment ? { comment: input.comment } : {}),
          }),
        }),
      onSuccess: invalidate,
    }),
  };
}

const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  submitted: "Soumis pour vérification",
  confirm_code: "Code confirmé",
  submit_for_approval: "Soumission au workflow",
  verified: "Vérifié",
  approved: "Approuvé",
  rejected: "Rejeté",
  rejection_confirmed: "Rejet confirmé",
  rejection_cancelled: "Rejet annulé",
  delegated: "Délégué",
  reminded: "Rappel envoyé",
  downloaded: "Téléchargé",
  previewed: "Prévisualisé",
  auto_submitted: "Soumis automatiquement",
  verify: "Vérification effectuée",
  approve: "Approbation effectuée",
  reject: "Rejet effectué",
  confirm_rejection_decision: "Décision du soumissionnaire",
};

export function workflowActionLabel(action: string): string {
  return WORKFLOW_ACTION_LABELS[action] ?? action;
}

function historyEntry(item: unknown): WorkflowHistoryEntry | null {
  const raw = objectOf(item);
  const attrs =
    raw.attributes && typeof raw.attributes === "object"
      ? (raw.attributes as Record<string, unknown>)
      : raw;
  const id = raw.id ?? attrs.id;
  if (id == null) return null;
  const user = relationValue(attrs.user ?? raw.user);
  const action = String(attrs.action ?? "");
  return {
    id: String(id),
    action,
    action_label: String(
      attrs.action_label ?? WORKFLOW_ACTION_LABELS[action] ?? action,
    ),
    from_status: attrs.from_status == null ? null : String(attrs.from_status),
    to_status: attrs.to_status == null ? null : String(attrs.to_status),
    comment: attrs.comment == null ? null : String(attrs.comment),
    actor_name: String(user.name ?? user.email ?? "Système"),
    created_at:
      attrs.action_at == null
        ? attrs.created_at == null
          ? null
          : String(attrs.created_at)
        : String(attrs.action_at),
  };
}

export async function fetchWorkflowHistory(id: string) {
  const payload = await backendApi.request<unknown>(
    `documents/${encodeURIComponent(id)}/workflow-history`,
  );
  const root = objectOf(payload);
  const data = Array.isArray(root.data) ? root.data : collection(payload);
  return data
    .map(historyEntry)
    .filter((item): item is WorkflowHistoryEntry => item !== null);
}

export function useWorkflowHistory(id: string | null) {
  return useQuery({
    queryKey: ["workflow-history", id],
    queryFn: () => fetchWorkflowHistory(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
    retry: 1,
  });
}

export async function previewDocumentBlob(id: string): Promise<Blob> {
  return backendApi.blob(`documents/${encodeURIComponent(id)}/preview`);
}

export async function downloadDocumentBlob(id: string): Promise<Blob> {
  return backendApi.blob(`documents/${encodeURIComponent(id)}/download`);
}
