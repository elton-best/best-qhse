import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Clock, MapPin, Menu, Search, Stamp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backendApi } from "@/integrations/backend/client";
import { useAccessibleSubModules } from "@/integrations/backend/access";
import { normFamily, useEnterpriseNorms } from "@/integrations/backend/norms";
import { AppSidebar } from "@/components/app/AppSidebar";
import { BackButton } from "@/components/app/BackButton";
import { LqButton } from "@/components/lq/LqButton";
import { getMyProfile } from "@/lib/profile.functions";
import { dueOf, isOverdue, useRecords, type QRecord } from "@/hooks/use-records";
import { useCurrentSite, useWorkspace } from "@/hooks/use-workspace";
import { KINDS, sectionForKind } from "@/components/app/sections";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Espace entreprise — LOGIQUALI" },
      { name: "description", content: "Pilotez votre système de management QHSE." },
    ],
  }),
  loader: async () => {
    const p = await getMyProfile();
    if (p.user_type === "super_admin") throw redirect({ to: "/superadmin" });
    if (p.account_type === "individual") throw redirect({ to: "/client" });
    return p;
  },
  component: AppLayout,
  errorComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="font-display text-xl font-bold text-foreground">
          Impossible de charger votre espace
        </h1>
        <LqButton to="/" variant="ghost" className="mt-6">
          Retour à l'accueil
        </LqButton>
      </div>
    </div>
  ),
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Page introuvable.</p>,
});

function AppLayout() {
  const profile = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: records = [] } = useRecords();
  const [site, setSite] = useCurrentSite();
  const { data: normCatalog } = useEnterpriseNorms({ site_id: site || undefined });
  const ws = useWorkspace(records, profile.created_at, profile.email ?? "");
  const sites = records.filter((r) => r.kind === "site" && r.status !== "Archivé");
  const backendActiveNorms = normCatalog
    ? new Set(normCatalog.norms.map((norm) => normFamily(norm.code)))
    : undefined;
  const { data: accessibleSubModules } = useAccessibleSubModules(site || undefined);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const alerts = useMemo(() => {
    const in30 = Date.now() + 30 * 86_400_000;
    const out: { r: QRecord; label: string; tone: "danger" | "warn" | "info" }[] = [];
    for (const r of records) {
      if (r.kind === "action" && isOverdue(r))
        out.push({
          r,
          label: `Action en retard (${new Date(dueOf(r)!).toLocaleDateString("fr-FR")})`,
          tone: "danger",
        });
      else if (r.kind === "document" && r.status === "En approbation")
        out.push({ r, label: "Document en attente d'approbation", tone: "info" });
      else if (
        r.kind === "habilitation" &&
        r.status !== "Archivé" &&
        r.data["expiry"] &&
        new Date(String(r.data["expiry"])).getTime() < in30
      )
        out.push({
          r,
          label: `Habilitation expirant le ${new Date(String(r.data["expiry"])).toLocaleDateString("fr-FR")}`,
          tone: "warn",
        });
    }
    return out;
  }, [records]);

  const openRecord = (r: QRecord) => {
    const section = sectionForKind(r.kind);
    setSearchOpen(false);
    if (section) navigate({ to: "/app/$section", params: { section }, search: { open: r.id } });
  };

  useEffect(() => {
    setCollapsed(localStorage.getItem("lq-sidebar") === "1");
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("lq-sidebar", c ? "0" : "1");
      return !c;
    });
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await backendApi.auth.logout();
    navigate({ to: "/auth/login", replace: true });
  };

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const sidebarProps = {
    name,
    email: profile.email ?? "",
    company: profile.company_name ?? "",
    onSignOut: signOut,
    activeNorms: backendActiveNorms,
    accessible: accessibleSubModules,
    counts: {
      taches: ws.tasks.length,
      verification: ws.verifyCount,
      approbation: ws.approveCount,
      sites: sites.length,
    },
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <aside
        className={`hidden shrink-0 border-r border-border transition-[width] duration-300 lg:block ${
          collapsed ? "w-[76px]" : "w-[272px]"
        }`}
      >
        <AppSidebar collapsed={collapsed} onToggle={toggle} {...sidebarProps} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] shadow-2xl">
            <AppSidebar
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
              {...sidebarProps}
            />
          </aside>
        </div>
      )}

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Référence (DOC-001, NC-002…) ou intitulé" />
        <CommandList>
          <CommandEmpty>Aucun résultat.</CommandEmpty>
          <CommandGroup heading="Enregistrements">
            {records
              .filter((r) => r.kind !== "norm" && r.kind !== "subscription_request")
              .slice(0, 400)
              .map((r) => (
                <CommandItem
                  key={r.id}
                  value={`${r.reference} ${r.title} ${r.id}`}
                  onSelect={() => openRecord(r)}
                >
                  <span className="font-mono text-xs font-bold text-primary">{r.reference}</span>
                  <span className="truncate">{r.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {KINDS[r.kind]?.singular}
                  </span>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 md:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border lg:hidden"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BackButton fallback="/app" />
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-full border border-input bg-background px-4 text-left text-sm text-muted-foreground hover:border-primary md:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 truncate">Rechercher (réf. ou intitulé)…</span>
            <kbd className="hidden rounded border border-border px-1.5 text-[10px] font-bold sm:inline">
              Ctrl K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <label className="relative flex items-center">
              <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
              <select
                aria-label="Site actif"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="h-10 w-auto min-w-0 max-w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm font-semibold outline-none focus:border-primary sm:max-w-[200px]"
              >
                <option value="">Tous les sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-primary"
                  aria-label="Notifications"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {alerts.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {alerts.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-0">
                <p className="border-b border-border px-4 py-3 text-sm font-bold text-foreground">
                  Alertes urgentes ({alerts.length})
                </p>
                <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
                  {alerts.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Aucune alerte. Tout est à jour.
                    </li>
                  )}
                  {alerts.slice(0, 30).map(({ r, label, tone }) => {
                    const Icon =
                      tone === "danger" ? AlertTriangle : tone === "warn" ? Clock : Stamp;
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => openRecord(r)}
                          className="flex w-full gap-3 px-4 py-3 text-left hover:bg-secondary"
                        >
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "danger" ? "text-destructive" : "text-primary"}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {r.reference} · {r.title}
                            </span>
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
