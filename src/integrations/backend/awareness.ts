import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Sensibilisation (ISO 14001:2026 §7.3) : campagnes, supports avec accusé de lecture, causeries, personnes extérieures.
 * Contrats Laravel : AwarenessCampaignController, AwarenessParticipationController, AwarenessPublicController,
 * AwarenessTalkController, AwarenessOverviewController.
 */

export type Topic = "policy" | "significant_aspects" | "contribution" | "consequences";
export const TOPICS: { value: Topic; label: string }[] = [
  { value: "policy", label: "La politique environnementale" },
  { value: "significant_aspects", label: "Les aspects significatifs liés à leur travail" },
  { value: "contribution", label: "Leur contribution à l'efficacité du système" },
  { value: "consequences", label: "Les conséquences d'une non-satisfaction des exigences" },
];
export type MaterialType = "sheet" | "video" | "quiz";
export type Question = { question: string; options: string[]; correct?: number };

export type Material = {
  id: number; topic: Topic; type: MaterialType; title: string; body: string | null; url: string | null; pass_mark: number; questions: Question[] | null;
};
export type Campaign = {
  id: number; ref: string; title: string; objective: string | null; audience: "all_site" | "selected"; status: "draft" | "active" | "closed";
  start_date: string | null; end_date: string | null; aspect_ids: number[] | null; selected_user_ids: number[] | null;
  materials?: Material[]; participants_count?: number; completed_count?: number; responsible?: { id: number; name: string } | null;
};
export type ParticipantRow = { id: number; kind: "internal" | "external"; name: string; organization: string | null; email: string | null; done: number; total: number; completed_at: string | null; attestation_number: string | null };

export type MyCampaign = { campaign_id: number; title: string; ref: string; status: string; end_date: string | null; completed_at: string | null; attestation_number: string | null };
export type ParticipantMaterial = { id: number; topic: Topic; type: MaterialType; title: string; body: string | null; url: string | null; pass_mark: number; questions: { question: string; options: string[] }[]; done: boolean };
export type Content = {
  campaign: { id: number; ref: string; title: string; objective: string | null; status: string; end_date: string | null };
  aspects: { id: number; aspect_number: string | null; aspect: string; impact: string }[];
  materials: ParticipantMaterial[]; completed_at: string | null; attestation_number: string | null;
  participant?: { name: string; organization: string | null };
};
export type QuizResult = { score: number; passed: boolean; correct: number; total: number; completed: boolean; attestation_number: string | null };

export type Talk = {
  id: number; ref: string; title: string; topic: Topic | null; held_on: string; duration_minutes: number; notes: string | null; status: "open" | "closed";
  responsible?: { id: number; name: string } | null; attendances?: { id: number; name: string; organization: string | null; method: "qr" | "manual"; signed_at: string }[];
};
export type AwarenessOverview = {
  by_site: { site_id: number; site: string; campaigns: number; participants: number; completed: number; rate: number | null; talks_90d: number }[];
  campaigns: { id: number; ref: string; title: string; status: string; participants: number; completed: number; rate: number | null }[];
};

type Page<T> = { data: T[] };
type Data<T> = { data: T };
const KEY = ["awareness"] as const;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

const siteQuery = (siteId: string | undefined): string => (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "");

export const useMyCampaigns = () =>
  useQuery({ queryKey: [...KEY, "my"], queryFn: async () => (await backendApi.request<Page<MyCampaign>>("awareness/my")).data, staleTime: 10_000 });

export const useMyContent = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "content", id], queryFn: async () => (await backendApi.request<Data<Content>>(`awareness/my/${id}`)).data, enabled: id !== null });

export const useCampaigns = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "campaigns", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Page<Campaign>>(`awareness-campaigns?per_page=200${siteQuery(siteId)}`)).data,
    enabled, staleTime: 10_000, retry: false,
  });

export const useCampaign = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "campaign", id], queryFn: async () => backendApi.request<Campaign>(`awareness-campaigns/${id}`), enabled: id !== null });

export const useParticipants = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "participants", id], queryFn: async () => (await backendApi.request<Page<ParticipantRow>>(`awareness-campaigns/${id}/participants`)).data, enabled: id !== null });

