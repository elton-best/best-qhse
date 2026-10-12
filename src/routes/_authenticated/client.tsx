import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  Clock,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareWarning,
  Plus,
  Smile,
  Star,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { backendApi } from "@/integrations/backend/client";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import logoAsset from "@/assets/bestqhse-logo.png.asset.json";

type Section = "dashboard" | "plaintes" | "notifications" | "satisfaction" | "profil" | "aide";
const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "plaintes", label: "Mes plaintes", icon: MessageSquareWarning },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "satisfaction", label: "Satisfaction client", icon: Smile },
  { id: "profil", label: "Mon profil", icon: User },
  { id: "aide", label: "Aide & support", icon: HelpCircle },
];

export const Route = createFileRoute("/_authenticated/client")({
  validateSearch: (s: Record<string, unknown>): { s?: Section } =>
    SECTIONS.some((x) => x.id === s["s"]) ? { s: s["s"] as Section } : {},
  head: () => ({
    meta: [
      { title: "Espace client — LOGIQUALI" },
      {
        name: "description",
        content: "Déposez et suivez vos plaintes, répondez aux enquêtes de satisfaction.",
      },
    ],
  }),
  loader: () => getMyProfile(),
  component: ClientSpace,
  errorComponent: () => (
    <p className="p-8 text-sm text-muted-foreground">Impossible de charger votre espace.</p>
  ),
});

type Rec = {
  id: string;
  kind: string;
  reference: string;
  title: string;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
const KEY = ["client-records"];
const STATUS_TONE: Record<string, string> = {
  "En attente": "bg-warning/15 text-warning-foreground",
  "En cours": "bg-info/15 text-info",
  Résolue: "bg-success/15 text-success",
  Fermée: "bg-secondary text-muted-foreground",
};
// Cycle de vie Vue (clientb) : pending -> in_progress -> resolved -> closed.
const clientStatus = (v: unknown) =>
  (
    ({
      open: "En attente",
      pending: "En attente",
      in_progress: "En cours",
      resolved: "Résolue",
      closed: "Fermée",
    }) as Record<string, string>
  )[String(v)] ?? String(v ?? "En attente");
const backendStatus = (v: string) =>
  (
    ({
      "En attente": "pending",
      "En cours": "in_progress",
      Résolue: "resolved",
      Fermée: "closed",
    }) as Record<string, string>
  )[v] ?? "pending";
// Catégories Vue (ComplaintCreate) affichées en FR, stockées normalisées côté Laravel.
const CATEGORY_FR: Record<string, string> = {
  product_quality: "Qualité produit",
  product_defect: "Qualité produit",
  service_quality: "Service client",
  delivery_delay: "Livraison",
  delivery_error: "Livraison",
  billing: "Facturation",
  other: "Autre",
  product: "Qualité produit",
  service: "Service client",
  delivery: "Livraison",
  quality: "Qualité produit",
  "Service client": "Service client",
  Livraison: "Livraison",
  "Qualité produit": "Qualité produit",
  Facturation: "Facturation",
  Autre: "Autre",
};
const categoryFr = (v: unknown) => CATEGORY_FR[String(v ?? "")] ?? String(v ?? "Autre");
const PRIORITY_FR: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  urgent: "Urgente",
};
const priorityFr = (v: unknown) => PRIORITY_FR[String(v ?? "")] ?? String(v ?? "—");

