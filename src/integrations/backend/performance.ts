import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackendApiError, backendApi } from "@/integrations/backend/client";

/**
 * Performance environnementale et surveillance (ISO 14001:2026 §9.1.1).
 * Contrats Laravel : EnvironmentalIndicatorController, IndicatorReadingController, MonitoringInstrumentController,
 * PerformanceOverviewController.
 */

export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export type ThresholdState = "ok" | "above_target" | "alert" | "no_data";
export type Validity = "valid" | "due_soon" | "expired" | "never_calibrated" | "out_of_service";

export const CATEGORIES = [
  { value: "water", label: "Eau" }, { value: "energy", label: "Énergie" }, { value: "waste", label: "Déchets" },
  { value: "emissions", label: "Émissions" }, { value: "incidents", label: "Incidents" }, { value: "compliance", label: "Conformité" },
  { value: "management", label: "Management" }, { value: "other", label: "Autre" },
];
export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Quotidienne" }, { value: "weekly", label: "Hebdomadaire" }, { value: "monthly", label: "Mensuelle" },
  { value: "quarterly", label: "Trimestrielle" }, { value: "annual", label: "Annuelle" },
];

export type Indicator = {
  id: number;
  ref: string;
  title: string;
  site_id: number;
  category: string;
  unit: string;
  formula: string | null;
  scope: string | null;
  measurement_method: string | null;
  frequency: Frequency;
  data_source: string | null;
  threshold_direction: "max" | "min";
  target_value: number | null;
  alert_threshold: number | null;
  normalization: "none" | "per_unit_produced" | "per_employee" | "per_surface";
  is_active: boolean;
  responsible?: { id: number; name: string } | null;
  aspect?: { id: number; aspect_number: string | null; aspect: string } | null;
};

export type IndicatorInput = Partial<Omit<Indicator, "id" | "ref" | "site_id" | "responsible" | "aspect">> & { site_id?: string };

export type Reading = {
  id: number;
  indicator_id: number;
  measured_on: string;
  value: number;
  unit: string;
  activity_quantity: number | null;
  instrument_valid: boolean | null;
  source: string;
  evidence_name: string | null;
  note: string | null;
  flags: string[] | null;
  superseded_by_id: number | null;
  correction_reason: string | null;
  indicator?: { id: number; ref: string; title: string; unit: string };
  instrument?: { id: number; ref: string; title: string } | null;
  recorder?: { id: number; name: string } | null;
};

export type Instrument = {
  id: number;
  ref: string;
  title: string;
  instrument_type: string;
  serial_number: string | null;
  location: string | null;
  measurement_range: string | null;
  last_calibration_date: string | null;
  calibration_frequency_days: number;
  next_calibration_date: string | null;
  status: "in_service" | "out_of_service";
  validity: Validity;
  calibrations?: { id: number; calibrated_on: string; result: "pass" | "fail"; certificate_ref: string | null; provider: string | null; recorder?: { name: string } | null }[];
};

export type Analysis = {
  count: number; total: number; average: number | null; min: number | null; max: number | null;
  trend: "up" | "down" | "stable" | "insufficient"; change_vs_previous_pct: number | null; last_value: number | null;
  last_measured_on: string | null; threshold_state: ThresholdState; flagged_readings: number;
  series: { id: number; measured_on: string; value: number; normalized: number | null; flags: string[] }[];
};

export type Overview = {
  objectives: { total: number; achieved: number; rate: number | null };
  actions: { due: number; on_time: number; rate: number | null };
  obligations: { applicable: number; evaluated_12m: number; rate: number | null };
  nonconformities: { total_12m: number; recurring: number; recurring_rate: number | null };
  indicators: { active: number; by_state: Record<ThresholdState, number>; readings_overdue: number };
  instruments: { total: number; not_valid: number };
};

export type Report = {
  from: string; to: string; readings_with_invalid_instrument: number;
  indicators: { ref: string; title: string; unit: string; site: string | null; count: number; average: number | null; last_value: number | null; trend: Analysis["trend"]; threshold_state: ThresholdState; change_vs_previous_pct: number | null }[];
  alerts: { ref: string; title: string }[];
};

export type ReadingInput = {
  indicator_id: number; value: number; measured_on?: string; activity_quantity?: number; instrument_id?: number; note?: string;
  client_uuid?: string; confirm_outlier?: boolean; confirm_duplicate?: boolean;
};

