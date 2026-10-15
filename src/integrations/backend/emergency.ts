import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Préparation et réponse aux situations d'urgence (ISO 14001:2026 §8.2).
 * Contrats Laravel : EmergencyProcedureController, EmergencyContactController, EmergencyResourceController,
 * EmergencyExerciseController, EmergencyEventController, EmergencyOverviewController.
 */

export type ProcedureStatus = "planifie" | "operationnel" | "teste" | "a_reviser";

export type Scenario = {
  id: number;
  site_id: number;
  title: string;
  emergency_type: string;
  status: ProcedureStatus;
  hazard_nature: string | null;
  probable_scale: string | null;
  neighbour_risk: string | null;
  measures: string | null;
  prevention_actions: string | null;
  mitigation_actions: string | null;
  internal_communication: string | null;
  external_communication: string | null;
  evacuation_routes: string | null;
  assembly_points: string | null;
  procedure_steps: string[] | null;
  responsible_id: number | null;
  last_drill_date: string | null;
  next_drill_date: string | null;
  next_review_date: string | null;
  review_reason: string | null;
  responsible?: { id: number; name: string } | null;
  aspect?: { id: number; aspect_number: string | null; aspect: string; impact: string } | null;
  exercises_count?: number;
  events_count?: number;
  contacts?: Contact[];
};

export type ScenarioInput = Partial<Omit<Scenario, "id" | "site_id" | "responsible" | "aspect" | "exercises_count" | "events_count" | "contacts">> & {
  site_id?: string | number;
};

export type Contact = {
  id: number;
  ref: string;
  title: string;
  category: string;
  job_role: string | null;
  phone: string;
  phone_alt: string | null;
  email: string | null;
  available_24h: boolean;
  procedure_id: number | null;
  procedure?: { id: number; title: string } | null;
};

export type Resource = {
  id: number;
  ref: string;
  title: string;
  resource_type: string;
  location: string | null;
  quantity: number;
  specification: string | null;
  last_check_date: string | null;
  check_frequency_days: number;
  next_check_date: string | null;
  status: "operational" | "to_check" | "defective" | "out_of_service";
  is_overdue: boolean;
  procedure_id: number | null;
  procedure?: { id: number; title: string } | null;
};

export type Exercise = {
  id: number;
  ref: string;
  title: string;
  procedure_id: number;
  exercise_type: string;
  planned_date: string | null;
  performed_date: string | null;
  participants_count: number | null;
  participants: string | null;
  description: string | null;
  findings: string | null;
  actions_required: string | null;
  stakeholders_informed: string | null;
  status: "planned" | "done" | "cancelled";
  procedure?: { id: number; title: string; status: string } | null;
};

export type TimelineEntry = { at: string; by: string | null; text: string };

export type EmergencyEvent = {
  id: number;
  ref: string;
  title: string;
  procedure_id: number | null;
  event_type: string | null;
  severity: "minor" | "major" | "critical";
  status: "ongoing" | "contained" | "closed";
  declared_at: string;
  closed_at: string | null;
  description: string | null;
  timeline: TimelineEntry[];
  debrief: string | null;
  lessons_actions: string | null;
  plan_revision_requested: boolean;
  aspects_flagged: number;
  procedure?: {
    id: number; title: string; status: string; procedure_steps: string[] | null; measures: string | null;
    evacuation_routes: string | null; assembly_points: string | null;
  } | null;
  declarer?: { id: number; name: string } | null;
};

export type EmergencyOverview = {
  scenarios: { total: number; ready: number; to_complete: number; to_revise: number; from_aspects: number; without_recent_drill: number[] };
  contacts: { total: number; available_24h: number };
  resources: { total: number; overdue: number; defective: number; due_in_30_days: number };
  exercises: { planned: number; done_last_12_months: number; overdue: number };
  events: { ongoing: number; closed_last_12_months: number; awaiting_debrief: number };
};

type Page<T> = { data: T[] };
type Envelope<T> = { success?: boolean; data: T };

