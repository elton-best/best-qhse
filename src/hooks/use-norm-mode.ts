import { useMemo } from "react";
import { normFamily, useEnterpriseNorms } from "@/integrations/backend/norms";

export type NormMode = "unknown" | "single" | "integrated";

/**
 * Normes actives du site courant et mode de gestion :
 * - `single`     : une seule norme, interfaces et canevas de cette norme uniquement ;
 * - `integrated` : plusieurs normes, briques communes partagées et pilotage consolidé.
 */
export function useNormMode(siteId?: string): { mode: NormMode; codes: string[]; has: (code: string) => boolean; isLoading: boolean } {
  const { data, isLoading } = useEnterpriseNorms({ site_id: siteId || undefined });
  return useMemo(() => {
    const codes = data ? [...new Set(data.norms.map((norm) => normFamily(norm.code)))] : [];
    const mode: NormMode = !data ? "unknown" : codes.length >= 2 ? "integrated" : "single";
    return { mode, codes, has: (code: string) => codes.includes(code), isLoading };
  }, [data, isLoading]);
}
