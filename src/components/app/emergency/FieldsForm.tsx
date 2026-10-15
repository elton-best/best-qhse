import { useState } from "react";
import { Field } from "../overlay";
import { input, primary, secondary } from "../planning/shared";

export type FieldSpec = {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "number" | "select" | "checkbox" | "tel";
  options?: { value: string; label: string }[];
  required?: boolean;
  full?: boolean;
  hint?: string;
};

type Values = Record<string, string | boolean>;

/** Formulaire simple piloté par une liste de champs ; renvoie des valeurs textuelles prêtes à être converties. */
export function FieldsForm({
  fields, initial, submitLabel = "Enregistrer", busy, error, onSubmit, onCancel,
}: {
  fields: FieldSpec[]; initial: Values; submitLabel?: string; busy: boolean; error?: string | null;
  onSubmit: (values: Values) => void; onCancel: () => void;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (): void => {
    const missing = fields.find((f) => f.required && (values[f.key] === undefined || values[f.key] === "" || values[f.key] === false));
    if (missing) {
      setLocalError(`Le champ « ${missing.label} » est obligatoire.`);
      return;
    }
    setLocalError(null);
    onSubmit(values);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.full || f.type === "textarea" ? "sm:col-span-2" : undefined}>
            {f.type === "checkbox" ? (
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" checked={values[f.key] === true} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} /> {f.label}
              </label>
            ) : (
              <Field label={`${f.label}${f.required ? " *" : ""}`}>
                {f.type === "textarea" ? (
                  <textarea className={`${input} min-h-20`} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                ) : f.type === "select" ? (
                  <select className={input} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    inputMode={f.type === "tel" ? "tel" : undefined}
                    className={input}
                    value={String(values[f.key] ?? "")}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  />
                )}
                {f.hint && <span className="mt-1 block text-xs text-muted-foreground">{f.hint}</span>}
              </Field>
            )}
          </div>
        ))}
      </div>
      {(localError || error) && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{localError ?? error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onCancel}>Annuler</button>
        <button type="button" className={primary} disabled={busy} onClick={submit}>{busy ? "Enregistrement…" : submitLabel}</button>
      </div>
    </div>
  );
}

export const orNull = (value: string | boolean | undefined): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
export const orNumber = (value: string | boolean | undefined): number | null => (typeof value === "string" && value.trim() !== "" ? Number(value) : null);
