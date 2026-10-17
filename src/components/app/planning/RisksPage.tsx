import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Copy,
  Eye,
  FileDown,
  Filter,
  LayoutGrid,
  List,
  PenLine,
  Plus,
  Save,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useProcesses } from "@/integrations/backend/context";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import {
  Header,
  PageSkeleton,
  SiteNotice,
  Stat,
  card,
  errorMessage,
  formatDateFR,
  input,
  muted,
  primary,
  secondary,
} from "./shared";
import {
  downloadBlob,
  exportRisksXlsx,
  riskCriticite,
  riskCriticiteOf,
  riskNiveau,
  riskNiveauOf,
  useRisk,
  useRiskMutations,
  useRiskUsers,
  useRisks,
  type PlannedActionType,
  type RiskLevel,
  type RiskOpportunity,
  type RiskStatus,
  type RiskType,
  type RiskUser,
} from "@/integrations/backend/planningRisks";

// ---------------------------------------------------------------------------
// Libellés FR
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<RiskType, string> = { risque: "Risque", opportunite: "Opportunité" };
const SOURCE_OPTIONS: Record<RiskType, Array<{ value: string; label: string }>> = {
  risque: [
    { value: "contexte", label: "Analyse du contexte" },
    { value: "parties_interessees", label: "Parties intéressées" },
    { value: "processus", label: "Processus" },
    { value: "changement", label: "Changement" },
    { value: "audit", label: "Audit / non-conformité" },
    { value: "autre", label: "Autre source" },
  ],
  opportunite: [
    { value: "contexte", label: "Analyse du contexte" },
    { value: "parties_interessees", label: "Parties intéressées" },
    { value: "capacites", label: "Capacités internes" },
    { value: "mesures", label: "Résultats de mesure" },
    { value: "marche", label: "Marché / client" },
    { value: "technologie", label: "Technologie" },
    { value: "reglementation", label: "Réglementation" },
    { value: "autre", label: "Autre source" },
  ],
};

const STATUS_LABELS: Record<RiskStatus, string> = {
  identifie: "Identifié",
  en_cours: "En cours",
  traite: "Traité",
  surveille: "Surveillé",
  cloture: "Clôturé",
};
const STATUSES = Object.keys(STATUS_LABELS) as RiskStatus[];
const OPPORTUNITY_DECISION_LABELS: Record<string, string> = {
  retain: "Retenir",
  defer: "Reporter",
  reject: "Rejeter",
};

const STRATEGIES: Array<{ value: string; label: string }> = [
  { value: "accepter", label: "Accepter" },
  { value: "reduire", label: "Réduire" },
  { value: "transferer", label: "Transférer" },
  { value: "eviter", label: "Éviter" },
  { value: "exploiter", label: "Exploiter" },
];

const NIVEAU_LABELS: Record<RiskLevel, string> = {
  faible: "Faible",
  moyen: "Moyen",
  eleve: "Élevé",
  critique: "Critique",
};

const ACTION_GROUPS: Array<{ value: PlannedActionType; label: string }> = [
  { value: "preventive", label: "Préventives" },
  { value: "corrective", label: "Correctives" },
  { value: "control", label: "Maîtrise" },
];

function probaLabels(type: RiskType): Record<number, string> {
  return type === "risque"
    ? { 1: "Rare", 2: "Peu fréquent", 3: "Fréquent", 4: "Très fréquent" }
    : { 1: "Incertain", 2: "Peu probable", 3: "Probable", 4: "Très probable" };
}

function graviteLabels(type: RiskType): Record<number, string> {
  return type === "risque"
    ? { 1: "Faible", 2: "Moyenne", 3: "Élevée", 4: "Très élevée" }
    : { 1: "Faible", 2: "Moins pertinent", 3: "Pertinent", 4: "Très pertinent" };
}

function statusBadgeClass(status: unknown): string {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold";
  switch (String(status ?? "").toLowerCase()) {
    case "identifie":
      return `${base} bg-slate-200 text-slate-700`;
    case "en_cours":
      return `${base} bg-sky-100 text-sky-700`;
    case "traite":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "surveille":
      return `${base} bg-violet-100 text-violet-700`;
    case "cloture":
      return `${base} bg-slate-800 text-white`;
    default:
      return `${base} bg-slate-100 text-slate-600`;
  }
}

function niveauBadgeClass(niveau: RiskLevel): string {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold";
  switch (niveau) {
    case "faible":
      return `${base} bg-emerald-100 text-emerald-700`;
    case "moyen":
      return `${base} bg-amber-100 text-amber-700`;
    case "eleve":
      return `${base} bg-orange-100 text-orange-700`;
    case "critique":
      return `${base} bg-red-100 text-red-700`;
  }
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function processIdOf(item: RiskOpportunity): string {
  if (item["process_id"] != null && String(item["process_id"]) !== "") {
    return String(item["process_id"]);
  }
  const raw = item["process"];
  if (raw && typeof raw === "object") {
    const id = (raw as Record<string, unknown>)["id"];
    return id == null ? "" : String(id);
  }
  return "";
}

function processLabelOfRecord(record: Record<string, unknown>): string {
  const title = str(record["title"] ?? record["name"]);
  const code = str(record["code"] ?? record["abbreviation"]);
  if (title && code) return `${code} — ${title}`;
  return title || code || "Processus non renseigné";
}

function processName(item: RiskOpportunity, processes: Array<Record<string, unknown>>): string {
  const raw = item["process"];
  if (raw && typeof raw === "object") return processLabelOfRecord(raw as Record<string, unknown>);
  const found = processes.find((p) => String(p["id"] ?? "") === processIdOf(item));
  return found ? processLabelOfRecord(found) : "Processus non renseigné";
}

function responsibleName(item: RiskOpportunity, users: RiskUser[]): string {
  const raw = item["responsibleUser"] ?? item["responsible_user"];
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const first = str(r["first_name"]);
    const last = str(r["last_name"]);
    const full = `${first} ${last}`.trim();
    if (full) return full;
    const name = str(r["name"] ?? r["email"]);
    if (name) return name;
  }
  const id = item["responsible_user_id"];
  if (id != null && String(id) !== "") {
    const found = users.find((u) => String(u.id) === String(id));
    if (found) return found.name;
  }
  return "—";
}

function plannedActionsOf(item: RiskOpportunity): Array<Record<string, unknown>> {
  const raw = item["planned_actions"];
  return Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>).filter((entry) => entry && typeof entry === "object")
    : [];
}

function actionText(entry: Record<string, unknown>): string {
  return str(entry["title"] ?? entry["description"]);
}

function validActionGroup(value: unknown): PlannedActionType {
  const v = str(value).toLowerCase();
  if (v === "corrective" || v === "control") return v;
  return "preventive";
}

