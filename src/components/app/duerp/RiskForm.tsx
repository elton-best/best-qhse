import { useState } from "react";
import {
  type ActionStatus, type Danger, type DangerInput, type RiskFamily, type Scales, type WorkUnit,
} from "@/integrations/backend/duerp";
import { Field } from "../overlay";
import { errorMessage, input, primary, secondary } from "../planning/shared";
import { ACTION_STATUS, LEVEL_TONE, PREVENTION_TYPES, previewScore } from "./duerp-config";

const num = (value: string): number | undefined => (value === "" ? undefined : Number(value));
const text = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/**
 * Fiche de risque du DUERP. Sur un document figé (soumis ou approuvé), seul le suivi des actions
 * et la cotation résiduelle sont modifiables : les autres champs sont verrouillés.
 */
export function RiskForm({
  danger, units, families, scales, locked, busy, onSubmit, onCancel,
}: {
  danger: Danger | null; units: WorkUnit[]; families: RiskFamily[]; scales: Scales; locked: boolean; busy: boolean;
  onSubmit: (input: DangerInput) => Promise<void>; onCancel: () => void;
}) {
  const [v, setV] = useState({
    unit: danger?.work_unit_id ? String(danger.work_unit_id) : "",
    family: danger?.risk_family_id ? String(danger.risk_family_id) : "",
    activity: danger?.activity ?? "",
    situation: danger?.dangerous_situation ?? "",
    risks: danger?.identified_risks ?? "",
    consequences: danger?.consequences ?? "",
    workers: danger?.exposed_workers_count ? String(danger.exposed_workers_count) : "",
    gravity: danger?.gravity ? String(danger.gravity) : "",
    frequency: danger?.frequency ? String(danger.frequency) : "",
    maitrise: danger?.mitigation_level ?? "",
    existing: danger?.existing_preventions ?? "",
    actions: danger?.prevention_actions ?? "",
    type: danger?.prevention_type ?? "",
    responsible: danger?.responsible_name ?? "",
    deadline: danger?.deadline?.slice(0, 10) ?? "",
    status: danger?.action_status ?? "",
    doneAt: danger?.action_done_at?.slice(0, 10) ?? "",
    rg: danger?.residual_gravity ? String(danger.residual_gravity) : "",
    rf: danger?.residual_frequency ? String(danger.residual_frequency) : "",
    rm: "",
    observations: danger?.observations ?? "",
    reviewed: false,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof v>): void => setV({ ...v, ...patch });
  const preview = previewScore(scales, { gravity: num(v.gravity), frequency: num(v.frequency), maitrise: num(v.maitrise) });
  const level = (rows: { level: number; label: string }[]) => rows.map((row) => <option key={row.level} value={row.level}>{row.level} — {row.label}</option>);

  const submit = async (): Promise<void> => {
    setError(null);
    const base: DangerInput = {
      action_status: (v.status || null) as ActionStatus | null,
      action_done_at: text(v.doneAt),
      residual_gravity: num(v.rg) ?? null,
      residual_frequency: num(v.rf) ?? null,
      residual_mitigation_level: num(v.rm) ?? null,
      observations: text(v.observations),
    };
    const payload: DangerInput = locked ? base : {
      ...base,
      work_unit_id: num(v.unit) ?? null,
      risk_family_id: num(v.family) ?? null,
      activity: text(v.activity),
      dangerous_situation: v.situation.trim(),
      identified_risks: v.risks.trim(),
      consequences: text(v.consequences),
      exposed_workers_count: num(v.workers) ?? null,
      gravity: num(v.gravity) ?? 0,
      frequency: num(v.frequency) ?? 0,
      mitigation_level: num(v.maitrise) ?? 0,
      existing_preventions: text(v.existing),
      prevention_actions: text(v.actions),
      prevention_type: text(v.type),
      responsible_name: text(v.responsible),
      deadline: text(v.deadline),
      ...(v.reviewed ? { confirm_reviewed: true } : {}),
    };
    try {
      await onSubmit(payload);
    } catch (e) {
      setError(errorMessage(e, "Enregistrement impossible."));
    }
  };

  const disabled = locked;
  return (
    <div className="space-y-5">
      {locked && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Document figé : seul le suivi de l'action et la cotation résiduelle sont modifiables. Créez une nouvelle version pour changer l'évaluation.</p>}
      {danger?.needs_review && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">À réévaluer : {danger.review_reason}. Vérifiez la cotation puis cochez « Réévaluation faite ».</p>}

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">1. Où et quoi</legend>
        <Field label="Unité de travail *">
          <select className={input} value={v.unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="">— Choisir —</option>
            {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.headcount ? ` (${unit.headcount} pers.)` : ""}</option>)}
          </select>
        </Field>
        <Field label="Famille de risques INRS *">
          <select className={input} value={v.family} onChange={(e) => set({ family: e.target.value })}>
            <option value="">— Choisir —</option>
            {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
          </select>
        </Field>
        <Field label="Activité / poste"><input className={input} value={v.activity} onChange={(e) => set({ activity: e.target.value })} /></Field>
        <Field label="Personnes exposées"><input type="number" min={1} className={input} value={v.workers} onChange={(e) => set({ workers: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Situation dangereuse (travail réel) *"><textarea className={`${input} min-h-16`} value={v.situation} onChange={(e) => set({ situation: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Risque encouru (ce qui peut arriver) *"><textarea className={`${input} min-h-16`} value={v.risks} onChange={(e) => set({ risks: e.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Dommages possibles"><textarea className={`${input} min-h-14`} value={v.consequences} onChange={(e) => set({ consequences: e.target.value })} /></Field></div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3" disabled={disabled}>
        <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">2. Cotation</legend>
        <Field label="Gravité *"><select className={input} value={v.gravity} onChange={(e) => set({ gravity: e.target.value })}><option value="">—</option>{level(scales.gravity)}</select></Field>
        <Field label="Fréquence d'exposition *"><select className={input} value={v.frequency} onChange={(e) => set({ frequency: e.target.value })}><option value="">—</option>{level(scales.frequency)}</select></Field>
        <Field label="Maîtrise des mesures existantes *"><select className={input} value={v.maitrise} onChange={(e) => set({ maitrise: e.target.value })}><option value="">—</option>{level(scales.maitrise)}</select></Field>
        <div className="sm:col-span-3"><Field label="Mesures de prévention déjà en place"><textarea className={`${input} min-h-14`} value={v.existing} onChange={(e) => set({ existing: e.target.value })} /></Field></div>
        {preview && (
          <p className="text-sm sm:col-span-3" aria-live="polite">
            Risque brut <strong>{preview.raw}</strong> <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[preview.rawLevel]}`}>{preview.rawLevel}</span>
            {" · "}Risque évalué <strong>{preview.assessed}</strong> <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[preview.assessedLevel]}`}>{preview.assessedLevel}</span>
          </p>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">3. Plan d'actions de prévention</legend>
        <div className="sm:col-span-2"><Field label="Action à mener"><textarea className={`${input} min-h-16`} value={v.actions} onChange={(e) => set({ actions: e.target.value })} /></Field></div>
        <Field label="Nature de la mesure">
          <select className={input} value={v.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">—</option>
            {PREVENTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Responsable"><input className={input} value={v.responsible} onChange={(e) => set({ responsible: e.target.value })} /></Field>
        <Field label="Échéance"><input type="date" className={input} value={v.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">4. Suivi et risque résiduel</legend>
        <Field label="Avancement de l'action">
          <select className={input} value={v.status} onChange={(e) => set({ status: e.target.value as typeof v.status })}>
            <option value="">—</option>
            {Object.entries(ACTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Date de réalisation"><input type="date" className={input} value={v.doneAt} onChange={(e) => set({ doneAt: e.target.value })} /></Field>
        <Field label="Gravité résiduelle"><select className={input} value={v.rg} onChange={(e) => set({ rg: e.target.value })}><option value="">—</option>{level(scales.gravity)}</select></Field>
        <Field label="Fréquence résiduelle"><select className={input} value={v.rf} onChange={(e) => set({ rf: e.target.value })}><option value="">—</option>{level(scales.frequency)}</select></Field>
        <Field label="Maîtrise après action"><select className={input} value={v.rm} onChange={(e) => set({ rm: e.target.value })}><option value="">—</option>{level(scales.maitrise)}</select></Field>
        <div className="sm:col-span-2"><Field label="Observations"><textarea className={`${input} min-h-14`} value={v.observations} onChange={(e) => set({ observations: e.target.value })} /></Field></div>
        {danger?.needs_review && !locked && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.reviewed} onChange={(e) => set({ reviewed: e.target.checked })} /> Réévaluation faite</label>
        )}
      </fieldset>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onCancel}>Annuler</button>
        <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}