type Page<T> = { data: T[] };
type Data<T> = { data: T };
const KEY = ["performance"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

const list = <T,>(name: string, resource: string, params: Record<string, string | undefined>, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, name, params],
    queryFn: async () => (await backendApi.request<Page<T>>(`${resource}${query({ per_page: "200", ...params })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useIndicators = (siteId: string | undefined, enabled = true) => list<Indicator>("indicators", "environmental-indicators", { site_id: siteId }, enabled);
export const useInstruments = (siteId: string | undefined, enabled = true) => list<Instrument>("instruments", "monitoring-instruments", { site_id: siteId }, enabled);
export const useReadings = (params: { site_id?: string | undefined; indicator_id?: string | undefined; flagged?: string | undefined }, enabled = true) =>
  list<Reading>("readings", "indicator-readings", params, enabled);

export const useOverview = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "overview", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Data<Overview>>(`performance/overview${query({ site_id: siteId })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useReport = (siteId: string | undefined, from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "report", siteId ?? "", from, to],
    queryFn: async () => (await backendApi.request<Data<Report>>(`performance/report${query({ site_id: siteId, from, to })}`)).data,
    enabled,
  });

export const useAnalysis = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "analysis", id],
    queryFn: async () => (await backendApi.request<Data<Analysis>>(`environmental-indicators/${id}/analysis`)).data,
    enabled: id !== null,
  });

export const useLibrary = (siteId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, "library", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Page<{ code: string; title: string; unit: string; category: string; frequency: Frequency; activated: boolean }>>(`environmental-indicator-library${query({ site_id: siteId })}`)).data,
    enabled,
  });

export function usePerformanceMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ["management-system-overview"] });
  };
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    saveIndicator: run(({ id, input }: { id?: number | undefined; input: IndicatorInput }) =>
      backendApi.request<Indicator>(id ? `environmental-indicators/${id}` : "environmental-indicators", json(id ? "PUT" : "POST", input))),
    activateLibrary: run(({ siteId, codes }: { siteId: string; codes: string[] }) =>
      backendApi.request<{ created: number }>("environmental-indicator-library/activate", json("POST", { site_id: siteId, codes }))),
    createAction: run((id: number) => backendApi.request<Data<{ id: number; ref: string }>>(`environmental-indicators/${id}/actions`, json("POST"))),
    saveInstrument: run(({ id, input }: { id?: number | undefined; input: Record<string, unknown> }) =>
      backendApi.request<Instrument>(id ? `monitoring-instruments/${id}` : "monitoring-instruments", json(id ? "PUT" : "POST", input))),
    calibrate: run(({ id, ...input }: { id: number; calibrated_on: string; result: "pass" | "fail"; certificate_ref?: string; provider?: string; note?: string }) =>
      backendApi.request<{ readings_to_review: number }>(`monitoring-instruments/${id}/calibrations`, json("POST", input))),
    correct: run(({ id, ...input }: { id: number; value: number; correction_reason: string; confirm_outlier?: boolean }) =>
      backendApi.request(`indicator-readings/${id}/correct`, json("POST", input))),
    record: run(({ input, evidence }: { input: ReadingInput; evidence?: File | null }) => {
      if (!evidence) return backendApi.request<Data<Reading>>("indicator-readings", json("POST", input));
      const body = new FormData();
      Object.entries(input).forEach(([key, value]) => value !== undefined && body.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value)));
      body.append("evidence", evidence);
      return backendApi.request<Data<Reading>>("indicator-readings", { method: "POST", body });
    }),
  };
}

export type ConfirmationNeeded = { code: "OUTLIER" | "DUPLICATE"; message: string };

/** Le serveur demande une confirmation explicite (valeur aberrante ou doublon) : renvoie le motif, sinon null. */
export function confirmationNeeded(error: unknown): ConfirmationNeeded | null {
  if (!(error instanceof BackendApiError) || error.status !== 422) return null;
  const payload = error.payload as { code?: string; needs_confirmation?: boolean; message?: string } | undefined;
  return payload?.needs_confirmation && (payload.code === "OUTLIER" || payload.code === "DUPLICATE") ? { code: payload.code, message: payload.message ?? "Confirmez ce relevé." } : null;
}

export const isNetworkError = (error: unknown): boolean => error instanceof BackendApiError && error.status === 0;

export const downloadEvidence = (id: number): Promise<Blob> => backendApi.blob(`indicator-readings/${id}/evidence`);
export const downloadTemplate = (): Promise<Blob> => backendApi.blob("environmental-indicators/template");

export type BatchResult = { client_uuid: string; status: "created" | "exists" | "rejected"; message?: string; code?: string };
export const syncBatch = async (readings: ReadingInput[]): Promise<BatchResult[]> =>
  (await backendApi.request<Page<BatchResult>>("indicator-readings/batch", json("POST", { readings }))).data;
