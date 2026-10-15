import { useQuery } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

export const NORMS_KEY = ["enterprise-norms"] as const;

/** « ISO 14001:2015 », « ISO-14001 » ou « iso 14001 » -> « ISO 14001 » (famille de norme, sans millésime). */
export function normFamily(code: string): string {
  const match = /ISO[\s_-]*(\d{4,5})/i.exec(code);
  return match ? `ISO ${match[1]}` : code.trim();
}

export type NormSection = {
  id: string | number;
  number?: string | null;
  title?: string | null;
  content?: string | null;
  children?: NormSection[];
  [key: string]: unknown;
};

export type EnterpriseNorm = {
  id: string | number;
  code: string;
  name: string;
  title?: string;
  domain?: string | undefined | null;
  status?: string | null;
  has_pdf_document?: boolean;
  pdf_file_url?: string | null;
  pdf_original_name?: string | null;
  currentVersion?: { version_code?: string | null; sections?: NormSection[] } | null;
  current_version?: { version_code?: string | null; sections?: NormSection[] } | null;
  versions?: Array<{ version_code?: string | null; sections?: NormSection[] }>;
  [key: string]: unknown;
};

export type EnterpriseCatalogMeta = {
  siteId?: number | null;
  siteName?: string | null;
  enterpriseId?: number | null;
  activeSubscriptionsCount?: number;
  linkedNormsCount?: number;
  activeNormsCount?: number;
  isTrial?: boolean;
  daysRemaining?: number;
};

export type EnterpriseCatalog = {
  norms: EnterpriseNorm[];
  trialPeriod: boolean;
  trialDaysRemaining: number;
  meta: EnterpriseCatalogMeta;
};

type NormResponse = { data?: unknown; success?: boolean };

function catalogData(payload: NormResponse): Record<string, unknown> {
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return payload.data as Record<string, unknown>;
  }
  return payload as Record<string, unknown>;
}

function itemsFrom(payload: NormResponse): unknown[] {
  if (Array.isArray(payload.data)) return payload.data;
  const data = catalogData(payload);
  if (Array.isArray(data["norms"])) return data["norms"];
  if (Array.isArray(data["data"])) return data["data"];
  return [];
}

function normalizeNorm(item: unknown): EnterpriseNorm {
  const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const attributes =
    raw["attributes"] && typeof raw["attributes"] === "object"
      ? (raw["attributes"] as Record<string, unknown>)
      : raw;
  const currentVersion =
    (attributes["currentVersion"] as EnterpriseNorm["currentVersion"]) ??
    (attributes["current_version"] as EnterpriseNorm["current_version"]) ??
    null;
  const versions = Array.isArray(attributes["versions"])
    ? (attributes["versions"] as EnterpriseNorm["versions"])
    : undefined;
  const normalizeSections = (value: unknown): NormSection[] | undefined =>
    Array.isArray(value) ? value.map(normalizeSection) : undefined;
  return {
    ...attributes,
    id: raw["id"] ?? attributes["id"] ?? "",
    code: String(attributes["code"] ?? ""),
    name: String(attributes["name"] ?? attributes["title"] ?? "Norme"),
    title: String(attributes["title"] ?? attributes["name"] ?? "Norme"),
    domain: attributes["domain"] == null ? null : String(attributes["domain"]),
    status: attributes["status"] == null ? null : String(attributes["status"]),
    has_pdf_document: Boolean(
      attributes["has_pdf_document"] ??
      (attributes as Record<string, unknown>)["hasPdfDocument"] ??
      false,
    ),
    pdf_file_url: attributes["pdf_file_url"] == null ? null : String(attributes["pdf_file_url"]),
    pdf_original_name:
      attributes["pdf_original_name"] == null ? null : String(attributes["pdf_original_name"]),
    currentVersion: currentVersion
      ? {
          ...currentVersion,
          sections: normalizeSections(currentVersion.sections) ?? currentVersion.sections,
        }
      : currentVersion,
    current_version: (attributes["current_version"] as EnterpriseNorm["current_version"])
      ? {
          ...(attributes["current_version"] as Record<string, unknown>),
          sections:
            normalizeSections((attributes["current_version"] as { sections?: unknown }).sections) ??
            (attributes["current_version"] as { sections?: NormSection[] }).sections,
        }
      : (attributes["current_version"] as EnterpriseNorm["current_version"]),
    versions: versions?.map((version) => ({
      ...version,
      sections: normalizeSections(version?.sections) ?? version?.sections,
    })),
  } as EnterpriseNorm;
}

