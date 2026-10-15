import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import {
  DashboardPage,
  EnterprisesPage,
  KycPage,
  LogsPage,
  NormsPage,
  OffersPage,
  SA_NAV,
  SettingsPage,
  SubscriptionsPage,
  SuperAdminShell,
  TeamPage,
  type SaSection,
} from "@/components/superadmin";

const parent = getRouteApi("/_authenticated/superadmin");

const PAGES: Record<SaSection, () => React.ReactNode> = {
  dashboard: () => <DashboardPage />,
  kyc: () => <KycPage />,
  entreprises: () => <EnterprisesPage />,
  abonnements: () => <SubscriptionsPage />,
  offres: () => <OffersPage />,
  normes: () => <NormsPage />,
  journaux: () => <LogsPage />,
  equipe: () => <TeamPage />,
  parametres: () => <SettingsPage />,
};

export const Route = createFileRoute("/_authenticated/superadmin/$section")({
  loader: ({ params }) => {
    if (!SA_NAV.some((item) => item.slug === params.section)) throw notFound();
    return { section: params.section as SaSection };
  },
  component: SuperAdminSection,
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Cette rubrique n'existe pas.</p>,
});

function SuperAdminSection() {
  const profile = parent.useLoaderData();
  const { section } = Route.useLoaderData();
  return (
    <SuperAdminShell profile={profile} active={section}>
      {PAGES[section]()}
    </SuperAdminShell>
  );
}