const KEY = ["emergency"] as const;

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  const text = search.toString();
  return text ? `?${text}` : "";
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const useEmergencyOverview = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "overview", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Envelope<EmergencyOverview>>(`emergency/overview${query({ site_id: siteId })}`)).data,
    enabled,
    staleTime: 15_000,
  });

export const useScenarios = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "scenarios", siteId ?? ""],
    queryFn: async () => (await backendApi.request<{ data: { data: Scenario[] } }>(`emergency-procedures${query({ site_id: siteId, per_page: "200" })}`)).data.data,
    enabled,
    staleTime: 15_000,
  });

export const useScenario = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "scenario", id],
    queryFn: async () => (await backendApi.request<Envelope<Scenario>>(`emergency-procedures/${id}`)).data,
    enabled: id !== null,
  });

function useList<T>(resource: string, siteId: string | undefined, extra: Record<string, string | undefined> = {}, enabled = true) {
  return useQuery({
    queryKey: [...KEY, resource, siteId ?? "", extra],
    queryFn: async () => (await backendApi.request<Page<T>>(`${resource}${query({ site_id: siteId, per_page: "200", ...extra })}`)).data,
    enabled,
    staleTime: 15_000,
  });
}

export const useContacts = (siteId: string | undefined, enabled = true) => useList<Contact>("emergency-contacts", siteId, {}, enabled);
export const useResources = (siteId: string | undefined, enabled = true) => useList<Resource>("emergency-resources", siteId, {}, enabled);
export const useExercises = (siteId: string | undefined, enabled = true) => useList<Exercise>("emergency-exercises", siteId, {}, enabled);
export const useEvents = (siteId: string | undefined, enabled = true) => useList<EmergencyEvent>("emergency-events", siteId, {}, enabled);

export function useEmergencyMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ["management-system-overview"] });
    void client.invalidateQueries({ queryKey: ["aes"] });
  };
  const save = <T,>(resource: string) =>
    useMutation({
      mutationFn: ({ id, input }: { id?: number | undefined; input: T }) =>
        backendApi.request<{ id?: number; data?: { id: number } }>(id ? `${resource}/${id}` : resource, json(id ? "PUT" : "POST", input)),
      onSuccess: refresh,
    });
  const remove = (resource: string) =>
    useMutation({ mutationFn: (id: number) => backendApi.request(`${resource}/${id}`, json("DELETE")), onSuccess: refresh });
  const action = <V, R = unknown>(run: (variables: V) => Promise<R>) => useMutation({ mutationFn: run, onSuccess: refresh });

  return {
    saveScenario: save<ScenarioInput>("emergency-procedures"),
    removeScenario: remove("emergency-procedures"),
    saveContact: save<Partial<Contact> & { site_id?: string | number }>("emergency-contacts"),
    removeContact: remove("emergency-contacts"),
    saveResource: save<Partial<Resource> & { site_id?: string | number }>("emergency-resources"),
    removeResource: remove("emergency-resources"),
    saveExercise: save<Partial<Exercise> & { site_id?: string | number }>("emergency-exercises"),
    removeExercise: remove("emergency-exercises"),
    completeExercise: action(({ id, ...input }: { id: number; performed_date: string; findings: string; participants_count?: number; actions_required?: string; next_drill_date?: string }) =>
      backendApi.request(`emergency-exercises/${id}/complete`, json("POST", input))),
    cancelExercise: action((id: number) => backendApi.request(`emergency-exercises/${id}/cancel`, json("POST"))),
    declareEvent: action<{ title: string; procedure_id?: number; severity: string; description?: string; site_id?: string }, EmergencyEvent>((input) =>
      backendApi.request<EmergencyEvent>("emergency-events", json("POST", input))),
    addTimeline: action(({ id, text }: { id: number; text: string }) => backendApi.request(`emergency-events/${id}/timeline`, json("POST", { text }))),
    containEvent: action((id: number) => backendApi.request(`emergency-events/${id}/contain`, json("POST"))),
    closeEvent: action(({ id, ...input }: { id: number; debrief: string; lessons_actions?: string }) =>
      backendApi.request(`emergency-events/${id}/close`, json("POST", input))),
  };
}
