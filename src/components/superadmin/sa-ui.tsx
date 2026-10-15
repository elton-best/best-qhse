import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PageMeta } from "@/integrations/backend/superadmin";
export { Drawer, Field } from "../app/overlay";

export const panel = "rounded-2xl border border-border bg-card";
export const field =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const btn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary-dark`;
export const btnGhost = `${btn} border border-border bg-card hover:border-primary hover:text-primary`;
export const btnDanger = `${btn} bg-destructive text-white hover:opacity-90`;
export const muted = "text-sm text-muted-foreground";

export function SaHeader({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-1 rounded-2xl bg-primary-soft p-3 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h1>
          <p className={`mt-1 max-w-2xl ${muted}`}>{description}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-sky-100 text-sky-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${TONES[tone]}`}>{children}</span>;
}

export function StatCard({ label, value, tone = "text-primary", hint }: { label: string; value: ReactNode; tone?: string; hint?: string }) {
  return (
    <div className={`${panel} p-4`}>
      <p className={`font-display text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pager({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || (meta.last_page ?? Math.ceil(meta.total / meta.per_page)) <= 1) return null;
  const last = meta.last_page ?? Math.ceil(meta.total / meta.per_page);
  return (
    <div className="flex items-center justify-between pt-3 text-sm">
      <span className={muted}>
        Page {meta.current_page} sur {last} · {meta.total} résultat(s)
      </span>
      <div className="flex gap-2">
        <button type="button" className={btnGhost} disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)} aria-label="Page précédente">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className={btnGhost} disabled={meta.current_page >= last} onClick={() => onPage(meta.current_page + 1)} aria-label="Page suivante">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ErrorNote({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      {error instanceof Error ? error.message : fallback}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={`py-10 text-center ${muted}`}>{children}</p>;
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement" className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={`${panel} h-14 animate-pulse`} />
      ))}
    </div>
  );
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime ? date.toLocaleString("fr-FR") : date.toLocaleDateString("fr-FR");
}
