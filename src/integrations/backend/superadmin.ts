import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackendApiError, backendApi } from "@/integrations/backend/client";

/**
 * Administration de la plateforme (super administrateur) : validation KYC, contrôle des entreprises,
 * publication des normes, offres et abonnements, journaux, sessions et paramètres.
 * Contrats Laravel : préfixe `/superadmin` (SuperAdminController et contrôleurs associés).
 */

type Envelope<T> = { success?: boolean; data: T; message?: string; meta?: PageMeta };
export type PageMeta = { current_page: number; last_page?: number; per_page: number; total: number };
export type Page<T> = { items: T[]; meta: PageMeta };

// ---------- Double authentification des actions sensibles ----------

type StepUpHandler = (mfaToken: string) => Promise<boolean>;
let stepUpHandler: StepUpHandler | null = null;

/** Enregistré par l'interface : demande le code reçu par e-mail puis le valide. */
export function setStepUpHandler(handler: StepUpHandler | null): void {
  stepUpHandler = handler;
}

export async function verifyStepUp(mfaToken: string, code: string): Promise<void> {
  await backendApi.request("auth/mfa/verify", { method: "POST", body: JSON.stringify({ token: mfaToken, code }) });
}

export async function saRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await backendApi.request<T>(path, init);
  } catch (error) {
    const payload = error instanceof BackendApiError ? (error.payload as Record<string, unknown> | undefined) : undefined;
    if (error instanceof BackendApiError && error.status === 423 && payload?.["code"] === "MFA_REQUIRED" && stepUpHandler) {
      if (await stepUpHandler(String(payload["mfa_token"] ?? ""))) return backendApi.request<T>(path, init);
    }
    throw error;
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

// ---------- Types ----------

export type SaStats = {
  kyc: { pending: number; approved: number; rejected: number; total: number };
  companies: { total: number; active: number; suspended: number };
  subscriptions: { active: number; total: number };
  revenue: { total: string | number; series: number[]; trend_pct: number };
  weekly: { new_registrations: number; kyc_validations: number };
};

export type SaEnterpriseDocument = {
  id: number;
  type?: string | null;
  name?: string | null;
  original_name?: string | null;
  file_name?: string | null;
  download_url?: string;
  preview_url?: string;
  file_size?: number | null;
  file_extension?: string | null;
};

export type SaEnterprise = {
  id: number;
  ref: string;
  name: string;
  email: string | null;
  registration_number: string | null;
  rccm_number?: string | null;
  ifu_number?: string | null;
  field: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  status: string;
  approval_status: "pending" | "approved" | "rejected" | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  trial_ends_at: string | null;
  created_at: string;
  users?: { id: number; name: string; email: string; role?: string }[];
  sites?: { id: number; name: string; city?: string | null; is_headquarter?: boolean }[];
  documents?: SaEnterpriseDocument[];
  enterprise_admin?: { id: number; name: string; email: string; phone: string | null } | null;
};

export type SaNorm = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  domain: string;
  status: "draft" | "published" | "archived" | string;
  enterprises_count?: number;
  pdf_file_url?: string | null;
  versions?: { id: number; version_code: string; full_code?: string | null; is_current?: boolean }[];
  current_version?: { id: number; version_code: string } | null;
};

export type SaOffer = {
  id: number;
  ref: string;
  name: string;
  description: string | null;
  is_active: boolean;
  price: string | number;
  duration_months: number;
  norms: { id: number; code: string; name: string }[];
};

export type SaSubscription = {
  id: number;
  ref: string;
  offer_id: number;
  site_id: number;
  status: string;
  is_active: boolean;
  is_trial: boolean;
  start_date: string | null;
  expiration_date: string | null;
  amount_paid?: string | number | null;
  offer?: { id: number; name: string; norms?: { code: string }[] } | null;
  site?: { id: number; name: string; enterprise?: { id: number; name: string } | null } | null;
  enterprise_name?: string | null;
  offer_name?: string | null;
};

export type SaPlatformUser = {
  id: number;
  name: string;
  email: string;
  username: string | null;
  role: string | null;
  is_active: boolean;
  user_type: string;
  enterprise_id: number | null;
  created_at?: string;
};

export type SaRole = { id: number; name: string; label: string; permissions_count: number };

