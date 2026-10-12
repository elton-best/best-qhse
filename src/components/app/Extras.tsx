import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Columns3, Download, Eye, Inbox, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { backendApi } from "@/integrations/backend/client";
import { downloadCsv } from "@/hooks/use-workspace";
import {
  isMyActionOverdue, myActionPriorityLabel, myActionStatusLabel, myActionTypeLabel,
  useActionProgress, useMyActions,
} from "@/integrations/backend/planning";
const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR");

function Title({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link to="/app" className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Vue d'ensemble</Link>
        <h1 className="mt-1 font-display text-2xl font-extrabold text-foreground md:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ---------- RT-01 : prévisualisation avant export ----------
export function ExportPreview({ open, onClose, filename, rows }: { open: boolean; onClose: () => void; filename: string; rows: string[][] }) {
  if (!open) return null;
  const [head, ...body] = rows;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <p className="font-display text-lg font-bold text-foreground">Aperçu de l'export</p>
            <p className="text-xs text-muted-foreground">{filename} · {body.length} ligne(s) · {head?.length ?? 0} colonne(s) · {new Date().toLocaleString("fr-FR")}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto p-4">
          <table className="w-full text-xs">
            <thead><tr>{head?.map((h, i) => <th key={i} className="border-b border-border px-2 py-2 text-left font-bold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>{body.slice(0, 50).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-border px-2 py-1.5">{c}</td>)}</tr>)}</tbody>
          </table>
          {body.length > 50 && <p className="mt-2 text-xs text-muted-foreground">… {body.length - 50} ligne(s) supplémentaire(s) dans le fichier.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold">Annuler</button>
          <button onClick={() => { downloadCsv(filename, rows); toast.success("Export téléchargé"); onClose(); }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <Download className="h-4 w-4" /> Confirmer le téléchargement
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- RT-04 : sélecteur de colonnes ----------
export function useColumns(storageKey: string, all: string[]) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try { setHidden(JSON.parse(localStorage.getItem(`cols:${storageKey}`) ?? "[]")); } catch { setHidden([]); }
  }, [storageKey]);
  const save = (h: string[]) => { setHidden(h); localStorage.setItem(`cols:${storageKey}`, JSON.stringify(h)); };
  const visible = all.filter((c) => !hidden.includes(c));
  const toggle = (c: string) => {
    if (hidden.includes(c)) save(hidden.filter((x) => x !== c));
    else if (visible.length <= 1) toast.error("Au moins une colonne doit rester visible.");
    else save([...hidden, c]);
  };
  return { isVisible: (c: string) => !hidden.includes(c), toggle, reset: () => save([]), visibleCount: visible.length };
}

export function ColumnPicker({ cols, labels, state }: { cols: string[]; labels: Record<string, string>; state: ReturnType<typeof useColumns> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:border-primary">
        <Columns3 className="h-4 w-4" /> Colonnes ({state.visibleCount}/{cols.length})
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
          {cols.map((c) => (
            <label key={c} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={state.isVisible(c)} onChange={() => state.toggle(c)} /> {labels[c] ?? c}
            </label>
          ))}
          <button onClick={state.reset} className="mt-2 w-full rounded-lg bg-primary-soft py-1.5 text-xs font-bold text-primary">Tout afficher</button>
        </div>
      )}
    </div>
  );
}

// ---------- RT-13 : Mes actions (backend Laravel GET actions/my-actions, parité Vue) ----------
type MyActionFilter = "" | "assigned" | "in_progress" | "overdue" | "completed";

const MY_ACTION_CLOSED = ["completed", "verified", "closed"];

