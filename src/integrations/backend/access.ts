import { useQuery } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

/**
 * Sous-modules accessibles : calculés par Laravel à partir de l'offre souscrite et des normes
 * choisies pour le site (le serveur refuse aussi les appels aux modules hors offre).
 */
export type AccessibleSubModule = {
  id: number;
  code: string;
  name: string;
  module_code: string;
  has_permission: boolean;
};

export function useAccessibleSubModules(siteId: string | undefined) {
  return useQuery({
    queryKey: ["accessible-sub-modules", siteId ?? ""],
    queryFn: async () => {
      const query = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
      const payload = await backendApi.request<{ data?: AccessibleSubModule[] }>(`sub-modules/accessible${query}`);
      return new Set((payload.data ?? []).filter((item) => item.has_permission).map((item) => item.code));
    },
    staleTime: 60_000,
    retry: 1,
  });
}