export type SaLog = {
  id: number;
  event_type: string;
  action: string;
  resource_type: string | null;
  resource_id: string | number | null;
  risk_level: "low" | "medium" | "high" | "critical" | string;
  status: string | null;
  ip_address: string | null;
  created_at: string;
  user?: { id: number; name: string; email: string } | null;
  enterprise?: { id: number; name: string } | null;
  site?: { id: number; name: string } | null;
};

export type SaLogStats = {
  total_events: number;
  high_risk_events: number;
  critical_events: number;
  events_today: number;
  failed_logins_today: number;
};

export type SaSession = {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  mfa_verified_at: string | null;
  is_current: boolean;
};

export type SaSettings = {
  general: {
    platformName: string; platformDescription: string; supportEmail: string; supportPhone: string;
    defaultLanguage: string; defaultCurrency: string; timezone: string;
  };
  email: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string | null; encryption: string };
  security: { enforceStrongPassword: boolean; enable2FA: boolean; sessionTimeout: boolean; sessionTimeoutMinutes: number; maxLoginAttempts: number };
  system: { maintenanceMode: boolean; maintenanceMessage: string };
  system_info?: { version: string; database: string; server: string; lastBackup: string | null };
};

const KEY = ["superadmin"] as const;

function page<T>(response: Envelope<T[]>): Page<T> {
  return {
    items: response.data,
    meta: response.meta ?? { current_page: 1, per_page: response.data.length, total: response.data.length },
  };
}

// ---------- Lectures ----------

export const useSaStats = () =>
  useQuery({ queryKey: [...KEY, "stats"], queryFn: async () => (await saRequest<Envelope<SaStats>>("superadmin/stats")).data, staleTime: 30_000 });

export type EnterpriseFilters = { status?: string; approval_status?: string; search?: string; page?: number; per_page?: number; kyc_priority?: number };

export const useSaEnterprises = (filters: EnterpriseFilters) =>
  useQuery({
    queryKey: [...KEY, "enterprises", filters],
    queryFn: async () => page(await saRequest<Envelope<SaEnterprise[]>>(`superadmin/enterprises${qs(filters)}`)),
    staleTime: 15_000,
  });

export const useSaEnterprise = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "enterprise", id],
    queryFn: async () => (await saRequest<Envelope<SaEnterprise>>(`superadmin/enterprises/${id}`)).data,
    enabled: id !== null,
  });

export const useSaNorms = () =>
  useQuery({ queryKey: [...KEY, "norms"], queryFn: async () => (await saRequest<Envelope<SaNorm[]>>("superadmin/norms")).data, staleTime: 30_000 });

export const useSaNorm = (id: number | null) =>
  useQuery({
    queryKey: [...KEY, "norm", id],
    queryFn: async () => (await saRequest<Envelope<SaNorm>>(`superadmin/norms/${id}`)).data,
    enabled: id !== null,
  });

export const useSaOffers = () =>
  useQuery({ queryKey: [...KEY, "offers"], queryFn: async () => (await saRequest<Envelope<SaOffer[]>>("superadmin/offers")).data, staleTime: 30_000 });

export const useSaSubscriptions = (filters: { status?: string; search?: string; page?: number }) =>
  useQuery({
    queryKey: [...KEY, "subscriptions", filters],
    queryFn: async () => page(await saRequest<Envelope<SaSubscription[]>>(`superadmin/subscriptions${qs({ per_page: 15, ...filters })}`)),
    staleTime: 15_000,
  });

export const useSaUsers = (filters: { search?: string; page?: number }) =>
  useQuery({
    queryKey: [...KEY, "users", filters],
    queryFn: async () => page(await saRequest<Envelope<SaPlatformUser[]>>(`superadmin/users${qs({ per_page: 15, ...filters })}`)),
    staleTime: 15_000,
  });

export const useSaRoles = () =>
  useQuery({ queryKey: [...KEY, "roles"], queryFn: async () => (await saRequest<Envelope<SaRole[]>>("superadmin/roles")).data, staleTime: 120_000 });

export type LogFilters = {
  event_type?: string; risk_level?: string; action?: string; enterprise_id?: number | undefined;
  date_from?: string; date_to?: string; page?: number; per_page?: number;
};

export const useSaLogs = (filters: LogFilters) =>
  useQuery({
    queryKey: [...KEY, "logs", filters],
    queryFn: async () => {
      const response = await saRequest<{
        data: SaLog[]; current_page: number; last_page: number; per_page: number; total: number;
      }>(`superadmin/audit-logs${qs({ per_page: 25, ...filters })}`);
      return {
        items: response.data,
        meta: { current_page: response.current_page, last_page: response.last_page, per_page: response.per_page, total: response.total },
      } satisfies Page<SaLog>;
    },
    staleTime: 10_000,
  });

