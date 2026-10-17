import type { ActionStatus, RiskLevel, Scales, WorkflowStatus } from "@/integrations/backend/duerp";

export const WORKFLOW: Record<WorkflowStatus, { label: string; tone: string }> = {
  draft: { label: "Brouillon", tone: "bg-slate-200 text-slate-700" },
  submitted_by_rq: { label: "En validation par la Direction", tone: "bg-amber-100 text-amber-800" },
  approved_by_ceo: { label: "Approuvé", tone: "bg-emerald-100 text-emerald-700" },
};

export const LEVEL_TONE: Record<RiskLevel, string> = {
  Faible: "bg-emerald-100 text-emerald-700",
  Moyen: "bg-amber-100 text-amber-800",
  Significatif: "bg-red-100 text-red-700",
};

export const ACTION_STATUS: Record<ActionStatus, string> = {
  en_continu: "En continu",
  en_cours: "En cours",
  realise: "Réalisée",
};

export const PREVENTION_TYPES = [
  { value: "elimination", label: "Éliminer le danger" },
  { value: "substitution", label: "Substituer par moins dangereux" },
  { value: "collective", label: "Protection collective" },
  { value: "organizational", label: "Mesure organisationnelle / formation" },
  { value: "individual", label: "Protection individuelle (EPI)" },
];

const LOW = 0.2;
const MEDIUM = 0.5;

const scoreOf = (scale: Scales[keyof Scales], level: number | null | undefined): number | null => {
  if (!level) return null;
  return scale.find((row) => row.level === level)?.score_value ?? null;
};

const levelOf = (score: number, max: number): RiskLevel => {
  const ratio = max > 0 ? score / max : 0;
  return ratio <= LOW ? "Faible" : ratio <= MEDIUM ? "Moyen" : "Significatif";
};

/** Aperçu de la cotation pendant la saisie ; le serveur reste la référence et recalcule à l'enregistrement. */
export function previewScore(
  scales: Scales,
  input: { gravity?: number | undefined; frequency?: number | undefined; maitrise?: number | undefined },
): { raw: number; assessed: number; rawLevel: RiskLevel; assessedLevel: RiskLevel } | null {
  const g = scoreOf(scales.gravity, input.gravity);
  const f = scoreOf(scales.frequency, input.frequency);
  const m = scoreOf(scales.maitrise, input.maitrise);
  if (g === null || f === null || m === null) return null;
  const max = (rows: Scales[keyof Scales]) => Math.max(...rows.map((row) => row.score_value), 1);
  const rawMax = max(scales.gravity) * max(scales.frequency);
  const raw = g * f;
  const assessed = raw * m;
  return { raw, assessed, rawLevel: levelOf(raw, rawMax), assessedLevel: levelOf(assessed, rawMax * max(scales.maitrise)) };
}