export const useTalks = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "talks", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Page<Talk>>(`awareness-talks?per_page=200${siteQuery(siteId)}`)).data,
    enabled, staleTime: 10_000, retry: false,
  });

export const useTalk = (id: number | null) =>
  useQuery({ queryKey: [...KEY, "talk", id], queryFn: async () => backendApi.request<Talk>(`awareness-talks/${id}`), enabled: id !== null });

export const useAwarenessOverview = (siteId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [...KEY, "overview", siteId ?? ""],
    queryFn: async () => (await backendApi.request<Data<AwarenessOverview>>(`awareness/overview${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`)).data,
    enabled, retry: false,
  });

export function useAwarenessMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  const run = <V, R = unknown>(fn: (variables: V) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });

  return {
    saveCampaign: run(({ id, input }: { id?: number | undefined; input: Record<string, unknown> }) =>
      backendApi.request<Campaign>(id ? `awareness-campaigns/${id}` : "awareness-campaigns", json(id ? "PUT" : "POST", input))),
    removeCampaign: run((id: number) => backendApi.request(`awareness-campaigns/${id}`, json("DELETE"))),
    saveMaterial: run(({ campaignId, id, input }: { campaignId: number; id?: number | undefined; input: Record<string, unknown> }) =>
      backendApi.request<Material>(id ? `awareness-materials/${id}` : `awareness-campaigns/${campaignId}/materials`, json(id ? "PUT" : "POST", input))),
    removeMaterial: run((id: number) => backendApi.request(`awareness-materials/${id}`, json("DELETE"))),
    activate: run((id: number) => backendApi.request(`awareness-campaigns/${id}/activate`, json("POST"))),
    close: run((id: number) => backendApi.request(`awareness-campaigns/${id}/close`, json("POST"))),
    invite: run(({ id, ...input }: { id: number; name: string; email?: string; organization?: string }) =>
      backendApi.request<Data<{ link: string }>>(`awareness-campaigns/${id}/invitations`, json("POST", input))),
    read: run(({ campaignId, materialId }: { campaignId: number; materialId: number }) =>
      backendApi.request<Data<{ completed: boolean }>>(`awareness/my/${campaignId}/materials/${materialId}/read`, json("POST"))),
    quiz: run(({ campaignId, materialId, answers }: { campaignId: number; materialId: number; answers: number[] }) =>
      backendApi.request<Data<QuizResult>>(`awareness/my/${campaignId}/materials/${materialId}/quiz`, json("POST", { answers }))),
    saveTalk: run(({ id, input }: { id?: number | undefined; input: Record<string, unknown> }) =>
      backendApi.request<Talk>(id ? `awareness-talks/${id}` : "awareness-talks", json(id ? "PUT" : "POST", input))),
    addAttendee: run(({ id, ...input }: { id: number; name: string; organization?: string }) => backendApi.request(`awareness-talks/${id}/attendees`, json("POST", input))),
    closeTalk: run((id: number) => backendApi.request(`awareness-talks/${id}/close`, json("POST"))),
    sign: run((token: string) => backendApi.request<Data<{ talk: string; already_signed: boolean }>>("awareness-talks/sign", json("POST", { token }))),
  };
}

export const downloadAttestation = (campaignId: number): Promise<Blob> => backendApi.blob(`awareness/my/${campaignId}/attestation`);
export const fetchTalkQr = (id: number): Promise<Blob> => backendApi.blob(`awareness-talks/${id}/qr`);

// --- Accès d'une personne extérieure invitée (lien personnel, sans compte) ---
export const publicContent = async (token: string): Promise<Content> => (await backendApi.request<Data<Content>>(`public/awareness/${token}`)).data;
export const publicRead = (token: string, materialId: number) => backendApi.request<Data<{ completed: boolean }>>(`public/awareness/${token}/materials/${materialId}/read`, json("POST"));
export const publicQuiz = async (token: string, materialId: number, answers: number[]): Promise<QuizResult> =>
  (await backendApi.request<Data<QuizResult>>(`public/awareness/${token}/materials/${materialId}/quiz`, json("POST", { answers }))).data;
export const publicAttestation = (token: string): Promise<Blob> => backendApi.blob(`public/awareness/${token}/attestation`);
