import type { AesSettings, AesStatus } from "@/integrations/backend/aes";

/** Libellés et barèmes de l'écran des aspects environnementaux (ISO 14001:2026 §6.1.2, canevas BASE AES). */

export type Choice = { value: string; label: string };

export const LIFECYCLE_PHASES: Choice[] = [
  { value: "acquisition", label: "Acquisition des matières" },
  { value: "design", label: "Conception" },
  { value: "production", label: "Production" },
  { value: "transport", label: "Transport / livraison" },
  { value: "use", label: "Utilisation" },
  { value: "end_of_life", label: "Fin de vie" },
  { value: "final_disposal", label: "Élimination finale" },
];

export const ASPECT_TYPES: Choice[] = [
  { value: "air_emissions", label: "Émissions dans l'air" },
  { value: "water_discharges", label: "Rejets dans l'eau" },
  { value: "soil_discharges", label: "Rejets dans le sol" },
  { value: "resources_materials", label: "Utilisation de matières et ressources" },
  { value: "energy", label: "Énergie" },
  { value: "emitted_energy", label: "Énergie émise (chaleur, bruit, vibrations, lumière)" },
  { value: "waste", label: "Déchets et sous-produits" },
  { value: "land_use", label: "Occupation du sol" },
  { value: "marine_coastal", label: "Zones marines et côtières" },
];

export const SITUATIONS: Choice[] = [
  { value: "normal", label: "Normale" },
  { value: "abnormal", label: "Anormale" },
  { value: "startup_shutdown", label: "Démarrage / arrêt" },
  { value: "emergency", label: "Urgence" },
];

export const CONTROL_LEVELS: Choice[] = [
  { value: "controlled", label: "Maîtrisé" },
  { value: "influenced", label: "Influencé" },
];

export const IMPACT_NATURES: Choice[] = [
  { value: "negative", label: "Négatif" },
  { value: "beneficial", label: "Bénéfique" },
];

export const IMPACT_SCALES: Choice[] = [
  { value: "local", label: "Locale" },
  { value: "regional", label: "Régionale" },
  { value: "global", label: "Mondiale" },
];

export const IMPACT_KINDS: Choice[] = [
  { value: "direct", label: "Directe" },
  { value: "indirect", label: "Indirecte" },
  { value: "cumulative", label: "Cumulative" },
];

export const STATUS_LABEL: Record<AesStatus, { label: string; tone: string }> = {
  draft: { label: "Brouillon", tone: "bg-slate-100 text-slate-700" },
  in_review: { label: "En revue", tone: "bg-amber-100 text-amber-800" },
  validated: { label: "Validé", tone: "bg-emerald-100 text-emerald-700" },
  archived: { label: "Archivé", tone: "bg-slate-200 text-slate-500" },
};

export function labelOf(choices: Choice[], value: string | null | undefined): string {
  return choices.find((choice) => choice.value === value)?.label ?? "—";
}

export type ScaleLevel = { value: number; label: string; hint: string };

/** Niveaux de cotation du canevas (feuille « Cotation »). */
export const FREQUENCY_LEVELS: ScaleLevel[] = [
  { value: 1, label: "Extrêmement rare", hint: "1 fois tous les 10 ans (événement improbable)" },
  { value: 3, label: "Rare", hint: "1 fois par an (pollution, incendie)" },
  { value: 5, label: "Peu fréquent", hint: "1 fois par mois (fuite)" },
  { value: 7, label: "Fréquent", hint: "1 fois par jour à 1 fois par semaine" },
];

export const GRAVITY_LEVELS: ScaleLevel[] = [
  { value: 1, label: "Faible", hint: "Effet négligeable (rayonnement, chaleur)" },
  { value: 3, label: "Moyen", hint: "Effet réversible à court terme, 1 à 6 mois (nuisances, déchet banal)" },
  { value: 5, label: "Majeur", hint: "Effet réversible à long terme, 6 mois à 3 ans (eau, sol, air, déchets dangereux)" },
  { value: 7, label: "Critique", hint: "Effet destructeur (explosion, incendie, déversement)" },
];

export const SENSITIVITY_LEVELS: ScaleLevel[] = [
  { value: 1, label: "Sensibilité faible", hint: "1 élément sensible" },
  { value: 3, label: "Sensibilité moyenne", hint: "2 à 3 éléments sensibles" },
  { value: 5, label: "Sensibilité forte", hint: "4 éléments sensibles" },
  { value: 7, label: "Sensibilité extrêmement forte", hint: "5 éléments sensibles ou plus" },
];

export const MASTERY_LEVELS: ScaleLevel[] = [
  { value: 1, label: "Maîtrise forte", hint: "Personnel compétent, procédures testées, équipements performants et maintenance préventive" },
  { value: 3, label: "Maîtrise moyenne", hint: "Personnel compétent, procédures documentées, équipements fonctionnels" },
  { value: 5, label: "Maîtrise faible", hint: "Aucune formation, aucune procédure, équipements non fonctionnels" },
];

/** Milieux à passer en revue pour estimer la sensibilité (canevas : 6 milieux). */
export const SENSITIVITY_MEDIA: { key: string; label: string; examples: string }[] = [
  { key: "soil", label: "Sol et sous-sol", examples: "Sol perméable, zone inondable, nappe phréatique proche, historique de pollution" },
  { key: "water", label: "Eaux", examples: "Cours d'eau proche, espèces protégées, points de pêche ou de baignade" },
  { key: "air", label: "Air", examples: "Pics de pollution, population sous les vents dominants, mauvaise circulation de l'air" },
  { key: "nature", label: "Milieu naturel", examples: "Espèces protégées, milieu naturel remarquable, paysage de qualité" },
  { key: "human", label: "Milieu humain", examples: "Hôpital, école, zone résidentielle, trafic dense, réclamations bruit ou odeurs" },
  { key: "energy", label: "Énergie", examples: "Recours à l'énergie fossile ou aux biocarburants" },
];

/** Niveau de sensibilité suggéré selon le nombre de milieux sensibles cochés. */
export function suggestSensitivity(sensitiveMedia: number): number {
  if (sensitiveMedia <= 1) return 1;
  if (sensitiveMedia <= 3) return 3;
  if (sensitiveMedia === 4) return 5;
  return 7;
}

export type Preview = { criticality: number; environmental: boolean; significant: boolean; basis: "environmental" | "additional" | null };

/** Aperçu en direct : le serveur recalcule et fait foi à l'enregistrement. */
export function previewSignificance(
  scores: { gravity: number; frequency: number; sensitivity: number; mastery: number },
  criteria: { legal: boolean; stakeholder: boolean },
  settings: Pick<AesSettings, "significance_threshold" | "use_legal_criterion" | "use_stakeholder_criterion">,
): Preview {
  const criticality = scores.gravity * scores.frequency * scores.sensitivity * scores.mastery;
  const environmental = criticality > settings.significance_threshold;
  const additional =
    (criteria.legal && settings.use_legal_criterion) || (criteria.stakeholder && settings.use_stakeholder_criterion);
  return {
    criticality,
    environmental,
    significant: environmental || additional,
    basis: environmental ? "environmental" : additional ? "additional" : null,
  };
}

export const DEFAULT_SETTINGS: AesSettings = {
  significance_threshold: 343,
  max_gravity: 7,
  max_frequency: 7,
  max_sensitivity: 7,
  max_mastery: 5,
  use_legal_criterion: true,
  use_stakeholder_criterion: true,
  review_frequency_months: 12,
};