function listFrom(payload: unknown): Record<string, unknown>[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = root.data;
  return (Array.isArray(data) ? data : Array.isArray(payload) ? payload : []) as Record<
    string,
    unknown
  >[];
}
function normalizeRec(item: Record<string, unknown>, kind: string): Rec {
  const attrs =
    item.attributes && typeof item.attributes === "object"
      ? (item.attributes as Record<string, unknown>)
      : item;
  const rels =
    item.relationships && typeof item.relationships === "object"
      ? (item.relationships as Record<string, unknown>)
      : {};
  const relSite = (rels.site as Record<string, unknown> | undefined)?.data as
    | Record<string, unknown>
    | undefined;
  const siteAttrs =
    relSite?.attributes && typeof relSite.attributes === "object"
      ? (relSite.attributes as Record<string, unknown>)
      : undefined;
  const status =
    kind === "client_survey" &&
    ((Array.isArray(attrs.responses) && attrs.responses.length > 0) || attrs.total_score != null)
      ? "Résolue"
      : clientStatus(attrs.status);
  const siteName =
    (attrs.site as Record<string, unknown> | undefined)?.name ??
    siteAttrs?.name ??
    attrs.client_company ??
    attrs.site_name;
  return {
    id: String(item.id ?? attrs.id),
    kind,
    reference: String(attrs.reference ?? attrs.ref ?? `${kind}-${item.id ?? ""}`),
    title: String(attrs.title ?? attrs.subject ?? attrs.name ?? "Sans titre"),
    status,
    data: {
      ...attrs,
      category_fr: categoryFr(attrs.category),
      priority_fr: priorityFr(attrs.priority),
      description: attrs.description ?? attrs.message,
      company:
        siteName != null
          ? String(siteName)
          : attrs.client_company != null
            ? String(attrs.client_company)
            : undefined,
      site_name: siteName != null ? String(siteName) : undefined,
    },
    created_at: String(attrs.created_at ?? new Date().toISOString()),
    updated_at: String(attrs.updated_at ?? attrs.created_at ?? new Date().toISOString()),
  };
}

function useClientRecords() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const [complaints, surveys, tickets] = await Promise.all([
        backendApi.request<unknown>("complaints?per_page=100"),
        backendApi
          .request<unknown>("satisfaction-surveys?per_page=100")
          .catch(() => ({ data: [] })),
        // Route réelle : /api/v1/clientb/support/tickets (voir backend/routes/modules/clientb.php).
        backendApi.request<unknown>("clientb/support/tickets?per_page=100").catch(() => ({ data: [] })),
      ]);
      return [
        ...listFrom(complaints).map((x) => normalizeRec(x, "client_complaint")),
        ...listFrom(surveys).map((x) => normalizeRec(x, "client_survey")),
        ...listFrom(tickets).map((x) => normalizeRec(x, "client_ticket")),
      ];
    },
  });
}

function useCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      kind: string;
      prefix: string;
      title: string;
      status: string;
      data: Record<string, unknown>;
      count: number;
      target?: string;
    }) => {
      if (v.kind === "client_ticket") {
        return backendApi.request("clientb/support/tickets", {
          method: "POST",
          body: JSON.stringify({
            type: "assistance_request",
            subject: v.title,
            message: String(v.data.message ?? ""),
          }),
        });
      }
      if (v.kind !== "client_complaint")
        throw new Error("Ce type de demande n'est pas encore exposé par le backend.");
      // Aligne Vue ComplaintCreate : champs customer_*, priorité, réponse souhaitée, solution attendue.
      return backendApi.request("complaints", {
        method: "POST",
        body: JSON.stringify({
          site_id: v.target ? Number(v.target) : undefined,
          title: v.title,
          description: String(v.data.description ?? ""),
          category: v.data.category,
          priority: v.data.priority ?? "medium",
          customer_name: v.data.customer_name,
          customer_email: v.data.customer_email,
          customer_phone: v.data.customer_phone,
          customer_address: v.data.customer_address,
          client_name: v.data.customer_name ?? v.data.client_name,
          client_email: v.data.customer_email ?? v.data.client_email,
          client_phone: v.data.customer_phone,
          client_company: v.data.company ?? v.data.client_company,
          wants_email_response: v.data.wants_email_response ?? true,
          wants_mail: v.data.wants_email_response ?? true,
          expected_solution: v.data.expected_solution,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Plainte enregistrée");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "L'enregistrement a échoué, réessayez."),
  });
}

function useUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      kind?: "client_complaint" | "client_survey";
      data: Record<string, unknown>;
      remove?: boolean;
    }) => {
      if (v.remove) return backendApi.request(`complaints/${v.id}`, { method: "DELETE" });
      if (v.kind === "client_survey") {
        const score = Number(v.data.score ?? 0);
        const responses = Array.isArray(v.data.responses) ? [...v.data.responses, score] : [score];
        return backendApi.request(`satisfaction-surveys/${v.id}`, {
          method: "PUT",
          body: JSON.stringify({
            responses,
            total_score: score,
            satisfaction_level:
              score >= 4 ? "very_satisfied" : score >= 3 ? "satisfied" : "dissatisfied",
          }),
        });
      }
      // Plainte : seuls title/description/category/priority + satisfaction (1-5) sont
      // persistés côté Laravel (voir ComplaintController). Pas de history/unread/rating fantômes.
      const payload: Record<string, unknown> = {};
      if (v.data.title !== undefined) payload.title = v.data.title;
      if (v.data.description !== undefined) payload.description = v.data.description;
      if (v.data.category !== undefined) payload.category = v.data.category;
      if (v.data.priority !== undefined) payload.priority = v.data.priority;
      if (v.data.wants_email_response !== undefined)
        payload.wants_email_response = v.data.wants_email_response;
      if (v.data.expected_solution !== undefined)
        payload.expected_solution = v.data.expected_solution;
      if (v.data.customer_address !== undefined)
        payload.customer_address = v.data.customer_address;
      if (v.data.satisfaction_rating !== undefined)
        payload.satisfaction_rating = v.data.satisfaction_rating;
      if (v.data.satisfaction_comment !== undefined)
        payload.satisfaction_comment = v.data.satisfaction_comment;
      return backendApi.request(`complaints/${v.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success("Mis à jour");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible."),
  });
}

const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const card = "rounded-2xl border border-border bg-card p-5";
const inputCls =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary";

function ClientSpace() {
  const profile = Route.useLoaderData();
  const { s = "dashboard" } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobile, setMobile] = useState(false);
  const { data: recs = [] } = useClientRecords();
  const complaints = recs.filter((r) => r.kind === "client_complaint");
  // Pas de flag "unread" côté Laravel : on signale les plaintes en attente de suivi
  // (En attente / En cours), comme Vue (pastilles pending/in_progress).
  const unread = complaints.filter((c) => c.status === "En attente" || c.status === "En cours").length;
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Client";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await backendApi.auth.logout();
    navigate({ to: "/auth/login", replace: true });
  };

  const nav = (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border">
          <img src={logoAsset.url} alt="LOGIQUALI" className="h-6 w-auto" />
        </span>
        <div className="flex-1">
          <p className="font-display font-extrabold text-foreground">LOGIQUALI</p>
          <p className="text-[11px] font-semibold text-muted-foreground">Espace Client</p>
        </div>
        <button className="lg:hidden" onClick={() => setMobile(false)} aria-label="Fermer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {SECTIONS.map((x) => (
          <Link
            key={x.id}
            to="/client"
            search={{ s: x.id }}
            onClick={() => setMobile(false)}
            className={`flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-semibold ${s === x.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <x.icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{x.label}</span>
            {x.id === "plaintes" && unread > 0 && (
              <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-border p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
        </div>
        <button
          onClick={signOut}
          aria-label="Se déconnecter"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside className="hidden w-[260px] shrink-0 border-r border-border lg:block">{nav}</aside>
      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px]">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <button
            onClick={() => setMobile(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-lg font-bold text-foreground">
            {SECTIONS.find((x) => x.id === s)?.label}
          </h1>
          <div className="ml-auto" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            {s === "dashboard" && <Dashboard name={name} complaints={complaints} />}
            {s === "plaintes" && <Complaints complaints={complaints} />}
            {s === "notifications" && <Notifications complaints={complaints} />}
            {s === "satisfaction" && (
              <Satisfaction surveys={recs.filter((r) => r.kind === "client_survey")} />
            )}
            {s === "profil" && <Profile profile={profile} />}
            {s === "aide" && <Help tickets={recs.filter((r) => r.kind === "client_ticket")} />}
          </div>
        </main>
      </div>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_TONE[status] ?? "bg-secondary text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function Dashboard({ name, complaints }: { name: string; complaints: Rec[] }) {
  const n = (st: string) => complaints.filter((c) => c.status === st).length;
  // Vue : Total / En attente / En cours / Clôturées (resolved + closed).
  const closed = n("Résolue") + n("Fermée");
  const rate = complaints.length ? Math.round((closed / complaints.length) * 100) : 0;
  const stats = [
    { label: "Total plaintes", v: complaints.length, cls: "text-primary" },
    { label: "En attente", v: n("En attente"), cls: "text-warning-foreground" },
    { label: "En cours", v: n("En cours"), cls: "text-info" },
    { label: "Résolues", v: n("Résolue"), cls: "text-success" },
    { label: "Fermées", v: n("Fermée"), cls: "text-muted-foreground" },
    { label: "Taux de résolution", v: `${rate} %`, cls: "text-success" },
  ];
  return (
    <div className="space-y-6">
      <div className={card}>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          {new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-foreground">Bonjour {name}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/client"
            search={{ s: "plaintes" }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Déposer une plainte
          </Link>
          <Link
            to="/client"
            search={{ s: "satisfaction" }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-success-foreground"
          >
            <Smile className="h-4 w-4" /> Répondre à une enquête
          </Link>
          <Link
            to="/client"
            search={{ s: "aide" }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"
          >
            <HelpCircle className="h-4 w-4" /> Contacter le support
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((x) => (
          <div key={x.label} className={card}>
            <p className={`font-display text-3xl font-bold ${x.cls}`}>{x.v}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{x.label}</p>
          </div>
        ))}
      </div>
      <div className={card}>
        <h3 className="font-display font-bold text-foreground">Plaintes récentes</h3>
        <ul className="mt-3 divide-y divide-border">
          {complaints.slice(0, 5).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {c.reference} · {c.title}
                </p>
                <p className="text-xs text-muted-foreground">Déposée le {fmt(c.created_at)}</p>
              </div>
              <Badge status={c.status} />
            </li>
          ))}
          {complaints.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">Aucune plainte pour l'instant.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Complaints({ complaints }: { complaints: Rec[] }) {
  const profile = Route.useLoaderData();
  const create = useCreate();
  const update = useUpdate();
  const [open, setOpen] = useState<Rec | null>(null);
  const [form, setForm] = useState(false);
  const [filter, setFilter] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [f, setF] = useState({
    title: "",
    company: "",
    category: "Qualité produit",
    priority: "medium",
    description: "",
    wants_email_response: true,
    expected_solution: "",
    signature: false,
  });
  const customerName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Client";
  const { data: companies = [] } = useQuery({
    queryKey: ["sites", "client", siteSearch],
    queryFn: async () => {
      // Autocomplete Vue : /sites/search?q= (min 2 lettres, vide = tous du périmètre).
      const q = siteSearch.trim();
      const path = q.length >= 2 ? `sites/search?q=${encodeURIComponent(q)}` : "sites/search";
      try {
        const payload = await backendApi.request<unknown>(path);
        return listFrom(payload).map((item) => {
          const attrs =
            item.attributes && typeof item.attributes === "object"
              ? (item.attributes as Record<string, unknown>)
              : (item as Record<string, unknown>);
          const label =
            (item as Record<string, unknown>).label ??
            attrs.label ??
            `${String(attrs.name ?? "Site")}${attrs.city ? ` - ${String(attrs.city)}` : attrs.location ? ` - ${String(attrs.location)}` : ""}`;
          return {
            id: String(item.id ?? attrs.id),
            name: String(label),
          };
        });
      } catch {
        const payload = await backendApi.request<unknown>("sites?per_page=100");
        return listFrom(payload).map((item) => {
          const attrs =
            item.attributes && typeof item.attributes === "object"
              ? (item.attributes as Record<string, unknown>)
              : (item as Record<string, unknown>);
          return {
            id: String(item.id ?? attrs.id),
            name: String(attrs.name ?? attrs.location ?? "Site"),
          };
        });
      }
    },
  });
  const list = complaints.filter((c) => !filter || c.status === filter);

  if (open) {
    const c = complaints.find((x) => x.id === open.id) ?? open;
    const reco = String(c.data["recommandations"] ?? "");
    const recoParts = reco ? reco.split("\n\n---\n").filter(Boolean) : [];
    const timeline: { at: string; text: string }[] = [
      { at: c.created_at, text: "Plainte déposée" },
      ...(c.updated_at !== c.created_at
        ? [{ at: c.updated_at, text: "Dernière mise à jour" }]
        : []),
      ...(c.data["response_date"]
        ? [{ at: String(c.data["response_date"]), text: "Réponse de l'entreprise" }]
        : []),
      ...(c.status === "Résolue"
        ? [{ at: c.updated_at, text: "Plainte résolue" }]
        : []),
      ...(c.status === "Fermée"
        ? [{ at: String(c.data["closed_date"] ?? c.updated_at), text: "Plainte fermée" }]
        : []),
    ];
    const satisfaction = c.data["satisfaction_rating"];
    return (
      <div className={card}>
        <button
          onClick={() => setOpen(null)}
          className="mb-4 text-sm font-semibold text-primary hover:underline"
        >
          ← Retour à mes plaintes
        </button>
        <p className="font-mono text-xs font-bold text-primary">{c.reference}</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-foreground">{c.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge status={c.status} />
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
            Priorité : {String(c.data["priority_fr"] ?? c.data["priority"] ?? "—")}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-muted-foreground">Site concerné</dt>
            <dd>{String(c.data["site_name"] ?? c.data["company"] ?? "—")}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">Catégorie</dt>
            <dd>{String(c.data["category_fr"] ?? c.data["category"] ?? "—")}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">Déposée le</dt>
            <dd>{fmt(c.created_at)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">Dernière mise à jour</dt>
            <dd>{fmt(c.updated_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-muted-foreground">Description</dt>
            <dd className="whitespace-pre-wrap">{String(c.data["description"] ?? "")}</dd>
          </div>
          {c.data["expected_solution"] ? (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-muted-foreground">Solution attendue</dt>
              <dd className="whitespace-pre-wrap">{String(c.data["expected_solution"])}</dd>
            </div>
          ) : null}
        </dl>
        {recoParts.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-display font-bold">Réponses de l’entreprise</h3>
            {recoParts.map((part, i) => (
              <p key={i} className="mt-2 whitespace-pre-wrap rounded-xl bg-secondary/50 p-3 text-sm">
                {part}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-info/10 p-4 text-center text-sm text-muted-foreground">
            En attente de réponse — votre réclamation est en cours de traitement.
          </p>
        )}
        <h3 className="mt-6 font-display font-bold">Suivi du traitement</h3>
        <ul className="mt-2 space-y-2 border-l-2 border-primary/20 pl-4 text-sm">
          {timeline.map((h, i) => (
            <li key={i}>
              <span className="text-xs text-muted-foreground">{fmt(h.at)}</span> — {h.text}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(c.status === "Résolue" || c.status === "Fermée") && satisfaction == null
            ? [1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => update.mutate({ id: c.id, data: { satisfaction_rating: n } })}
                  className="inline-flex h-10 items-center gap-1 rounded-xl bg-warning px-3 text-sm font-semibold text-warning-foreground"
                >
                  <Star className="h-4 w-4" />
                  {n}
                </button>
              ))
            : null}
          {satisfaction != null ? (
            <p className="text-sm font-semibold text-success">
              Votre note : {String(satisfaction)}/5 — merci !
            </p>
          ) : null}
          {c.status === "En attente" && (
            <button
              onClick={() => {
                if (confirm("Retirer cette plainte ?"))
                  update.mutate({ id: c.id, kind: "client_complaint", data: c.data, remove: true });
              }}
              className="inline-flex h-10 items-center rounded-xl bg-destructive/10 px-4 text-sm font-semibold text-destructive"
            >
              Retirer la plainte
            </button>
          )}
        </div>
      </div>
    );
  }

  if (form) {
    return (
      <form
        className={`${card} space-y-4`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.title.trim() || f.title.trim().length > 100) {
            toast.error("Objet obligatoire (100 caractères max).");
            return;
          }
          if (!f.description.trim() || f.description.trim().length < 10) {
            toast.error("Description obligatoire (10 caractères minimum).");
            return;
          }
          if (!f.company) {
            toast.error("Choisissez le site concerné.");
            return;
          }
          if (!f.signature) {
            toast.error("Veuillez certifier l'exactitude des informations.");
            return;
          }
          const co = companies.find((x) => x.id === f.company);
          await create.mutateAsync({
            kind: "client_complaint",
            prefix: "PLT",
            title: f.title.trim(),
            status: "En attente",
            count: complaints.length,
            target: f.company,
            data: {
              company: co?.name ?? "",
              category: f.category,
              priority: f.priority,
              description: f.description.trim(),
              customer_name: customerName,
              customer_email: profile.email,
              customer_phone: profile.phone ?? undefined,
              wants_email_response: f.wants_email_response,
              expected_solution: f.expected_solution.trim() || undefined,
            },
          });
          setForm(false);
          setF({
            title: "",
            company: "",
            category: "Qualité produit",
            priority: "medium",
            description: "",
            wants_email_response: true,
            expected_solution: "",
            signature: false,
          });
        }}
      >
        <button
          type="button"
          onClick={() => setForm(false)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          ← Retour
        </button>
        <h2 className="font-display text-xl font-bold">Déposer une plainte</h2>
        <p className="text-xs text-muted-foreground">
          Connecté en tant que {customerName} ({profile.email})
          {profile.phone ? ` — ${profile.phone}` : ""}. La référence sera générée automatiquement.
        </p>
        <input
          className={inputCls}
          placeholder="Objet * (100 caractères max)"
          maxLength={100}
          value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })}
        />
        <div>
          <input
            className={inputCls}
            placeholder="Rechercher un site (min 2 lettres)…"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
          />
          <select
            className={`${inputCls} mt-2`}
            value={f.company}
            onChange={(e) => setF({ ...f, company: e.target.value })}
          >
            <option value="">Site concerné *</option>
            {companies.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <select
          className={inputCls}
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
        >
          {[
            "Qualité produit",
            "Délai de livraison",
            "Service client",
            "Facturation",
            "Sécurité",
            "Autre",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["low", "Basse"],
              ["medium", "Moyenne"],
              ["high", "Haute"],
              ["urgent", "Urgente"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="flex items-center gap-2">
              <input
                type="radio"
                checked={f.priority === v}
                onChange={() => setF({ ...f, priority: v })}
              />
              {label}
            </label>
          ))}
        </div>
        <textarea
          className={`${inputCls} h-32 py-3`}
          placeholder="Description détaillée * (10 caractères minimum, 50 recommandés)"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.wants_email_response}
            onChange={(e) => setF({ ...f, wants_email_response: e.target.checked })}
          />
          Je souhaite recevoir la réponse par e-mail
        </label>
        <textarea
          className={`${inputCls} h-24 py-3`}
          placeholder="Solution attendue (optionnel)"
          value={f.expected_solution}
          onChange={(e) => setF({ ...f, expected_solution: e.target.value })}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={f.signature}
            onChange={(e) => setF({ ...f, signature: e.target.checked })}
          />
          Je certifie que les informations fournies sont exactes et je valide cette réclamation. *
        </label>
        <button
          disabled={create.isPending}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Envoyer la plainte
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filtrer par statut"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={`${inputCls} sm:w-60`}
        >
          <option value="">Tous les statuts ({complaints.length})</option>
          {Object.keys(STATUS_TONE).map((st) => (
            <option key={st} value={st}>
              {st} ({complaints.filter((c) => c.status === st).length})
            </option>
          ))}
        </select>
        <button
          onClick={() => setForm(true)}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Nouvelle plainte
        </button>
      </div>
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => {
                setOpen(c);
              }}
              className={`${card} flex w-full items-center justify-between gap-3 text-left hover:border-primary`}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary">
                  {c.reference} · {String(c.data["category_fr"] ?? c.data["category"] ?? "")} ·{" "}
                  {String(c.data["priority_fr"] ?? "")}
                </p>
                <p className="truncate font-semibold text-foreground">{c.title}</p>
                <p className="text-xs text-muted-foreground">
                  {String(c.data["site_name"] ?? c.data["company"] ?? "")} · {fmt(c.created_at)}
                </p>
              </div>
              <Badge status={c.status} />
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted-foreground">Aucune plainte.</li>}
      </ul>
    </div>
  );
}

function Notifications({ complaints }: { complaints: Rec[] }) {
  // Laravel ne stocke pas de history : on reconstruit depuis created/updated/response/closed + recommandations.
  const items = complaints
    .flatMap((c) => {
      const rows: { c: Rec; at: string; text: string }[] = [
        { c, at: c.created_at, text: "Plainte déposée" },
      ];
      if (c.data["recommandations"]) rows.push({ c, at: c.updated_at, text: "Réponse de l'entreprise reçue" });
      if (c.status === "Résolue") rows.push({ c, at: c.updated_at, text: "Plainte résolue" });
      if (c.status === "Fermée") rows.push({ c, at: String(c.data["closed_date"] ?? c.updated_at), text: "Plainte fermée" });
      else if (c.status === "En cours") rows.push({ c, at: c.updated_at, text: "Plainte en cours de traitement" });
      return rows;
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ul className="space-y-2">
      {items.map((n, i) => (
        <li key={i} className={`${card} flex gap-3`}>
          {n.text.includes("résolue") || n.text.includes("fermée") ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          ) : (
            <Clock className="h-5 w-5 shrink-0 text-info" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {n.c.reference} · {n.text}
            </p>
            <p className="text-xs text-muted-foreground">
              {fmt(n.at)} · {n.c.title}
            </p>
          </div>
        </li>
      ))}
      {items.length === 0 && (
        <li className="text-sm text-muted-foreground">Aucune notification.</li>
      )}
    </ul>
  );
}

function Satisfaction({ surveys }: { surveys: Rec[] }) {
  const update = useUpdate();
  const [scores, setScores] = useState<Record<string, number>>({});
  return (
    <ul className="space-y-3">
      {surveys.map((s) => (
        <li key={s.id} className={card}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{s.title}</p>
            <Badge status={s.status === "Résolue" ? "Résolue" : "En attente"} />
          </div>
          <p className="text-xs text-muted-foreground">
            {String(s.data["site_name"] ?? s.data["company"] ?? "")} · reçue le {fmt(s.created_at)}
          </p>
          {s.status === "Résolue" ? (
            <p className="mt-2 text-sm font-semibold text-success">
              Votre note : {String(s.data["total_score"] ?? s.data["score"] ?? "—")}/5
              {s.data["satisfaction_level"] ? ` — ${String(s.data["satisfaction_level"])}` : ""}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setScores({ ...scores, [s.id]: n })}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${scores[s.id] === n ? "bg-warning text-warning-foreground" : "border border-border"}`}
                >
                  {n}
                </button>
              ))}
              <button
                disabled={!scores[s.id]}
                onClick={() =>
                  update.mutate({
                    id: s.id,
                    kind: "client_survey",
                    data: { ...s.data, score: scores[s.id] },
                  })
                }
                className="inline-flex h-10 items-center rounded-xl bg-success px-4 text-sm font-semibold text-success-foreground disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
          )}
        </li>
      ))}
      {surveys.length === 0 && (
        <li className="text-sm text-muted-foreground">Aucune enquête reçue.</li>
      )}
    </ul>
  );
}

function Profile({ profile }: { profile: Awaited<ReturnType<typeof getMyProfile>> }) {
  const [f, setF] = useState({
    first_name: profile.first_name,
    last_name: profile.last_name,
    phone: profile.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`${card} max-w-xl space-y-4`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await updateMyProfile(f);
          toast.success("Profil mis à jour");
        } catch {
          toast.error("Mise à jour impossible.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        E-mail : <b className="text-foreground">{profile.email}</b>
      </p>
      <input
        className={inputCls}
        placeholder="Prénom"
        value={f.first_name}
        onChange={(e) => setF({ ...f, first_name: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Nom"
        value={f.last_name}
        onChange={(e) => setF({ ...f, last_name: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Téléphone"
        value={f.phone}
        onChange={(e) => setF({ ...f, phone: e.target.value })}
      />
      <button
        disabled={busy}
        className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Enregistrer
      </button>
    </form>
  );
}

function Help({ tickets }: { tickets: Rec[] }) {
  const create = useCreate();
  const [msg, setMsg] = useState("");
  const faq = [
    ["Comment déposer une plainte ?", "Menu « Mes plaintes » puis « Nouvelle plainte »."],
    [
      "Quel est le délai de traitement ?",
      "L'entreprise concernée répond en général sous 5 jours ouvrés.",
    ],
    ["Puis-je retirer une plainte ?", "Oui, tant qu'elle est « En attente », depuis sa fiche."],
  ];
  return (
    <div className="space-y-6">
      <div className={card}>
        <h3 className="font-display font-bold">Questions fréquentes</h3>
        {faq.map(([q, a]) => (
          <details key={q} className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold">{q}</summary>
            <p className="mt-1 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
      <form
        className={`${card} space-y-3`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!msg.trim()) return;
          await create.mutateAsync({
            kind: "client_ticket",
            prefix: "SUP",
            title: msg.slice(0, 80),
            status: "En attente",
            data: { message: msg },
            count: tickets.length,
          });
          setMsg("");
        }}
      >
        <h3 className="font-display font-bold">Contacter le support</h3>
        <textarea
          className={`${inputCls} h-28 py-3`}
          placeholder="Votre message"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
        />
        <button
          disabled={create.isPending}
          className="inline-flex h-11 items-center rounded-xl bg-info px-5 text-sm font-semibold text-info-foreground"
        >
          Envoyer
        </button>
        {tickets.map((t) => (
          <p key={t.id} className="text-xs text-muted-foreground">
            {t.reference} · {fmt(t.created_at)} · {t.status}
          </p>
        ))}
      </form>
    </div>
  );
}
