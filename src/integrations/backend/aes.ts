import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Aspects environnementaux significatifs (ISO 14001:2026 §6.1.2).
 * Contrats Laravel : EnvironmentalAspectController, AesSettingsController, AesRegistryVersionController.
 * La cotation et la significativité sont calculées par le serveur : le navigateur ne les envoie jamais.
 */

export type AesStatus = "draft" | "in_review" | "validated" | "archived";
export type AesSituation = "normal" | "abnormal" | "startup_shutdown" | "emergency";

export type Aes = {
  id: number;
  site_id: number;
  process_id: number | null;
  sub_process: string | null;
  aspect_number: string | null;
  mode: "N" | "A";
  situation: AesSituation;
  activity: string;
  aspect: string;
  impact: string;
  risk: string | null;
  existing_controls: string | null;
  gravity: number | null;
  frequency: number | null;
  sensitivity: number | null;
  mastery: number | null;
  criticality_score: number | null;
  significance_threshold: number | null;
  is_significant: boolean;
  significance_basis: "environmental" | "additional" | null;
  status: AesStatus;
  lifecycle_phase: string | null;
  control_level: "controlled" | "influenced";
  aspect_type: string | null;
  impact_nature: "negative" | "beneficial";
  impact_scale: "local" | "regional" | "global" | null;
  impact_kind: "direct" | "indirect" | "cumulative" | null;
  group_label: string | null;
  group_members: string[] | null;
  group_characteristics: string | null;
  legal_criterion: boolean;
  stakeholder_criterion: boolean;
  is_emergency_potential: boolean;
  emergency_procedure_id: number | null;
  needs_reassessment: boolean;
  reassessment_reason: string | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  additional_actions: string | null;
  responsible_id: number | null;
  responsible_name: string | null;
  deadline: string | null;
  effectiveness_criterion: string | null;
  efficiency_criterion: string | null;
  observations: string | null;
  action_ids: number[] | null;
  process?: { id: number; code: string | null; title: string | null } | null;
  site?: { id: number; name: string } | null;
  responsible?: { id: number; name: string } | null;
  emergency_procedure?: { id: number; title: string; status: string } | null;
};

/** Champs envoyés à l'API (jamais le score, le seuil ni la significativité). */
type AesInputKey =
  | "process_id" | "sub_process" | "aspect_number" | "situation" | "activity" | "aspect" | "impact" | "risk"
  | "existing_controls" | "gravity" | "frequency" | "sensitivity" | "mastery" | "lifecycle_phase"
  | "control_level" | "aspect_type" | "impact_nature" | "impact_scale" | "impact_kind" | "group_label" | "group_members" | "group_characteristics"
  | "legal_criterion" | "stakeholder_criterion" | "is_emergency_potential" | "additional_actions"
  | "responsible_id" | "deadline" | "effectiveness_criterion" | "efficiency_criterion" | "observations";

export type AesInput = { [K in AesInputKey]?: Aes[K] | undefined } & { site_id?: string | number };

export type AesFilters = {
  site_id?: string | undefined;
  search?: string | undefined;
  status?: string | undefined;
  is_significant?: string | undefined;
  situation?: string | undefined;
  lifecycle_phase?: string | undefined;
  aspect_type?: string | undefined;
  needs_reassessment?: string | undefined;
};

export type AesStats = {
  total: number;
  significant: number;
  non_significant: number;
  validated: number;
  needs_reassessment: number;
  review_due: number;
  emergency_potential: number;
  significant_without_action: number[];
  by_type: Record<string, number>;
  by_lifecycle: Record<string, number>;
  heatmap: Record<string, number>;
};

export type AesSettings = {
  significance_threshold: number;
  max_gravity: number;
  max_frequency: number;
  max_sensitivity: number;
  max_mastery: number;
  use_legal_criterion: boolean;
  use_stakeholder_criterion: boolean;
  review_frequency_months: number;
};

export type AesMethod = {
  formula: string;
  rule: string;
  threshold: number;
  additional_criteria: string[];
  maximum_score: number;
};

export type AesSettingsPayload = { settings: AesSettings; method: AesMethod; is_default?: boolean; recalculated?: number };

export type AesSheetGroup = {
  site: string;
  process: string;
  aspects: {
    id: number;
    aspect_number: string | null;
    activity: string;
    aspect: string;
    impact: string;
    criticality_score: number;
    significance_basis: string | null;
    existing_controls: string | null;
    additional_actions: string | null;
    responsible: string | null;
    deadline: string | null;
  }[];
};

export type AesVersion = {
  id: number;
  site_id: number;
  version_number: number;
  label: string | null;
  aspects_count: number;
  significant_count: number;
  created_at: string;
};

export type AesVersionDiff = {
  from: { id: number; version_number: number; label: string | null };
  to: { id: number; version_number: number; label: string | null };
  added: { id: number; aspect: string; criticality_score: number | null; is_significant: boolean }[];
  removed: { id: number; aspect: string }[];
  changed: { id: number; aspect: string; changes: Record<string, { from: unknown; to: unknown }> }[];
  method_changed: boolean;
};

