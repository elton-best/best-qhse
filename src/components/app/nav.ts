import {
  Award, BarChart3, Briefcase, BookOpen, Building2, ClipboardCheck, CreditCard, FileText, Gauge, GitBranch,
  GraduationCap, Landmark, LayoutDashboard, MapPin, MessageSquareWarning, ShieldAlert, ShieldCheck, Target,
  Truck, Users, Wrench, Factory, ListChecks, CheckSquare, BadgeCheck, Stamp, Crown, Lightbulb, Settings,
  Leaf, HardHat, Zap, UtensilsCrossed, Lock, Megaphone, Network, Siren, ScrollText, SlidersHorizontal,
  FileSearch, Package, PackageX, Scale, PenTool, Presentation, UserCheck, Smile, RefreshCw, Activity, ShoppingCart, ScanSearch, Layers, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Only visible when one of these norms is active. */
  norms?: string[];
  /** Only visible when at least this many norms are active (integrated management system). */
  minNorms?: number;
  badge?: string;
};
export type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

/** Top-level shortcuts (Vue d'ensemble is /app). */
export const TOP_ITEMS: NavItem[] = [
  { slug: "systeme-integre", label: "Système intégré", icon: Layers, minNorms: 2 },
  { slug: "taches", label: "Mes tâches", icon: CheckSquare },
  { slug: "mes-actions", label: "Mes actions", icon: ListChecks },
  { slug: "boite-reception", label: "Plaintes clients", icon: MessageSquareWarning },
  { slug: "sites", label: "Sites", icon: MapPin },
  { slug: "verification", label: "Vérification", icon: BadgeCheck },
  { slug: "approbation", label: "Approbation", icon: Stamp },
  { slug: "normes", label: "Bibliothèque des normes", icon: BookOpen },
];

