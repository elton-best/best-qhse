import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, Building2, CreditCard, FileSearch, LayoutDashboard, LogOut, Menu, Package, ScrollText,
  Settings, ShieldCheck, UserCog, X, type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import logoAsset from "@/assets/bestqhse-logo.png.asset.json";
import { BackButton } from "../app/BackButton";
import { backendApi, type BackendProfile } from "@/integrations/backend/client";
import { meetsPasswordPolicy, passwordRequirements } from "@/lib/password-strength";
import { BackendApiError } from "@/integrations/backend/client";
import { useSaMutations, useSaStats } from "@/integrations/backend/superadmin";
import { StepUpProvider } from "./StepUp";
import { btnPrimary, field, muted, panel } from "./sa-ui";

export type SaSection =
  | "dashboard" | "kyc" | "entreprises" | "abonnements" | "offres" | "normes" | "journaux" | "equipe" | "parametres";

export const SA_NAV: { slug: SaSection; label: string; icon: LucideIcon; group: string }[] = [
  { slug: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, group: "Pilotage" },
  { slug: "kyc", label: "Validation KYC", icon: ShieldCheck, group: "Entreprises" },
  { slug: "entreprises", label: "Entreprises", icon: Building2, group: "Entreprises" },
  { slug: "abonnements", label: "Abonnements", icon: CreditCard, group: "Offres" },
  { slug: "offres", label: "Offres", icon: Package, group: "Offres" },
  { slug: "normes", label: "Normes", icon: BookOpen, group: "Référentiels" },
  { slug: "journaux", label: "Journaux de sécurité", icon: ScrollText, group: "Contrôle" },
  { slug: "equipe", label: "Équipe plateforme", icon: UserCog, group: "Contrôle" },
  { slug: "parametres", label: "Paramètres et sessions", icon: Settings, group: "Contrôle" },
];

/** Changement de mot de passe obligatoire à la première connexion (le serveur bloque tout le reste). */
function PasswordGate({ onDone }: { onDone: () => void }) {
  const mutations = useSaMutations();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!meetsPasswordPolicy(password) || password !== confirm) {
      setError("Le mot de passe ne respecte pas les critères ou les deux saisies diffèrent.");
      return;
    }
    setError("");
    try {
      await mutations.changeOwnPassword.mutateAsync(password);
      toast.success("Mot de passe mis à jour.");
      onDone();
    } catch (e) {
      const detail = e instanceof BackendApiError ? [e.errors["password"]].flat()[0] : undefined;
      setError(
        typeof detail === "string" && detail.trim()
          ? `${detail} Respectez les critères ci-dessus.`
          : e instanceof Error
            ? e.message
            : "Mise à jour impossible.",
      );
    }
  };

  const requirements = passwordRequirements(password);
  const matches = password !== "" && password === confirm;

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-950 p-4">
      <form onSubmit={submit} className={`${panel} w-full max-w-md space-y-4 p-6`}>
        <h1 className="font-display text-xl font-extrabold">Définissez votre mot de passe</h1>
        <p className={muted}>
          Pour des raisons de sécurité, le mot de passe initial du compte d'administration doit être remplacé avant de continuer.
        </p>
        <input type="password" className={field} placeholder="Nouveau mot de passe" autoComplete="new-password" aria-label="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" className={field} placeholder="Confirmer le mot de passe" autoComplete="new-password" aria-label="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ul className="space-y-1 text-sm" aria-label="Critères du mot de passe">
          {[...requirements, { label: "Les deux saisies sont identiques", ok: matches }].map((requirement) => (
            <li key={requirement.label} className={requirement.ok ? "text-emerald-700" : "text-muted-foreground"}>
              {requirement.ok ? "✓" : "○"} {requirement.label}
            </li>
          ))}
        </ul>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={mutations.changeOwnPassword.isPending || !meetsPasswordPolicy(password) || !matches}>
          Enregistrer et continuer
        </button>
      </form>
    </div>
  );
}

/** Coque de l'espace d'administration : volontairement distincte de l'espace entreprise. */
export function SuperAdminShell({ profile, active, children }: { profile: BackendProfile; active: SaSection; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const { data: stats } = useSaStats();
  const mustChange = profile.raw["must_change_password"] === true && !passwordChanged;

  if (mustChange) return <PasswordGate onDone={() => setPasswordChanged(true)} />;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await backendApi.auth.logout();
    navigate({ to: "/auth/login", replace: true });
  };

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const groups = [...new Set(SA_NAV.map((item) => item.group))];
  const pending = stats?.kyc.pending ?? 0;

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Administration">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-400">{group}</p>
          {SA_NAV.filter((item) => item.group === group).map((item) => (
            <Link
              key={item.slug}
              to="/superadmin/$section"
              params={{ section: item.slug }}
              onClick={() => setOpen(false)}
              className={`flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                active === item.slug ? "bg-primary text-primary-foreground" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.slug === "kyc" && pending > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold leading-4 text-slate-900">{pending}</span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
        <img src={logoAsset.url} alt="LOGIQUALI" className="h-6 w-auto" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-extrabold text-white">LOGIQUALI</p>
        <p className="text-[11px] font-semibold text-amber-300">Administration plateforme</p>
      </div>
    </div>
  );

  return (
    <StepUpProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-background">
        <aside className="hidden w-[272px] shrink-0 flex-col bg-slate-900 lg:flex">
          {brand}
          {nav}
        </aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-slate-900 shadow-2xl">
              <button type="button" className="absolute right-3 top-4 text-slate-300" onClick={() => setOpen(false)} aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </button>
              {brand}
              {nav}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            <button type="button" className="rounded-xl p-2 hover:bg-secondary lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
              <Menu className="h-5 w-5" />
            </button>
            <BackButton fallback="/superadmin/dashboard" />
            <FileSearch className="hidden h-5 w-5 text-primary sm:block" />
            <p className="hidden text-sm font-semibold text-muted-foreground sm:block">Espace réservé à l'administration de la plateforme</p>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-bold leading-tight">{name}</p>
                <p className="text-xs text-muted-foreground">Super administrateur</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                aria-label="Se déconnecter"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">{children}</div>
          </main>
        </div>
      </div>
    </StepUpProvider>
  );
}
