import type { ComplianceStatus, Frequency, SourceType } from "@/integrations/backend/compliance";

export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "law", label: "Loi" },
  { value: "decree", label: "Décret" },
  { value: "order", label: "Arrêté" },
  { value: "permit", label: "Permis / autorisation" },
  { value: "licence", label: "Licence" },
  { value: "court_decision", label: "Décision de justice" },
  { value: "contract", label: "Contrat" },
  { value: "agreement", label: "Accord / plan convenu" },
  { value: "voluntary_code", label: "Code volontaire" },
  { value: "sector_standard", label: "Norme sectorielle" },
];

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "monthly", label: "Mensuelle" },
  { value: "quarterly", label: "Trimestrielle" },
  { value: "semiannual", label: "Semestrielle" },
  { value: "annual", label: "Annuelle" },
  { value: "on_demand", label: "À la demande" },
];

export const STATUS: Record<ComplianceStatus, { label: string; tone: string }> = {
  compliant: { label: "Conforme", tone: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Partiellement conforme", tone: "bg-amber-100 text-amber-800" },
  non_compliant: { label: "Non conforme", tone: "bg-red-100 text-red-700" },
  not_applicable: { label: "Non applicable", tone: "bg-slate-100 text-slate-600" },
  not_evaluated: { label: "Non évalué", tone: "bg-sky-100 text-sky-700" },
};

export const CHANGE_STATUS = [
  { value: "existing", label: "Existant" },
  { value: "new", label: "Nouveau" },
  { value: "modified", label: "Modifié" },
] as const;

export const EXPIRING = ["permit", "licence"];

export function labelOf<T extends string>(items: { value: T; label: string }[], value: T | null | undefined): string {
  return items.find((item) => item.value === value)?.label ?? "—";
}

export const BUCKET_LABEL: Record<string, { label: string; tone: string }> = {
  expired: { label: "Expiré", tone: "bg-red-100 text-red-700" },
  d7: { label: "≤ 7 jours", tone: "bg-red-100 text-red-700" },
  d30: { label: "≤ 30 jours", tone: "bg-amber-100 text-amber-800" },
  d90: { label: "≤ 90 jours", tone: "bg-sky-100 text-sky-700" },
  later: { label: "Plus tard", tone: "bg-slate-100 text-slate-600" },
};
