import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Edit3,
  FileText,
  GitBranch,
  Layers3,
  Leaf,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  createProcessSequence,
  deleteProcessSequence,
  downloadCartographyDocx,
  downloadCartographyPdf,
  generateCartographyDraft,
  normalizeProcessSequences,
  updateProcessSequence,
  useCartographyData,
  useIsoCoverageMatrix,
} from "@/integrations/backend/processes";
import { backendApi } from "@/integrations/backend/client";
import { useProcess, useProcessMutations } from "@/integrations/backend/processes";
import { flattenResource } from "@/integrations/backend/context";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

const card = "rounded-2xl border border-border bg-card";
const input =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-dark`;
const secondary = `${button} border border-border bg-card hover:border-primary hover:text-primary`;
const muted = "text-sm text-muted-foreground";

const CONTEXT_LINKS = [
  ["contexte", "Compréhension de l'organisme"],
  ["parties-interessees", "Parties intéressées"],
  ["perimetre", "Domaine d'application"],
  ["processus", "Système de management"],
] as const;
const PROCESS_STEP_TABS = [
  ["general", "Général"],
  ["sequences", "Séquences"],
  ["objectives", "Objectifs"],
  ["resources", "Ressources"],
  ["risks", "Risques & opportunités"],
  ["indicators", "KPI"],
  ["versions", "Versions"],
  ["interactions", "Interactions"],
  ["workflow", "Workflow"],
  ["summary", "Récapitulatif"],
] as const;
const TYPES = [
  ["pilotage", "Management"],
  ["operationnel", "Réalisation"],
  ["support", "Support"],
] as const;
const EMPTY_FORM = {
  title: "",
  purpose: "",
  type: "",
  pilot_id: "",
  copilot_id: "",
  aspect_qualite: false,
  aspect_environnement: false,
  aspect_sante_securite: false,
  normes_iso: [] as string[],
  sequences: [] as SequenceForm[],
};
type SequenceForm = {
  id?: string;
  sequence_order: number;
  input_description: string;
  activity_description: string;
  output_description: string;
  sub_activities: string[];
  supplier_processes: string[];
  client_processes: string[];
  responsible_user_id?: string;
  duration_minutes?: number;
  documents?: Record<string, unknown>[];
};
type ProcessForm = Omit<typeof EMPTY_FORM, "sequences"> & { sequences: SequenceForm[] };

function ContextNav() {
  return null;
}
function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex items-start gap-4">
        <div className="mt-1 rounded-2xl bg-primary-soft p-3 text-primary">
          <GitBranch className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Contexte de l'organisme
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
function SiteRequired() {
  return (
    <div className={`${card} mx-auto max-w-3xl p-8 text-center`}>
      <MapPin className="mx-auto h-9 w-9 text-primary" />
      <h2 className="mt-3 font-display text-lg font-bold">Sélectionnez un site</h2>
      <p className={`mt-2 ${muted}`}>Les processus sont rattachés au site courant.</p>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}
function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    if (Array.isArray(root.data)) return root.data;
  }
  return [];
}

function useProcessLookups(siteId: string) {
  const users = useQuery({
    queryKey: ["process-users", siteId],
    queryFn: async () => {
      const payload = await backendApi.request<unknown>(
        `users/job-description-collaborators?site_id=${encodeURIComponent(siteId)}`,
      );
      return asArray(payload).map((item) => {
        const value = flattenResource(item);
        return {
          id: String(value.id),
          name: String(value.full_name ?? value.name ?? value.email ?? "Collaborateur"),
        };
      });
    },
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
  const norms = useQuery({
    queryKey: ["process-norms"],
    queryFn: async () => {
      const payload = await backendApi.request<unknown>("access/catalog");
      const root =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      return asArray(
        root.norms ??
          (root.data && typeof root.data === "object"
            ? (root.data as Record<string, unknown>).norms
            : []),
      )
        .map((item) => {
          const value = flattenResource(item);
          return String(value.code ?? value.name ?? "");
        })
        .filter(Boolean);
    },
    staleTime: 60_000,
  });
  const cartography = useCartographyData(siteId);
  return {
    users: users.data ?? [],
    norms: norms.data ?? [],
    processes: cartography.data?.processes ?? [],
    loading: users.isLoading || norms.isLoading || cartography.isLoading,
  };
}

function laneOf(item: Record<string, unknown>) {
  const value = String(item.normalized_category ?? item.category ?? item.type ?? "").toLowerCase();
  if (["management", "pilotage", "mesure_amelioration", "direction"].includes(value))
    return "management";
  if (["support", "soutien", "ressource", "ressources"].includes(value)) return "support";
  return "realization";
}
function categoryOf(item: Record<string, unknown>) {
  const lane = laneOf(item);
  return lane === "management" ? "pilotage" : lane === "support" ? "support" : "operationnel";
}
function matchesQuery(item: Record<string, unknown>, query: string) {
  const needle = query.toLowerCase().trim();
  if (!needle) return true;
  const haystack = [
    item.title ?? item.name,
    item.code,
    item.pilot_name,
    item.responsible_display,
    item.department,
    item.activities_summary,
    item.inputs_summary,
    item.outputs_summary,
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function ProcessManagementPage() {
  const [siteId] = useCurrentSite();
  const carto = useCartographyData(siteId);
  const processes = useMemo(() => carto.data?.processes ?? [], [carto.data]);
  const interactions = useMemo(() => carto.data?.interactions ?? [], [carto.data]);
  const document = carto.data?.document ?? null;
  const isLoading = carto.isLoading;
  const isError = carto.isError;
  const coverage = useIsoCoverageMatrix(siteId, "9001");
  const coverageRows = useMemo(() => coverage.data?.rows ?? [], [coverage.data]);
  const { remove } = useProcessMutations(siteId);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState<"pdf" | "docx" | "draft" | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  const filtered = processes.filter(
    (item) => (lane === "all" || laneOf(item) === lane) && matchesQuery(item, query),
  );
  const groups = [
    {
      key: "management",
      label: "Processus de management",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: BarChart3,
    },
    {
      key: "realization",
      label: "Processus de réalisation",
      tone: "border-orange-200 bg-orange-50 text-orange-800",
      icon: Layers3,
    },
    {
      key: "support",
      label: "Processus support",
      tone: "border-violet-200 bg-violet-50 text-violet-800",
      icon: ShieldCheck,
    },
  ];
  const saveBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const blob = await downloadCartographyPdf(siteId);
      saveBlob(blob, `Cartographie_Processus_${stamp}.pdf`);
      toast.success("Cartographie exportée en PDF.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export PDF impossible.");
    } finally {
      setBusy(null);
    }
  };
  const exportDocx = async () => {
    setBusy("docx");
    try {
      const blob = await downloadCartographyDocx(siteId);
      saveBlob(blob, `Cartographie_Processus_${stamp}.docx`);
      toast.success("Cartographie exportée en DOCX.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export DOCX impossible.");
    } finally {
      setBusy(null);
    }
  };
  const codify = async () => {
    setBusy("draft");
    try {
      await generateCartographyDraft({ site_id: Number(siteId) });
      await carto.refetch();
      toast.success("Document SMQ codifié avec succès.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Codification impossible.");
    } finally {
      setBusy(null);
    }
  };
  const selected = processes.find((item) => String(item.id) === selectedId);
  const upstreamOf = (id: string) =>
    interactions
      .filter((link) => String(link.target_id) === id)
      .map((link) => processes.find((item) => String(item.id) === String(link.source_id)))
      .filter(Boolean);
  const downstreamOf = (id: string) =>
    interactions
      .filter((link) => String(link.source_id) === id)
      .map((link) => processes.find((item) => String(item.id) === String(link.target_id)))
      .filter(Boolean);
  const destroy = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      await carto.refetch();
      toast.success("Processus archivé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        title="Système de management"
        description="Construisez la cartographie, consultez les processus actifs et créez chaque fiche selon le parcours en 4 étapes."
      >
        <Link
          className={primary}
          to="/app/$section"
          params={{ section: "processus" }}
          search={{ new: 1 }}
        >
          <Plus className="h-4 w-4" /> Nouveau processus
        </Link>
        <button className={secondary} disabled={busy !== null} onClick={() => void exportPdf()}>
          <FileText className="h-4 w-4" /> {busy === "pdf" ? "PDF…" : "Export PDF"}
        </button>
        <button className={secondary} disabled={busy !== null} onClick={() => void exportDocx()}>
          <FileText className="h-4 w-4" /> {busy === "docx" ? "DOCX…" : "Export DOCX"}
        </button>
        <button className={secondary} disabled={busy !== null} onClick={() => void codify()}>
          <ShieldCheck className="h-4 w-4" />{" "}
          {busy === "draft" ? "Codification…" : document ? "Recodifier" : "Codifier"}
        </button>
      </Header>
      <ContextNav />
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={`${card} p-4`}>
          <p className="font-display text-2xl font-extrabold text-primary">{processes.length}</p>
          <p className="text-xs font-semibold text-muted-foreground">Processus actifs</p>
        </div>
        {groups.slice(0, 3).map(({ key, label }) => (
          <div key={key} className={`${card} p-4`}>
            <p className="font-display text-2xl font-extrabold text-foreground">
              {processes.filter((item) => laneOf(item) === key).length}
            </p>
            <p className="text-xs font-semibold text-muted-foreground">
              {label.replace("Processus de ", "")}
            </p>
          </div>
        ))}
      </div>
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Cartographie des processus</h2>
            <p className={muted}>
              Données de la cartographie — {carto.data?.enterprise_name ?? ""} ·{" "}
              {carto.data?.site_name ?? ""}
              {document
                ? ` · Réf ${String(document.code ?? "")} (v${String(document.version ?? "1.0")})`
                : " · Non codifié"}
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { key: "all", label: `Tous (${processes.length})` },
                ...groups.map(({ key, label }) => ({
                  key,
                  label: `${label.replace("Processus de ", "").replace("Processus ", "")} (${processes.filter((item) => laneOf(item) === key).length})`,
                })),
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setLane(tab.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${lane === tab.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <input
            className={`${input} w-full sm:w-72`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (titre, code, pilote, activité)…"
          />
        </div>
        {isError && (
          <p className="mt-4 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
            La cartographie n'est pas disponible depuis le backend.
          </p>
        )}
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Chargement de la cartographie…
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map(({ key, label, tone, icon: Icon }) => {
              const items = filtered.filter((item) => laneOf(item) === key);
              return (
                <section key={key} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <h3 className="font-display font-bold">{label}</h3>
                    <span className="ml-auto rounded-full bg-white/70 px-2 py-1 text-xs font-bold">
                      {items.length}
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <p className="mt-4 text-xs opacity-70">Aucun processus dans cette famille.</p>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {items.map((item) => (
                        <article
                          key={String(item.id)}
                          className="rounded-xl border border-white/70 bg-white/80 p-4 text-foreground"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-[10px] font-bold uppercase text-primary">
                                {String(item.code ?? "PROCESSUS")}
                              </p>
                              <h4 className="mt-1 font-display font-bold">
                                <Link
                                  to="/app/$section"
                                  params={{ section: "processus" }}
                                  search={{ open: String(item.id) }}
                                  className="hover:text-primary"
                                >
                                  {String(item.title ?? item.name ?? "Processus sans nom")}
                                </Link>
                              </h4>
                            </div>
                            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                            {String(item.finalite ?? item.purpose ?? "Finalité à documenter")}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Pilote :{" "}
                            <span className="font-bold text-foreground">
                              {String(item.pilot_name ?? item.responsible_display ?? "Non assigné")}
                            </span>{" "}
                            · {String(item.indicators_count ?? 0)} indicateur(s) ·{" "}
                            {String(item.risks_count ?? 0)} risque(s)
                          </p>
                          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-black/5 pt-3">
                            <Link
                              to="/app/$section"
                              params={{ section: "processus" }}
                              search={{ open: String(item.id) }}
                              className="text-xs font-bold text-primary"
                            >
                              Ouvrir la fiche <ChevronRight className="inline h-3.5 w-3.5" />
                            </Link>
                            <button
                              className={`text-xs font-bold ${selectedId === String(item.id) ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                              onClick={() =>
                                setSelectedId((current) =>
                                  current === String(item.id) ? "" : String(item.id),
                                )
                              }
                            >
                              <GitBranch className="inline h-3.5 w-3.5" /> Interactions
                            </button>
                            <button
                              className="text-xs font-bold text-muted-foreground hover:text-destructive"
                              onClick={() => setArchiveId(String(item.id))}
                            >
                              <Trash2 className="inline h-3.5 w-3.5" /> Archiver
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {selected ? (
          <div className={`${card} mt-5 p-5`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">
                  Interactions — {String(selected.title ?? selected.name ?? "")}
                </h2>
                <p className={muted}>
                  Fournisseurs en amont et clients en aval (séquences déclarées + matrice de
                  synthèse).
                </p>
              </div>
              <button className={secondary} onClick={() => setSelectedId("")}>
                <X className="h-4 w-4" /> Fermer
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  En amont ({upstreamOf(selectedId).length})
                </p>
                {upstreamOf(selectedId).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Entrées directes : exigences clients et parties intéressées.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {upstreamOf(selectedId).map(
                      (proc) =>
                        proc && (
                          <li
                            key={String(proc.id)}
                            className="rounded-xl border border-border bg-card p-3 text-sm"
                          >
                            <span className="font-mono text-[10px] font-bold uppercase text-primary">
                              {String(proc.code ?? "")}
                            </span>
                            <p className="font-bold">{String(proc.title ?? proc.name ?? "")}</p>
                          </li>
                        ),
                    )}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  En aval ({downstreamOf(selectedId).length})
                </p>
                {downstreamOf(selectedId).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sorties directes : livrables conformes et amélioration du SMQ.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {downstreamOf(selectedId).map(
                      (proc) =>
                        proc && (
                          <li
                            key={String(proc.id)}
                            className="rounded-xl border border-border bg-card p-3 text-sm"
                          >
                            <span className="font-mono text-[10px] font-bold uppercase text-primary">
                              {String(proc.code ?? "")}
                            </span>
                            <p className="font-bold">{String(proc.title ?? proc.name ?? "")}</p>
                          </li>
                        ),
                    )}
                  </ul>
                )}
              </div>
            </div>
            {interactions.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Cible</th>
                      <th className="px-3 py-2">Nature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {interactions
                      .filter(
                        (link) =>
                          String(link.source_id) === selectedId ||
                          String(link.target_id) === selectedId,
                      )
                      .map((link) => (
                        <tr key={String(link.id ?? `${link.source_id}-${link.target_id}`)}>
                          <td className="px-3 py-2 font-semibold">
                            {String(link.source_title ?? link.source_code ?? link.source_id)}
                          </td>
                          <td className="px-3 py-2">
                            {String(link.target_title ?? link.target_code ?? link.target_id)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {String(link.label ?? link.nature ?? "—")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          interactions.length > 0 && (
            <div className={`${card} mt-5 p-5`}>
              <h2 className="font-display text-lg font-bold">
                Matrice des interactions ({interactions.length})
              </h2>
              <p className={muted}>
                Sélectionnez « Interactions » sur une fiche pour le détail amont/aval.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Cible</th>
                      <th className="px-3 py-2">Nature</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {interactions.slice(0, 12).map((link) => (
                      <tr key={String(link.id ?? `${link.source_id}-${link.target_id}`)}>
                        <td className="px-3 py-2 font-semibold">
                          {String(link.source_title ?? link.source_code ?? link.source_id)}
                        </td>
                        <td className="px-3 py-2">
                          {String(link.target_title ?? link.target_code ?? link.target_id)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {String(link.label ?? link.nature ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
        <div className={`${card} mt-5 p-5`}>
          <h2 className="font-display text-lg font-bold">Tableau officiel — canevas 4 colonnes</h2>
          <p className={muted}>
            Proposition de nom, activités principales, observation et responsable (même canevas que
            l'export DOCX).
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Proposition de nom processus</th>
                  <th className="px-3 py-2">Activités principales</th>
                  <th className="px-3 py-2">Observation</th>
                  <th className="px-3 py-2">Responsable par département</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr key={String(item.id)}>
                    <td className="px-3 py-2 font-semibold">
                      {String(item.title ?? item.name ?? "")}
                      <span className="block font-mono text-[10px] font-bold uppercase text-primary">
                        {String(item.code ?? "")}
                      </span>
                    </td>
                    <td className="max-w-[320px] px-3 py-2 text-muted-foreground">
                      {String(item.activities_summary ?? item.purpose ?? "—")}
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-muted-foreground">
                      {String(item.observation ?? "—") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {String(item.responsible_display ?? item.pilot_name ?? "Non assigné")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={`${card} mt-5 p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Couverture ISO 9001</h2>
              <p className={muted}>
                {coverage.isLoading
                  ? "Chargement de la matrice…"
                  : coverageRows.length === 0
                    ? "Aucune couverture ISO enregistrée pour ce site (ajoutez des couvertures sur chaque fiche processus)."
                    : `${coverageRows.length} ligne(s) — norme ${String(coverage.data?.norme ?? "9001")}.`}
              </p>
            </div>
          </div>
          {coverageRows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Processus</th>
                    <th className="px-3 py-2">Clause</th>
                    <th className="px-3 py-2">Couverture</th>
                    <th className="px-3 py-2">Conformité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coverageRows.slice(0, 30).map((row, index) => (
                    <tr
                      key={`${String(row.process_code ?? row.process ?? index)}-${String(row.clause ?? index)}`}
                    >
                      <td className="px-3 py-2 font-semibold">
                        {String(row.process ?? "")}
                        <span className="block font-mono text-[10px] uppercase text-muted-foreground">
                          {String(row.process_code ?? "")}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {String(row.clause ?? "")} — {String(row.clause_title ?? "")}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary">
                          {String(row.coverage ?? "—")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {String(row.conformity ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(archiveId)}
        title="Archiver ce processus ?"
        description="Le processus ne sera plus affiché dans la cartographie active, mais son historique sera conservé."
        confirmLabel="Archiver"
        destructive
        onCancel={() => setArchiveId(null)}
        onConfirm={() => {
          const id = archiveId;
          setArchiveId(null);
          if (id) void destroy(id);
        }}
      />
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = [
    [1, "Informations", FileText],
    [2, "Classification", Tag],
    [3, "Séquences", Layers3],
    [4, "Validation", CheckCircle2],
  ] as const;
  return (
    <div className={`${card} overflow-hidden p-3`}>
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map(([number, label, Icon], index) => (
          <div key={number} className="relative flex items-center gap-3 rounded-xl p-3">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ${step === number ? "bg-primary text-primary-foreground" : step > number ? "bg-success text-success-foreground" : "bg-background text-muted-foreground"}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p
                className={`text-[10px] font-extrabold uppercase tracking-wide ${step === number ? "text-primary" : "text-muted-foreground"}`}
              >
                Étape {number}
              </p>
              <p className="text-sm font-bold">{label}</p>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="absolute -right-1 hidden h-4 w-4 text-border md:block" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function emptySequence(sequence_order = 1): SequenceForm {
  return {
    sequence_order,
    input_description: "",
    activity_description: "",
    output_description: "",
    sub_activities: [],
    supplier_processes: [],
    client_processes: [],
    responsible_user_id: "",
    duration_minutes: undefined,
    documents: [],
  };
}
function initialForm(siteId: string): ProcessForm {
  return { ...EMPTY_FORM, sequences: [emptySequence()] };
}

function SequenceProcessField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
}) {
  const choices = [...new Set([...options, ...value])];
  return (
    <div>
      <Label>{label}</Label>
      <select
        multiple
        className={`${input} min-h-24`}
        value={value}
        onChange={(event) => {
          const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
          onChange(selected);
        }}
      >
        {choices.length === 0 ? (
          <option disabled>Aucun processus disponible</option>
        ) : (
          choices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))
        )}
      </select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sélectionnez un ou plusieurs processus existants.
      </p>
    </div>
  );
}

export function ProcessEditorPage({ processId }: { processId?: string }) {
  const [siteId] = useCurrentSite();
  const navigate = useNavigate();
  const { data: existing, isLoading: loadingProcess } = useProcess(processId);
  const {
    users,
    norms,
    processes: lookupProcesses,
    loading: loadingLookups,
  } = useProcessLookups(siteId);
  const { save } = useProcessMutations(siteId);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ProcessForm>(() => initialForm(siteId));
  const editing = Boolean(processId);

  useEffect(() => {
    if (!existing) return;
    setForm({
      ...initialForm(siteId),
      title: String(existing.title ?? existing.name ?? ""),
      purpose: String(existing.purpose ?? existing.finalite ?? ""),
      type: String(existing.category ?? existing.type ?? ""),
      pilot_id: existing.pilot_id ? String(existing.pilot_id) : "",
      copilot_id: existing.copilot_id ? String(existing.copilot_id) : "",
      aspect_qualite: Boolean(existing.aspect_qualite),
      aspect_environnement: Boolean(existing.aspect_environnement),
      aspect_sante_securite: Boolean(existing.aspect_sante_securite),
      normes_iso: Array.isArray(existing.normes_iso) ? existing.normes_iso.map(String) : [],
      sequences: normalizeProcessSequences(existing.sequences),
    });
  }, [existing, siteId]);
  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  const change = (key: keyof ProcessForm, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateSequence = (index: number, key: keyof SequenceForm, value: unknown) =>
    setForm((current) => ({
      ...current,
      sequences: current.sequences.map((sequence, sequenceIndex) =>
        sequenceIndex === index ? { ...sequence, [key]: value } : sequence,
      ),
    }));
  const addSequence = () =>
    setForm((current) => ({
      ...current,
      sequences: [...current.sequences, emptySequence(current.sequences.length + 1)],
    }));
  const removeSequence = (index: number) =>
    setForm((current) => ({
      ...current,
      sequences: current.sequences
        .filter((_, sequenceIndex) => sequenceIndex !== index)
        .map((sequence, sequenceIndex) => ({ ...sequence, sequence_order: sequenceIndex + 1 })),
    }));
  const validation = (target: number) => {
    if (target > 1 && (!form.title.trim() || !form.purpose.trim() || !form.type)) {
      toast.error("Complétez le titre, la finalité et le type à l'étape 1.");
      return false;
    }
    if (
      target > 2 &&
      ((!form.aspect_qualite && !form.aspect_environnement && !form.aspect_sante_securite) ||
        form.normes_iso.length === 0)
    ) {
      toast.error("Sélectionnez au moins un aspect QHSE et une norme à l'étape 2.");
      return false;
    }
    if (
      target > 3 &&
      (form.sequences.length === 0 ||
        form.sequences.some((sequence) => !sequence.activity_description.trim()))
    ) {
      toast.error("Ajoutez au moins une séquence avec une activité renseignée.");
      return false;
    }
    return true;
  };
  const saveForm = async () => {
    if (!validation(4)) return;
    try {
      await save.mutateAsync({
        id: processId,
        payload: {
          site_id: Number(siteId),
          title: form.title,
          name: form.title,
          category: form.type,
          type: form.type,
          purpose: form.purpose,
          finalite: form.purpose,
          pilot_id: form.pilot_id ? Number(form.pilot_id) : null,
          copilot_id: form.copilot_id ? Number(form.copilot_id) : null,
          aspect_qualite: form.aspect_qualite,
          aspect_environnement: form.aspect_environnement,
          aspect_sante_securite: form.aspect_sante_securite,
          normes_iso: form.normes_iso,
          sequences: form.sequences,
          status: existing?.status ?? "draft",
        },
      });
      toast.success(editing ? "Processus mis à jour." : "Processus créé.");
      navigate({ to: "/app/$section", params: { section: "processus" } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'enregistrer le processus.",
      );
    }
  };
  const next = () => {
    if (validation(step + 1)) setStep((current) => Math.min(4, current + 1));
  };
  const sequenceProcessOptions = useMemo(
    () =>
      lookupProcesses
        .map((process) => String(process.title ?? process.name ?? process.code ?? "").trim())
        .filter(Boolean),
    [lookupProcesses],
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Header
        title={editing ? "Modifier le processus" : "Nouveau processus"}
        description="Suivez les 4 étapes de la référence fonctionnelle : informations, classification, séquences et validation."
      >
        <button
          className={secondary}
          onClick={() => navigate({ to: "/app/$section", params: { section: "processus" } })}
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        {editing && (
          <Link
            className={secondary}
            to="/app/$section"
            params={{ section: "processus" }}
            search={{ open: processId!, tab: "sequences" }}
          >
            <Layers3 className="h-4 w-4" /> Gérer les séquences
          </Link>
        )}
      </Header>
      <ContextNav />
      <Stepper step={step} />
      {loadingProcess ? (
        <div className={`${card} p-10 text-center ${muted}`}>Chargement du processus…</div>
      ) : (
        <div className={`${card} p-6 md:p-8`}>
          {step === 1 && (
            <section>
              <div className="mb-6 rounded-xl border-l-4 border-primary bg-primary-soft p-4">
                <div className="flex items-center gap-2 font-bold">
                  <CircleAlert className="h-4 w-4" /> Informations générales
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Définissez l'identité, la finalité et le responsable du processus.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>Nom du processus *</Label>
                  <input
                    className={input}
                    value={form.title}
                    onChange={(e) => change("title", e.target.value)}
                    placeholder="Ex. Gestion des commandes"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Finalité *</Label>
                  <textarea
                    className={`${input} min-h-28`}
                    value={form.purpose}
                    onChange={(e) => change("purpose", e.target.value)}
                    placeholder="Décrivez la finalité et les objectifs du processus…"
                  />
                </div>
                <div>
                  <Label>Catégorie *</Label>
                  <select
                    className={input}
                    value={form.type}
                    onChange={(e) => change("type", e.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {TYPES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Pilote</Label>
                  <select
                    className={input}
                    value={form.pilot_id}
                    onChange={(e) => change("pilot_id", e.target.value)}
                    disabled={loadingLookups}
                  >
                    <option value="">Non assigné</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Copilote</Label>
                  <select
                    className={input}
                    value={form.copilot_id}
                    onChange={(e) => change("copilot_id", e.target.value)}
                    disabled={loadingLookups}
                  >
                    <option value="">Non assigné</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}
          {step === 2 && (
            <section>
              <div className="mb-6 rounded-xl border-l-4 border-success bg-success/10 p-4">
                <div className="flex items-center gap-2 font-bold">
                  <ShieldCheck className="h-4 w-4" /> Classification QHSE
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sélectionnez les aspects et normes couverts par le processus.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  [
                    "aspect_qualite",
                    "Qualité",
                    "ISO 9001",
                    ShieldCheck,
                    "border-primary bg-primary-soft",
                  ],
                  [
                    "aspect_environnement",
                    "Environnement",
                    "ISO 14001",
                    Leaf,
                    "border-success bg-success/10",
                  ],
                  [
                    "aspect_sante_securite",
                    "Santé & sécurité",
                    "ISO 45001",
                    CircleAlert,
                    "border-destructive bg-destructive/10",
                  ],
                ].map(([key, label, code, Icon, activeClass]) => {
                  const active = Boolean(form[key as keyof ProcessForm]);
                  return (
                    <button
                      type="button"
                      key={key}
                      className={`rounded-2xl border-2 p-5 text-center transition ${active ? activeClass : "border-border bg-background"}`}
                      onClick={() => change(key as keyof ProcessForm, !active)}
                    >
                      <Icon
                        className={`mx-auto h-8 w-8 ${active ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <p className="mt-2 font-display font-bold">{label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{code}</p>
                      {active && <Check className="mx-auto mt-2 h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <Label>Normes ISO applicables *</Label>
                {norms.length === 0 ? (
                  <p className="rounded-xl bg-background p-3 text-sm text-muted-foreground">
                    Les normes disponibles seront chargées depuis le catalogue.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {norms.map((norm) => (
                      <button
                        type="button"
                        key={norm}
                        onClick={() =>
                          change(
                            "normes_iso",
                            form.normes_iso.includes(norm)
                              ? form.normes_iso.filter((value) => value !== norm)
                              : [...form.normes_iso, norm],
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-xs font-bold ${form.normes_iso.includes(norm) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
                      >
                        {norm}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {step === 3 && (
            <section>
              <div className="mb-6 rounded-xl border-l-4 border-info bg-info/10 p-4">
                <div className="flex items-center gap-2 font-bold">
                  <Layers3 className="h-4 w-4" /> Séquences opérationnelles
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pour chaque séquence, rattachez les processus fournisseurs en amont et les
                  processus clients en aval, comme dans la référence Vue.
                </p>
              </div>
              <button type="button" className={secondary} onClick={addSequence}>
                <Plus className="h-4 w-4" /> Ajouter une séquence
              </button>
              <div className="mt-4 space-y-4">
                {form.sequences.map((sequence, index) => (
                  <div
                    key={`${sequence.id ?? "new"}-${sequence.sequence_order}-${index}`}
                    className="rounded-2xl border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                          {index + 1}
                        </span>
                        <p className="font-display font-bold">Séquence {index + 1}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeSequence(index)}
                        aria-label="Supprimer la séquence"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Entrées</Label>
                        <textarea
                          className={`${input} min-h-24`}
                          value={sequence.input_description}
                          onChange={(e) =>
                            updateSequence(index, "input_description", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Activité *</Label>
                        <textarea
                          className={`${input} min-h-24`}
                          value={sequence.activity_description}
                          onChange={(e) =>
                            updateSequence(index, "activity_description", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Sorties</Label>
                        <textarea
                          className={`${input} min-h-24`}
                          value={sequence.output_description}
                          onChange={(e) =>
                            updateSequence(index, "output_description", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Sous-activités</Label>
                        <textarea
                          className={`${input} min-h-20`}
                          value={sequence.sub_activities.join("\n")}
                          onChange={(e) =>
                            updateSequence(
                              index,
                              "sub_activities",
                              e.target.value
                                .split("\n")
                                .map((value) => value.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="Une sous-activité par ligne"
                        />
                      </div>
                      <SequenceProcessField
                        label="Processus fournisseurs en amont"
                        value={sequence.supplier_processes}
                        options={sequenceProcessOptions}
                        onChange={(value) => updateSequence(index, "supplier_processes", value)}
                      />
                      <SequenceProcessField
                        label="Processus clients en aval"
                        value={sequence.client_processes}
                        options={sequenceProcessOptions}
                        onChange={(value) => updateSequence(index, "client_processes", value)}
                      />
                    </div>
                  </div>
                ))}
                {form.sequences.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                    <ClipboardList className="mx-auto h-8 w-8 text-primary" />
                    <p className="mt-3 font-semibold">Aucune séquence</p>
                    <p className={`mt-1 ${muted}`}>Ajoutez au moins une séquence pour continuer.</p>
                  </div>
                )}
              </div>
            </section>
          )}
          {step === 4 && (
            <section>
              <div className="mb-6 rounded-xl border-l-4 border-violet-500 bg-violet-50 p-4">
                <div className="flex items-center gap-2 font-bold text-violet-800">
                  <CheckCircle2 className="h-4 w-4" /> Validation
                </div>
                <p className="mt-1 text-sm text-violet-700">
                  Vérifiez les informations avant l'enregistrement.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Informations</p>
                  <h3 className="mt-2 font-display text-lg font-bold">{form.title || "—"}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {form.purpose || "Finalité non renseignée"}
                  </p>
                  <span className="mt-3 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                    {TYPES.find(([value]) => value === form.type)?.[1] ?? "Type non renseigné"}
                  </span>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Classification
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.normes_iso.map((norm) => (
                      <span
                        key={norm}
                        className="rounded-full bg-background px-2.5 py-1 text-xs font-bold"
                      >
                        {norm}
                      </span>
                    ))}
                    {form.normes_iso.length === 0 && (
                      <span className="text-sm text-muted-foreground">Aucune norme</span>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Aspects :{" "}
                    {[
                      form.aspect_qualite && "Qualité",
                      form.aspect_environnement && "Environnement",
                      form.aspect_sante_securite && "Santé & sécurité",
                    ]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4 md:col-span-2">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    Séquences ({form.sequences.length})
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {form.sequences.map((sequence, index) => (
                      <div
                        key={sequence.sequence_order}
                        className="rounded-xl bg-background p-3 text-sm"
                      >
                        <p className="font-bold">
                          {index + 1}. {sequence.activity_description || "Activité non renseignée"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {sequence.input_description || "Entrées —"} →{" "}
                          {sequence.output_description || "Sorties —"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
            <button
              className={secondary}
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              <ArrowLeft className="h-4 w-4" /> Précédent
            </button>
            {step < 4 ? (
              <button className={primary} onClick={next}>
                Suivant <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button className={primary} disabled={save.isPending} onClick={saveForm}>
                <Save className="h-4 w-4" />{" "}
                {save.isPending
                  ? "Enregistrement…"
                  : editing
                    ? "Enregistrer les modifications"
                    : "Créer le processus"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProcessDetailsPage({ processId }: { processId: string }) {
  return <ProcessEditorPage processId={processId} />;
}

export function ProcessSequencesPage({ processId }: { processId: string }) {
  const [siteId] = useCurrentSite();
  const navigate = useNavigate();
  const { data: process, isLoading, refetch } = useProcess(processId);
  const cartography = useCartographyData(siteId);
  const [sequences, setSequences] = useState<SequenceForm[]>([]);
  const [saving, setSaving] = useState(false);

  const processOptions = useMemo(
    () =>
      (cartography.data?.processes ?? [])
        .map((entry) => String(entry.title ?? entry.name ?? entry.code ?? "").trim())
        .filter(Boolean),
    [cartography.data],
  );
  const usersQuery = useQuery({
    queryKey: ["process-sequence-users", siteId],
    queryFn: async () =>
      asArray(
        await backendApi.request<unknown>(
          `users/job-description-collaborators?site_id=${encodeURIComponent(siteId)}`,
        ),
      ).map((item) => {
        const value = flattenResource(item);
        return {
          id: String(value.id),
          name: String(value.full_name ?? value.name ?? value.email ?? "Collaborateur"),
        };
      }),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (process) setSequences(normalizeProcessSequences(process.sequences));
  }, [process]);

  const update = (index: number, key: keyof SequenceForm, value: unknown) =>
    setSequences((current) =>
      current.map((sequence, sequenceIndex) =>
        sequenceIndex === index ? { ...sequence, [key]: value } : sequence,
      ),
    );
  const add = () => setSequences((current) => [...current, emptySequence(current.length + 1)]);
  const move = (index: number, direction: -1 | 1) =>
    setSequences((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, itemIndex) => ({ ...item, sequence_order: itemIndex + 1 }));
    });
  const remove = async (index: number) => {
    const sequence = sequences[index];
    if (!sequence) return;
    try {
      if (sequence.id) await deleteProcessSequence(processId, sequence.id);
      setSequences((current) =>
        current
          .filter((_, sequenceIndex) => sequenceIndex !== index)
          .map((item, sequenceIndex) => ({ ...item, sequence_order: sequenceIndex + 1 })),
      );
      toast.success("Séquence supprimée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer la séquence.");
    }
  };
  const saveAll = async (): Promise<boolean> => {
    if (
      sequences.length === 0 ||
      sequences.some((sequence) => !sequence.activity_description.trim())
    ) {
      toast.error("Ajoutez au moins une séquence avec une activité renseignée.");
      return false;
    }
    setSaving(true);
    try {
      for (const [index, sequence] of sequences.entries()) {
        const payload = {
          sequence_order: index + 1,
          input_description: sequence.input_description.trim(),
          activity_description: sequence.activity_description.trim(),
          output_description: sequence.output_description.trim(),
          sub_activities: sequence.sub_activities.map((value) => value.trim()).filter(Boolean),
          supplier_processes: sequence.supplier_processes
            .map((value) => value.trim())
            .filter(Boolean),
          client_processes: sequence.client_processes.map((value) => value.trim()).filter(Boolean),
          responsible_user_id: sequence.responsible_user_id
            ? Number(sequence.responsible_user_id)
            : null,
          duration_minutes: sequence.duration_minutes ? Number(sequence.duration_minutes) : null,
          document_ids: (sequence.documents ?? [])
            .map((document) => Number(document.id))
            .filter(Boolean),
        };
        if (sequence.id) await updateProcessSequence(processId, sequence.id, payload);
        else await createProcessSequence(processId, payload);
      }
      await refetch();
      toast.success("Séquences enregistrées sans modifier les autres données du processus.");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'enregistrer les séquences.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goToStep = async (target: string) => {
    const targetIndex = PROCESS_STEP_TABS.findIndex(([value]) => value === target);
    const currentIndex = PROCESS_STEP_TABS.findIndex(([value]) => value === "sequences");
    if (targetIndex > currentIndex && !(await saveAll())) return;
    navigate({
      to: "/app/$section",
      params: { section: "processus" },
      search: { open: processId, tab: target },
    });
  };

  if (isLoading)
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-8">
        <div className={`${card} p-10 text-center ${muted}`}>Chargement des séquences…</div>
      </div>
    );
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Header
        title={`Séquences — ${String(process?.title ?? process?.name ?? "Processus")}`}
        description="Cette page est dédiée aux séquences. Les informations générales du processus sont enregistrées séparément."
      >
        <button
          className={secondary}
          onClick={() =>
            navigate({
              to: "/app/$section",
              params: { section: "processus" },
              search: { open: processId },
            })
          }
        >
          <ArrowLeft className="h-4 w-4" /> Fiche du processus
        </button>
        <button className={primary} disabled={saving} onClick={() => void saveAll()}>
          <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer les séquences"}
        </button>
      </Header>
      <ContextNav />
      <div className={`${card} flex items-center justify-between gap-3 p-4`}>
        <button
          type="button"
          className={secondary}
          disabled={saving}
          onClick={() => void goToStep("general")}
        >
          <ArrowLeft className="h-4 w-4" /> Précédent
        </button>
        <p className="text-center text-sm font-semibold text-muted-foreground">
          Étape 2 sur {PROCESS_STEP_TABS.length} — Séquences
          <br />
          <span className="text-xs font-normal">
            Enregistrez les séquences avant de passer aux objectifs.
          </span>
        </p>
        <button
          type="button"
          className={primary}
          disabled={saving}
          onClick={() => void goToStep("objectives")}
        >
          Enregistrer et continuer <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Chaînage des processus</h2>
            <p className={muted}>
              Pour chaque séquence, indiquez les processus fournisseurs en amont et les processus
              clients en aval.
            </p>
          </div>
          <button type="button" className={secondary} onClick={add}>
            <Plus className="h-4 w-4" /> Ajouter une séquence
          </button>
        </div>
        <div className="mt-5 space-y-4">
          {sequences.map((sequence, index) => (
            <div
              key={`${sequence.id ?? "new"}-${index}`}
              className="rounded-2xl border border-border bg-background p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="font-display font-bold">Séquence {index + 1}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    className="rounded-lg p-2 text-muted-foreground hover:text-primary disabled:opacity-30"
                    onClick={() => move(index, -1)}
                    aria-label="Monter la séquence"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === sequences.length - 1}
                    className="rounded-lg p-2 text-muted-foreground hover:text-primary disabled:opacity-30"
                    onClick={() => move(index, 1)}
                    aria-label="Descendre la séquence"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void remove(index)}
                    aria-label="Supprimer la séquence"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Entrées</Label>
                  <textarea
                    className={`${input} min-h-24`}
                    value={sequence.input_description}
                    onChange={(event) => update(index, "input_description", event.target.value)}
                  />
                </div>
                <div>
                  <Label>Activité *</Label>
                  <textarea
                    className={`${input} min-h-24`}
                    value={sequence.activity_description}
                    onChange={(event) => update(index, "activity_description", event.target.value)}
                  />
                </div>
                <div>
                  <Label>Sorties</Label>
                  <textarea
                    className={`${input} min-h-24`}
                    value={sequence.output_description}
                    onChange={(event) => update(index, "output_description", event.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Sous-activités</Label>
                  <textarea
                    className={`${input} min-h-20`}
                    value={sequence.sub_activities.join("\n")}
                    onChange={(event) =>
                      update(
                        index,
                        "sub_activities",
                        event.target.value
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="Une sous-activité par ligne"
                  />
                </div>
                <SequenceProcessField
                  label="Processus fournisseurs en amont"
                  value={sequence.supplier_processes}
                  options={processOptions}
                  onChange={(value) => update(index, "supplier_processes", value)}
                />
                <SequenceProcessField
                  label="Processus clients en aval"
                  value={sequence.client_processes}
                  options={processOptions}
                  onChange={(value) => update(index, "client_processes", value)}
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Responsable de la séquence</Label>
                  <select
                    className={input}
                    value={sequence.responsible_user_id ?? ""}
                    onChange={(event) => update(index, "responsible_user_id", event.target.value)}
                  >
                    <option value="">Non assigné</option>
                    {(usersQuery.data ?? []).map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Durée (minutes)</Label>
                  <input
                    className={input}
                    type="number"
                    min="1"
                    value={sequence.duration_minutes ?? ""}
                    onChange={(event) =>
                      update(
                        index,
                        "duration_minutes",
                        event.target.value ? Number(event.target.value) : undefined,
                      )
                    }
                    placeholder="Ex. 30"
                  />
                </div>
              </div>
              {(sequence.documents ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Documents :</span>
                  {(sequence.documents ?? []).map((document) => (
                    <span
                      key={String(document.id)}
                      className="rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary"
                    >
                      {String(document.title ?? document.code ?? document.id)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sequences.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <Layers3 className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-semibold">Aucune séquence enregistrée</p>
              <button type="button" className={`${primary} mt-4`} onClick={add}>
                <Plus className="h-4 w-4" /> Ajouter la première séquence
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
