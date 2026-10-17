import { useQuery } from "@tanstack/react-query";
import { backendApi } from "./client";
import type { Locale } from "@/lib/i18n";

export type ScopePublication = {
  id: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};
export type ScopeReview = {
  review_frequency_months: number;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  review_required_at: string | null;
  review_reason: string | null;
};
export type PublicScope = {
  version: string;
  processes: { name: string; type: string }[];
  scope_definition: string | null;
  scope: string | null;
  enterprise_name: string;
  site_name: string;
  products_services: string[] | null;
  organizational_units: string[] | null;
  locations: string[] | null;
  scope_exclusions: string | null;
  exclusions: string | null;
  exclusions_justification: string | null;
  published_at: string;
  expires_at: string;
};
export type LeadershipAnswer = {
  status: "yes" | "partial" | "no" | "" | null;
  justification: string;
};
export type LeadershipReview = {
  id: number;
  year: number;
  answers: Record<string, LeadershipAnswer>;
  status: "draft" | "completed";
  completed_at: string | null;
};
export type RiskExample = {
  id: string;
  type: "risque" | "opportunite";
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  cause: Record<Locale, string>;
  consequence: Record<Locale, string>;
};
export type ObjectiveSnapshot = {
  ref: string;
  title: string;
  description: string | null;
  target_value: string;
  unit: string | null;
  deadline: string | null;
  updated_at: string;
};
export type ObjectiveCommunication = {
  id: number;
  snapshot: ObjectiveSnapshot;
  message: string | null;
  content_locale: Locale;
  created_at: string;
  acknowledged_at?: string | null;
  receipts?: { id: number; name: string; acknowledged_at: string | null }[];
};

export const isoFoundationApi = {
  scope: (id: string) =>
    backendApi.request<{
      data: { publications: ScopePublication[]; review: ScopeReview; can_manage: boolean };
    }>(`application-scopes/${id}/publications`),
  publishScope: (id: string, expiresAt: string) =>
    backendApi.request<{ data: { id: number; path: string; expires_at: string } }>(
      `application-scopes/${id}/publications`,
      { method: "POST", body: JSON.stringify({ expires_at: expiresAt }) },
    ),
  revokeScope: (id: string, publication: number) =>
    backendApi.request(`application-scopes/${id}/publications/${publication}`, {
      method: "DELETE",
    }),
  reviewScope: (
    id: string,
    data: {
      action: "configure" | "complete" | "request";
      review_frequency_months: number;
      reason: string;
    },
  ) =>
    backendApi.request(`application-scopes/${id}/review`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  publicScope: (token: string) =>
    backendApi.request<{ data: PublicScope }>(`public/scopes/${encodeURIComponent(token)}`),
  leadership: (siteId: string) =>
    backendApi.request<{
      data: {
        commitments: Record<string, Record<Locale, string>>;
        reviews: LeadershipReview[];
        can_manage: boolean;
      };
    }>(`leadership-reviews?site_id=${encodeURIComponent(siteId)}`),
  saveLeadership: (data: {
    site_id: string;
    year: number;
    answers: Record<string, LeadershipAnswer>;
    status: "draft" | "completed";
  }) =>
    backendApi.request<{ data: LeadershipReview }>("leadership-reviews", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  communications: (id: string | number) =>
    backendApi.request<{
      data: {
        communications: ObjectiveCommunication[];
        recipients: { id: number; name: string }[];
      };
    }>(`objectives/${id}/communications`),
  sendObjective: (
    id: string | number,
    data: { recipient_ids: number[]; message: string; content_locale: Locale },
  ) =>
    backendApi.request(`objectives/${id}/communications`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  inbox: (siteId: string) =>
    backendApi.request<{ data: ObjectiveCommunication[] }>(
      `objective-communications/inbox?site_id=${encodeURIComponent(siteId)}`,
    ),
  acknowledge: (id: number) =>
    backendApi.request(`objective-communications/${id}/acknowledge`, { method: "POST" }),
};

export function useRiskExamples() {
  return useQuery({
    queryKey: ["environmental-risk-examples"],
    queryFn: async () =>
      (await backendApi.request<{ data: RiskExample[] }>("risks-opportunities/examples")).data,
    staleTime: Infinity,
  });
}

export type FoundationNotification = {
  id: string;
  data: {
    type: "scope_review_due" | "objective_communicated";
    data: { title: string; message: string; site_id?: number };
  };
  created_at: string;
};
export const FOUNDATION_NOTIFICATIONS_KEY = ["foundation-notifications"] as const;
export function useFoundationNotifications() {
  return useQuery({
    queryKey: FOUNDATION_NOTIFICATIONS_KEY,
    queryFn: async () => {
      const result = await backendApi.request<{ data: FoundationNotification[] }>(
        "notifications?unread_only=1&per_page=100",
      );
      return result.data.filter((n) =>
        ["scope_review_due", "objective_communicated"].includes(n.data.type),
      );
    },
    refetchInterval: 60_000,
  });
}
export const markFoundationNotificationRead = (id: string) =>
  backendApi.request(`notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
