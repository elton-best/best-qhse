import type { FileText } from "lucide-react";

export const card = "rounded-2xl border border-border bg-card";
export const input =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
export const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-dark`;
export const secondary = `${button} border border-border bg-card hover:border-primary hover:text-primary`;
export const muted = "text-sm text-muted-foreground";

export function Header({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof FileText;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <div className="mt-1 shrink-0 rounded-2xl bg-primary-soft p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h1 className="mt-1 min-w-0 break-words font-display text-xl font-extrabold sm:text-2xl md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap lg:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}

export function SiteRequired() {
  return (
    <div className={`${card} mx-auto max-w-3xl p-8 text-center`}>
      <p className="mt-3 font-display text-lg font-bold">Sélectionnez un site</p>
      <p className={`mt-2 ${muted}`}>
        Les données Planification sont rattachées au site courant. Sélectionnez un site avant de
        consulter cette section.
      </p>
    </div>
  );
}

export function SiteNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      Aucun site sélectionné — affichage basé sur le site de votre compte. Choisissez un site dans
      l'en-tête pour filtrer.
    </div>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement" className="space-y-3">
      <div className={`${card} h-16 animate-pulse`} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${card} h-20 animate-pulse`} />
      ))}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

export function Stat({
  value,
  label,
  tone = "text-primary",
}: {
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className={`font-display text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function join(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join("\n") : String(value ?? "");
}

export function formatDateFR(value: unknown): string {
  if (value == null || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR");
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function statusBadge(status: unknown): string {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold";
  const value = String(status ?? "")
    .toLowerCase()
    .trim();
  if (
    ["validated", "validée", "atteint", "termine", "terminée", "realise", "réalisé"].includes(value)
  )
    return `${base} bg-emerald-100 text-emerald-700`;
  if (value.includes("cours") || value.includes("progress") || value === "en_revision")
    return `${base} bg-sky-100 text-sky-700`;
  if (["critique", "critical", "eleve", "élevé", "high"].includes(value))
    return `${base} bg-red-100 text-red-700`;
  if (["moyen", "medium"].includes(value)) return `${base} bg-amber-100 text-amber-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