/** "Normes & Système" — normative groups. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "contexte", label: "Contexte de l'organisme", icon: Landmark,
    items: [
      { slug: "contexte", label: "Compréhension de l'organisme", icon: Landmark },
      { slug: "parties-interessees", label: "Parties intéressées", icon: Users },
      { slug: "perimetre", label: "Domaine d'application", icon: Scale },
      { slug: "processus", label: "Système de management", icon: GitBranch },
    ],
  },
  {
    id: "leadership", label: "Leadership", icon: Crown,
    items: [
      { slug: "politique", label: "Politique QHSE", icon: ScrollText },
      { slug: "organigramme", label: "Organigramme", icon: Network },
      { slug: "collaborateurs", label: "Liste du personnel", icon: Users },
      { slug: "fiches-poste", label: "Fiches de poste", icon: Briefcase },
      { slug: "responsabilites", label: "Fiches de responsabilité", icon: UserCheck },
    ],
  },
  {
    id: "planification", label: "Planification", icon: Target,
    items: [
      { slug: "risques", label: "Risques & opportunités", icon: ShieldAlert },
      { slug: "objectifs", label: "Objectifs qualité", icon: Target },
      { slug: "actions", label: "Plans d'actions", icon: ListChecks },
      { slug: "plan-sm", label: "Plan du SM & modifications", icon: ClipboardCheck },
      { slug: "aspects-environnementaux", label: "Aspects environnementaux", icon: Leaf, norms: ["ISO 14001"] },
      { slug: "dangers", label: "DUERP & dangers", icon: HardHat, norms: ["ISO 45001"] },
      { slug: "energie", label: "Revue énergétique", icon: Zap, norms: ["ISO 50001"] },
      { slug: "situation-energetique", label: "Situation énergétique de référence", icon: Gauge, norms: ["ISO 50001"] },
      { slug: "collecte-energetique", label: "Collecte des données énergétiques", icon: ScanSearch, norms: ["ISO 50001"] },
      { slug: "ipe", label: "Indicateurs de performance énergétique", icon: Activity, norms: ["ISO 50001"] },
      { slug: "objectifs-energetiques", label: "Objectifs et cibles énergétiques", icon: Target, norms: ["ISO 50001"] },
      { slug: "securite-information", label: "Actifs & risques SI", icon: Lock, norms: ["ISO 27001"] },
    ],
  },
  {
    id: "support", label: "Support", icon: Wrench,
    items: [
      { slug: "equipements", label: "Ressources", icon: Wrench },
      { slug: "competences", label: "Compétences", icon: GraduationCap },
      { slug: "sensibilisation", label: "Sensibilisation", icon: Lightbulb },
      { slug: "communication", label: "Communication", icon: Megaphone },
      { slug: "documents", label: "Information documentée", icon: FileText },
    ],
  },
  {
    id: "realisation", label: "Réalisation des activités", icon: Factory,
    items: [
      { slug: "procedures", label: "Procédures", icon: FileSearch },
      { slug: "maitrise-operationnelle", label: "Maîtrise opérationnelle", icon: SlidersHorizontal },
      { slug: "exigences", label: "Exigences produits & services", icon: ClipboardCheck },
      { slug: "obligations", label: "Obligations de conformité", icon: Scale },
      { slug: "conception", label: "Conception & développement", icon: PenTool },
      { slug: "fournisseurs", label: "Gestion des prestataires", icon: Truck },
      { slug: "realisation", label: "Production & prestation", icon: Factory },
      { slug: "liberation", label: "Libération", icon: Package },
      { slug: "sorties-non-conformes", label: "Sorties non conformes", icon: PackageX },
      { slug: "urgences", label: "Situations d'urgence", icon: Siren, norms: ["ISO 14001", "ISO 45001"] },
      { slug: "incidents", label: "Accidents & incidents", icon: HardHat, norms: ["ISO 45001"] },
      { slug: "haccp", label: "Plan HACCP", icon: UtensilsCrossed, norms: ["ISO 22000"] },
      { slug: "conception-energetique", label: "Conception énergétique", icon: PenTool, norms: ["ISO 50001"] },
      { slug: "achats-energie", label: "Achats d'énergie", icon: Zap, norms: ["ISO 50001"] },
      { slug: "achats-equipements-energetiques", label: "Achats d'équipements énergétiques", icon: ShoppingCart, norms: ["ISO 50001"] },
    ],
  },
  {
    id: "evaluation", label: "Évaluation des performances", icon: BarChart3,
    items: [
      { slug: "indicateurs", label: "Indicateurs", icon: BarChart3 },
      { slug: "enquetes", label: "Évaluations PIP", icon: Smile },
      { slug: "revue-processus", label: "Revue des processus", icon: RefreshCw },
      { slug: "audits", label: "Audits internes", icon: ClipboardCheck },
      { slug: "surveillance-energetique", label: "Surveillance de la performance énergétique", icon: Gauge, norms: ["ISO 50001"] },
      { slug: "conformite-energetique", label: "Évaluation de la conformité énergétique", icon: Scale, norms: ["ISO 50001"] },
      { slug: "audit-energetique", label: "Audit énergétique interne", icon: ClipboardCheck, norms: ["ISO 50001"] },
      { slug: "auditeurs", label: "Évaluation des auditeurs", icon: UserCheck },
      { slug: "revue-direction", label: "Revue de direction", icon: Presentation },
    ],
  },
  {
    id: "amelioration", label: "Amélioration", icon: Lightbulb,
    items: [
      { slug: "non-conformites", label: "NC & actions correctives", icon: ShieldAlert },
      { slug: "reclamations", label: "Réclamations", icon: MessageSquareWarning },
      { slug: "amelioration", label: "Amélioration continue", icon: Lightbulb },
    ],
  },
];

export const CONFIG_GROUP: NavGroup = {
  id: "configuration", label: "Configuration", icon: Settings,
  items: [
    { slug: "entreprise", label: "Paramètres de l'organisation", icon: Building2 },
    { slug: "roles", label: "Utilisateurs & permissions", icon: ShieldCheck },
    { slug: "preferences", label: "Préférences", icon: SlidersHorizontal },
    { slug: "journal", label: "Journal sécurité", icon: ScrollText },
  ],
};

export const BOTTOM_ITEMS: NavItem[] = [
  { slug: "abonnement", label: "Abonnement", icon: CreditCard },
  { slug: "certifications", label: "Certifications", icon: Award },
];

export const DASHBOARD_ICON = LayoutDashboard;
export const GAUGE_ICON = Gauge;

/** Slugs of every normative item (locked when the subscription is expired). */
export const NORMATIVE_SLUGS = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.slug)));

