import { useEffect, useState } from "react";
import { X } from "lucide-react";

const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const field =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  required = false,
  minLength = 0,
  multiline = false,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  busy = false,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  minLength?: number;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  const trimmed = value.trim();
  const error =
    required && !trimmed
      ? "Ce champ est requis."
      : minLength > 0 && trimmed.length > 0 && trimmed.length < minLength
        ? `Saisissez au moins ${minLength} caractères.`
        : minLength > 0 && trimmed.length === 0
          ? `Saisissez au moins ${minLength} caractères.`
          : null;
  const canSubmit = !busy && !error && (!required || trimmed.length > 0);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-foreground/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-prompt-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="site-prompt-title" className="font-display text-lg font-bold text-foreground">
              {title}
            </h2>
            {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl p-2 text-muted-foreground hover:bg-background"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">
          {label && (
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {label}
            </label>
          )}
          {multiline ? (
            <textarea
              className={`${field} min-h-24`}
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              className={field}
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) onSubmit(trimmed);
              }}
              autoFocus
            />
          )}
          {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className={`${button} border border-border bg-card hover:border-primary`}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${button} bg-primary text-primary-foreground hover:bg-primary-dark`}
            disabled={!canSubmit}
            onClick={() => onSubmit(trimmed)}
          >
            {busy ? "Traitement…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