export type AesImportSummary = {
  total: number;
  valid: number;
  significant: number;
  errors: string[];
  imported?: number;
  preview?: { line: number; activity: string; aspect: string; criticality: number; is_significant: boolean }[];
};

const KEY = ["aes"] as const;

type Envelope<T> = { success?: boolean; data: T; message?: string };

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function useAesList(filters: AesFilters, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "list", filters],
    queryFn: async () => (await backendApi.request<Envelope<Aes[]>>(`environmental-aspects${query(filters)}`)).data,
    enabled,
    staleTime: 15_000,
  });
}

export function useAesStats(siteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "stats", siteId ?? ""],
    queryFn: async () =>
      (await backendApi.request<Envelope<AesStats>>(`environmental-aspects/statistics${query({ site_id: siteId })}`)).data,
    enabled,
    staleTime: 15_000,
  });
}

export function useAesSettings() {
  return useQuery({
    queryKey: [...KEY, "settings"],
    queryFn: async () => (await backendApi.request<Envelope<AesSettingsPayload>>("aes-settings")).data,
    staleTime: 60_000,
  });
}

export function useAesSheet(siteId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, "sheet", siteId ?? ""],
    queryFn: async () =>
      (
        await backendApi.request<Envelope<{ generated_at: string; method: AesMethod; groups: AesSheetGroup[] }>>(
          `environmental-aspects/significant-sheet${query({ site_id: siteId })}`,
        )
      ).data,
    enabled,
    staleTime: 15_000,
  });
}

export function useAesVersions(siteId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "versions", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Envelope<AesVersion[]>>(`aes-registry-versions${query({ site_id: siteId })}`)).data,
    staleTime: 15_000,
  });
}

export function useAesVersionDiff(from: number | null, to: number | null) {
  return useQuery({
    queryKey: [...KEY, "diff", from, to],
    queryFn: async () =>
      (await backendApi.request<Envelope<AesVersionDiff>>(`aes-registry-versions/compare?from=${from}&to=${to}`)).data,
    enabled: from !== null && to !== null && from !== to,
  });
}

export function useAesMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const json = (method: string, body?: unknown) => ({
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    save: useMutation({
      mutationFn: ({ id, input }: { id?: number | undefined; input: AesInput }) =>
        backendApi.request<Envelope<Aes>>(id ? `environmental-aspects/${id}` : "environmental-aspects", json(id ? "PUT" : "POST", input)),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => backendApi.request<Envelope<null>>(`environmental-aspects/${id}`, json("DELETE")),
      onSuccess: refresh,
    }),
    transition: useMutation({
      mutationFn: ({ id, action }: { id: number; action: "validate" | "archive" | "reopen" }) =>
        backendApi.request<Envelope<Aes>>(`environmental-aspects/${id}/${action}`, json("POST")),
      onSuccess: refresh,
    }),
    flagReassessment: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        backendApi.request<Envelope<Aes>>(`environmental-aspects/${id}/flag-reassessment`, json("POST", { reason })),
      onSuccess: refresh,
    }),
    triggerReassessment: useMutation({
      mutationFn: (input: { trigger: string; reason: string; site_id?: string; process_id?: number }) =>
        backendApi.request<Envelope<{ flagged: number }>>("environmental-aspects/reassessment-trigger", json("POST", input)),
      onSuccess: refresh,
    }),
    saveSettings: useMutation({
      mutationFn: (input: AesSettings) => backendApi.request<Envelope<AesSettingsPayload>>("aes-settings", json("PUT", input)),
      onSuccess: refresh,
    }),
    freezeVersion: useMutation({
      mutationFn: (input: { site_id?: string; label?: string }) =>
        backendApi.request<Envelope<AesVersion>>("aes-registry-versions", json("POST", input)),
      onSuccess: refresh,
    }),
    importFile: useMutation({
      mutationFn: async ({ file, siteId, dryRun, skipInvalid }: { file: File; siteId: string; dryRun: boolean; skipInvalid?: boolean }) => {
        const body = new FormData();
        body.append("file", file);
        if (siteId) body.append("site_id", siteId);
        if (dryRun) body.append("dry_run", "1");
        if (skipInvalid) body.append("skip_invalid", "1");
        return (await backendApi.request<Envelope<AesImportSummary>>("environmental-aspects/import-xlsx", { method: "POST", body })).data;
      },
      onSuccess: (_data, variables) => {
        if (!variables.dryRun) void refresh();
      },
    }),
  };
}

export function downloadAesTemplate(): Promise<Blob> {
  return backendApi.blob("environmental-aspects/template");
}

export function downloadAesExport(siteId: string | undefined): Promise<Blob> {
  return backendApi.blob(`environmental-aspects/export-xlsx${query({ site_id: siteId })}`);
}

// ---------- Pilotage du système de management (mono-norme ou intégré) ----------

export type ManagementOverview = {
  sites: number[];
  common: Record<string, number>;
  norms: Record<string, Record<string, number>>;
};

export function useManagementOverview(siteId: string | undefined) {
  return useQuery({
    queryKey: ["management-system-overview", siteId ?? ""],
    queryFn: async () =>
      (await backendApi.request<Envelope<ManagementOverview>>(`management-system/overview${query({ site_id: siteId })}`)).data,
    staleTime: 30_000,
  });
}
