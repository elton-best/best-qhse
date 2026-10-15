import { createFileRoute, notFound } from "@tanstack/react-router";
import { SECTIONS } from "@/components/app/sections";
import { SectionView } from "@/components/app/SectionView";
import {
  CompanyPage,
  JournalPage,
  NormsPage,
  PreferencesPage,
  QueuePage,
  RolesPage,
  SubscriptionPage,
  TasksPage,
} from "@/components/app/CustomPages";
import { InboxPage, MyActionsPage } from "@/components/app/Extras";
import {
  DuerpView,
  GuideSection,
  ManagementConsolidation,
  ObjectivesGrid,
  ProcessReviewView,
  RisksView,
} from "@/components/app/GuidePages";
import {
  ContextOrganisationPage,
  StakeholdersPage,
} from "@/components/app/OrganisationContextPages";
import { ProcessManagementPage } from "@/components/app/ProcessPages";
import { ProcessFullPage } from "@/components/app/ProcessFullPage";
import { ScopePage } from "@/components/app/ScopePages";
import {
  CollaboratorsPage,
  JobDescriptionsPage,
  OrgChartPage,
  PolicyPage,
  ResponsibilitiesPage,
} from "@/components/app/LeadershipPages";
import { RisksPage } from "@/components/app/planning/RisksPage";
import { ObjectivesPage } from "@/components/app/planning/ObjectivesPage";
import { ActionsPage } from "@/components/app/planning/ActionsPage";
import { SmPlanPage } from "@/components/app/planning/SmPlanPage";
import {
  DesignPage,
  NonconformingPage,
  OperationalControlPage,
  ProceduresPage,
  RealisationOverviewPage,
  ReleasePage,
  RequirementsPage,
} from "@/components/app/realisation";
import { HabilitationsPage } from "@/components/app/HabilitationsPage";
import { SitesPage } from "@/components/app/SitesPage";
import { GlobalLoader } from "@/components/app/GlobalLoader";
import { SectionErrorBoundary } from "@/components/app/SectionErrorBoundary";

const GUIDE: Record<string, { id: string; label: string; render: () => React.ReactNode }[]> = {
  risques: [
    {
      id: "ro",
      label: "Risques & opportunités (grille, tableau, actions)",
      render: () => <RisksView />,
    },
  ],
  dangers: [{ id: "duerp", label: "DUERP par unité de travail", render: () => <DuerpView /> }],
  objectifs: [
    { id: "grid", label: "Grille mensuelle & taux d'atteinte", render: () => <ObjectivesGrid /> },
  ],
  "revue-processus": [
    { id: "rvp", label: "Revue en 9 sections", render: () => <ProcessReviewView /> },
  ],
  "revue-direction": [
    {
      id: "cons",
      label: "Consolidation des revues de processus",
      render: () => <ManagementConsolidation />,
    },
  ],
};

const CUSTOM = [
  "entreprise",
  "roles",
  "abonnement",
  "taches",
  "verification",
  "approbation",
  "normes",
  "preferences",
  "journal",
  "mes-actions",
  "boite-reception",
  "habilitations",
];

type Search = {
  open?: string | undefined;
  new?: number | undefined;
  origin?: string | undefined;
  kind?: string | undefined;
  tab?: string | undefined;
};

function normalizeSearchId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const decoded = JSON.parse(trimmed);
    if (typeof decoded === "string" && decoded.trim()) return decoded.trim();
  } catch {
    // L'identifiant peut être une valeur texte simple dans l'URL.
  }
  return trimmed.replace(/^["']|["']$/g, "").trim() || undefined;
}

export const Route = createFileRoute("/_authenticated/app/$section")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    open: normalizeSearchId(s["open"]),
    new: s["new"] ? 1 : undefined,
    origin: typeof s["origin"] === "string" ? (s["origin"] as string) : undefined,
    kind: typeof s["kind"] === "string" ? (s["kind"] as string) : undefined,
    tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined,
  }),
  loader: ({ params }) => {
    if (!SECTIONS[params.section] && !CUSTOM.includes(params.section)) throw notFound();
    return { slug: params.section };
  },
  component: SectionPage,
  pendingComponent: () => (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <GlobalLoader label="Chargement de la rubrique" />
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Cette rubrique n'existe pas.</div>
  ),
  errorComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Impossible de charger cette rubrique.</div>
  ),
});

function SectionPage() {
  const { slug } = Route.useLoaderData();
  const search = Route.useSearch();
  switch (slug) {
    case "entreprise":
      return <CompanyPage />;
    case "roles":
      return <RolesPage />;
    case "abonnement":
      return <SubscriptionPage />;
    case "taches":
      return <TasksPage />;
    case "verification":
      return <QueuePage mode="verification" />;
    case "approbation":
      return <QueuePage mode="approbation" />;
    case "normes":
      return <NormsPage />;
    case "sites":
      return <SitesPage />;
    case "preferences":
      return <PreferencesPage />;
    case "journal":
      return <JournalPage />;
    case "mes-actions":
      return <MyActionsPage />;
    case "boite-reception":
      return <InboxPage />;
    case "habilitations":
      return <HabilitationsPage />;
    case "contexte":
      return <ContextOrganisationPage />;
    case "parties-interessees":
      return <StakeholdersPage />;
    case "perimetre":
      return <ScopePage />;
    case "processus": {
      const resetKey = `processus-${search.open ?? "list"}-${search.tab ?? "general"}-${search.new ? "new" : "view"}`;
      return (
        <SectionErrorBoundary key={resetKey} onResetKey={resetKey}>
          {search.new ? (
            <ProcessFullPage />
          ) : search.open ? (
            <ProcessFullPage processId={search.open} tab={search.tab ?? "general"} />
          ) : (
            <ProcessManagementPage />
          )}
        </SectionErrorBoundary>
      );
    }
    case "politique":
      return <PolicyPage />;
    case "organigramme":
      return <OrgChartPage />;
    case "collaborateurs":
      return <CollaboratorsPage />;
    case "fiches-poste":
      return <JobDescriptionsPage />;
    case "responsabilites":
      return <ResponsibilitiesPage />;
    case "risques":
      return <RisksPage />;
    case "objectifs":
      return <ObjectivesPage />;
    case "actions":
      return <ActionsPage />;
    case "plan-sm":
      return <SmPlanPage />;
    case "procedures":
      return <ProceduresPage />;
    case "maitrise-operationnelle":
      return <OperationalControlPage />;
    case "exigences":
      return <RequirementsPage />;
    case "conception":
      return <DesignPage />;
    case "realisation":
      return <RealisationOverviewPage />;
    case "liberation":
      return <ReleasePage />;
    case "sorties-non-conformes":
      return <NonconformingPage />;
  }
  const section = SECTIONS[slug]!;
  if (GUIDE[slug] && !search.open && !search.new)
    return <GuideSection key={slug} slug={slug} views={GUIDE[slug]!} />;
  return (
    <SectionView
      key={slug}
      section={section}
      openId={search.open}
      createNew={!!search.new}
      newKind={search.kind}
      originId={search.origin}
    />
  );
}
