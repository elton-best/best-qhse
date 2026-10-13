import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Flag,
  LayoutGrid,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  Table as TableIcon,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { flattenResource, useProcesses } from "@/integrations/backend/context";
import {
  downloadBlob,
  exportObjectivesXlsx,
  normalizeMonthly,
  OBJECTIVES_KEY,
  OBJECTIVES_SUMMARY_KEY,
  useObjectiveMutations,
  useObjectives,
  usePolicyAxes,
  useProcessObjectiveMutations,
  useProcessObjectives,
  useResponsables,
  useSystemSummary,
  type CreateObjectiveInput,
  type MonthlyValue,
  type ObjectiveAxis,
  type ObjectiveFrequency,
  type ObjectiveRecord,
  type ObjectiveType,
  type PlannedActionInput,
  type ProcessObjective,
  type SystemSummary,
} from "@/integrations/backend/planningObjectives";
import {
  PLAN_ACTIONS_KEY,
  planActionStatusLabel,
  usePlanActionProgress,
  usePlanActionStatus,
} from "@/integrations/backend/planningActions";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  Header,
  Label,
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

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
const AXES: ObjectiveAxis[] = ["Q", "HS", "E"];
const FREQUENCIES: ObjectiveFrequency[] = ["mensuel", "trimestriel", "semestriel", "annuel"];
const TYPES: ObjectiveType[] = ["strategic", "operational", "quality", "safety", "environmental"];

const TYPE_LABELS: Record<ObjectiveType, string> = {
  strategic: "Stratégique",
  operational: "Opérationnel",
  quality: "Qualité",
  safety: "Sécurité",
  environmental: "Environnemental",
};

const MEASUREMENT_LABELS: Record<string, string> = {
  monthly: "Mensuel",
  quarterly: "Trimestriel",
  semiannual: "Semestriel",
  annual: "Annuel",
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  semestriel: "Semestriel",
  annuel: "Annuel",
};

