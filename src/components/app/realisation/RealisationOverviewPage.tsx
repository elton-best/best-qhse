import { Link } from "@tanstack/react-router";
import { ClipboardCheck, Factory, Package, PackageX, PenTool, SlidersHorizontal } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  Header,
  PageSkeleton,
  SiteNotice,
  Stat,
  card,
  muted,
  secondary,
} from "../planning/shared";
import { useOperationalOverview } from "@/integrations/backend/realisation";
import { ProductionPage } from "./ProductionPage";

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

const SHORTCUTS = [
  { slug: "maitrise-operationnelle", label: "Maîtrise opérationnelle", icon: SlidersHorizontal },
  { slug: "exigences", label: "Exigences produits & services", icon: ClipboardCheck },
  { slug: "conception", label: "Conception & développement", icon: PenTool },
  { slug: "liberation", label: "Libération", icon: Package },
  { slug: "sorties-non-conformes", label: "Sorties non conformes", icon: PackageX },
] as const;

export function RealisationOverviewPage() {
  const [siteId] = useCurrentSite();
  const { data: overview, isLoading } = useOperationalOverview(siteId);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Réalisation des activités"
        title="Production & prestation"
        description="Vue d'ensemble des projets opérationnels (§8.1) et registre des opérations de production."
        icon={Factory}
      >
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Link
              key={shortcut.slug}
              to="/app/$section"
              params={{ section: shortcut.slug }}
              className={secondary}
            >
              <Icon className="h-4 w-4" /> {shortcut.label}
            </Link>
          );
        })}
      </Header>

      <div className={`${card} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        {isLoading || !overview ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <PageSkeleton rows={1} />
          </div>
        ) : (
          <>
            <Stat value={overview.totalProjects} label="Projets opérationnels" />
            <Stat value={overview.totalActivities} label="Activités" />
            <Stat
              value={`${overview.completedTasks}/${overview.totalTasks}`}
              label="Tâches terminées"
              tone="text-emerald-600"
            />
            <Stat
              value={`${overview.progressRate} %`}
              label="Avancement global"
              tone="text-amber-600"
            />
          </>
        )}
      </div>

      {!isLoading && overview && overview.projects.length > 0 && (
        <div className={`${card} p-5`}>
          <h2 className="font-display text-lg font-bold">Projets opérationnels</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {overview.projects.map((project) => (
              <article
                key={String(project.id)}
                className="rounded-xl border border-border bg-background p-4"
              >
                <p className="text-xs font-bold text-muted-foreground">
                  {str(project["code"]) || `#${String(project.id)}`}
                </p>
                <h3 className="mt-1 font-display font-bold">
                  {str(project["title"]) || "Sans intitulé"}
                </h3>
                <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>
                  {str(project["description"]) || "—"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Statut : {str(project["status"]) || "—"}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      <ProductionPage />
    </div>
  );
}
