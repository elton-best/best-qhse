import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { Aes, AesInput, AesSettings } from "@/integrations/backend/aes";
import { useProcesses } from "@/integrations/backend/context";
import { useRelationOptions } from "@/integrations/backend/energy";
import { Label, card, input, muted, primary, secondary } from "../planning/shared";
import {
  ASPECT_TYPES,
  CONTROL_LEVELS,
  FREQUENCY_LEVELS,
  GRAVITY_LEVELS,
  IMPACT_KINDS,
  IMPACT_NATURES,
  IMPACT_SCALES,
  LIFECYCLE_PHASES,
  MASTERY_LEVELS,
  SENSITIVITY_LEVELS,
  SENSITIVITY_MEDIA,
  SITUATIONS,
  previewSignificance,
  suggestSensitivity,
  type Choice,
  type ScaleLevel,
} from "./aes-config";

type FormState = {
  activity: string;
  aspect: string;
  impact: string;
  process_id: string;
  sub_process: string;
  group_label: string;
  aspect_number: string;
  aspect_type: string;
  lifecycle_phase: string;
  situation: string;
  control_level: string;
  impact_nature: string;
  impact_scale: string;
  impact_kind: string;
  risk: string;
  existing_controls: string;
  gravity: string;
  frequency: string;
  sensitivity: string;
  mastery: string;
  legal_criterion: boolean;
  stakeholder_criterion: boolean;
  is_emergency_potential: boolean;
  additional_actions: string;
  responsible_id: string;
  deadline: string;
  effectiveness_criterion: string;
  efficiency_criterion: string;
  observations: string;
};

function initialState(aspect: Aes | null): FormState {
  const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
  return {
    activity: text(aspect?.activity),
    aspect: text(aspect?.aspect),
    impact: text(aspect?.impact),
    process_id: text(aspect?.process_id),
    sub_process: text(aspect?.sub_process),
    group_label: text(aspect?.group_label),
    aspect_number: text(aspect?.aspect_number),
    aspect_type: text(aspect?.aspect_type),
    lifecycle_phase: text(aspect?.lifecycle_phase),
    situation: aspect?.situation ?? "normal",
    control_level: aspect?.control_level ?? "controlled",
    impact_nature: aspect?.impact_nature ?? "negative",
    impact_scale: text(aspect?.impact_scale),
    impact_kind: text(aspect?.impact_kind),
    risk: text(aspect?.risk),
    existing_controls: text(aspect?.existing_controls),
    gravity: text(aspect?.criticality_score === null ? "" : aspect?.gravity),
    frequency: text(aspect?.criticality_score === null ? "" : aspect?.frequency),
    sensitivity: text(aspect?.criticality_score === null ? "" : aspect?.sensitivity),
    mastery: text(aspect?.criticality_score === null ? "" : aspect?.mastery),
    legal_criterion: aspect?.legal_criterion ?? false,
    stakeholder_criterion: aspect?.stakeholder_criterion ?? false,
    is_emergency_potential: aspect?.is_emergency_potential ?? false,
    additional_actions: text(aspect?.additional_actions),
    responsible_id: text(aspect?.responsible_id),
    deadline: text(aspect?.deadline).slice(0, 10),
    effectiveness_criterion: text(aspect?.effectiveness_criterion),
    efficiency_criterion: text(aspect?.efficiency_criterion),
    observations: text(aspect?.observations),
  };
}