function implicatedToIds(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function implicatedToString(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  return str(value);
}

// ---------------------------------------------------------------------------
// Formulaire 2 étapes
// ---------------------------------------------------------------------------

type ActionDraft = {
  key: string;
  id?: string | undefined;
  group: PlannedActionType;
  description: string;
  responsible_user_id: string;
  implicated: string;
  deadline: string;
  implementation_status: "planned" | "in_progress" | "completed";
  effectiveness_result: "" | "efficace" | "partiellement_efficace" | "non_efficace";
  effectiveness_review: string;
  effectiveness_review_date: string;
};

type RiskForm = {
  process_id: string;
  type: RiskType;
  source_category: string;
  source_detail: string;
  assessment_method: "qualitative" | "quantitative";
  proportionality_rationale: string;
  decision_rationale: string;
  desired_effect: string;
  opportunity_decision: "" | "retain" | "defer" | "reject";
  continuity_plan: string;
  continuity_indicator: string;
  effectiveness_review: string;
  effectiveness_review_date: string;
  title: string;
  description: string;
  cause: string;
  consequence: string;
  probabilite: number;
  gravite: number;
  strategie: string;
  status: RiskStatus;
  responsible_user_id: string;
  target_date: string;
  normes_iso: string;
  actions: ActionDraft[];
};

type ActionReviewResult = "" | "efficace" | "partiellement_efficace" | "non_efficace";
type ActionImplementationStatus = "planned" | "in_progress" | "completed";
type RegisterTab = RiskType | "combined";

let draftCounter = 0;
function newDraft(group: PlannedActionType): ActionDraft {
  draftCounter += 1;
  return {
    key: `draft-${Date.now()}-${draftCounter}`,
    group,
    description: "",
    responsible_user_id: "",
    implicated: "",
    deadline: "",
    implementation_status: "planned",
    effectiveness_result: "",
    effectiveness_review: "",
    effectiveness_review_date: "",
  };
}

function emptyForm(type: RiskType, processId = ""): RiskForm {
  return {
    process_id: processId,
    type,
    source_category: type === "opportunite" ? "contexte" : "processus",
    source_detail: "",
    assessment_method: "qualitative",
    proportionality_rationale: "",
    decision_rationale: "",
    desired_effect: "",
    opportunity_decision: "",
    continuity_plan: "",
    continuity_indicator: "",
    effectiveness_review: "",
    effectiveness_review_date: "",
    title: "",
    description: "",
    cause: "",
    consequence: "",
    probabilite: 2,
    gravite: 2,
    strategie: "",
    status: "identifie",
    responsible_user_id: "",
    target_date: "",
    normes_iso: "",
    actions: [],
  };
}

function formFromItem(item: RiskOpportunity, processes: Array<Record<string, unknown>>): RiskForm {
  const type: RiskType =
    str(item["type"]).toLowerCase() === "opportunite" ? "opportunite" : "risque";
  const actions: ActionDraft[] = plannedActionsOf(item).map((entry, index): ActionDraft => ({
    ...newDraft(validActionGroup(entry["action_type"])),
    key: `existing-${String(item.id)}-${index}`,
    id: entry["id"] == null ? undefined : String(entry["id"]),
    description: actionText(entry),
    responsible_user_id:
      entry["responsible_user_id"] != null && String(entry["responsible_user_id"]) !== ""
        ? String(entry["responsible_user_id"])
        : "",
    implicated: implicatedToString(entry["implicated_user_ids"]),
    deadline: str(entry["deadline"] ?? entry["due_date"]).slice(0, 10),
    implementation_status:
      str(entry["implementation_status"]) === "completed"
        ? "completed"
        : str(entry["implementation_status"]) === "in_progress"
          ? "in_progress"
          : "planned",
    effectiveness_result: (
      ["efficace", "partiellement_efficace", "non_efficace"] as string[]
    ).includes(str(entry["effectiveness_result"]))
      ? (str(entry["effectiveness_result"]) as ActionDraft["effectiveness_result"])
      : "",
    effectiveness_review: str(entry["effectiveness_review"]),
    effectiveness_review_date: str(entry["effectiveness_review_date"]).slice(0, 10),
  }));
  const pid = processIdOf(item);
  return {
    process_id: pid || (processes[0] ? String(processes[0]?.["id"] ?? "") : ""),
    type,
    source_category: str(item["source_category"]),
    source_detail: str(item["source_detail"]),
    assessment_method:
      str(item["assessment_method"]) === "quantitative" ? "quantitative" : "qualitative",
    proportionality_rationale: str(item["proportionality_rationale"]),
    decision_rationale: str(item["decision_rationale"]),
    desired_effect: str(item["desired_effect"]),
    opportunity_decision: (["retain", "defer", "reject"] as string[]).includes(
      str(item["opportunity_decision"]),
    )
      ? (str(item["opportunity_decision"]) as "retain" | "defer" | "reject")
      : "",
    continuity_plan: str(item["continuity_plan"]),
    continuity_indicator: str(item["continuity_indicator"]),
    effectiveness_review: str(item["effectiveness_review"]),
    effectiveness_review_date: str(item["effectiveness_review_date"]).slice(0, 10),
    title: str(item["title"]),
    description: str(item["description"]),
    cause: str(item["cause"]),
    consequence: str(item["consequence"]),
    probabilite: Number(item["probabilite"] ?? 2) || 2,
    gravite: Number(item["gravite"] ?? 2) || 2,
    strategie: str(item["strategie"]),
    status: ((): RiskStatus => {
      const s = str(item["status"]).toLowerCase();
      return (STATUSES as string[]).includes(s) ? (s as RiskStatus) : "identifie";
    })(),
    responsible_user_id:
      item["responsible_user_id"] != null && String(item["responsible_user_id"]) !== ""
        ? String(item["responsible_user_id"])
        : "",
    target_date: str(item["target_date"]).slice(0, 10),
    normes_iso: Array.isArray(item["normes_iso"])
      ? (item["normes_iso"] as unknown[]).map((v) => String(v)).join(", ")
      : str(item["normes_iso"]),
    actions,
  };
}

function buildPayload(form: RiskForm): Record<string, unknown> {
  const kept = form.actions.filter((a) => a.description.trim() !== "");
  return {
    process_id: form.process_id,
    type: form.type,
    source_category: form.source_category,
    source_detail: form.source_detail.trim(),
    assessment_method: form.assessment_method,
    proportionality_rationale: form.proportionality_rationale.trim() || null,
    decision_rationale: form.decision_rationale.trim() || null,
    desired_effect: form.desired_effect.trim() || null,
    opportunity_decision: form.opportunity_decision || null,
    continuity_plan: form.continuity_plan.trim() || null,
    continuity_indicator: form.continuity_indicator.trim() || null,
    effectiveness_review: form.effectiveness_review.trim() || null,
    effectiveness_review_date: form.effectiveness_review_date || null,
    title: form.title.trim() || form.description.trim(),
    description: form.description.trim() || form.title.trim(),
    cause: form.cause.trim() || null,
    consequence: form.consequence.trim() || null,
    normes_iso: form.normes_iso
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    probabilite: form.probabilite,
    gravite: form.gravite,
    strategie: form.strategie || null,
    actions_prevues: kept.map((a) => a.description.trim()).join("\n") || null,
    planned_actions: kept.map((a) => ({
      ...(a.id ? { id: a.id } : {}),
      title: a.description.trim(),
      action_type: a.group,
      responsible_user_id: a.responsible_user_id ? Number(a.responsible_user_id) : null,
      implicated_user_ids: implicatedToIds(a.implicated),
      deadline: a.deadline.trim() || null,
      implementation_status: a.implementation_status,
      effectiveness_result: a.effectiveness_result || null,
      effectiveness_review: a.effectiveness_review.trim() || null,
      effectiveness_review_date: a.effectiveness_review_date || null,
    })),
    responsible_user_id: form.responsible_user_id ? Number(form.responsible_user_id) : null,
    target_date: form.target_date || null,
    status: form.status,
  };
}

function Slider({
  label,
  value,
  labels,
  onChange,
}: {
  label: string;
  value: number;
  labels: Record<number, string>;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-extrabold text-primary">
          {value} · {labels[value] ?? String(value)}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={4}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>1 · {labels[1] ?? "1"}</span>
        <span>4 · {labels[4] ?? "4"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogue détail + évaluation
// ---------------------------------------------------------------------------

function RiskDetailDialog({
  itemId,
  itemType,
  processes,
  users,
  onClose,
  onEdit,
}: {
  itemId: string | number;
  itemType: RiskType;
  processes: Array<Record<string, unknown>>;
  users: RiskUser[];
  onClose: () => void;
  onEdit: (item: RiskOpportunity) => void;
}) {
  const { data: detail, isLoading } = useRisk(itemId, itemType);
  const mutations = useRiskMutations();
  const [proba, setProba] = useState(2);
  const [grav, setGrav] = useState(2);
  const [probaRes, setProbaRes] = useState("");
  const [gravRes, setGravRes] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<RiskStatus>("identifie");
  const [effectivenessResult, setEffectivenessResult] = useState("");
  const [effectivenessReview, setEffectivenessReview] = useState("");
  const [effectivenessReviewDate, setEffectivenessReviewDate] = useState("");
  const [actionReviews, setActionReviews] = useState<Array<Record<string, unknown>>>([]);
  const [hydratedFor, setHydratedFor] = useState<string>("");

  useEffect(() => {
    if (!detail) return;
    const actions = plannedActionsOf(detail);
    const key = `${String(detail.id)}:${str(detail["updated_at"])}:${JSON.stringify(actions)}`;
    if (hydratedFor === key) return;
    setHydratedFor(key);
    setProba(Number(detail["probabilite"] ?? 2) || 2);
    setGrav(Number(detail["gravite"] ?? 2) || 2);
    setProbaRes(
      detail["probabilite_residuelle"] != null && String(detail["probabilite_residuelle"]) !== ""
        ? String(detail["probabilite_residuelle"])
        : "",
    );
    setGravRes(
      detail["gravite_residuelle"] != null && String(detail["gravite_residuelle"]) !== ""
        ? String(detail["gravite_residuelle"])
        : "",
    );
    setTargetDate(str(detail["target_date"]).slice(0, 10));
    setEffectivenessResult(str(detail["effectiveness_result"]));
    setEffectivenessReview(str(detail["effectiveness_review"]));
    setEffectivenessReviewDate(str(detail["effectiveness_review_date"]).slice(0, 10));
    setActionReviews(actions.map((action) => ({ ...action })));
    const s = str(detail["status"]).toLowerCase();
    setStatus((STATUSES as string[]).includes(s) ? (s as RiskStatus) : "identifie");
  }, [detail, hydratedFor]);

  const type: RiskType =
    detail && str(detail["type"]).toLowerCase() === "opportunite" ? "opportunite" : "risque";
  const criticite = riskCriticite(proba, grav);
  const criticiteRes =
    probaRes && gravRes ? riskCriticite(Number(probaRes), Number(gravRes)) : null;
  const busy = mutations.evaluate.isPending || mutations.update.isPending;
  const closureExempt =
    type === "opportunite" && str(detail?.["opportunity_decision"]) === "reject";

  const saveInfo = async (): Promise<void> => {
    if (!detail) return;
    const closingNow = status === "cloture" && str(detail["status"]) !== "cloture";
    if (
      closingNow &&
      !closureExempt &&
      (effectivenessResult !== "efficace" ||
        !effectivenessReview.trim() ||
        !effectivenessReviewDate ||
        actionReviews.some(
          (action) =>
            str(action["implementation_status"]) !== "completed" ||
            str(action["effectiveness_result"]) !== "efficace" ||
            !str(action["effectiveness_review"]).trim() ||
            !str(action["effectiveness_review_date"]),
        ))
    ) {
      toast.error(
        "Avant la clôture, toutes les actions doivent être terminées et efficaces, avec une date et une preuve.",
      );
      return;
    }
    try {
      await mutations.update.mutateAsync({
        id: detail.id,
        type,
        payload: {
          status,
          target_date: targetDate || null,
          effectiveness_result: effectivenessResult || null,
          effectiveness_review: effectivenessReview.trim() || null,
          effectiveness_review_date: effectivenessReviewDate || null,
          ...(actionReviews.length > 0
            ? {
                planned_actions: actionReviews.map((action) => ({
                  ...action,
                  title: actionText(action),
                  deadline: str(action["deadline"] ?? action["due_date"]) || null,
                  implementation_status: (str(action["implementation_status"]) ||
                    "planned") as ActionImplementationStatus,
                  effectiveness_result: str(action["effectiveness_result"])
                    ? (str(action["effectiveness_result"]) as ActionReviewResult)
                    : null,
                  effectiveness_review: str(action["effectiveness_review"]).trim() || null,
                  effectiveness_review_date: str(action["effectiveness_review_date"]) || null,
                })),
              }
            : {}),
        },
      });
      toast.success("Fiche mise à jour.");
    } catch (error) {
      toast.error(errorMessage(error, "Mise à jour impossible."));
    }
  };

  const evaluate = async (): Promise<void> => {
    if (!detail) return;
    try {
      await mutations.evaluate.mutateAsync({
        id: detail.id,
        type,
        payload: {
          probabilite: proba,
          gravite: grav,
          ...(probaRes ? { probabilite_residuelle: Number(probaRes) } : {}),
          ...(gravRes ? { gravite_residuelle: Number(gravRes) } : {}),
          ...(criticiteRes != null ? { criticite_residuelle: criticiteRes } : {}),
        },
      });
      toast.success("Évaluation enregistrée.");
    } catch (error) {
      toast.error(errorMessage(error, "Évaluation impossible."));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Détail du risque ou de l'opportunité"
    >
      <div className={`${card} my-8 w-full max-w-3xl p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {TYPE_LABELS[type]} · {detail ? str(detail["code"]) || `#${String(detail.id)}` : ""}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold">
              {detail ? str(detail["title"]) || "Sans intitulé" : "Chargement…"}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-muted-foreground hover:bg-background"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !detail ? (
          <PageSkeleton rows={3} />
        ) : (
          <div className="mt-5 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className={statusBadgeClass(detail["status"])}>
                {STATUS_LABELS[str(detail["status"]).toLowerCase() as RiskStatus] ??
                  str(detail["status"])}
              </span>
              <span className={niveauBadgeClass(riskNiveauOf(detail))}>
                Criticité {riskCriticiteOf(detail) ?? "—"} · {NIVEAU_LABELS[riskNiveauOf(detail)]}
              </span>
              <span className={`text-xs ${muted}`}>
                {processName(detail, processes)} · Responsable : {responsibleName(detail, users)} ·
                Échéance : {formatDateFR(detail["target_date"])}
              </span>
            </div>

            {str(detail["description"]) && (
              <p className="rounded-xl bg-background p-3 text-sm">{str(detail["description"])}</p>
            )}
            {type === "opportunite" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Source analysée
                  </p>
                  <p className="mt-1 text-sm">
                    {str(detail["source_category"]) || "—"} · {str(detail["source_detail"]) || "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Décision
                  </p>
                  <p className="mt-1 text-sm">
                    {OPPORTUNITY_DECISION_LABELS[str(detail["opportunity_decision"])] || "—"} ·{" "}
                    {str(detail["decision_rationale"]) || "Justification non renseignée"}
                  </p>
                </div>
                <div className="rounded-xl bg-background p-3 sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Effet recherché
                  </p>
                  <p className="mt-1 text-sm">{str(detail["desired_effect"]) || "—"}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Cause
                  </p>
                  <p className="mt-1 text-sm">{str(detail["cause"]) || "—"}</p>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Conséquence
                  </p>
                  <p className="mt-1 text-sm">{str(detail["consequence"]) || "—"}</p>
                </div>
              </div>
            )}

            {actionReviews.length > 0 && (
              <div>
                <h3 className="text-sm font-extrabold">Exécution et efficacité des actions</h3>
                <div className="mt-2 space-y-3">
                  {actionReviews.map((action, index) => (
                    <div
                      key={str(action["id"]) || `${String(detail.id)}-action-${index}`}
                      className="rounded-xl bg-background p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {actionText(action) || "Action prévue"}
                          </p>
                          <p className={`mt-1 text-xs ${muted}`}>
                            {str(action["action_type"]) || "Préventive"}
                            {action["deadline"]
                              ? ` · Échéance ${formatDateFR(action["deadline"])}`
                              : ""}
                          </p>
                        </div>
                        {action["effectiveness_reviewed_by"] != null && (
                          <span className={`text-xs ${muted}`}>
                            Évaluation consignée par l’utilisateur #
                            {String(action["effectiveness_reviewed_by"])}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-bold text-muted-foreground">
                          Avancement de l’action
                          <select
                            className={`${input} mt-1`}
                            value={str(action["implementation_status"]) || "planned"}
                            onChange={(event) =>
                              setActionReviews((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, implementation_status: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="planned">À faire</option>
                            <option value="in_progress">En cours</option>
                            <option value="completed">Terminée</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-muted-foreground">
                          Résultat d’efficacité
                          <select
                            className={`${input} mt-1`}
                            value={str(action["effectiveness_result"])}
                            onChange={(event) =>
                              setActionReviews((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, effectiveness_result: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          >
                            <option value="">Non évaluée</option>
                            <option value="efficace">Efficace</option>
                            <option value="partiellement_efficace">Partiellement efficace</option>
                            <option value="non_efficace">Non efficace</option>
                          </select>
                        </label>
                        <label className="text-xs font-bold text-muted-foreground">
                          Date d’évaluation
                          <input
                            type="date"
                            className={`${input} mt-1`}
                            max={new Date().toISOString().slice(0, 10)}
                            value={str(action["effectiveness_review_date"]).slice(0, 10)}
                            onChange={(event) =>
                              setActionReviews((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, effectiveness_review_date: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="text-xs font-bold text-muted-foreground sm:col-span-2">
                          Preuve ou justification de l’efficacité
                          <textarea
                            className={`${input} mt-1 min-h-20`}
                            value={str(action["effectiveness_review"])}
                            onChange={(event) =>
                              setActionReviews((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? { ...entry, effectiveness_review: event.target.value }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="Résultat observé, preuve vérifiable ou justification…"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`${card} space-y-4 border p-4`}>
              <h3 className="text-sm font-extrabold">Suivi</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Statut
                  </label>
                  <select
                    className={input}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as RiskStatus)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Résultat de l’efficacité des actions
                  </label>
                  <select
                    className={input}
                    value={effectivenessResult}
                    onChange={(e) => setEffectivenessResult(e.target.value)}
                    aria-label="Résultat de l’évaluation d’efficacité"
                  >
                    <option value="">Non évaluée</option>
                    <option value="efficace">Efficace</option>
                    <option value="partiellement_efficace">Partiellement efficace</option>
                    <option value="non_efficace">Non efficace</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Échéance cible
                  </label>
                  <input
                    type="date"
                    className={input}
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Date de l’évaluation d’efficacité
                  </label>
                  <input
                    type="date"
                    className={input}
                    max={new Date().toISOString().slice(0, 10)}
                    value={effectivenessReviewDate}
                    onChange={(e) => setEffectivenessReviewDate(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Preuve / justification de l’efficacité
                  </label>
                  <textarea
                    className={`${input} min-h-20`}
                    value={effectivenessReview}
                    onChange={(e) => setEffectivenessReview(e.target.value)}
                    placeholder="Résultat mesuré, preuve vérifiable et décision de suivi…"
                  />
                  {detail["effectiveness_reviewed_by"] != null && (
                    <p className={`mt-1 text-xs ${muted}`}>
                      Évaluation consignée par l’utilisateur #
                      {String(detail["effectiveness_reviewed_by"])}
                    </p>
                  )}
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className={secondary}
                    disabled={busy}
                    onClick={() => void saveInfo()}
                  >
                    <Save className="h-4 w-4" /> Enregistrer
                  </button>
                </div>
              </div>
            </div>

            <div className={`${card} space-y-4 border p-4`}>
              <h3 className="text-sm font-extrabold">Évaluation (probabilité × gravité)</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Slider
                  label="Probabilité"
                  value={proba}
                  labels={probaLabels(type)}
                  onChange={setProba}
                />
                <Slider
                  label="Gravité"
                  value={grav}
                  labels={graviteLabels(type)}
                  onChange={setGrav}
                />
              </div>
              <p className="text-sm">
                Criticité : <strong className="text-primary">{criticite ?? "—"}</strong>
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Probabilité résiduelle
                  </label>
                  <select
                    className={input}
                    value={probaRes}
                    onChange={(e) => setProbaRes(e.target.value)}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={String(n)}>
                        {n} · {probaLabels(type)[n] ?? String(n)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Gravité résiduelle
                  </label>
                  <select
                    className={input}
                    value={gravRes}
                    onChange={(e) => setGravRes(e.target.value)}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={String(n)}>
                        {n} · {graviteLabels(type)[n] ?? String(n)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-sm">
                    Score résiduel : <strong className="text-primary">{criticiteRes ?? "—"}</strong>
                  </p>
                </div>
              </div>
              {(detail["criticite_residuelle"] != null ||
                detail["probabilite_residuelle"] != null) && (
                <p className={`text-xs ${muted}`}>
                  Score résiduel enregistré : {str(detail["criticite_residuelle"]) || "—"} (P{" "}
                  {str(detail["probabilite_residuelle"]) || "—"} × G{" "}
                  {str(detail["gravite_residuelle"]) || "—"})
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primary}
                  disabled={busy}
                  onClick={() => void evaluate()}
                >
                  {mutations.evaluate.isPending ? "Évaluation…" : "Évaluer"}
                </button>
                <button type="button" className={secondary} onClick={() => onEdit(detail)}>
                  <PenLine className="h-4 w-4" /> Modifier la fiche
                </button>
                <Link
                  to="/app/$section"
                  params={{ section: "actions" }}
                  search={{ new: 1, origin: String(detail.id), kind: "risk" }}
                  className={secondary}
                >
                  <Plus className="h-4 w-4" /> Créer action
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function RisksPage() {
  const [siteId] = useCurrentSite();
  const filters = useMemo(() => ({ site_id: siteId || undefined }), [siteId]);
  const { data: items = [], isLoading } = useRisks(filters);
  const { data: processes = [] } = useProcesses(siteId);
  const { data: users = [] } = useRiskUsers(siteId);
  const mutations = useRiskMutations();

  const [tab, setTab] = useState<RegisterTab>("risque");
  const [query, setQuery] = useState("");
  const [processFilter, setProcessFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [niveauFilter, setNiveauFilter] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [form, setForm] = useState<RiskForm>(() => emptyForm("risque"));
  const [detailSelection, setDetailSelection] = useState<{
    id: string | number;
    type: RiskType;
  } | null>(null);
  const [confirmDeleteSelection, setConfirmDeleteSelection] = useState<{
    id: string | number;
    type: RiskType;
  } | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<RiskOpportunity | null>(null);
  const [exporting, setExporting] = useState(false);

  const typeOf = (item: RiskOpportunity): RiskType =>
    str(item["type"]).toLowerCase() === "opportunite" ? "opportunite" : "risque";

  const counts = useMemo(
    () => ({
      risque: items.filter((i) => typeOf(i) === "risque").length,
      opportunite: items.filter((i) => typeOf(i) === "opportunite").length,
    }),
    [items],
  );

  const typed = useMemo(
    () => (tab === "combined" ? items : items.filter((i) => typeOf(i) === tab)),
    [items, tab],
  );

  const stats = useMemo(() => {
    const total = typed.length;
    const priority = typed.filter((i) => (riskCriticiteOf(i) ?? 0) >= 12).length;
    const closed = typed.filter((i) =>
      ["traite", "cloture"].includes(str(i["status"]).toLowerCase()),
    );
    const rate = total === 0 ? 0 : Math.round((closed.length / total) * 100);
    const scores = typed.map((i) => riskCriticiteOf(i)).filter((v): v is number => v != null);
    const avg = scores.length === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / scores.length;
    return { total, priority, rate, avg: Math.round(avg * 10) / 10 };
  }, [typed]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return typed.filter((item) => {
      if (processFilter !== "all" && processIdOf(item) !== processFilter) return false;
      if (statusFilter !== "all" && str(item["status"]).toLowerCase() !== statusFilter)
        return false;
      if (niveauFilter !== "all" && riskNiveauOf(item) !== niveauFilter) return false;
      if (q) {
        const haystack =
          `${str(item["title"])} ${str(item["description"])} ${processName(item, processes)} ${str(item["code"])}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [typed, query, processFilter, statusFilter, niveauFilter, processes]);

  const resetFilters = (): void => {
    setQuery("");
    setProcessFilter("all");
    setStatusFilter("all");
    setNiveauFilter("all");
  };
  const hasActiveFilters =
    query.trim() !== "" ||
    processFilter !== "all" ||
    statusFilter !== "all" ||
    niveauFilter !== "all";

  const touch = (patch: Partial<RiskForm>): void => setForm((c) => ({ ...c, ...patch }));

  const openCreate = (): void => {
    if (tab === "combined") return;
    if (!siteId) {
      toast.error("Sélectionnez un site avant de créer un risque ou une opportunité.");
      return;
    }
    const first = processes[0];
    setEditingId(null);
    setForm(emptyForm(tab, first && first["id"] != null ? String(first["id"]) : ""));
    setStep(1);
    setFormOpen(true);
  };

  const openEdit = (item: RiskOpportunity): void => {
    setEditingId(item.id);
    setForm(formFromItem(item, processes));
    setStep(1);
    setDetailSelection(null);
    setFormOpen(true);
  };

  const stepOneValid = (): boolean => {
    if (!form.process_id) {
      toast.error("Sélectionnez un processus.");
      return false;
    }
    if (!form.title.trim()) {
      toast.error("L'intitulé est requis.");
      return false;
    }
    if (!form.description.trim()) {
      toast.error("La description est requise.");
      return false;
    }
    if (!form.source_category || !form.source_detail.trim()) {
      toast.error("Indiquez la catégorie et le fait à l’origine de l’analyse.");
      return false;
    }
    if (form.type === "risque" && !form.cause.trim()) {
      toast.error("La cause est requise pour un risque.");
      return false;
    }
    if (
      form.type === "risque" &&
      (!form.strategie ||
        !form.continuity_plan.trim() ||
        !form.continuity_indicator.trim() ||
        !form.proportionality_rationale.trim())
    ) {
      toast.error(
        "Justifiez la proportionnalité, la stratégie de traitement et le plan de continuité du risque.",
      );
      return false;
    }
    if (
      form.type === "opportunite" &&
      (!form.desired_effect.trim() || !form.opportunity_decision || !form.decision_rationale.trim())
    ) {
      toast.error("Précisez l’effet recherché, la décision et sa justification.");
      return false;
    }
    return true;
  };

  const submit = async (): Promise<void> => {
    if (!stepOneValid()) {
      setStep(1);
      return;
    }
    if (!siteId && editingId == null) {
      toast.error("Sélectionnez un site avant de créer un risque ou une opportunité.");
      return;
    }
    const actionPlanRequired = form.type === "risque" || form.opportunity_decision !== "reject";
    if (actionPlanRequired && !form.actions.some((action) => action.description.trim())) {
      toast.error("Ajoutez au moins une action au plan de traitement ou d’exploitation.");
      setStep(2);
      return;
    }
    if (form.actions.some((action) => action.description.trim() && !action.deadline)) {
      toast.error("Chaque action doit avoir une échéance.");
      setStep(2);
      return;
    }
    try {
      if (editingId == null) {
        await mutations.create.mutateAsync({
          processId: form.process_id,
          payload: buildPayload(form),
        });
        toast.success(`${TYPE_LABELS[form.type]} créé(e).`);
      } else {
        await mutations.update.mutateAsync({
          id: editingId,
          type: form.type,
          payload: buildPayload(form),
        });
        toast.success(`${TYPE_LABELS[form.type]} mis(e) à jour.`);
      }
      setFormOpen(false);
      setEditingId(null);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  const doDestroy = async (id: string | number, type: RiskType): Promise<void> => {
    try {
      await mutations.remove.mutateAsync({ id, type });
      toast.success("Élément supprimé.");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };

  const doDuplicate = async (title: string): Promise<void> => {
    if (!duplicateSource) return;
    if (!siteId) {
      toast.error("Sélectionnez un site avant de dupliquer.");
      return;
    }
    const pid = processIdOf(duplicateSource);
    if (!pid) {
      toast.error("Duplication impossible : processus d'origine introuvable.");
      return;
    }
    try {
      const base = formFromItem(duplicateSource, processes);
      await mutations.create.mutateAsync({
        processId: pid,
        payload: { ...buildPayload(base), title },
      });
      toast.success("Élément dupliqué.");
    } catch (error) {
      toast.error(errorMessage(error, "Duplication impossible."));
    } finally {
      setDuplicateSource(null);
    }
  };

  const exportFile = async (): Promise<void> => {
    setExporting(true);
    try {
      const blob = await exportRisksXlsx(siteId || undefined);
      downloadBlob(blob, `risques-opportunites-${siteId || "tous"}.xlsx`);
      toast.success("Export Excel téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setExporting(false);
    }
  };

  const updateDraft = (key: string, patch: Partial<ActionDraft>): void =>
    setForm((c) => ({
      ...c,
      actions: c.actions.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    }));

  const removeDraft = (key: string): void =>
    setForm((c) => ({ ...c, actions: c.actions.filter((a) => a.key !== key) }));

  const criticite = riskCriticite(form.probabilite, form.gravite);
  const saving = mutations.create.isPending || mutations.update.isPending;

  const renderActions = (item: RiskOpportunity) =>
    tab === "combined" ? (
      <span className={`text-xs ${muted}`}>Lecture seule</span>
    ) : (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => setDetailSelection({ id: item.id, type: typeOf(item) })}
        >
          <Eye className="h-4 w-4" /> Détail
        </button>
        <button type="button" className={secondary} onClick={() => openEdit(item)}>
          <PenLine className="h-4 w-4" /> Modifier
        </button>
        <button type="button" className={secondary} onClick={() => setDuplicateSource(item)}>
          <Copy className="h-4 w-4" /> Dupliquer
        </button>
        <button
          type="button"
          className={secondary}
          onClick={() => setConfirmDeleteSelection({ id: item.id, type: typeOf(item) })}
        >
          <Trash2 className="h-4 w-4" /> Supprimer
        </button>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification"
        title="Risques & opportunités"
        description="Les risques et les opportunités sont conservés dans des registres séparés. La vue combinée est consultative et permet de comparer les deux."
        icon={AlertTriangle}
      >
        <button
          type="button"
          className={secondary}
          disabled={exporting}
          onClick={() => void exportFile()}
        >
          <FileDown className="h-4 w-4" /> {exporting ? "Export…" : "Export Excel"}
        </button>
        {tab !== "combined" && (
          <button type="button" className={primary} onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouveau
          </button>
        )}
      </Header>

      <div className="flex flex-wrap gap-2">
        {(["risque", "opportunite", "combined"] as RegisterTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? primary : secondary}
            onClick={() => setTab(t)}
          >
            {t === "combined" ? (
              <List className="h-4 w-4" />
            ) : t === "risque" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            {t === "combined"
              ? `Vue combinée en lecture seule (${counts.risque + counts.opportunite})`
              : `${TYPE_LABELS[t]}s (${t === "risque" ? counts.risque : counts.opportunite})`}
          </button>
        ))}
      </div>

      <div className={`${card} grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <Stat
          value={stats.total}
          label={
            tab === "combined"
              ? "Total risques + opportunités"
              : `Total ${TYPE_LABELS[tab].toLowerCase()}s`
          }
        />
        <Stat value={stats.priority} label="Prioritaires (≥ 12)" tone="text-red-600" />
        <Stat value={`${stats.rate} %`} label="Traités + clôturés" tone="text-emerald-600" />
        <Stat value={stats.avg} label="Criticité moyenne" tone="text-amber-600" />
      </div>

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Filtres</span>
          </div>
          <input
            className={`${input} max-w-full sm:max-w-xs`}
            placeholder="Rechercher intitulé, description, processus…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`${input} max-w-full sm:max-w-[240px]`}
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
            aria-label="Filtrer par processus"
          >
            <option value="all">Tous les processus</option>
            {processes.map((p) => (
              <option key={String(p["id"] ?? "")} value={String(p["id"] ?? "")}>
                {processLabelOfRecord(p)}
              </option>
            ))}
          </select>
          <select
            className={`${input} max-w-full sm:max-w-[180px]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className={`${input} max-w-full sm:max-w-[180px]`}
            value={niveauFilter}
            onChange={(e) => setNiveauFilter(e.target.value)}
            aria-label="Filtrer par niveau"
          >
            <option value="all">Tous les niveaux</option>
            {(Object.keys(NIVEAU_LABELS) as RiskLevel[]).map((n) => (
              <option key={n} value={n}>
                {NIVEAU_LABELS[n]}
              </option>
            ))}
          </select>
          <button type="button" className={secondary} onClick={resetFilters}>
            Réinitialiser
          </button>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className={view === "grid" ? primary : secondary}
              onClick={() => setView("grid")}
              aria-label="Vue grille"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={view === "list" ? primary : secondary}
              onClick={() => setView("list")}
              aria-label="Vue liste"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4">
            <PageSkeleton rows={4} />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className={muted}>
              {typed.length === 0
                ? tab === "combined"
                  ? "Aucun risque ou opportunité enregistré pour ce périmètre."
                  : `Aucun ${TYPE_LABELS[tab].toLowerCase()} enregistré pour ce périmètre.`
                : "Aucun élément ne correspond aux filtres."}
            </p>
            {hasActiveFilters && typed.length > 0 && (
              <button type="button" className={`${secondary} mt-3`} onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <article
                key={`${typeOf(item)}-${String(item.id)}`}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {tab === "combined" && (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
                      {TYPE_LABELS[typeOf(item)]}
                    </span>
                  )}
                  <span className={`text-xs font-bold text-muted-foreground`}>
                    {str(item["code"]) || `#${String(item.id)}`}
                  </span>
                  <span className={niveauBadgeClass(riskNiveauOf(item))}>
                    {riskCriticiteOf(item) ?? "—"} · {NIVEAU_LABELS[riskNiveauOf(item)]}
                  </span>
                  <span className={statusBadgeClass(item["status"])}>
                    {STATUS_LABELS[str(item["status"]).toLowerCase() as RiskStatus] ??
                      str(item["status"])}
                  </span>
                </div>
                <h3 className="mt-2 font-display font-bold">
                  {str(item["title"]) || "Sans intitulé"}
                </h3>
                <p className={`mt-1 line-clamp-2 text-sm ${muted}`}>
                  {str(item["description"]) || "—"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {processName(item, processes)} · P{str(item["probabilite"]) || "—"} × G
                  {str(item["gravite"]) || "—"} · Échéance : {formatDateFR(item["target_date"])}
                </p>
                <div className="mt-3">{renderActions(item)}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {tab === "combined" && <th className="px-3 py-2">Type</th>}
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Intitulé</th>
                  <th className="px-3 py-2">Processus</th>
                  <th className="px-3 py-2">P × G</th>
                  <th className="px-3 py-2">Criticité</th>
                  <th className="px-3 py-2">Niveau</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Échéance</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={`${typeOf(item)}-${String(item.id)}`} className="border-t border-border">
                    {tab === "combined" && (
                      <td className="px-3 py-2">{TYPE_LABELS[typeOf(item)]}</td>
                    )}
                    <td className="px-3 py-2 font-semibold">{str(item["code"]) || "—"}</td>
                    <td className="px-3 py-2 font-semibold">{str(item["title"]) || "—"}</td>
                    <td className="px-3 py-2">{processName(item, processes)}</td>
                    <td className="px-3 py-2">
                      {str(item["probabilite"]) || "—"} × {str(item["gravite"]) || "—"}
                    </td>
                    <td className="px-3 py-2 font-extrabold text-primary">
                      {riskCriticiteOf(item) ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={niveauBadgeClass(riskNiveauOf(item))}>
                        {NIVEAU_LABELS[riskNiveauOf(item)]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusBadgeClass(item["status"])}>
                        {STATUS_LABELS[str(item["status"]).toLowerCase() as RiskStatus] ??
                          str(item["status"])}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatDateFR(item["target_date"])}</td>
                    <td className="px-3 py-2">{renderActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editingId == null ? "Nouveau risque ou opportunité" : "Modifier la fiche"}
        >
          <div className={`${card} my-8 w-full max-w-3xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Étape {step} / 2 · {step === 1 ? "Informations" : "Actions"}
                </p>
                <h2 className="mt-1 font-display text-xl font-bold">
                  {editingId == null
                    ? `Nouveau ${TYPE_LABELS[form.type].toLowerCase()}`
                    : "Modifier la fiche"}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-muted-foreground hover:bg-background"
                onClick={() => setFormOpen(false)}
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              {(Object.keys(TYPE_LABELS) as RiskType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={form.type === t ? primary : secondary}
                  disabled={editingId != null && form.type !== t}
                  onClick={() =>
                    touch({
                      type: t,
                      source_category:
                        form.type === t
                          ? form.source_category
                          : (SOURCE_OPTIONS[t][0]?.value ?? ""),
                    })
                  }
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {step === 1 ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Processus *
                  </label>
                  <select
                    className={input}
                    value={form.process_id}
                    onChange={(e) => touch({ process_id: e.target.value })}
                  >
                    <option value="">Sélectionner un processus</option>
                    {processes.map((p) => (
                      <option key={String(p["id"] ?? "")} value={String(p["id"] ?? "")}>
                        {processLabelOfRecord(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Statut *
                  </label>
                  <select
                    className={input}
                    value={form.status}
                    onChange={(e) => touch({ status: e.target.value as RiskStatus })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Intitulé *
                  </label>
                  <input
                    className={input}
                    value={form.title}
                    placeholder="Ex : Rupture d'un fournisseur critique"
                    onChange={(e) => touch({ title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Stratégie {form.type === "risque" ? "*" : ""}
                  </label>
                  <select
                    className={input}
                    value={form.strategie}
                    onChange={(e) => touch({ strategie: e.target.value })}
                  >
                    {form.type !== "risque" && <option value="">—</option>}
                    {STRATEGIES.filter((strategy) =>
                      form.type === "risque"
                        ? strategy.value !== "exploiter"
                        : strategy.value === "exploiter",
                    ).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Description *
                  </label>
                  <textarea
                    className={`${input} min-h-24`}
                    value={form.description}
                    placeholder="Décrivez le risque ou l'opportunité…"
                    onChange={(e) => touch({ description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Source de l’analyse *
                  </label>
                  <select
                    className={input}
                    value={form.source_category}
                    onChange={(e) => touch({ source_category: e.target.value })}
                  >
                    {SOURCE_OPTIONS[form.type].map((source) => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Méthode d’évaluation *
                  </label>
                  <select
                    className={input}
                    value={form.assessment_method}
                    onChange={(e) =>
                      touch({ assessment_method: e.target.value as RiskForm["assessment_method"] })
                    }
                  >
                    <option value="qualitative">Qualitative, proportionnée au contexte</option>
                    <option value="quantitative">Quantitative / chiffrée</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Fait, attente ou donnée source *
                  </label>
                  <textarea
                    className={`${input} min-h-20`}
                    value={form.source_detail}
                    placeholder="Référence au fait observé, à la partie intéressée, au changement ou à la mesure."
                    onChange={(e) => touch({ source_detail: e.target.value })}
                  />
                </div>
                {form.type === "risque" && (
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Cause *
                    </label>
                    <textarea
                      className={input}
                      value={form.cause}
                      placeholder="Cause probable du risque…"
                      onChange={(e) => touch({ cause: e.target.value })}
                    />
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Conséquence
                  </label>
                  <textarea
                    className={input}
                    value={form.consequence}
                    placeholder="Conséquence potentielle…"
                    onChange={(e) => touch({ consequence: e.target.value })}
                  />
                </div>
                {form.type === "opportunite" ? (
                  <>
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Effet souhaité *
                      </label>
                      <textarea
                        className={input}
                        value={form.desired_effect}
                        placeholder="Quel bénéfice ou résultat positif cherche-t-on à obtenir ?"
                        onChange={(e) => touch({ desired_effect: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Décision *
                      </label>
                      <select
                        className={input}
                        value={form.opportunity_decision}
                        onChange={(e) =>
                          touch({
                            opportunity_decision: e.target
                              .value as RiskForm["opportunity_decision"],
                          })
                        }
                      >
                        <option value="">Choisir une décision</option>
                        <option value="retain">Retenir et exploiter</option>
                        <option value="defer">Différer</option>
                        <option value="reject">Rejeter</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Justification de la décision *
                      </label>
                      <textarea
                        className={input}
                        value={form.decision_rationale}
                        placeholder="Expliquez les critères de faisabilité, les ressources et la priorité."
                        onChange={(e) => touch({ decision_rationale: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Plan de continuité en cas de perturbation *
                      </label>
                      <textarea
                        className={input}
                        value={form.continuity_plan}
                        placeholder="Comment maintenir ou rétablir le processus si l’événement survient ?"
                        onChange={(e) => touch({ continuity_plan: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Indicateur de continuité *
                      </label>
                      <input
                        className={input}
                        value={form.continuity_indicator}
                        placeholder="Ex. délai maximal de reprise ou taux de service maintenu"
                        onChange={(e) => touch({ continuity_indicator: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Justification de la proportionnalité *
                      </label>
                      <textarea
                        className={input}
                        value={form.proportionality_rationale}
                        placeholder="Expliquez pourquoi la méthode et le niveau de traitement sont adaptés aux effets possibles."
                        onChange={(e) => touch({ proportionality_rationale: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Revue d’efficacité (à renseigner au suivi)
                  </label>
                  <textarea
                    className={input}
                    value={form.effectiveness_review}
                    placeholder="Résultat de la vérification des actions et motif de leur maintien ou ajustement."
                    onChange={(e) => touch({ effectiveness_review: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Date de la revue d’efficacité
                  </label>
                  <input
                    type="date"
                    className={input}
                    value={form.effectiveness_review_date}
                    onChange={(e) => touch({ effectiveness_review_date: e.target.value })}
                  />
                </div>
                <div>
                  <Slider
                    label={
                      form.assessment_method === "qualitative"
                        ? "Vraisemblance (1–4)"
                        : "Probabilité *"
                    }
                    value={form.probabilite}
                    labels={probaLabels(form.type)}
                    onChange={(v) => touch({ probabilite: v })}
                  />
                </div>
                <div>
                  <Slider
                    label={form.assessment_method === "qualitative" ? "Impact (1–4)" : "Gravité *"}
                    value={form.gravite}
                    labels={graviteLabels(form.type)}
                    onChange={(v) => touch({ gravite: v })}
                  />
                </div>
                <div className="md:col-span-2">
                  <p className="rounded-xl bg-primary-soft/60 p-3 text-sm">
                    Criticité calculée :{" "}
                    <strong className="text-primary">{criticite ?? "—"}</strong>
                    {criticite != null && (
                      <span className="ml-2">(niveau {NIVEAU_LABELS[riskNiveau(criticite)]})</span>
                    )}
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Responsable
                  </label>
                  <select
                    className={input}
                    value={form.responsible_user_id}
                    onChange={(e) => touch({ responsible_user_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={String(u.id)} value={String(u.id)}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Échéance cible
                  </label>
                  <input
                    type="date"
                    className={input}
                    value={form.target_date}
                    onChange={(e) => touch({ target_date: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Normes ISO (séparées par des virgules)
                  </label>
                  <input
                    className={input}
                    value={form.normes_iso}
                    placeholder="Ex : ISO 9001, ISO 14001"
                    onChange={(e) => touch({ normes_iso: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <p className={muted}>
                  {form.type === "risque"
                    ? "Ajoutez des actions préventives, correctives ou de maîtrise."
                    : "Ajoutez les actions d'exploitation de l'opportunité."}
                </p>
                {form.type === "risque" ? (
                  ACTION_GROUPS.map((group) => (
                    <div key={group.value} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-extrabold">
                          Actions {group.label.toLowerCase()}
                        </h3>
                        <button
                          type="button"
                          className={secondary}
                          onClick={() =>
                            setForm((c) => ({
                              ...c,
                              actions: [...c.actions, newDraft(group.value)],
                            }))
                          }
                        >
                          <Plus className="h-4 w-4" /> Ajouter
                        </button>
                      </div>
                      <div className="mt-3 space-y-3">
                        {form.actions
                          .filter((a) => a.group === group.value)
                          .map((a) => (
                            <ActionDraftFields
                              key={a.key}
                              draft={a}
                              users={users}
                              onChange={(patch) => updateDraft(a.key, patch)}
                              onRemove={() => removeDraft(a.key)}
                            />
                          ))}
                        {form.actions.filter((a) => a.group === group.value).length === 0 && (
                          <p className={`text-xs ${muted}`}>Aucune action dans ce groupe.</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold">Actions</h3>
                      <button
                        type="button"
                        className={secondary}
                        onClick={() =>
                          setForm((c) => ({
                            ...c,
                            actions: [...c.actions, newDraft("preventive")],
                          }))
                        }
                      >
                        <Plus className="h-4 w-4" /> Ajouter
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      {form.actions.map((a) => (
                        <ActionDraftFields
                          key={a.key}
                          draft={a}
                          users={users}
                          onChange={(patch) => updateDraft(a.key, patch)}
                          onRemove={() => removeDraft(a.key)}
                        />
                      ))}
                      {form.actions.length === 0 && (
                        <p className={`text-xs ${muted}`}>Aucune action saisie.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className={secondary} onClick={() => setFormOpen(false)}>
                Annuler
              </button>
              {step === 2 && (
                <button type="button" className={secondary} onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Retour
                </button>
              )}
              {step === 1 ? (
                <button
                  type="button"
                  className={primary}
                  onClick={() => {
                    if (stepOneValid()) setStep(2);
                  }}
                >
                  Suivant <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  className={primary}
                  disabled={saving}
                  onClick={() => void submit()}
                >
                  <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {detailSelection != null && (
        <RiskDetailDialog
          itemId={detailSelection.id}
          itemType={detailSelection.type}
          processes={processes}
          users={users}
          onClose={() => setDetailSelection(null)}
          onEdit={openEdit}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteSelection != null}
        title="Supprimer cet élément ?"
        description="L'élément sera définitivement supprimé."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const selected = confirmDeleteSelection;
          setConfirmDeleteSelection(null);
          if (selected) void doDestroy(selected.id, selected.type);
        }}
        onCancel={() => setConfirmDeleteSelection(null)}
      />

      <PromptDialog
        open={duplicateSource != null}
        title="Dupliquer l'élément"
        description="Saisissez l'intitulé de la copie."
        label="Nouvel intitulé"
        initialValue={duplicateSource ? `${str(duplicateSource["title"])} (copie)` : ""}
        required
        confirmLabel="Dupliquer"
        onSubmit={(value) => void doDuplicate(value)}
        onCancel={() => setDuplicateSource(null)}
      />
    </div>
  );
}

function ActionDraftFields({
  draft,
  users,
  onChange,
  onRemove,
}: {
  draft: ActionDraft;
  users: RiskUser[];
  onChange: (patch: Partial<ActionDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-background p-3">
      <div className="flex items-start gap-2">
        <input
          className={input}
          value={draft.description}
          placeholder="Description de l'action…"
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <button
          type="button"
          className={`${secondary} h-10 w-10 shrink-0 !px-0`}
          onClick={onRemove}
          aria-label="Retirer l'action"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <select
          className={input}
          value={draft.responsible_user_id}
          onChange={(e) => onChange({ responsible_user_id: e.target.value })}
          aria-label="Responsable de l'action"
        >
          <option value="">Responsable…</option>
          {users.map((u) => (
            <option key={String(u.id)} value={String(u.id)}>
              {u.name}
            </option>
          ))}
        </select>
        <input
          className={input}
          value={draft.implicated}
          placeholder="Impliqués (IDs : 5, 8)"
          onChange={(e) => onChange({ implicated: e.target.value })}
          aria-label="Utilisateurs impliqués"
        />
        <input
          type="date"
          className={input}
          value={draft.deadline}
          required
          onChange={(e) => onChange({ deadline: e.target.value })}
          aria-label="Échéance de l’action"
        />
      </div>
    </div>
  );
}