function normalizeSection(item: unknown): NormSection {
  const raw = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const attrs =
    raw["attributes"] && typeof raw["attributes"] === "object"
      ? (raw["attributes"] as Record<string, unknown>)
      : raw;
  // Compatibilité backend historique : `subchapters` -> `children`.
  const rawChildren = Array.isArray(attrs["children"])
    ? attrs["children"]
    : Array.isArray((attrs as Record<string, unknown>)["subchapters"])
      ? ((attrs as Record<string, unknown>)["subchapters"] as unknown[])
      : [];
  return {
    ...attrs,
    id: raw["id"] ?? attrs["id"] ?? "",
    number:
      attrs["number"] == null && (attrs as Record<string, unknown>)["code"] != null
        ? String((attrs as Record<string, unknown>)["code"])
        : attrs["number"] == null
          ? null
          : String(attrs["number"]),
    title:
      attrs["title"] == null && (attrs as Record<string, unknown>)["name"] != null
        ? String((attrs as Record<string, unknown>)["name"])
        : attrs["title"] == null
          ? null
          : String(attrs["title"]),
    content: attrs["content"] == null ? null : String(attrs["content"]),
    children: rawChildren.map(normalizeSection),
  } as NormSection;
}

export async function fetchEnterpriseNorms(params?: {
  site_id?: string | undefined;
  search?: string | undefined;
  domain?: string | undefined;
}) {
  const query = new URLSearchParams();
  if (params?.site_id) query.set("site_id", params.site_id);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await backendApi.request<NormResponse>(`access/catalog${suffix}`);
  const data = catalogData(payload);
  const queryText = params?.search?.trim().toLowerCase();
  const queryDomain = params?.domain?.trim().toLowerCase();
  const norms = itemsFrom(payload)
    .map(normalizeNorm)
    .filter((norm) => {
      const matchesText =
        !queryText || `${norm.code} ${norm.name}`.toLowerCase().includes(queryText);
      const matchesDomain = !queryDomain || String(norm.domain ?? "").toLowerCase() === queryDomain;
      return matchesText && matchesDomain;
    });
  const meta =
    data["meta"] && typeof data["meta"] === "object" ? (data["meta"] as Record<string, unknown>) : {};
  const asNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const catalogMeta: EnterpriseCatalogMeta = {
    siteId: meta["site_id"] == null ? null : asNumber(meta["site_id"], 0) || null,
    siteName: meta["site_name"] == null ? null : String(meta["site_name"]),
    enterpriseId: meta["enterprise_id"] == null ? null : asNumber(meta["enterprise_id"], 0) || null,
    activeSubscriptionsCount: asNumber(meta["active_subscriptions_count"], 0),
    linkedNormsCount: asNumber(meta["linked_norms_count"], 0),
    activeNormsCount: asNumber(meta["active_norms_count"] ?? norms.length, norms.length),
    isTrial: Boolean(meta["is_trial"] ?? data["trial_period"]),
    daysRemaining: asNumber(meta["days_remaining"] ?? data["trial_days_remaining"], 0),
  };
  return {
    norms,
    trialPeriod: Boolean(meta["is_trial"] ?? data["trial_period"]),
    trialDaysRemaining: Number(meta["days_remaining"] ?? data["trial_days_remaining"] ?? 0),
    meta: catalogMeta,
  };
}

export async function fetchNorm(id: string | number) {
  const payload = await backendApi.request<{ data?: unknown }>(`norms/${id}`);
  const value = payload.data ?? payload;
  return normalizeNorm(value);
}

export async function fetchNormChapters(id: string | number) {
  const payload = await backendApi.request<NormResponse>(`norms/${id}/chapters`);
  return itemsFrom(payload).map(normalizeSection);
}

export function useEnterpriseNorms(params?: {
  site_id?: string | undefined;
  search?: string | undefined;
  domain?: string | undefined;
}) {
  return useQuery({
    queryKey: [...NORMS_KEY, params ?? {}],
    queryFn: () => fetchEnterpriseNorms(params),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useNorm(id: string | number | null) {
  return useQuery({
    queryKey: [...NORMS_KEY, "detail", id],
    queryFn: () => fetchNorm(id as string | number),
    enabled: id !== null,
    staleTime: 60_000,
    retry: 1,
  });
}

export function flattenNormSections(sections: NormSection[], output: NormSection[] = []) {
  sections.forEach((section) => {
    output.push(section);
    const children = Array.isArray(section.children)
      ? section.children
      : Array.isArray((section as Record<string, unknown>)["subchapters"])
        ? ((section as Record<string, unknown>)["subchapters"] as NormSection[])
        : [];
    if (children.length > 0) flattenNormSections(children, output);
  });
  return output;
}