function rateColor(rate: number): string {
  if (rate >= 80) return "#22c55e";
  if (rate >= 50) return "#f59e0b";
  return "#ef4444";
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberOr(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function centralRate(obj: ObjectiveRecord): number {
  const direct = numberOr(obj["progress"] ?? obj["achievement_percentage"]);
  if (direct !== null) return Math.round(Math.min(100, Math.max(0, direct)));
  const current = numberOr(obj["current_value"]);
  const target = numberOr(obj["target_value"]);
  if (current !== null && target !== null && target > 0)
    return Math.round(Math.min(100, Math.max(0, (current / target) * 100)));
  return 0;
}

function centralProcessLabel(obj: ObjectiveRecord, processNameById?: Map<string, string>): string {
  const processId = obj["process_id"];
  if (processId != null && processNameById) {
    const resolved = processNameById.get(String(processId));
    if (resolved) return resolved;
  }
  const process = obj["process"];
  if (process && typeof process === "object") {
    const title = (process as Record<string, unknown>)["title"];
    if (typeof title === "string" && title) return title;
  }
  const fallback = obj["process_title"] ?? obj["process_name"];
  return typeof fallback === "string" ? fallback : "";
}

function centralResponsibleLabel(obj: ObjectiveRecord): string {
  const responsible = obj["responsible"];
  if (responsible && typeof responsible === "object") {
    const name = (responsible as Record<string, unknown>)["name"];
    if (typeof name === "string" && name) return name;
  }
  const fallback = obj["responsible_name"] ?? obj["responsible"];
  return textOf(fallback);
}

function centralIndicatorLabel(obj: ObjectiveRecord): string {
  const indicateur = obj["indicateur"];
  if (indicateur && typeof indicateur === "object") {
    const name = (indicateur as Record<string, unknown>)["name"];
    if (typeof name === "string" && name) return name;
  }
  return textOf(obj["indicator_name"] ?? obj["indicator"] ?? obj["indicateur"] ?? "");
}

function centralAxes(obj: ObjectiveRecord): string[] {
  const raw = obj["axes"] ?? obj["strategic_axes"];
  if (!Array.isArray(raw)) {
    const single = obj["strategic_axis"];
    return typeof single === "string" && single ? [single] : [];
  }
  return (raw as unknown[])
    .map((axis) =>
      axis && typeof axis === "object"
        ? textOf(
            (axis as Record<string, unknown>)["code"] ?? (axis as Record<string, unknown>)["name"],
          )
        : textOf(axis),
    )
    .map((axis) => axis.trim())
    .filter(Boolean);
}

function centralActionsCount(obj: ObjectiveRecord): number {
  const actions = obj["actions"];
  if (Array.isArray(actions)) return actions.length;
  const planned = obj["planned_actions"];
  return Array.isArray(planned) ? planned.length : 0;
}

type LinkedActionView = {
  id: string | number | null;
  title: string;
  status: string;
  progress: number;
};

function linkedActionsOf(obj: ObjectiveRecord): LinkedActionView[] {
  const raw = obj["actions"];
  if (!Array.isArray(raw)) return [];
  const out: LinkedActionView[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const idRaw = rec["id"];
    const id: string | number | null =
      typeof idRaw === "string" || typeof idRaw === "number" ? idRaw : null;
    const progressRaw = numberOr(rec["progress"] ?? rec["progress_rate"]);
    out.push({
      id,
      title: textOf(rec["title"] ?? rec["name"]) || "Action",
      status: textOf(rec["status"] ?? rec["workflow_state"] ?? ""),
      progress: progressRaw === null ? 0 : Math.min(100, Math.max(0, Math.round(progressRaw))),
    });
  }
  return out;
}

function plannedTitlesOf(obj: ObjectiveRecord): string[] {
  const raw = obj["planned_actions"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") return textOf(entry) || "Action";
    const rec = entry as Record<string, unknown>;
    return textOf(rec["title"] ?? rec["name"]) || "Action";
  });
}

function ActionProgressRow({ action }: { action: LinkedActionView }) {
  const queryClient = useQueryClient();
  const progressMutation = usePlanActionProgress();
  const statusMutation = usePlanActionStatus();
  const [draft, setDraft] = useState<number>(action.progress);
  const [notes, setNotes] = useState<string>("");
  const [statusDraft, setStatusDraft] = useState<string>(action.status);

  useEffect(() => {
    setDraft(action.progress);
    setStatusDraft(action.status);
  }, [action.progress, action.status]);

  const invalidateObjectiveQueries = (): void => {
    queryClient.invalidateQueries({ queryKey: OBJECTIVES_KEY });
    queryClient.invalidateQueries({ queryKey: OBJECTIVES_SUMMARY_KEY });
    queryClient.invalidateQueries({ queryKey: PLAN_ACTIONS_KEY });
  };

  const saveProgress = (): void => {
    if (action.id === null) {
      toast.error("Action sans identifiant : progression impossible.");
      return;
    }
    const value = Math.min(100, Math.max(0, Math.round(draft)));
    progressMutation.mutate(
      {
        id: action.id,
        progress: value,
        notes: notes.trim() === "" ? undefined : notes.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Progression de l'action enregistrée.");
          invalidateObjectiveQueries();
        },
        onError: (err) => toast.error(errorMessage(err, "Enregistrement impossible.")),
      },
    );
  };

  const saveStatus = (nextStatus: string): void => {
    if (action.id === null) return;
    setStatusDraft(nextStatus);
    if (!nextStatus || nextStatus === action.status) return;
    statusMutation.mutate(
      { id: action.id, status: nextStatus },
      {
        onSuccess: () => {
          toast.success("Statut de l'action mis à jour.");
          invalidateObjectiveQueries();
        },
        onError: (err) => toast.error(errorMessage(err, "Mise à jour du statut impossible.")),
      },
    );
  };

  const pending = progressMutation.isPending || statusMutation.isPending;
  const actionLabel = action.id === null ? action.title : `${action.title} (#${String(action.id)})`;

  return (
    <div className="space-y-2 rounded-xl bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold" title={actionLabel}>
          {action.title}
        </p>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {action.status ? planActionStatusLabel(action.status) : "—"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          className="w-full accent-primary"
          aria-label={`Progression de ${action.title} (0 à 100)`}
        />
        <span className="w-14 shrink-0 text-right text-sm font-extrabold">{draft} %</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px]">
        <input
          className={input}
          value={notes}
          placeholder="Note de suivi (optionnel)…"
          onChange={(e) => setNotes(e.target.value)}
          aria-label={`Note pour ${action.title}`}
        />
        <select
          className={input}
          value={statusDraft}
          onChange={(e) => saveStatus(e.target.value)}
          disabled={pending || action.id === null}
          aria-label={`Statut de ${action.title}`}
        >
          <option value="">Statut…</option>
          <option value="planned">Assignée</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminée</option>
          <option value="verified">Vérifiée</option>
          <option value="cancelled">Annulée</option>
        </select>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={`${secondary} h-8 px-3 text-xs`}
          disabled={pending || action.id === null}
          onClick={saveProgress}
        >
          <Save className="h-3.5 w-3.5" />{" "}
          {progressMutation.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

function ObjectiveActionsBlock({ obj }: { obj: ObjectiveRecord }) {
  // Liste dépliable des actions liées ; fallback planned_actions en lecture seule
  // (détail non chargé) quand obj["actions"] est absent.
  const [open, setOpen] = useState(false);
  const linked = linkedActionsOf(obj);
  const planned = linked.length === 0 ? plannedTitlesOf(obj) : [];
  const count = centralActionsCount(obj);
  if (count === 0) return null;

  if (linked.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
        <button
          type="button"
          className="text-xs font-bold text-primary hover:underline"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Masquer les actions" : `Voir les actions (${String(planned.length)})`}
        </button>
        {open && (
          <div className="mt-2 space-y-1.5">
            <p className={`text-xs ${muted}`}>
              {
                "Actions en lecture seule (détail non chargé) — progression à saisir depuis la page Plans d'actions."
              }
            </p>
            <ul className="space-y-1">
              {planned.map((title, index) => (
                <li
                  key={index}
                  className="rounded-lg bg-background px-3 py-2 text-sm font-semibold"
                >
                  {title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <button
        type="button"
        className="text-xs font-bold text-primary hover:underline"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Masquer les actions" : `Voir les actions (${String(linked.length)})`}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {linked.map((action, index) => (
            <ActionProgressRow
              key={action.id === null ? `action-${String(index)}` : String(action.id)}
              action={action}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function centralFrequency(obj: ObjectiveRecord): string {
  const raw = textOf(obj["measurement_frequency"] ?? obj["frequency"] ?? obj["frequence"]);
  return MEASUREMENT_LABELS[raw.toLowerCase()] ?? raw;
}

function monthlyRate(obj: ProcessObjective): number | null {
  const direct = numberOr(obj["current_achievement_rate"] ?? obj["taux_actuel"]);
  if (direct !== null) return Math.round(direct);
  const months = normalizeMonthly(obj["period_realizations"]);
  const numeric = months.filter((value): value is number => typeof value === "number");
  if (numeric.length === 0) return null;
  return Math.round(numeric.reduce((a, b) => a + b, 0) / numeric.length);
}

function monthlyAxes(obj: ProcessObjective): string[] {
  const raw = obj["strategic_axes"];
  const list: string[] = Array.isArray(raw)
    ? raw
        .map(textOf)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  const single = textOf(obj["strategic_axis"]).trim();
  if (list.length === 0 && single) return [single];
  return list;
}

function summaryCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return textOf(value);
  }
  return "—";
}

function tomorrowISO(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

// ---------- Formulaire central ----------

type CentralForm = {
  process_id: string;
  frequency: ObjectiveFrequency;
  title: string;
  type: ObjectiveType;
  axes: ObjectiveAxis[];
  indicator_name: string;
  target_value: string;
  unit: string;
  deadline: string;
  responsible_id: string;
  description: string;
  actions: PlannedActionInput[];
};

const EMPTY_FORM: CentralForm = {
  process_id: "",
  frequency: "mensuel",
  title: "",
  type: "operational",
  axes: [],
  indicator_name: "",
  target_value: "",
  unit: "%",
  deadline: "",
  responsible_id: "",
  description: "",
  actions: [],
};

function formFromRecord(obj: ObjectiveRecord): CentralForm {
  const process = obj["process"];
  const processId =
    obj["process_id"] ??
    (process && typeof process === "object"
      ? (process as Record<string, unknown>)["id"]
      : undefined);
  const rawAxes = centralAxes(obj).filter((axis): axis is ObjectiveAxis =>
    (AXES as string[]).includes(axis),
  );
  return {
    process_id: processId == null ? "" : String(processId),
    frequency: "mensuel",
    title: textOf(obj["title"]),
    type: (TYPES as string[]).includes(textOf(obj["type"]))
      ? (obj["type"] as ObjectiveType)
      : "operational",
    axes: rawAxes,
    indicator_name: centralIndicatorLabel(obj),
    target_value: obj["target_value"] == null ? "" : String(obj["target_value"]),
    unit: textOf(obj["unit"] ?? "%"),
    deadline: textOf(obj["deadline"]).slice(0, 10),
    responsible_id: obj["responsible_id"] == null ? "" : String(obj["responsible_id"]),
    description: textOf(obj["description"]),
    actions: [],
  };
}

function CentralDialog({
  open,
  editing,
  form,
  setForm,
  policyAxes,
  responsables,
  processOptions,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: ObjectiveRecord | null;
  form: CentralForm;
  setForm: (form: CentralForm) => void;
  policyAxes: string[];
  responsables: Array<{ id: string | number; name: string }>;
  processOptions: Array<{ id: string; label: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!open) return null;
  const set = <K extends keyof CentralForm>(key: K, value: CentralForm[K]): void =>
    setForm({ ...form, [key]: value });
  const toggleAxis = (axis: ObjectiveAxis): void =>
    set(
      "axes",
      form.axes.includes(axis) ? form.axes.filter((item) => item !== axis) : [...form.axes, axis],
    );
  const updateAction = (index: number, patch: Partial<PlannedActionInput>): void =>
    set(
      "actions",
      form.actions.map((action, i) => (i === index ? { ...action, ...patch } : action)),
    );
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-foreground/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} my-8 w-full max-w-3xl p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">
              {editing ? "Modifier l'objectif" : "Nouvel objectif"}
            </h2>
            <p className={muted}>Objectif central rattaché au site courant.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-background"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Processus *</Label>
            <select
              className={input}
              value={form.process_id}
              onChange={(e) => set("process_id", e.target.value)}
            >
              <option value="">Sélectionnez un processus</option>
              {processOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Fréquence *</Label>
            <select
              className={input}
              value={form.frequency}
              onChange={(e) => set("frequency", e.target.value as ObjectiveFrequency)}
            >
              {FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {MEASUREMENT_LABELS[frequency] ?? frequency}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Titre *</Label>
            <input
              className={input}
              value={form.title}
              placeholder="Ex : Réduire les non-conformités de 20 %"
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div>
            <Label>Type *</Label>
            <select
              className={input}
              value={form.type}
              onChange={(e) => set("type", e.target.value as ObjectiveType)}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Indicateur *</Label>
            <input
              className={input}
              value={form.indicator_name}
              placeholder="Ex : Taux de non-conformité"
              onChange={(e) => set("indicator_name", e.target.value)}
            />
          </div>
          <div>
            <Label>Axes (Q / HS / E) *</Label>
            <div className="flex flex-wrap gap-2">
              {AXES.map((axis) => (
                <button
                  key={axis}
                  type="button"
                  onClick={() => toggleAxis(axis)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${form.axes.includes(axis) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary"}`}
                >
                  {axis}
                </button>
              ))}
            </div>
            {policyAxes.length > 0 && (
              <p className={`mt-1 text-xs ${muted}`}>
                Axes de la politique : {policyAxes.join(" · ")}
              </p>
            )}
          </div>
          <div>
            <Label>Cible *</Label>
            <input
              className={input}
              inputMode="decimal"
              value={form.target_value}
              placeholder="Ex : 100"
              onChange={(e) => set("target_value", e.target.value)}
            />
          </div>
          <div>
            <Label>Unité</Label>
            <input
              className={input}
              value={form.unit}
              placeholder="Ex : %"
              onChange={(e) => set("unit", e.target.value)}
            />
          </div>
          <div>
            <Label>Échéance (date future) *</Label>
            <input
              type="date"
              className={input}
              min={tomorrowISO()}
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Responsable *</Label>
            <select
              className={input}
              value={form.responsible_id}
              onChange={(e) => set("responsible_id", e.target.value)}
            >
              <option value="">Sélectionnez un responsable</option>
              {responsables.map((user) => (
                <option key={String(user.id)} value={String(user.id)}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <textarea
              className={`${input} min-h-20`}
              value={form.description}
              placeholder="Contexte et portée de l'objectif…"
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <Label>Actions planifiées</Label>
            <button
              type="button"
              className={`${secondary} h-8 px-3 text-xs`}
              onClick={() =>
                set("actions", [...form.actions, { title: "", status: "a_faire", progress: 0 }])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          {form.actions.length === 0 ? (
            <p className={`mt-1 text-xs ${muted}`}>Aucune action planifiée.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {form.actions.map((action, index) => (
                <li
                  key={index}
                  className="grid grid-cols-1 gap-2 rounded-xl bg-background p-3 sm:grid-cols-[1fr_140px_130px]"
                >
                  <input
                    className={input}
                    value={action.title}
                    placeholder={`Action ${index + 1}`}
                    onChange={(e) => updateAction(index, { title: e.target.value })}
                  />
                  <input
                    type="date"
                    className={input}
                    value={action.due_date ?? ""}
                    onChange={(e) => updateAction(index, { due_date: e.target.value || undefined })}
                  />
                  <div className="flex gap-2">
                    <select
                      className={input}
                      value={action.status ?? "a_faire"}
                      onChange={(e) => updateAction(index, { status: e.target.value })}
                    >
                      <option value="a_faire">À faire</option>
                      <option value="en_cours">En cours</option>
                      <option value="terminee">Terminée</option>
                    </select>
                    <button
                      type="button"
                      className={`${secondary} h-10 w-10 shrink-0 !px-0`}
                      aria-label="Retirer l'action"
                      onClick={() =>
                        set(
                          "actions",
                          form.actions.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={primary} disabled={pending} onClick={onSubmit}>
            <Save className="h-4 w-4" />{" "}
            {pending ? "Enregistrement…" : editing ? "Mettre à jour" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SmallDialog({
  title,
  description,
  onClose,
  onSubmit,
  submitLabel,
  pending,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-foreground/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${card} w-full max-w-md p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            {description && <p className={`mt-1 ${muted}`}>{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-muted-foreground hover:bg-background"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={primary} disabled={pending} onClick={onSubmit}>
            {pending ? "Enregistrement…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Suivi mensuel : éditeur 12 mois ----------

function MonthlyEditor({
  objective,
  processId,
  siteId,
}: {
  objective: ProcessObjective;
  processId: string;
  siteId: string;
}) {
  const mutations = useProcessObjectiveMutations(processId, siteId);
  const serverKey = JSON.stringify(objective["period_realizations"] ?? null);
  const [title, setTitle] = useState<string>(objective.title);
  const [months, setMonths] = useState<MonthlyValue[]>(() =>
    normalizeMonthly(objective["period_realizations"]),
  );
  const [error, setError] = useState<string | null>(null);
  const currentMonth = new Date().getMonth() + 1;
  const rate = monthlyRate(objective);
  const dirty = useMemo(
    () => title !== objective.title || JSON.stringify(months) !== serverKey,
    [title, months, objective.title, serverKey],
  );

  useEffect(() => {
    setTitle(objective.title);
    setMonths(normalizeMonthly(objective["period_realizations"]));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey, objective.id]);

  const setMonth = (index: number, value: MonthlyValue): void =>
    setMonths((current) => current.map((item, i) => (i === index ? value : item)));

  const onNumeric = (index: number, raw: string): void => {
    if (raw.trim() === "") {
      setMonth(index, null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setMonth(index, Math.min(100, Math.max(0, Math.round(n))));
  };

  const save = (): void => {
    setError(null);
    mutations.update.mutate(
      {
        objectiveId: objective.id,
        patch: { title: title.trim() || objective.title, period_realizations: months },
      },
      {
        onSuccess: () => toast.success("Suivi mensuel enregistré."),
        onError: (err) => {
          // Message serveur affiché tel quel (dont verrou REQ-6.2-06 en 422).
          const message = errorMessage(err, "Enregistrement impossible.");
          setError(message);
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            className={`${input} font-bold`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Titre de l'objectif"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {monthlyAxes(objective).map((axis) => (
              <span
                key={axis}
                className="rounded-full bg-primary-soft px-2.5 py-1 font-bold text-primary"
              >
                {axis}
              </span>
            ))}
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
              {MEASUREMENT_LABELS[textOf(objective["measurement_frequency"]).toLowerCase()] ??
                "Mensuel"}
            </span>
            {rate !== null ? (
              <span className="font-extrabold" style={{ color: rateColor(rate) }}>
                Taux actuel : {rate} %
              </span>
            ) : (
              <span className="text-muted-foreground">Taux actuel : —</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={primary}
          disabled={!dirty || mutations.update.isPending}
          onClick={save}
        >
          <Save className="h-4 w-4" />{" "}
          {mutations.update.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {rate !== null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${rate}%`, backgroundColor: rateColor(rate) }}
          />
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {MONTHS.map((label, index) => {
          const monthNumber = index + 1;
          const value = months[index] ?? null;
          const isPast = monthNumber < currentMonth;
          const isCurrent = monthNumber === currentMonth;
          return (
            <div
              key={label}
              className={`rounded-xl border p-2 ${isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border"} ${monthNumber > currentMonth ? "bg-slate-50" : "bg-background"}`}
              title={
                isPast
                  ? "Mois verrouillé : les mois passés ne sont pas modifiables (REQ-6.2-06)."
                  : monthNumber > currentMonth
                    ? "Mois futur : saisie optionnelle."
                    : "Mois en cours."
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                {isPast ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setMonth(index, value === "N/A" ? null : "N/A")}
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${value === "N/A" ? "bg-slate-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    title="Basculer N/A (non applicable)"
                  >
                    N/A
                  </button>
                )}
              </div>
              {value === "N/A" ? (
                <p className="mt-1 rounded-lg bg-slate-100 py-1.5 text-center text-sm font-bold text-slate-500">
                  N/A
                </p>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={100}
                  disabled={isPast}
                  value={value ?? ""}
                  placeholder={monthNumber > currentMonth ? "Optionnel" : "0-100"}
                  onChange={(e) => onNumeric(index, e.target.value)}
                  className={`${input} mt-1 !px-2 py-1.5 text-center font-bold disabled:cursor-not-allowed disabled:opacity-50`}
                  aria-label={`${label} (0 à 100)`}
                />
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ---------- Page ----------

export function ObjectivesPage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<"central" | "monthly">("central");
  const [search, setSearch] = useState("");
  const [filterProcess, setFilterProcess] = useState("");
  const [filterAxe, setFilterAxe] = useState("");
  const [filterFrequency, setFilterFrequency] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ObjectiveRecord | null>(null);
  const [form, setForm] = useState<CentralForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | number | null>(null);
  const [progressState, setProgressState] = useState<{
    id: string | number;
    value: string;
    notes: string;
  } | null>(null);
  const [milestoneState, setMilestoneState] = useState<{
    id: string | number;
    title: string;
    target_date: string;
    target_value: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [monthlyProcessId, setMonthlyProcessId] = useState("");

  const { data: objectives = [], isLoading, isError, error: listError } = useObjectives(siteId);
  const { data: summary } = useSystemSummary(siteId);
  const { data: policyAxes = [] } = usePolicyAxes(siteId);
  const { data: responsables = [] } = useResponsables(siteId);
  const { data: processes = [] } = useProcesses(siteId);
  const mutations = useObjectiveMutations(siteId);

  const processOptions = useMemo(
    () =>
      processes
        .map((item) => {
          const flat = flattenResource(item);
          return {
            id: String(flat["id"] ?? ""),
            label: textOf(flat["title"] ?? flat["name"]) || `Processus #${textOf(flat["id"])}`,
          };
        })
        .filter((option) => option.id),
    [processes],
  );

  const processNameById = useMemo(
    () => new Map(processOptions.map((option) => [option.id, option.label])),
    [processOptions],
  );

  useEffect(() => {
    if (!monthlyProcessId && processOptions.length > 0 && processOptions[0]) {
      setMonthlyProcessId(processOptions[0].id);
    }
  }, [monthlyProcessId, processOptions]);

  const { data: processObjectives } = useProcessObjectives(monthlyProcessId || null);

  const filtered = useMemo(
    () =>
      objectives.filter((obj) => {
        const query = search.trim().toLowerCase();
        const matchSearch =
          !query ||
          textOf(obj["title"]).toLowerCase().includes(query) ||
          centralIndicatorLabel(obj).toLowerCase().includes(query);
        const matchProcess = !filterProcess || String(obj["process_id"] ?? "") === filterProcess;
        const matchAxe = !filterAxe || centralAxes(obj).includes(filterAxe);
        const matchFrequency = !filterFrequency || centralFrequency(obj) === filterFrequency;
        return matchSearch && matchProcess && matchAxe && matchFrequency;
      }),
    [objectives, search, filterProcess, filterAxe, filterFrequency],
  );

  const stats = useMemo(() => {
    const rates = objectives.map(centralRate);
    const total = objectives.length;
    const average = total === 0 ? 0 : Math.round(rates.reduce((a, b) => a + b, 0) / total);
    return {
      total,
      average,
      achieved: rates.filter((rate) => rate >= 80).length,
      warning: rates.filter((rate) => rate < 50).length,
    };
  }, [objectives]);

  const processLabels = useMemo(() => {
    const usedIds = new Set(
      objectives.map((obj) => String(obj["process_id"] ?? "")).filter(Boolean),
    );
    const fromOptions = processOptions.filter(
      (option) => usedIds.size === 0 || usedIds.has(option.id),
    );
    if (fromOptions.length > 0) return fromOptions;
    return [...usedIds].map((id) => ({
      id,
      label: processNameById.get(id) ?? `Processus #${id}`,
    }));
  }, [objectives, processOptions, processNameById]);
  const axeOptions = useMemo(() => [...new Set(objectives.flatMap(centralAxes))], [objectives]);
  const frequencyOptions = useMemo(
    () => [...new Set(objectives.map(centralFrequency).filter(Boolean))],
    [objectives],
  );
  const hasFilters = Boolean(search.trim() || filterProcess || filterAxe || filterFrequency);

  const openCreate = (): void => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (obj: ObjectiveRecord): void => {
    setEditing(obj);
    setForm(formFromRecord(obj));
    setDialogOpen(true);
  };

  const submitDialog = (): void => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant d'enregistrer.");
      return;
    }
    if (!form.process_id) {
      toast.error("Sélectionnez un processus.");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Le titre de l'objectif est requis.");
      return;
    }
    if (!form.indicator_name.trim()) {
      toast.error("Le nom de l'indicateur est requis.");
      return;
    }
    if (form.axes.length === 0) {
      toast.error("Sélectionnez au moins un axe (Q / HS / E).");
      return;
    }
    const target = Number(form.target_value);
    if (!Number.isFinite(target)) {
      toast.error("La cible doit être un nombre.");
      return;
    }
    if (!form.deadline || form.deadline <= new Date().toISOString().slice(0, 10)) {
      toast.error("L'échéance doit être une date future.");
      return;
    }
    if (!form.responsible_id) {
      toast.error("Sélectionnez un responsable.");
      return;
    }
    const actions = form.actions
      .map((action) => ({ ...action, title: action.title.trim() }))
      .filter((action) => action.title.length > 0);
    if (editing) {
      mutations.update.mutate(
        {
          id: editing.id,
          patch: {
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            type: form.type,
            target_value: target,
            unit: form.unit.trim() || undefined,
            deadline: form.deadline,
            responsible_id: Number(form.responsible_id),
            axes: form.axes,
            planned_actions: actions,
          },
        },
        {
          onSuccess: () => {
            toast.success("Objectif mis à jour.");
            setDialogOpen(false);
            setEditing(null);
          },
          onError: (err) => toast.error(errorMessage(err, "Mise à jour impossible.")),
        },
      );
      return;
    }
    const payload: CreateObjectiveInput = {
      site_id: Number(siteId),
      process_id: Number(form.process_id),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      target_value: target,
      unit: form.unit.trim() || undefined,
      deadline: form.deadline,
      responsible_id: Number(form.responsible_id),
      axes: form.axes,
      frequency: form.frequency,
      indicator_name: form.indicator_name.trim(),
      planned_actions: actions,
    };
    mutations.create.mutate(payload, {
      onSuccess: () => {
        toast.success("Objectif créé.");
        setDialogOpen(false);
      },
      onError: (err) => toast.error(errorMessage(err, "Création impossible.")),
    });
  };

  const confirmDelete = (): void => {
    if (deleteId === null) return;
    mutations.remove.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Objectif supprimé.");
        setDeleteId(null);
      },
      onError: (err) => toast.error(errorMessage(err, "Suppression impossible.")),
    });
  };

  const submitMilestone = (): void => {
    if (!milestoneState) return;
    if (!milestoneState.title.trim()) {
      toast.error("Le titre du jalon est requis.");
      return;
    }
    if (!milestoneState.target_date) {
      toast.error("La date cible du jalon est requise.");
      return;
    }
    const target =
      milestoneState.target_value.trim() === "" ? undefined : Number(milestoneState.target_value);
    if (target !== undefined && !Number.isFinite(target)) {
      toast.error("La valeur cible doit être un nombre.");
      return;
    }
    mutations.milestone.mutate(
      {
        id: milestoneState.id,
        title: milestoneState.title.trim(),
        target_date: milestoneState.target_date,
        target_value: target,
      },
      {
        onSuccess: () => {
          toast.success("Jalon ajouté.");
          setMilestoneState(null);
        },
        onError: (err) => toast.error(errorMessage(err, "Ajout du jalon impossible.")),
      },
    );
  };

  const submitProgressDirect = (): void => {
    if (!progressState) return;
    const value = Number(progressState.value);
    if (!Number.isFinite(value)) {
      toast.error("Saisissez une valeur numérique.");
      return;
    }
    mutations.progress.mutate(
      {
        id: progressState.id,
        current_value: value,
        notes: progressState.notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Progression enregistrée.");
          setProgressState(null);
        },
        onError: (err) => toast.error(errorMessage(err, "Enregistrement impossible.")),
      },
    );
  };

  const doExport = async (): Promise<void> => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant d'exporter.");
      return;
    }
    setExporting(true);
    try {
      const blob = await exportObjectivesXlsx(siteId);
      downloadBlob(blob, `objectifs-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Export XLSX téléchargé.");
    } catch (err) {
      toast.error(errorMessage(err, "Export impossible."));
    } finally {
      setExporting(false);
    }
  };

  const summaryData: SystemSummary | undefined = summary;
  const progressObjective = progressState
    ? (objectives.find((item) => String(item.id) === String(progressState.id)) ?? null)
    : null;
  const progressHasLinkedActions =
    progressObjective !== null && centralActionsCount(progressObjective) > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        eyebrow="Planification"
        title="Objectifs qualité"
        description="Objectifs centraux du site et suivi mensuel par processus."
        icon={Target}
      >
        <Link
          to="/app/$section"
          params={{ section: "actions" }}
          search={{ new: 1 }}
          className={secondary}
        >
          <Plus className="h-4 w-4" /> Créer action
        </Link>
        <button
          type="button"
          className={secondary}
          disabled={exporting || objectives.length === 0}
          onClick={() => void doExport()}
        >
          <Download className="h-4 w-4" /> {exporting ? "Export…" : "Export XLSX"}
        </button>
        <button type="button" className={primary} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nouvel objectif
        </button>
      </Header>

      {!siteId && <SiteNotice />}

      <div className={`${card} grid grid-cols-2 gap-3 p-4 lg:grid-cols-4`}>
        <Stat value={stats.total} label="Objectifs" />
        <Stat
          value={`${stats.average} %`}
          label="Taux moyen"
          tone={
            stats.average >= 80
              ? "text-emerald-600"
              : stats.average >= 50
                ? "text-amber-600"
                : "text-red-600"
          }
        />
        <Stat value={stats.achieved} label="Atteints (≥ 80 %)" tone="text-emerald-600" />
        <Stat value={stats.warning} label="Vigilance (< 50 %)" tone="text-red-600" />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={tab === "central" ? primary : secondary}
          onClick={() => setTab("central")}
        >
          <Target className="h-4 w-4" /> Objectifs centraux
        </button>
        <button
          type="button"
          className={tab === "monthly" ? primary : secondary}
          onClick={() => setTab("monthly")}
        >
          <TrendingUp className="h-4 w-4" /> Suivi mensuel
        </button>
      </div>

      {tab === "central" && (
        <div className="space-y-4">
          <div className={`${card} p-4`}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_140px_160px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className={`${input} pl-9`}
                  value={search}
                  placeholder="Rechercher un objectif, un indicateur…"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className={input}
                value={filterProcess}
                onChange={(e) => setFilterProcess(e.target.value)}
              >
                <option value="">Tous processus</option>
                {processLabels.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                className={input}
                value={filterAxe}
                onChange={(e) => setFilterAxe(e.target.value)}
              >
                <option value="">Tous axes</option>
                {axeOptions.map((axe) => (
                  <option key={axe} value={axe}>
                    {axe}
                  </option>
                ))}
              </select>
              <select
                className={input}
                value={filterFrequency}
                onChange={(e) => setFilterFrequency(e.target.value)}
              >
                <option value="">Toutes fréquences</option>
                {frequencyOptions.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
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
                  className={view === "table" ? primary : secondary}
                  onClick={() => setView("table")}
                  aria-label="Vue tableau"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            {hasFilters && (
              <button
                type="button"
                className={`mt-3 text-xs font-bold text-primary hover:underline`}
                onClick={() => {
                  setSearch("");
                  setFilterProcess("");
                  setFilterAxe("");
                  setFilterFrequency("");
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>

          {isLoading ? (
            <PageSkeleton rows={4} />
          ) : isError ? (
            <div role="alert" className={`${card} p-6 text-sm text-destructive`}>
              La liste des objectifs centraux est indisponible :{" "}
              {errorMessage(listError, "erreur inconnue")}.
            </div>
          ) : filtered.length === 0 ? (
            <div className={`${card} p-8 text-center`}>
              <p className="font-display text-lg font-bold">
                {objectives.length === 0 ? "Aucun objectif central" : "Aucun résultat"}
              </p>
              <p className={`mt-1 ${muted}`}>
                {objectives.length === 0
                  ? "Créez votre premier objectif central pour ce site."
                  : "Aucun objectif ne correspond aux filtres."}
              </p>
              {objectives.length === 0 && (
                <button type="button" className={`${primary} mt-4`} onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Nouvel objectif
                </button>
              )}
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((obj) => {
                const rate = centralRate(obj);
                return (
                  <article key={String(obj.id)} className={`${card} flex flex-col p-5`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {centralProcessLabel(obj, processNameById) && (
                        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                          {centralProcessLabel(obj, processNameById)}
                        </span>
                      )}
                      {centralAxes(obj).map((axe) => (
                        <span
                          key={axe}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
                        >
                          {axe}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-3 font-display text-base font-extrabold">
                      {textOf(obj["title"]) || "Objectif"}
                    </h3>
                    {centralIndicatorLabel(obj) && (
                      <p className={`mt-1 text-sm ${muted}`}>{centralIndicatorLabel(obj)}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Taux d'atteinte
                      </span>
                      <span
                        className="font-display text-xl font-extrabold"
                        style={{ color: rateColor(rate) }}
                      >
                        {rate} %
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${rate}%`, backgroundColor: rateColor(rate) }}
                      />
                    </div>
                    <div className={`mt-3 flex items-center justify-between text-xs ${muted}`}>
                      <span>{centralActionsCount(obj)} action(s) planifiée(s)</span>
                      {centralFrequency(obj) && (
                        <span className="font-bold">{centralFrequency(obj)}</span>
                      )}
                    </div>
                    <ObjectiveActionsBlock obj={obj} />
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs`}
                        onClick={() => setProgressState({ id: obj.id, value: "", notes: "" })}
                      >
                        <TrendingUp className="h-3.5 w-3.5" /> Progression
                      </button>
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs`}
                        onClick={() =>
                          setMilestoneState({
                            id: obj.id,
                            title: "",
                            target_date: "",
                            target_value: "",
                          })
                        }
                      >
                        <Flag className="h-3.5 w-3.5" /> Jalon
                      </button>
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs`}
                        onClick={() => openEdit(obj)}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs text-destructive`}
                        onClick={() => setDeleteId(obj.id)}
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={`${card} overflow-x-auto [-webkit-overflow-scrolling:touch]`}>
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">N°</th>
                    <th className="px-4 py-3">Titre</th>
                    <th className="px-4 py-3">Processus</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Cible</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3">Taux</th>
                    <th className="px-4 py-3">Actions</th>
                    <th className="px-4 py-3 text-right">Opérations</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((obj, index) => {
                    const rate = centralRate(obj);
                    const type = textOf(obj["type"]) as ObjectiveType;
                    return (
                      <Fragment key={String(obj.id)}>
                        <tr className="border-b border-border last:border-0 hover:bg-background">
                          <td className="px-4 py-3 font-bold">{index + 1}</td>
                          <td className="px-4 py-3 font-semibold">{textOf(obj["title"]) || "—"}</td>
                          <td className="px-4 py-3">
                            {centralProcessLabel(obj, processNameById) || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {TYPE_LABELS[type] ?? textOf(obj["type"]) ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {obj["target_value"] == null
                              ? "—"
                              : `${textOf(obj["target_value"])}${textOf(obj["unit"]) ? ` ${textOf(obj["unit"])}` : ""}`}
                          </td>
                          <td className="px-4 py-3">{formatDateFR(obj["deadline"])}</td>
                          <td className="px-4 py-3">{centralResponsibleLabel(obj) || "—"}</td>
                          <td
                            className="px-4 py-3 font-extrabold"
                            style={{ color: rateColor(rate) }}
                          >
                            {rate} %
                          </td>
                          <td className="px-4 py-3">{centralActionsCount(obj)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="rounded-lg p-2 hover:bg-background"
                                title="Progression"
                                onClick={() =>
                                  setProgressState({ id: obj.id, value: "", notes: "" })
                                }
                              >
                                <TrendingUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-2 hover:bg-background"
                                title="Jalon"
                                onClick={() =>
                                  setMilestoneState({
                                    id: obj.id,
                                    title: "",
                                    target_date: "",
                                    target_value: "",
                                  })
                                }
                              >
                                <Flag className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-2 hover:bg-background"
                                title="Modifier"
                                onClick={() => openEdit(obj)}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="rounded-lg p-2 text-destructive hover:bg-background"
                                title="Supprimer"
                                onClick={() => setDeleteId(obj.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {centralActionsCount(obj) > 0 && (
                          <tr className="border-b border-border last:border-0">
                            <td colSpan={10} className="px-4 pb-4">
                              <ObjectiveActionsBlock obj={obj} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "monthly" && (
        <div className="space-y-4">
          <div className={`${card} flex flex-wrap items-end gap-3 p-4`}>
            <div className="min-w-52 flex-1">
              <Label>Processus suivi</Label>
              <select
                className={input}
                value={monthlyProcessId}
                onChange={(e) => setMonthlyProcessId(e.target.value)}
              >
                <option value="">Sélectionnez un processus</option>
                {processOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className={`text-xs ${muted}`}>
              Les mois passés sont verrouillés. Les mois futurs sont optionnels.
            </p>
          </div>

          {!monthlyProcessId ? (
            <div className={`${card} p-8 text-center`}>
              <p className="font-display text-lg font-bold">Sélectionnez un processus</p>
              <p className={`mt-1 ${muted}`}>Le suivi mensuel s'affiche par processus.</p>
            </div>
          ) : !processObjectives ? (
            <PageSkeleton rows={2} />
          ) : processObjectives.items.length === 0 ? (
            <div className={`${card} p-8 text-center`}>
              <p className="font-display text-lg font-bold">Aucun objectif suivi</p>
              <p className={`mt-1 ${muted}`}>
                Ce processus ne suit aucun objectif mensuel pour le moment.
              </p>
            </div>
          ) : (
            processObjectives.items.map((objective) => (
              <MonthlyEditor
                key={String(objective.id)}
                objective={objective}
                processId={monthlyProcessId}
                siteId={siteId}
              />
            ))
          )}

          {summaryData && (
            <div className={`${card} space-y-4 p-5`}>
              <h2 className="font-display text-lg font-bold">Récapitulatif système</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  value={
                    summaryData.system_average_rate === null
                      ? "—"
                      : `${Math.round(summaryData.system_average_rate)} %`
                  }
                  label="Taux global"
                />
                <Stat value={summaryData.total_objectives} label="Objectifs suivis" />
                <Stat
                  value={summaryData.achieved_count}
                  label="Atteints (≥ 80 %)"
                  tone="text-emerald-600"
                />
                <Stat
                  value={summaryData.warning_count}
                  label="Vigilance (< 50 %)"
                  tone="text-red-600"
                />
              </div>
              {summaryData.by_process.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-extrabold">Par processus</h3>
                  <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Processus</th>
                          <th className="px-3 py-2">Objectifs</th>
                          <th className="px-3 py-2">Taux moyen</th>
                          <th className="px-3 py-2">Atteints</th>
                          <th className="px-3 py-2">Vigilance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.by_process.map((row, index) => (
                          <tr key={index} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-semibold">
                              {summaryCell(row, ["process_name", "process", "label"])}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["total_objectives", "total"])}
                            </td>
                            <td className="px-3 py-2 font-bold">
                              {summaryCell(row, ["average_rate", "rate"])}
                              {summaryCell(row, ["average_rate", "rate"]) === "—" ? "" : " %"}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["achieved_count", "achieved"])}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["warning_count", "warning"])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {summaryData.by_axis.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-extrabold">Par axe stratégique</h3>
                  <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Axe</th>
                          <th className="px-3 py-2">Objectifs</th>
                          <th className="px-3 py-2">Taux moyen</th>
                          <th className="px-3 py-2">Atteints</th>
                          <th className="px-3 py-2">Vigilance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.by_axis.map((row, index) => (
                          <tr key={index} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-semibold">
                              {summaryCell(row, ["axis", "label", "name"])}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["total_objectives", "total"])}
                            </td>
                            <td className="px-3 py-2 font-bold">
                              {summaryCell(row, ["average_rate", "rate"])}
                              {summaryCell(row, ["average_rate", "rate"]) === "—" ? "" : " %"}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["achieved_count", "achieved"])}
                            </td>
                            <td className="px-3 py-2">
                              {summaryCell(row, ["warning_count", "warning"])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CentralDialog
        open={dialogOpen}
        editing={editing}
        form={form}
        setForm={setForm}
        policyAxes={policyAxes}
        responsables={responsables.map((user) => ({ id: user.id, name: user.name }))}
        processOptions={processOptions}
        pending={mutations.create.isPending || mutations.update.isPending}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSubmit={submitDialog}
      />

      {progressState && (
        <SmallDialog
          title="Enregistrer la progression"
          description="Valeur actuelle mesurée pour cet objectif."
          onClose={() => setProgressState(null)}
          onSubmit={submitProgressDirect}
          submitLabel="Enregistrer"
          pending={mutations.progress.isPending}
        >
          {progressHasLinkedActions && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {
                "Le taux d'atteinte suit la moyenne des actions liées — faites avancer les actions ci-dessous pour faire bouger la barre."
              }
            </p>
          )}
          <div>
            <Label>Valeur actuelle *</Label>
            <input
              className={input}
              inputMode="decimal"
              value={progressState.value}
              placeholder="Ex : 45"
              onChange={(e) => setProgressState({ ...progressState, value: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              className={`${input} min-h-20`}
              value={progressState.notes}
              placeholder="Commentaire de suivi…"
              onChange={(e) => setProgressState({ ...progressState, notes: e.target.value })}
            />
          </div>
        </SmallDialog>
      )}

      {milestoneState && (
        <SmallDialog
          title="Ajouter un jalon"
          description="Étape intermédiaire datée pour cet objectif."
          onClose={() => setMilestoneState(null)}
          onSubmit={submitMilestone}
          submitLabel="Ajouter"
          pending={mutations.milestone.isPending}
        >
          <div>
            <Label>Titre *</Label>
            <input
              className={input}
              value={milestoneState.title}
              placeholder="Ex : Revue à mi-parcours"
              onChange={(e) => setMilestoneState({ ...milestoneState, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Date cible *</Label>
            <input
              type="date"
              className={input}
              value={milestoneState.target_date}
              onChange={(e) =>
                setMilestoneState({ ...milestoneState, target_date: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Valeur cible</Label>
            <input
              className={input}
              inputMode="decimal"
              value={milestoneState.target_value}
              placeholder="Optionnel"
              onChange={(e) =>
                setMilestoneState({ ...milestoneState, target_value: e.target.value })
              }
            />
          </div>
        </SmallDialog>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Supprimer cet objectif ?"
        description="Cette action est définitive. Les jalons et la progression associés seront perdus."
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
