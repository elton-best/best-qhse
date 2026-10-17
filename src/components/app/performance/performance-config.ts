import type { Analysis, ThresholdState, Validity } from "@/integrations/backend/performance";

export const STATE: Record<ThresholdState, { label: string; tone: string }> = {
  ok: { label: "Conforme", tone: "bg-emerald-100 text-emerald-700" },
  above_target: { label: "Cible dépassée", tone: "bg-amber-100 text-amber-800" },
  alert: { label: "Seuil d'alerte dépassé", tone: "bg-red-100 text-red-700" },
  no_data: { label: "Sans relevé", tone: "bg-slate-200 text-slate-600" },
};

export const VALIDITY: Record<Validity, { label: string; tone: string }> = {
  valid: { label: "Valide", tone: "bg-emerald-100 text-emerald-700" },
  due_soon: { label: "Échéance proche", tone: "bg-amber-100 text-amber-800" },
  expired: { label: "Étalonnage expiré", tone: "bg-red-100 text-red-700" },
  never_calibrated: { label: "Jamais étalonné", tone: "bg-red-100 text-red-700" },
  out_of_service: { label: "Hors service", tone: "bg-red-100 text-red-700" },
};

export const TREND: Record<Analysis["trend"], string> = { up: "En hausse", down: "En baisse", stable: "Stable", insufficient: "Données insuffisantes" };

export const FLAG_LABEL: Record<string, string> = {
  duplicate_confirmed: "Doublon confirmé",
  outlier_confirmed: "Valeur aberrante confirmée",
  instrument_out_of_validity: "Instrument hors validité",
  instrument_out_of_service: "Instrument hors service",
};

export const INSTRUMENT_TYPES = [
  { value: "meter", label: "Compteur" }, { value: "scale", label: "Balance" }, { value: "sensor", label: "Capteur" },
  { value: "analyzer", label: "Analyseur" }, { value: "thermometer", label: "Thermomètre" }, { value: "flow_meter", label: "Débitmètre" }, { value: "other", label: "Autre" },
];
