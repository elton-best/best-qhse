import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Layers,
  Megaphone,
  ShieldAlert,
  Users,
  Wrench,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  Header,
  SiteNotice,
  Stat,
  card,
  primary,
  secondary,
} from "@/components/app/support/shared";
import {
  useDocumentStats,
  useEquipements,
  useFormationStats,
  useMaintenanceAlertes,
  useCommunicationStats,
} from "@/integrations/backend/support";

export function SupportOverviewPage() {
  const [siteId] = useCurrentSite();
  const currentYear = new Date().getFullYear();

  const { data: equipements = [] } = useEquipements({ site_id: siteId || undefined });
  const { data: alertes = [] } = useMaintenanceAlertes(siteId || undefined);
  const { data: formationStats } = useFormationStats(currentYear, siteId || undefined);
  const { data: comStats } = useCommunicationStats(
    currentYear,
    siteId || undefined,
    "communication",
  );
  const { data: sensStats } = useCommunicationStats(
    currentYear,
    siteId || undefined,
    "sensibilisation",
  );
  const { data: docStats } = useDocumentStats(siteId || undefined);

  const modules = [
    {
      title: "Ressources & Équipements",
      subtitle: "Inventaire des matériels, plan de maintenance et transferts",
      description:
        "Codification du parc d'équipements, suivi des maintenances préventives et correctives, alertes et traçabilité des transferts inter-sites.",
      href: "/app/equipements",
      icon: Wrench,
      stats: `${equipements.length} équipements · ${alertes.length} alerte(s)`,
      badge: "Chapitre 7.1",
      color: "from-blue-600/10 to-indigo-600/10 border-blue-500/20",
      iconColor: "text-blue-600",
    },
    {
      title: "Compétences & Formations",
      subtitle: "Gestion des qualifications, formations et gap analysis",
      description:
        "Cycle de vie des formations, plan annuel budgétaire, matrice des compétences requises par poste et identification des écarts.",
      href: "/app/competences",
      icon: GraduationCap,
      stats: `${formationStats?.total ?? 0} formation(s) · ${formationStats?.taux_realisation ?? 0} % réalisés`,
      badge: "Chapitre 7.2",
      color: "from-emerald-600/10 to-teal-600/10 border-emerald-500/20",
      iconColor: "text-emerald-600",
    },
    {
      title: "Sensibilisation",
      subtitle: "Causeries sécurité, 1/4h QHSE et campagnes d'information",
      description:
        "Sensibilisation continue du personnel aux enjeux sécurité, qualité et environnement, avec validation et archivage des feuilles d'émargement.",
      href: "/app/sensibilisation",
      icon: ShieldAlert,
      stats: `${sensStats?.total ?? 0} campagne(s) · ${sensStats?.realisees ?? 0} réalisée(s)`,
      badge: "Chapitre 7.3",
      color: "from-purple-600/10 to-pink-600/10 border-purple-500/20",
      iconColor: "text-purple-600",
    },
    {
      title: "Communication",
      subtitle: "Diffusion interne et externe de l'information QHSE",
      description:
        "Plan annuel de communication, ciblage des publics, choix des canaux et traçabilité des diffusions de la politique et des résultats.",
      href: "/app/communication",
      icon: Megaphone,
      stats: `${comStats?.total ?? 0} action(s) · ${comStats?.taux_realisation ?? 0} % réalisés`,
      badge: "Chapitre 7.4",
      color: "from-amber-600/10 to-orange-600/10 border-amber-500/20",
      iconColor: "text-amber-600",
    },
    {
      title: "Information documentée",
      subtitle: "GED, pyramide documentaire N1 à N5 et workflow d'approbation",
      description:
        "Maîtrise des documents internes et externes, gestion des versions, circuit de vérification/approbation et respect des règles de codification.",
      href: "/app/documents",
      icon: BookOpen,
      stats: `${docStats?.total ?? 0} document(s) · ${docStats?.approved ?? 0} validé(s)`,
      badge: "Chapitre 7.5",
      color: "from-rose-600/10 to-red-600/10 border-rose-500/20",
      iconColor: "text-rose-600",
    },
  ];

  return (
    <div className="space-y-6">
      <Header
        eyebrow="Support — Chapitre 7 ISO 9001"
        title="Support (Chapitre 7 ISO 9001)"
        description="Ressources, compétences, sensibilisation, communication et maîtrise de l'information documentée"
        icon={BookOpen}
      />

      <SiteNotice siteId={siteId} />

      {/* Global KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Équipements suivis" value={equipements.length} />
        <Stat label="Formations planifiées" value={formationStats?.total ?? 0} />
        <Stat label="Actions de sensibilisation" value={sensStats?.total ?? 0} />
        <Stat label="Documents en vigueur" value={docStats?.approved ?? 0} />
      </div>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              to={m.href}
              className={`${card} p-6 flex flex-col justify-between hover:shadow-lg hover:border-primary/50 transition-all group bg-gradient-to-br ${m.color}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className={`rounded-xl bg-background p-2.5 shadow-xs ${m.iconColor}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-background px-2.5 py-1 font-mono text-xs font-bold text-muted-foreground shadow-xs">
                    {m.badge}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold group-hover:text-primary transition-colors">
                    {m.title}
                  </h3>
                  <p className="text-xs font-semibold text-muted-foreground">{m.subtitle}</p>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
              </div>

              <div className="mt-5 pt-3 border-t border-border flex items-center justify-between text-xs font-semibold">
                <span className="text-muted-foreground">{m.stats}</span>
                <span className="text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  Accéder <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