export function MyActionsPage() {
  const { data: summary, isLoading, isError } = useMyActions({ per_page: 100 });
  const progressMutation = useActionProgress();
  const [status, setStatus] = useState<MyActionFilter>("");
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [progressTarget, setProgressTarget] = useState<{ id: string | number; title: string; reference: string; progress: number } | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const [progressNote, setProgressNote] = useState("");

  const columns = ["reference", "title", "type", "priority", "due_date", "status", "progress", "actions"];
  const columnLabels: Record<string, string> = {
    reference: "Référence",
    title: "Titre de l'action",
    type: "Type",
    priority: "Priorité",
    due_date: "Échéance",
    status: "Statut",
    progress: "Progression",
    actions: "Actions",
  };
  const columnState = useColumns("my-actions", columns);
  const stats = summary?.stats;
  const actions = summary?.actions ?? [];

  const overdueOf = (action: { due_date?: string | null | undefined; deadline?: string | null | undefined; status: string }) =>
    isMyActionOverdue(action.due_date ?? action.deadline ?? null, action.status);
  const isAssigned = (action: { status: string }) => ["planned", "draft", "assigned"].includes(action.status);

  const filtered = useMemo(() => {
    return [...actions]
      .filter((action) => {
        const overdue = overdueOf(action);
        const matchesStatus =
          !status ||
          (status === "assigned" ? isAssigned(action) :
            status === "in_progress" ? action.status === "in_progress" && !overdue :
            status === "overdue" ? overdue :
            MY_ACTION_CLOSED.includes(action.status));
        const haystack = [action.reference, action.title, action.description, action.process?.title, action.process?.code, action.site?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return matchesStatus && (!query || haystack.includes(query.toLowerCase()));
      })
      .sort((a, b) => {
        const da = a.due_date ?? a.deadline;
        const db = b.due_date ?? b.deadline;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
      });
  }, [actions, query, status, sortAsc]);

  const assignedCount = actions.filter((a) => isAssigned(a)).length;
  const cards = [
    { key: "", label: "Total de mes actions", value: stats?.total_assigned ?? actions.length, tone: "text-primary" },
    { key: "assigned", label: "À faire", value: assignedCount, tone: "text-info" },
    { key: "in_progress", label: "En cours", value: stats?.in_progress_count ?? 0, tone: "text-warning" },
    { key: "overdue", label: "En retard", value: stats?.overdue_count ?? 0, tone: "text-destructive" },
    { key: "completed", label: "Réalisées", value: stats?.completed_count ?? 0, tone: "text-success" },
  ] as const;

  const openProgress = (action: { id: string | number; title: string; reference: string; progress: number }) => {
    setProgressTarget(action);
    setProgressValue(Number(action.progress || 0));
    setProgressNote("");
  };

  const submitProgress = async () => {
    if (!progressTarget) return;
    try {
      await progressMutation.mutateAsync({
        id: progressTarget.id,
        progress: Number(progressValue || 0),
        notes: progressNote.trim() || undefined,
      });
      toast.success("Progression mise à jour");
      setProgressTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible.");
    }
  };

  const openExportPreview = () => {
    setPreviewRows([
      ["Référence", "Action", "Type", "Priorité", "Processus", "Site", "Échéance", "Statut", "Progression (%)"],
      ...filtered.map((action) => [
        action.reference,
        action.title,
        myActionTypeLabel(action.type),
        myActionPriorityLabel(action.priority),
        action.process?.title ?? action.process?.code ?? "—",
        action.site?.name ?? "—",
        action.due_date ?? action.deadline ?? "—",
        myActionStatusLabel(action.status, overdueOf(action)),
        String(Number(action.progress || 0)),
      ]),
    ]);
    setPreviewOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Title title="Mes actions" desc="Toutes les actions dont vous êtes responsable, tous modules confondus, depuis le backend Laravel.">
        <div className="flex flex-wrap gap-2">
          <button onClick={openExportPreview} disabled={filtered.length === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:border-primary disabled:opacity-50">
            <Download className="h-4 w-4" /> Exporter
          </button>
          <Link to="/app/$section" params={{ section: "actions" }} search={{ new: 1 }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Nouvelle action</Link>
        </div>
      </Title>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <button key={card.key} onClick={() => setStatus(card.key)} className={`rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 ${status === card.key ? "border-primary shadow-md" : "border-border"}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{card.label}</span><span className={`text-2xl font-extrabold ${card.tone}`}>{card.value}</span></div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par titre, référence…" className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none focus:border-primary" />
        </div>
        <ColumnPicker cols={columns} labels={columnLabels} state={columnState} />
      </div>
      <ExportPreview open={previewOpen} onClose={() => setPreviewOpen(false)} filename="mes-actions.csv" rows={previewRows} />

      {isError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Impossible de charger vos actions depuis le backend Laravel.</p>}
      {isLoading ? <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground" aria-busy="true">Chargement de vos actions…</div> : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-display font-bold text-foreground">Aucune action correspondante</p>
          <p className="mt-1 text-sm text-muted-foreground">Les actions attribuées à votre compte et leurs échéances apparaîtront ici.</p>
          {(query || status) && <button onClick={() => { setQuery(""); setStatus(""); }} className="mt-3 h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary">Réinitialiser les filtres</button>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border bg-background text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  {columnState.isVisible("reference") && <th className="px-4 py-3">Référence</th>}
                  {columnState.isVisible("title") && <th className="px-4 py-3">Titre de l'action</th>}
                  {columnState.isVisible("type") && <th className="px-4 py-3">Type</th>}
                  {columnState.isVisible("priority") && <th className="px-4 py-3">Priorité</th>}
                  {columnState.isVisible("due_date") && <th className="cursor-pointer px-4 py-3" onClick={() => setSortAsc(!sortAsc)}>Échéance {sortAsc ? "↑" : "↓"}</th>}
                  {columnState.isVisible("status") && <th className="px-4 py-3">Statut</th>}
                  {columnState.isVisible("progress") && <th className="px-4 py-3">Progression</th>}
                  {columnState.isVisible("actions") && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((action) => {
                  const overdue = overdueOf(action);
                  const due = action.due_date ?? action.deadline;
                  return <tr key={String(action.id)} className={`hover:bg-primary-soft/40 ${overdue ? "bg-destructive/[0.04]" : ""}`}>
                    {columnState.isVisible("reference") && <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{action.reference}</td>}
                    {columnState.isVisible("title") && <td className="max-w-[260px] px-4 py-3"><p className="font-semibold text-foreground">{action.title}</p>{action.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{action.description}</p>}</td>}
                    {columnState.isVisible("type") && <td className="px-4 py-3 text-muted-foreground">{myActionTypeLabel(action.type)}</td>}
                    {columnState.isVisible("priority") && <td className="px-4 py-3 text-muted-foreground">{myActionPriorityLabel(action.priority)}</td>}
                    {columnState.isVisible("due_date") && <td className={`px-4 py-3 ${overdue ? "font-bold text-destructive" : "text-muted-foreground"}`}>{due ? fmt(due) : "—"}</td>}
                    {columnState.isVisible("status") && <td className="px-4 py-3"><button onClick={() => setStatus(overdue ? "overdue" : (action.status as MyActionFilter))} title="Filtrer sur ce statut" className={`rounded-full px-2.5 py-1 text-xs font-bold ${overdue ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary"}`}>{myActionStatusLabel(action.status, overdue)}</button></td>}
                    {columnState.isVisible("progress") && <td className="min-w-[130px] px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-secondary"><div className={`h-2 rounded-full ${Number(action.progress || 0) >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${Number(action.progress || 0)}%` }} /></div><span className="text-xs font-bold">{Number(action.progress || 0)}%</span></div></td>}
                    {columnState.isVisible("actions") && <td className="px-4 py-3 text-right"><button onClick={() => openProgress({ id: action.id, title: action.title, reference: action.reference, progress: Number(action.progress || 0) })} title="Mettre à jour la progression" className="h-8 rounded-xl border border-border px-3 text-xs font-semibold hover:border-primary">Progression</button></td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-border md:hidden">
            {filtered.map((action) => {
              const overdue = overdueOf(action);
              const due = action.due_date ?? action.deadline;
              return <li key={String(action.id)} className="p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">{action.reference}</p><p className="mt-1 font-semibold text-foreground">{action.title}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${overdue ? "bg-destructive/10 text-destructive" : "bg-primary-soft text-primary"}`}>{myActionStatusLabel(action.status, overdue)}</span></div>
                <p className="mt-2 text-xs text-muted-foreground">{action.process?.title ?? "Sans processus"} · {action.site?.name ?? "Tous sites"} · {due ? fmt(due) : "Sans échéance"} · {Number(action.progress || 0)}%</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => openProgress({ id: action.id, title: action.title, reference: action.reference, progress: Number(action.progress || 0) })} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold">Progression</button>
                  <Link to="/app/$section" params={{ section: "actions" }} search={{ open: String(action.id) }} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-primary"><Eye className="h-3.5 w-3.5" /> Ouvrir l'action</Link>
                </div>
              </li>;
            })}
          </ul>
        </div>
      )}

      {progressTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h2 className="font-display text-lg font-bold text-foreground">Mettre à jour la progression</h2>
            <p className="mt-1 text-xs font-bold text-muted-foreground">{progressTarget.reference} — {progressTarget.title}</p>
            <label className="mb-1 mt-4 block text-sm font-bold">Progression : {progressValue}%</label>
            <input type="range" min={0} max={100} step={5} value={progressValue} onChange={(e) => setProgressValue(Number(e.target.value))} className="w-full accent-primary" />
            <textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Commentaire / avancement…" className="mt-4 h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setProgressTarget(null)} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold">Annuler</button>
              <button disabled={progressMutation.isPending} onClick={() => void submitProgress()} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{progressMutation.isPending ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Boîte de réception des plaintes clients ----------
type Complaint = { id: string; reference: string; title: string; status: string; data: Record<string, unknown>; created_at: string };
const INBOX_KEY = ["client-inbox"];
const STATUSES = ["En attente", "En cours", "Résolue", "Rejetée"];
const TONE: Record<string, string> = {
  "En attente": "bg-warning/15 text-warning-foreground", "En cours": "bg-info/15 text-info",
  "Résolue": "bg-success/15 text-success", "Rejetée": "bg-destructive/10 text-destructive",
};

function inboxStatus(value: unknown): string {
  return ({ pending: "En attente", in_progress: "En cours", resolved: "Résolue", closed: "Résolue" } as Record<string, string>)[String(value)] ?? String(value ?? "En attente");
}

function backendInboxStatus(value: string): string {
  return ({ "En attente": "pending", "En cours": "in_progress", "Résolue": "resolved", "Rejetée": "closed" } as Record<string, string>)[value] ?? "pending";
}

export function useInbox() {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: async () => {
      const payload = await backendApi.request<unknown>("complaints?per_page=100");
      const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const items = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? payload : [];
      return items.map((item) => {
        const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const attrs = source.attributes && typeof source.attributes === "object" ? source.attributes as Record<string, unknown> : source;
        return {
          id: String(source.id ?? attrs.id),
          reference: String(attrs.reference ?? attrs.ref ?? `PLT-${source.id ?? ""}`),
          title: String(attrs.title ?? "Plainte client"),
          status: inboxStatus(attrs.status),
          created_at: String(attrs.created_at ?? new Date().toISOString()),
          data: { ...attrs, company: (attrs.site as Record<string, unknown> | undefined)?.name ?? attrs.client_company },
        } as Complaint;
      });
    },
  });
}

export function InboxPage() {
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useInbox();
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const upd = useMutation({
    mutationFn: async (v: { c: Complaint; status: string; text: string }) => {
      await backendApi.request(`complaints/${v.c.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: backendInboxStatus(v.status), immediate_response: v.text || undefined }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: INBOX_KEY }); setMsg(""); toast.success("Le client a été notifié"); },
    onError: () => toast.error("Mise à jour impossible."),
  });
  const shown = list.filter((c) => !filter || c.status === filter);
  const c = openId ? list.find((x) => x.id === openId) : undefined;

  if (c) {
    const hist = Array.isArray(c.data["history"]) ? (c.data["history"] as { at: string; text: string }[]) : [];
    const act = (status: string, label: string) => upd.mutate({ c, status, text: msg.trim() ? `${label} — ${msg.trim()}` : label });
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-8">
        <button onClick={() => setOpenId(null)} className="mb-4 text-sm font-semibold text-primary hover:underline">← Retour à la boîte de réception</button>
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="font-mono text-xs font-bold text-primary">{c.reference}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground">{c.title}</h1>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[c.status] ?? ""}`}>{c.status}</span>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-muted-foreground">Catégorie</dt><dd>{String(c.data["category"] ?? "—")}</dd></div>
            <div><dt className="font-semibold text-muted-foreground">Reçue le</dt><dd>{fmt(c.created_at)}</dd></div>
            <div className="sm:col-span-2"><dt className="font-semibold text-muted-foreground">Description</dt><dd className="whitespace-pre-wrap">{String(c.data["description"] ?? "")}</dd></div>
          </dl>
          <h2 className="mt-6 font-display font-bold">Suivi du traitement</h2>
          <ul className="mt-2 space-y-2 border-l-2 border-primary/20 pl-4 text-sm">
            {hist.map((h, i) => <li key={i}><span className="text-xs text-muted-foreground">{fmt(h.at)}</span> — {h.text}</li>)}
          </ul>
          {c.status !== "Résolue" && c.status !== "Rejetée" && (
            <div className="mt-6 space-y-3">
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message au client (facultatif)" className="h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary" />
              <div className="flex flex-wrap gap-2">
                {c.status === "En attente" && <button onClick={() => act("En cours", "Prise en charge par l'entreprise")} className="h-10 rounded-xl bg-info px-4 text-sm font-semibold text-info-foreground">Prendre en charge</button>}
                <button disabled={!msg.trim()} onClick={() => act(c.status, "Réponse de l'entreprise")} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50">Répondre</button>
                <button onClick={() => act("Résolue", "Plainte résolue")} className="h-10 rounded-xl bg-success px-4 text-sm font-semibold text-success-foreground">Marquer résolue</button>
                <button onClick={() => act("Rejetée", "Plainte rejetée")} className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground">Rejeter</button>
                <Link to="/app/$section" params={{ section: "actions" }} search={{ new: 1 }} className="inline-flex h-10 items-center rounded-xl bg-warning px-4 text-sm font-semibold text-warning-foreground">Créer une action</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Title title="Plaintes clients" desc="Plaintes déposées par les particuliers à l'encontre de votre entreprise, avec leur suivi." />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? "" : s)} className={`rounded-xl border px-4 py-2 text-left ${filter === s ? "border-primary bg-primary-soft" : "border-border bg-card"}`}>
            <p className="font-display text-xl font-extrabold">{list.filter((c) => c.status === s).length}</p>
            <p className="text-xs font-semibold text-muted-foreground">{s}</p>
          </button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-display font-bold">Aucune plainte</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpenId(c.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:border-primary">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary">{c.reference} · {String(c.data["category"] ?? "")}{!c.data["seen_by_company"] ? " · Nouveau" : ""}</p>
                  <p className="truncate font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">Reçue le {fmt(c.created_at)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[c.status] ?? ""}`}>{c.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
