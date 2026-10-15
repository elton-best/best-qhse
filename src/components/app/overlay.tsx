import type { ReactNode } from "react";

/** Briques d'interface partagées : tiroir latéral, fenêtre modale et champ étiqueté. */

export function Drawer({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string | undefined; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex h-full w-full flex-col overflow-y-auto bg-background shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            {subtitle && <p className="text-xs font-bold uppercase tracking-wide text-primary">{subtitle}</p>}
            <h2 className="font-display text-xl font-bold">{title}</h2>
          </div>
          <button type="button" className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="flex-1 space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}


export function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[85] grid place-items-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="my-8 w-full max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button type="button" className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
