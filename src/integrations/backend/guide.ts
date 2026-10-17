import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/** Assistant de démarrage (T-01) et score de préparation à la certification (T-03). Contrat Laravel : SetupGuideController. */

export type StepState = "todo" | "in_progress" | "done" | "skipped";
export type GuideStep = { key: string; title: string; why: string; slug: string; state: StepState; count: number; can_apply: boolean; applied_sector: string | null };
export type Guide = { site: { id: number; name: string }; steps: GuideStep[]; done: number; total: number; sectors: { key: string; label: string }[] };
export type ReadinessState = "ok" | "partial" | "missing";
export type ClauseStatus = "compliant" | "to_complete" | "missing";
export type Readiness = {
  site: { id: number; name: string }; score: number; counts: Record<ClauseStatus, number>;
  clauses: { clause: string; title: string; status: ClauseStatus; checks: { label: string; state: ReadinessState; detail: string; fix: string }[] }[];
  gaps: { clause: string; title: string; label: string; state: ReadinessState; detail: string; fix: string }[];
};

const KEY = ["guide"] as const;
const site = (siteId: string | undefined): string => (siteId ? `?site_id=${encodeURIComponent(siteId)}` : "");

export const useGuide = (siteId: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...KEY, "steps", siteId ?? ""], queryFn: async () => (await backendApi.request<{ data: Guide }>(`setup-guide${site(siteId)}`)).data, enabled });

export const useReadiness = (siteId: string | undefined, enabled = true) =>
  useQuery({ queryKey: [...KEY, "readiness", siteId ?? ""], queryFn: async () => (await backendApi.request<{ data: Readiness }>(`certification-readiness${site(siteId)}`)).data, enabled, staleTime: 15_000 });

export function useGuideMutations(siteId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: KEY });
  return {
    apply: useMutation({
      mutationFn: ({ step, sector }: { step: string; sector: string }) =>
        backendApi.request<{ data: { created: number } }>(`setup-guide/${step}/apply${site(siteId)}`, { method: "POST", body: JSON.stringify({ sector }) }),
      onSuccess: refresh,
    }),
    skip: useMutation({
      mutationFn: ({ step, skipped }: { step: string; skipped: boolean }) =>
        backendApi.request(`setup-guide/${step}/skip${site(siteId)}`, { method: "POST", body: JSON.stringify({ skipped }) }),
      onSuccess: refresh,
    }),
  };
}