function ChoiceSelect({
  value,
  onChange,
  choices,
  placeholder = "—",
}: {
  value: string;
  onChange: (value: string) => void;
  choices: Choice[];
  placeholder?: string;
}) {
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

function ScoreSelect({
  label,
  letter,
  value,
  onChange,
  levels,
  max,
}: {
  label: string;
  letter: string;
  value: string;
  onChange: (value: string) => void;
  levels: ScaleLevel[];
  max: number;
}) {
  const available = levels.filter((level) => level.value <= max);
  const current = available.find((level) => String(level.value) === value);
  return (
    <div>
      <Label>
        {label} ({letter}) *
      </Label>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">—</option>
        {value && !current && <option value={value}>Niveau {value}</option>}
        {available.map((level) => (
          <option key={level.value} value={level.value}>
            {level.value} — {level.label}
          </option>
        ))}
      </select>
      <p className="mt-1 min-h-8 text-xs text-muted-foreground">{current?.hint ?? ""}</p>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      {hint && <p className={`mt-0.5 ${muted}`}>{hint}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function AesForm({
  aspect,
  siteId,
  settings,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  aspect: Aes | null;
  siteId: string;
  settings: AesSettings;
  busy: boolean;
  error: string | null;
  onSubmit: (input: AesInput) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(aspect));
  const [media, setMedia] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const { data: processes = [] } = useProcesses(siteId);
  const users = useRelationOptions("users", siteId, true).data ?? [];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const processOptions = useMemo(
    () =>
      (processes as Record<string, unknown>[])
        .map((item) => ({ id: String(item["id"] ?? ""), name: String(item["title"] ?? item["name"] ?? item["code"] ?? "") }))
        .filter((option) => option.id !== ""),
    [processes],
  );

  const scored = form.gravity && form.frequency && form.sensitivity && form.mastery;
  const preview = scored
    ? previewSignificance(
        { gravity: +form.gravity, frequency: +form.frequency, sensitivity: +form.sensitivity, mastery: +form.mastery },
        { legal: form.legal_criterion, stakeholder: form.stakeholder_criterion },
        settings,
      )
    : null;
  const sensitiveCount = Object.values(media).filter(Boolean).length;

  const submit = (): void => {
    if (!form.activity.trim() || !form.aspect.trim() || !form.impact.trim()) {
      setLocalError("L'activité, l'aspect et l'impact sont obligatoires.");
      return;
    }
    const filledScores = [form.gravity, form.frequency, form.sensitivity, form.mastery].filter(Boolean).length;
    if (filledScores > 0 && filledScores < 4) {
      setLocalError("Renseignez les quatre critères de cotation (G, F, S, M) ou aucun.");
      return;
    }
    setLocalError(null);

    const text = (value: string): string | null => (value.trim() === "" ? null : value.trim());
    const number = (value: string): number | null => (value === "" ? null : Number(value));
    onSubmit({
      site_id: siteId,
      activity: form.activity.trim(),
      aspect: form.aspect.trim(),
      impact: form.impact.trim(),
      process_id: number(form.process_id),
      sub_process: text(form.sub_process),
      group_label: text(form.group_label),
      ...(form.aspect_number.trim() ? { aspect_number: form.aspect_number.trim() } : {}),
      aspect_type: text(form.aspect_type),
      lifecycle_phase: text(form.lifecycle_phase),
      situation: form.situation as AesInput["situation"],
      control_level: form.control_level as AesInput["control_level"],
      impact_nature: form.impact_nature as AesInput["impact_nature"],
      impact_scale: text(form.impact_scale) as AesInput["impact_scale"],
      impact_kind: text(form.impact_kind) as AesInput["impact_kind"],
      risk: text(form.risk),
      existing_controls: text(form.existing_controls),
      gravity: number(form.gravity),
      frequency: number(form.frequency),
      sensitivity: number(form.sensitivity),
      mastery: number(form.mastery),
      legal_criterion: form.legal_criterion,
      stakeholder_criterion: form.stakeholder_criterion,
      is_emergency_potential: form.is_emergency_potential,
      additional_actions: text(form.additional_actions),
      responsible_id: number(form.responsible_id),
      deadline: text(form.deadline),
      effectiveness_criterion: text(form.effectiveness_criterion),
      efficiency_criterion: text(form.efficiency_criterion),
      observations: text(form.observations),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={aspect ? "Modifier l'aspect" : "Nouvel aspect"}
    >
      <div className="flex h-full w-full max-w-3xl flex-col bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">ISO 14001 — §6.1.2</p>
            <h2 className="font-display text-xl font-bold">{aspect ? "Modifier l'aspect" : "Nouvel aspect environnemental"}</h2>
          </div>
          <button type="button" className="rounded-xl p-2 text-muted-foreground hover:bg-secondary" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Section title="1. Identification" hint="Que fait l'organisme, et quel aspect en découle ?">
            <div className="sm:col-span-2">
              <Label>Activité, produit ou service *</Label>
              <input className={input} value={form.activity} onChange={(e) => set("activity", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Aspect environnemental *</Label>
              <input
                className={input}
                placeholder="Ex. : consommation d'électricité, émission de poussières"
                value={form.aspect}
                onChange={(e) => set("aspect", e.target.value)}
              />
            </div>
            <div>
              <Label>Type d'aspect</Label>
              <ChoiceSelect value={form.aspect_type} onChange={(v) => set("aspect_type", v)} choices={ASPECT_TYPES} />
            </div>
            <div>
              <Label>Phase du cycle de vie</Label>
              <ChoiceSelect value={form.lifecycle_phase} onChange={(v) => set("lifecycle_phase", v)} choices={LIFECYCLE_PHASES} />
            </div>
            <div>
              <Label>Processus</Label>
              <select className={input} value={form.process_id} onChange={(e) => set("process_id", e.target.value)}>
                <option value="">—</option>
                {processOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Sous-processus / zone</Label>
              <input className={input} value={form.sub_process} onChange={(e) => set("sub_process", e.target.value)} />
            </div>
            <div>
              <Label>Situation</Label>
              <ChoiceSelect value={form.situation} onChange={(v) => set("situation", v)} choices={SITUATIONS} />
            </div>
            <div>
              <Label>Maîtrisé ou influencé</Label>
              <ChoiceSelect value={form.control_level} onChange={(v) => set("control_level", v)} choices={CONTROL_LEVELS} />
            </div>
            <div>
              <Label>Regroupement (activités similaires)</Label>
              <input
                className={input}
                placeholder="Ex. : bureaux, ateliers"
                value={form.group_label}
                onChange={(e) => set("group_label", e.target.value)}
              />
            </div>
            <div>
              <Label>N° (généré si vide)</Label>
              <input className={input} value={form.aspect_number} onChange={(e) => set("aspect_number", e.target.value)} />
            </div>
          </Section>

          <Section title="2. Impact et risque associé">
            <div className="sm:col-span-2">
              <Label>Impact environnemental *</Label>
              <input className={input} value={form.impact} onChange={(e) => set("impact", e.target.value)} />
            </div>
            <div>
              <Label>Nature</Label>
              <ChoiceSelect value={form.impact_nature} onChange={(v) => set("impact_nature", v)} choices={IMPACT_NATURES} />
            </div>
            <div>
              <Label>Échelle</Label>
              <ChoiceSelect value={form.impact_scale} onChange={(v) => set("impact_scale", v)} choices={IMPACT_SCALES} />
            </div>
            <div>
              <Label>Type d'effet</Label>
              <ChoiceSelect value={form.impact_kind} onChange={(v) => set("impact_kind", v)} choices={IMPACT_KINDS} />
            </div>
            <div className="sm:col-span-2">
              <Label>Risque associé</Label>
              <textarea className={`${input} min-h-16`} value={form.risk} onChange={(e) => set("risk", e.target.value)} />
            </div>
          </Section>

          <Section
            title="3. Cotation et significativité"
            hint={`Cr = G × F × S × M. L'aspect est significatif si Cr > ${settings.significance_threshold}. Le serveur recalcule à l'enregistrement.`}
          >
            <ScoreSelect label="Gravité" letter="G" value={form.gravity} onChange={(v) => set("gravity", v)} levels={GRAVITY_LEVELS} max={settings.max_gravity} />
            <ScoreSelect label="Fréquence / probabilité" letter="F" value={form.frequency} onChange={(v) => set("frequency", v)} levels={FREQUENCY_LEVELS} max={settings.max_frequency} />
            <ScoreSelect label="Sensibilité du milieu" letter="S" value={form.sensitivity} onChange={(v) => set("sensitivity", v)} levels={SENSITIVITY_LEVELS} max={settings.max_sensitivity} />
            <ScoreSelect label="Maîtrise" letter="M" value={form.mastery} onChange={(v) => set("mastery", v)} levels={MASTERY_LEVELS} max={settings.max_mastery} />

            <div className="rounded-xl bg-secondary/50 p-3 sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Aide : sensibilité du milieu</p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SENSITIVITY_MEDIA.map((medium) => (
                  <label key={medium.key} className="flex items-start gap-2 text-sm" title={medium.examples}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={media[medium.key] ?? false}
                      onChange={(e) => setMedia((current) => ({ ...current, [medium.key]: e.target.checked }))}
                    />
                    <span>
                      <span className="font-semibold">{medium.label}</span>
                      <span className="block text-xs text-muted-foreground">{medium.examples}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-sm">{sensitiveCount} milieu(x) sensible(s) coché(s)</span>
                {sensitiveCount > 0 && (
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => set("sensitivity", String(Math.min(suggestSensitivity(sensitiveCount), settings.max_sensitivity)))}
                  >
                    Appliquer S = {Math.min(suggestSensitivity(sensitiveCount), settings.max_sensitivity)}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Critères additionnels (ne peuvent que relever un aspect)</p>
              <label className={`flex items-center gap-2 text-sm ${settings.use_legal_criterion ? "" : "opacity-50"}`}>
                <input
                  type="checkbox"
                  disabled={!settings.use_legal_criterion}
                  checked={form.legal_criterion}
                  onChange={(e) => set("legal_criterion", e.target.checked)}
                />
                Exigence légale ou autre exigence applicable
              </label>
              <label className={`flex items-center gap-2 text-sm ${settings.use_stakeholder_criterion ? "" : "opacity-50"}`}>
                <input
                  type="checkbox"
                  disabled={!settings.use_stakeholder_criterion}
                  checked={form.stakeholder_criterion}
                  onChange={(e) => set("stakeholder_criterion", e.target.checked)}
                />
                Préoccupation d'une partie intéressée
              </label>
            </div>

            <div
              className={`rounded-xl border p-3 sm:col-span-2 ${
                preview?.significant ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
              aria-live="polite"
            >
              {preview ? (
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {preview.significant ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  Cr = {preview.criticality} —{" "}
                  {preview.significant
                    ? preview.basis === "environmental"
                      ? "aspect significatif (impact environnemental)"
                      : "aspect significatif (critère additionnel)"
                    : "aspect non significatif"}
                </p>
              ) : (
                <p className="text-sm">Renseignez G, F, S et M pour obtenir la significativité.</p>
              )}
            </div>
          </Section>

          <Section title="4. Maîtrise, actions et suivi">
            <div className="sm:col-span-2">
              <Label>Mesures de maîtrise existantes</Label>
              <textarea className={`${input} min-h-16`} value={form.existing_controls} onChange={(e) => set("existing_controls", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Actions complémentaires de maîtrise ou de prévention</Label>
              <textarea className={`${input} min-h-16`} value={form.additional_actions} onChange={(e) => set("additional_actions", e.target.value)} />
            </div>
            <div>
              <Label>Responsable</Label>
              <select className={input} value={form.responsible_id} onChange={(e) => set("responsible_id", e.target.value)}>
                <option value="">—</option>
                {users.map((user) => (
                  <option key={user.value} value={user.value}>
                    {user.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Délai</Label>
              <input type="date" className={input} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </div>
            <div>
              <Label>Critère d'effectivité</Label>
              <input className={input} value={form.effectiveness_criterion} onChange={(e) => set("effectiveness_criterion", e.target.value)} />
            </div>
            <div>
              <Label>Critère d'efficacité</Label>
              <input className={input} value={form.efficiency_criterion} onChange={(e) => set("efficiency_criterion", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Observations</Label>
              <textarea className={`${input} min-h-16`} value={form.observations} onChange={(e) => set("observations", e.target.value)} />
            </div>
            <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.is_emergency_potential}
                onChange={(e) => set("is_emergency_potential", e.target.checked)}
              />
              <span>
                <span className="font-semibold">Situation d'urgence potentielle</span>
                <span className="block text-xs">
                  Une fiche « situation d'urgence » est créée automatiquement dans la préparation et réponse aux urgences.
                  {aspect?.emergency_procedure && ` Fiche liée : ${aspect.emergency_procedure.title}.`}
                </span>
              </span>
            </label>
          </Section>

          {(localError || error) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {localError ?? error}
            </div>
          )}
        </div>

        <div className={`${card} flex justify-end gap-2 rounded-none border-x-0 border-b-0 p-4`}>
          <button type="button" className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button type="button" className={primary} disabled={busy} onClick={submit}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