export function findNavItem(slug: string): NavItem | undefined {
  for (const g of [...NAV_GROUPS, CONFIG_GROUP]) {
    const it = g.items.find((i) => i.slug === slug);
    if (it) return it;
  }
  return [...TOP_ITEMS, ...BOTTOM_ITEMS].find((i) => i.slug === slug);
}

/** REQ-5.1-01 — policy title depends on active norms. */
export function policyTitle(norms?: Set<string>): string {
  if (!norms) return "Politique QHSE";
  const h = norms.has("ISO 22000"), sec = norms.has("ISO 45001"), e = norms.has("ISO 14001");
  if (!h && !sec && !e) return "Politique Qualité";
  return `Politique Q${h ? "H" : ""}${sec ? "S" : ""}${e ? "E" : ""}`;
}

/**
 * Slug de rubrique -> codes de sous-modules du catalogue Laravel (offre + normes choisies).
 * Une rubrique est visible si l'un de ses codes est accessible ; sans entrée ici, elle reste toujours visible.
 */
export const ACCESS_CODES: Record<string, string[]> = {
  contexte: ["comprehension_organisme"],
  "parties-interessees": ["parties_interessees"],
  perimetre: ["domaine_application"],
  processus: ["systeme_management"],
  politique: ["politique"],
  organigramme: ["roles_responsabilites"],
  collaborateurs: ["roles_responsabilites"],
  "fiches-poste": ["roles_responsabilites"],
  responsabilites: ["roles_responsabilites"],
  risques: ["risques_opportunites"],
  objectifs: ["objectifs_qualite"],
  actions: ["plans_action"],
  "plan-sm": ["plans_action"],
  "aspects-environnementaux": ["aspects_environnementaux"],
  obligations: ["obligations_conformite"],
  dangers: ["duerp", "identification_dangers_sst"],
  energie: ["revue_energetique"],
  "securite-information": ["evaluation_risques_si"],
  "situation-energetique": ["situation_energetique_reference"],
  "collecte-energetique": ["collecte_donnees_energetiques"],
  ipe: ["ipe"],
  "objectifs-energetiques": ["objectifs_cibles_energetiques"],
  equipements: ["ressources"],
  competences: ["competences"],
  sensibilisation: ["sensibilisation"],
  communication: ["communication"],
  documents: ["documents"],
  "maitrise-operationnelle": ["planification_maitrise_operationnelle"],
  exigences: ["exigences_produits_services"],
  conception: ["conception_developpement_produits_services"],
  fournisseurs: ["gestion_prestataires"],
  realisation: ["production_prestation_service"],
  liberation: ["liberation_produits_services"],
  "sorties-non-conformes": ["maitrise_sorties_non_conformes"],
  urgences: ["urgences_environnementales", "preparation_reponse_urgences_sst"],
  incidents: ["enquetes_incidents", "surveillance_accidents"],
  haccp: ["plan_haccp"],
  "conception-energetique": ["conception_energetique"],
  "achats-energie": ["achats_energie"],
  "achats-equipements-energetiques": ["achats_equipements_energetiques"],
  enquetes: ["satisfaction_client"],
  "revue-processus": ["revue_processus"],
  audits: ["audits_internes"],
  auditeurs: ["audits_internes"],
  "revue-direction": ["revue_direction"],
  "surveillance-energetique": ["surveillance_performance_energetique"],
  "conformite-energetique": ["conformite_energetique"],
  "audit-energetique": ["audit_energetique"],
  "non-conformites": ["non_conformites_actions"],
  amelioration: ["amelioration_continue"],
};

/** Visibilité d'une rubrique : catalogue d'accès si disponible, sinon repli sur les normes actives. */
export function isNavItemVisible(item: NavItem, activeNorms?: Set<string>, accessible?: Set<string>): boolean {
  if (item.minNorms && activeNorms && activeNorms.size < item.minNorms) return false;
  const codes = ACCESS_CODES[item.slug];
  if (accessible && codes) return codes.some((code) => accessible.has(code));
  return !item.norms || !activeNorms || item.norms.some((norm) => activeNorms.has(norm));
}
