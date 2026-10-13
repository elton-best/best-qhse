import { X } from "lucide-react";

const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-foreground/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="site-confirm-title" className="font-display text-lg font-bold text-foreground">
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
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className={`${button} border border-border bg-card hover:border-primary`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${button} ${destructive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground hover:bg-primary-dark"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
