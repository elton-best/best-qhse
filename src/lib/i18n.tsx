import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "fr" | "en";
export const LOCALE_KEY = "lq-interface-locale";

// Only interface labels belong here. User content is rendered verbatim.
export const english: Record<string, string> = {
  "Réalisation des activités": "Operations",
  "Exigences produits & services": "Product & service requirements",
  "Gestion des prestataires": "Provider management",
  Libération: "Release",
  "Sorties non conformes": "Nonconforming outputs",
  "Accidents & incidents": "Accidents & incidents",
  "Évaluation des performances": "Performance evaluation",
  "Évaluations PIP": "Interested party evaluations",
  "Revue des processus": "Process reviews",
  "Audits internes": "Internal audits",
  "Surveillance de la performance énergétique": "Energy performance monitoring",
  "Politique Qualité": "Quality policy",
  "Achats d'énergie": "Energy purchases",
  "Achats d'équipements énergétiques": "Energy equipment purchases",
  Notifications: "Notifications",
  "Tableau de bord": "Dashboard",
  "Se déconnecter": "Sign out",
  Évaluation: "Evaluation",
  "Évaluation de la performance": "Performance evaluation",
  Amélioration: "Improvement",
  "NC & actions correctives": "Nonconformities & corrective actions",
  Réclamations: "Complaints",
  "Paramètres de l'organisation": "Organization settings",
  "Utilisateurs & permissions": "Users & permissions",
  "Journal sécurité": "Security log",
  "Audit interne": "Internal audit",
  "Évaluation des auditeurs": "Auditor evaluation",
  "Conception & développement": "Design & development",
  "Prestataires externes": "External providers",
  Fournisseurs: "Suppliers",
  "Production & prestation": "Production & service delivery",
  "Libération des produits/services": "Release of products/services",
  "Maîtrise des sorties non conformes": "Control of nonconforming outputs",
  "Maîtrise opérationnelle": "Operational control",
  "Exigences clients": "Customer requirements",
  Procédures: "Procedures",
  "Revue énergétique": "Energy review",
  "Situation énergétique de référence": "Energy baseline",
  "Collecte des données énergétiques": "Energy data collection",
  "Indicateurs de performance énergétique": "Energy performance indicators",
  "Objectifs et cibles énergétiques": "Energy objectives and targets",
  "Actifs & risques SI": "Information assets & risks",
  "Conception énergétique": "Energy design",
  "Achats d’énergie": "Energy purchases",
  "Achats d’équipements énergétiques": "Energy equipment purchases",
  "Surveillance énergétique": "Energy monitoring",
  "Évaluation de la conformité énergétique": "Energy compliance evaluation",
  "Audit énergétique interne": "Internal energy audit",
  Indicateurs: "Indicators",
  "Enquêtes de satisfaction": "Satisfaction surveys",
  "Langue de l’interface": "Interface language",
  Enregistrer: "Save",
  "Chargement…": "Loading…",
  Annuler: "Cancel",
  Fermer: "Close",
  "Aucune donnée.": "No data.",
  "Erreur de chargement.": "Unable to load data.",
  "Vue d'ensemble": "Overview",
  "Normes & Système": "Standards & system",
  Déconnexion: "Sign out",
  "Espace entreprise": "Company workspace",
  "Démarrage guidé": "Guided setup",
  "Préparation à la certification": "Certification readiness",
  "Système intégré": "Integrated system",
  "Mes tâches": "My tasks",
  "Mes actions": "My actions",
  "Plaintes clients": "Customer complaints",
  Sites: "Sites",
  Vérification: "Verification",
  Approbation: "Approval",
  "Bibliothèque des normes": "Standards library",
  "Contexte de l'organisme": "Organizational context",
  "Compréhension de l'organisme": "Understanding the organization",
  "Parties intéressées": "Interested parties",
  "Domaine d'application": "Scope",
  "Système de management": "Management system",
  "Politique QHSE": "QHSE policy",
  "Politique environnementale": "Environmental policy",
  "Politique qualité": "Quality policy",
  Organigramme: "Organization chart",
  "Liste du personnel": "Personnel",
  "Fiches de poste": "Job descriptions",
  "Fiches de responsabilité": "Responsibilities",
  "Engagements de leadership": "Leadership commitments",
  Planification: "Planning",
  "Risques & opportunités": "Risks & opportunities",
  "Objectifs qualité": "Quality objectives",
  "Plans d'actions": "Action plans",
  "Plan du SM & modifications": "Management plan & modifications",
  "Gestion des changements": "Change management",
  "Aspects environnementaux": "Environmental aspects",
  "DUERP & dangers": "Hazard assessment",
  Support: "Support",
  Ressources: "Resources",
  Compétences: "Competence",
  Sensibilisation: "Awareness",
  "Campagnes de sensibilisation": "Awareness campaigns",
  Communication: "Communication",
  "Information documentée": "Documented information",
  Réalisation: "Operations",
  "Obligations de conformité": "Compliance obligations",
  "Situations d'urgence": "Emergency preparedness",
  Audits: "Audits",
  "Revue de direction": "Management review",
  "Performance environnementale": "Environmental performance",
  "Non-conformités": "Nonconformities",
  "Amélioration continue": "Continual improvement",
  Préférences: "Preferences",
  Configuration: "Settings",
  Entreprise: "Company",
  "Rôles & permissions": "Roles & permissions",
  Abonnement: "Subscription",
  "Publier le périmètre": "Publish scope",
  "Publication et revue du périmètre": "Scope publication and review",
  "Expiration du lien": "Link expiry",
  "Créer un lien public": "Create a public link",
  Révoquer: "Revoke",
  Révoqué: "Revoked",
  "Ce lien donne accès à la version enregistrée du périmètre. Copiez-le maintenant pour le partager.":
    "This link provides access to the saved scope version. Copy it now to share it.",
  "Fréquence de revue (mois)": "Review frequency (months)",
  "Configurer la fréquence": "Set frequency",
  "Revue effectuée": "Review completed",
  "Demander une revue": "Request a review",
  "Motif / conclusion de revue": "Review reason / conclusion",
  "Prochaine revue": "Next review",
  "Une revue est requise après un changement approuvé.":
    "A review is required following an approved change.",
  "Périmètre publié": "Published scope",
  Version: "Version",
  "Produits et services": "Products and services",
  "Unités organisationnelles": "Organizational units",
  Lieux: "Locations",
  Exclusions: "Exclusions",
  "Ce lien est indisponible, expiré ou révoqué.": "This link is unavailable, expired or revoked.",
  "Revue annuelle de la direction — article 5.1 a à i":
    "Annual leadership review — clause 5.1 a to i",
  Année: "Year",
  Brouillon: "Draft",
  Finalisée: "Completed",
  Oui: "Yes",
  Partiellement: "Partly",
  Non: "No",
  "Justification et preuves": "Justification and evidence",
  "Finaliser la revue": "Complete review",
  "Revue enregistrée.": "Review saved.",
  "Une revue finalisée est conservée et ne peut plus être modifiée.":
    "A completed review is retained and cannot be changed.",
  "Bibliothèque d’exemples": "Example library",
  "Choisir un exemple à adapter": "Choose an example to adapt",
  "Ces exemples sont des suggestions à adapter à votre contexte. Aucun enregistrement automatique.":
    "Adapt these suggestions to your context. No record is saved automatically.",
  "Activités ou produits regroupés (un par ligne)": "Grouped activities or products (one per line)",
  "Caractéristiques communes justifiant le regroupement":
    "Shared characteristics justifying the grouping",
  "Diffuser l’objectif": "Communicate objective",
  "Objectifs reçus": "Received objectives",
  "Accuser réception": "Acknowledge receipt",
  "Lecture confirmée": "Receipt acknowledged",
  Destinataires: "Recipients",
  Message: "Message",
  Diffuser: "Send",
  "Diffusions et accusés de lecture": "Communications and read receipts",
  "En attente": "Pending",
  "Sélectionnez les personnes concernées. La version envoyée est conservée avec leurs accusés de lecture.":
    "Select the people concerned. The sent version is retained with their read receipts.",
  "Diffusion envoyée.": "Communication sent.",
  "Aucun objectif reçu.": "No objectives received.",
};

export function translate(locale: Locale, french: string, englishText?: string): string {
  return locale === "en" ? (englishText ?? english[french] ?? french) : french;
}

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (fr: string, en?: string) => string;
  date: (value: string | null | undefined) => string;
};
const I18nContext = createContext<I18n>({
  locale: "fr",
  setLocale: () => {},
  t: (fr) => fr,
  date: (v) => v ?? "—",
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("fr");
  useEffect(() => {
    const read = () => updateLocale(localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "fr");
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);
  const setLocale = (next: Locale) => {
    updateLocale(next);
    localStorage.setItem(LOCALE_KEY, next);
  };
  const date = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
          dateStyle: "medium",
          timeStyle: value.length > 10 ? "short" : undefined,
        }).format(new Date(value))
      : "—";
  return (
    <I18nContext.Provider
      value={{ locale, setLocale, t: (fr, en) => translate(locale, fr, en), date }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{t("Langue de l’interface")}</span>
      <select
        aria-label={t("Langue de l’interface")}
        className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
