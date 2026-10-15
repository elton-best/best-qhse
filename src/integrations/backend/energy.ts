import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Listes de choix des champs relationnels des sections ISO 50001.
 * Les identifiants renvoyés sont revalidés côté Laravel (appartenance à l'entreprise).
 */
export type RelationSource = "users" | "ipe" | "equipment" | "provider";

export type RelationOption = { value: string; label: string };

const ENDPOINTS: Record<RelationSource, (siteId: string) => string> = {
  users: () => "users?per_page=200",
  ipe: (siteId) => `ipe?site_id=${encodeURIComponent(siteId)}`,
  equipment: (siteId) => `equipements?per_page=200&site_id=${encodeURIComponent(siteId)}`,
  provider: () => "provider-partners?per_page=100",
};

const LABEL_KEYS: Record<RelationSource, string[]> = {
  users: ["name", "full_name", "email"],
  ipe: ["nom", "name"],
  equipment: ["nom_commun", "code_complet", "name"],
  provider: ["designation", "name", "reference"],
};

function listOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const data = (payload as Record<string, unknown>)["data"];
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return listOf(data);
  }
  return [];
}

export function toRelationOptions(source: RelationSource, payload: unknown): RelationOption[] {
  return listOf(payload).flatMap((entry) => {
    const item = flattenResource(entry);
    const id = item["id"];
    if (id == null || id === "") return [];
    const label = LABEL_KEYS[source]
      .map((key) => item[key])
      .find((value) => typeof value === "string" && value.trim() !== "");
    return [{ value: String(id), label: typeof label === "string" ? label : `#${String(id)}` }];
  });
}

export function useRelationOptions(source: RelationSource, siteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["energy-relation-options", source, siteId],
    queryFn: async () =>
      toRelationOptions(source, await backendApi.request<unknown>(ENDPOINTS[source](siteId))),
    enabled: enabled && Boolean(siteId),
    staleTime: 60_000,
  });
}

// ---------- IPÉ (indicateurs de performance énergétique) ----------

export type IpePeriodicity = "journalier" | "hebdomadaire" | "mensuel" | "trimestriel" | "annuel";

export type Ipe = {
  id: number;
  site_id: number;
  nom: string;
  description: string | null;
  formule_calcul: string;
  unite: string;
  valeur_reference: string | null;
  objectif_cible: string | null;
  date_reference: string | null;
  periodicite: IpePeriodicity;
  actif: boolean;
};

export type IpeValue = {
  id: number;
  periode_debut: string;
  periode_fin: string;
  valeur: string;
  ecart_reference: string | null;
  ecart_objectif: string | null;
  commentaire: string | null;
};

export type IpeInput = {
  site_id?: string | number;
  nom: string;
  description?: string;
  formule_calcul: string;
  unite: string;
  periodicite: IpePeriodicity;
  valeur_reference?: number | null;
  objectif_cible?: number | null;
  date_reference?: string | null;
  actif?: boolean;
};

export type IpeValueInput = {
  periode_debut: string;
  periode_fin: string;
  valeur: number;
  commentaire?: string;
};

const IPE_KEY = ["energy-ipe"] as const;

export function useIpeList(siteId: string) {
  return useQuery({
    queryKey: [...IPE_KEY, "list", siteId],
    queryFn: () =>
      backendApi.request<Ipe[]>(`ipe?site_id=${encodeURIComponent(siteId)}`),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
}

export function useIpeValues(ipeId: number | null) {
  return useQuery({
    queryKey: [...IPE_KEY, "values", ipeId],
    queryFn: () => backendApi.request<IpeValue[]>(`ipe/${ipeId}/valeurs`),
    enabled: ipeId !== null,
    staleTime: 15_000,
  });
}

export function useIpeMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: IPE_KEY });
  return {
    create: useMutation({
      mutationFn: (input: IpeInput) =>
        backendApi.request<Ipe>("ipe", { method: "POST", body: JSON.stringify(input) }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: number; input: Partial<IpeInput> }) =>
        backendApi.request<Ipe>(`ipe/${id}`, { method: "PUT", body: JSON.stringify(input) }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: number) => backendApi.request<unknown>(`ipe/${id}`, { method: "DELETE" }),
      onSuccess: refresh,
    }),
    addValue: useMutation({
      mutationFn: ({ id, input }: { id: number; input: IpeValueInput }) =>
        backendApi.request<IpeValue>(`ipe/${id}/valeurs`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      onSuccess: refresh,
    }),
  };
}