export const useSaLogStats = (filters: Pick<LogFilters, "enterprise_id" | "date_from" | "date_to">) =>
  useQuery({
    queryKey: [...KEY, "log-stats", filters],
    queryFn: () => saRequest<SaLogStats>(`superadmin/audit-logs/stats${qs(filters)}`),
    staleTime: 10_000,
  });

export const useSaSessions = () =>
  useQuery({ queryKey: [...KEY, "sessions"], queryFn: async () => (await saRequest<Envelope<SaSession[]>>("superadmin/sessions")).data });

export const useSaSettings = () =>
  useQuery({ queryKey: [...KEY, "settings"], queryFn: async () => (await saRequest<Envelope<SaSettings>>("superadmin/settings")).data });

// ---------- Actions ----------

export function useSaMutations() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  const action = <V,>(run: (variables: V) => Promise<unknown>) => useMutation({ mutationFn: run, onSuccess: refresh });

  return {
    approveEnterprise: action((id: number) => saRequest(`superadmin/enterprises/${id}/approve`, json("POST"))),
    rejectEnterprise: action(({ id, reason }: { id: number; reason: string }) =>
      saRequest(`superadmin/enterprises/${id}/reject`, json("POST", { reason }))),
    suspendEnterprise: action(({ id, reason }: { id: number; reason: string }) =>
      saRequest(`superadmin/enterprises/${id}/suspend`, json("POST", { reason }))),
    reactivateEnterprise: action((id: number) => saRequest(`superadmin/enterprises/${id}/reactivate`, json("POST"))),
    deleteEnterprise: action((id: number) => saRequest(`superadmin/enterprises/${id}`, json("DELETE"))),

    createNorm: action((input: { code: string; name: string; description?: string; domain: string; version_code: string; publish: boolean }) =>
      saRequest("superadmin/norms", json("POST", input))),
    updateNorm: action(({ id, ...input }: { id: number; name?: string; description?: string; domain?: string }) =>
      saRequest(`superadmin/norms/${id}`, json("PUT", input))),
    normTransition: action(({ id, action: step }: { id: number; action: "publish" | "archive" | "unarchive" }) =>
      saRequest(`superadmin/norms/${id}/${step}`, json("POST"))),
    deleteNorm: action((id: number) => saRequest(`superadmin/norms/${id}`, json("DELETE"))),
    importNorm: action(async (input: { file: File; code: string; name: string; domain: string; version_code: string; description?: string }) => {
      const body = new FormData();
      Object.entries(input).forEach(([key, value]) => value !== undefined && body.append(key, value as string | Blob));
      return saRequest("superadmin/norms/import", { method: "POST", body });
    }),

    saveOffer: action(({ id, ...input }: { id?: number; name: string; description?: string; price: number; duration_months: number; norms: number[]; is_active?: boolean }) =>
      saRequest(id ? `superadmin/offers/${id}` : "superadmin/offers", json(id ? "PUT" : "POST", input))),
    deleteOffer: action((id: number) => saRequest(`superadmin/offers/${id}`, json("DELETE"))),

    suspendSubscription: action(({ id, reason }: { id: number; reason: string }) =>
      saRequest(`superadmin/subscriptions/${id}/suspend`, json("POST", { reason }))),
    reactivateSubscription: action((id: number) => saRequest(`superadmin/subscriptions/${id}/reactivate`, json("POST"))),
    deleteSubscription: action((id: number) => saRequest(`superadmin/subscriptions/${id}`, json("DELETE"))),

    saveUser: action(({ id, ...input }: { id?: number; first_name?: string; last_name?: string; username?: string; email?: string; password?: string; role_name?: string; is_active?: boolean }) =>
      saRequest(id ? `superadmin/users/${id}` : "superadmin/users", json(id ? "PUT" : "POST", input))),

    revokeSession: action((id: number) => saRequest(`superadmin/sessions/${id}`, json("DELETE"))),
    saveSettings: action((input: SaSettings) => saRequest("superadmin/settings", json("PUT", input))),
    testEmail: action((input: { email: string }) => saRequest("superadmin/settings/email/test", json("POST", input))),
    changeOwnPassword: action((password: string) =>
      backendApi.request("auth/profile", json("PUT", { password, password_confirmation: password }))),
  };
}
