import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Eye,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { backendApi } from "@/integrations/backend/client";

const card = "rounded-2xl border border-border bg-card";
const input =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-dark`;
const secondary = `${button} border border-border bg-card hover:border-primary hover:text-primary`;
const muted = "text-sm text-muted-foreground";

type Site = {
  id: string;
  name: string;
  ref: string;
  location: string;
  city: string;
  phone: string;
  email: string;
  is_headquarter: boolean;
  is_active: boolean;
  manager_id?: string | undefined;
  manager_name: string;
  manager_role?: string | undefined;
  users_count: number;
  processes_count: number;
  active_norms: string[];
  created_at: string;
  subscriptions: Record<string, unknown>[];
};

type SiteForm = {
  name: string;
  location: string;
  city: string;
  phone: string;
  email: string;
  is_headquarter: boolean;
  is_active: boolean;
};

type NewManager = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  address: string;
  start_date: string;
};

type SiteRole = {
  id: number;
  name: string;
  label?: string | undefined;
  permissions_count: number;
  permissions: string[];
};

type Offer = {
  id: number;
  name: string;
  description?: string | undefined;
  price: number;
  duration_months: number;
  is_active?: boolean | undefined;
};

const emptyForm: SiteForm = {
  name: "",
  location: "",
  city: "",
  phone: "",
  email: "",
  is_headquarter: false,
  is_active: true,
};
const emptyManager: NewManager = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  position: "",
  address: "",
  start_date: "",
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = objectOf(payload);
  if (Array.isArray(root["data"])) return root["data"];
  const data = objectOf(root["data"]);
  return Array.isArray(data["data"]) ? data["data"] : [];
}

function flatten(value: unknown): Record<string, unknown> {
  const raw = objectOf(value);
  const attrs = objectOf(raw["attributes"] ?? raw);
  const relationships = objectOf(raw["relationships"]);
  const manager = objectOf(relationships["manager"] ?? raw["manager"]);
  const managerAttrs = objectOf(manager["attributes"] ?? manager);
  const subscriptions = collection(relationships["subscriptions"] ?? raw["subscriptions"]);
  return { ...attrs, id: raw["id"] ?? attrs["id"], manager: managerAttrs, subscriptions };
}

function normalizeSite(value: unknown): Site {
  const raw = flatten(value);
  const manager = objectOf(raw["manager"]);
  const activeNorms = Array.isArray(raw["active_norms"]) ? raw["active_norms"].map(String) : [];
  return {
    id: String(raw["id"] ?? ""),
    name: String(raw["name"] ?? "Site sans nom"),
    ref: String(raw["ref"] ?? raw["code"] ?? ""),
    location: String(raw["location"] ?? raw["address"] ?? ""),
    city: String(raw["city"] ?? ""),
    phone: String(raw["phone"] ?? ""),
    email: String(raw["email"] ?? ""),
    is_headquarter: Boolean(raw["is_headquarter"]),
    is_active: raw["is_active"] !== false,
    manager_id: raw["manager_id"] == null ? undefined : String(raw["manager_id"]),
    manager_name: String(raw["manager_name"] ?? manager["name"] ?? manager["full_name"] ?? ""),
    manager_role: String(
      raw["manager_role"] ??
        (Array.isArray(manager["role_names"]) ? manager["role_names"][0] : undefined) ??
        raw["role"] ??
        "",
    ),
    users_count: Number(raw["users_count"] ?? 0),
    processes_count: Number(raw["processes_count"] ?? 0),
    active_norms: activeNorms,
    created_at: String(raw["created_at"] ?? ""),
    subscriptions: Array.isArray(raw["subscriptions"])
      ? raw["subscriptions"].map((item) => objectOf(item))
      : [],
  };
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fr-FR");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase()
    : (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

function SiteDialog({
  site,
  onClose,
  onSaved,
}: {
  site: Site | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<SiteForm>(() =>
    site
      ? {
          name: site.name,
          location: site.location,
          city: site.city,
          phone: site.phone,
          email: site.email,
          is_headquarter: site.is_headquarter,
          is_active: site.is_active,
        }
      : emptyForm,
  );
  const [managerMode, setManagerMode] = useState<"existing" | "new">("existing");
  const [managerId, setManagerId] = useState(site?.manager_id ?? "");
  const [newManager, setNewManager] = useState<NewManager>(emptyManager);
  const [role, setRole] = useState(site?.manager_role || "site_manager");
  const collaborators = useQuery({
    queryKey: ["site-wizard-users"],
    queryFn: async () =>
      collection(await backendApi.request<unknown>("users?per_page=100")).map((item) => {
        const raw = flatten(item);
        const fallbackName =
          `${String(raw["first_name"] ?? "")} ${String(raw["last_name"] ?? "")}`.trim() || "Sans nom";
        const name =
          raw["name"] == null || String(raw["name"]).trim() === "" ? fallbackName : String(raw["name"]);
        return { id: String(raw["id"] ?? ""), name, email: String(raw["email"] ?? "") };
      }),
    staleTime: 30_000,
  });
  const roles = useQuery({
    queryKey: ["site-wizard-roles", site?.id ?? "new"],
    queryFn: async () => {
      const payload = objectOf(
        await backendApi.request<unknown>(
          site?.id ? `available-roles?site_id=${site.id}` : "available-roles",
        ),
      );
      const items = Array.isArray(payload["roles"]) ? payload["roles"] : [];
      return items
        .map((item) => {
          const raw = objectOf(item);
          return {
            id: Number(raw["id"] ?? 0),
            name: String(raw["name"] ?? ""),
            label: raw["label"] == null ? undefined : String(raw["label"]),
            permissions_count: Number(raw["permissions_count"] ?? 0),
            permissions: Array.isArray(raw["permissions"]) ? raw["permissions"].map(String) : [],
          } satisfies SiteRole;
        })
        .filter((item) => item.name);
    },
    staleTime: 60_000,
  });
  const selectedRole = roles.data?.find((item) => item.name === role);
  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.location.trim() || !form.city.trim())
        throw new Error("Le nom, l'adresse et la ville sont obligatoires.");
      if (managerMode === "existing" && !managerId && !form.is_headquarter)
        throw new Error("Sélectionnez un responsable ou cochez siège social.");
      if (
        !site &&
        managerMode === "new" &&
        (!newManager.first_name.trim() ||
          !newManager.last_name.trim() ||
          !newManager.position.trim() ||
          !/.+@.+\..+/.test(newManager.email))
      )
        throw new Error("Les informations du nouveau responsable sont incomplètes.");
      const payload: Record<string, unknown> = {
        ...form,
        ...(managerMode === "existing" && managerId ? { manager_id: Number(managerId) } : {}),
        ...(!site && managerMode === "new" ? { new_manager: newManager } : {}),
        ...(role && (managerId || managerMode === "new" || form.is_headquarter) ? { role } : {}),
      };
      return backendApi.request(site ? `sites/${site.id}` : "sites", {
        method: site ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enterprise-sites"] });
      toast.success(site ? "Site modifié." : "Site créé.");
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible."),
  });
  const change = <K extends keyof SiteForm>(key: K, value: SiteForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={site ? "Modifier le site" : "Créer un site"}
    >
      <div
        className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 shadow-2xl sm:max-w-xl sm:p-6 lg:max-w-3xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Sites</p>
            <h2 className="font-display text-xl font-bold">
              {site ? "Modifier le site" : "Créer un nouveau site"}
            </h2>
          </div>
          <button
            className="rounded-xl p-2 hover:bg-background"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
          {[
            [1, "Informations"],
            [2, "Responsable"],
            [3, "Rôle & permissions"],
            [4, "Récapitulatif"],
          ].map(([value, label]) => (
            <span
              key={String(value)}
              className={`rounded-full px-3 py-1.5 ${step === value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
            >
              {value}. {label}
            </span>
          ))}
        </div>
        {step === 1 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                Nom du site *
              </span>
              <input
                className={input}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                Ville *
              </span>
              <input
                className={input}
                value={form.city}
                onChange={(e) => change("city", e.target.value)}
              />
            </label>
            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                Adresse / localisation *
              </span>
              <input
                className={input}
                value={form.location}
                onChange={(e) => change("location", e.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                Téléphone
              </span>
              <input
                className={input}
                value={form.phone}
                onChange={(e) => change("phone", e.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                E-mail
              </span>
              <input
                className={input}
                type="email"
                value={form.email}
                onChange={(e) => change("email", e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_headquarter}
                onChange={(e) => change("is_headquarter", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />{" "}
              Siège social
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => change("is_active", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />{" "}
              Site actif
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              <button
                className={managerMode === "existing" ? primary : secondary}
                onClick={() => setManagerMode("existing")}
              >
                Responsable existant
              </button>
              {!site && (
                <button
                  className={managerMode === "new" ? primary : secondary}
                  onClick={() => setManagerMode("new")}
                >
                  Nouveau responsable
                </button>
              )}
            </div>
            {managerMode === "existing" ? (
              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                  Collaborateur responsable
                </span>
                <select
                  className={input}
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                >
                  <option value="">
                    {form.is_headquarter ? "Responsable par défaut du siège" : "Sélectionner"}
                  </option>
                  {(collaborators.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.email ? ` — ${user.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ["first_name", "Prénom *"],
                    ["last_name", "Nom *"],
                    ["email", "E-mail *"],
                    ["phone", "Téléphone"],
                    ["position", "Fonction *"],
                    ["address", "Adresse"],
                    ["start_date", "Date de prise de service"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <span className="mb-1.5 block text-xs font-bold uppercase text-muted-foreground">
                      {label}
                    </span>
                    <input
                      className={input}
                      type={key === "email" ? "email" : key === "start_date" ? "date" : "text"}
                      value={newManager[key]}
                      onChange={(e) =>
                        setNewManager((current) => ({ ...current, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <p className={muted}>
              {site
                ? "La modification d'un site utilise un responsable existant, conformément aux règles de gestion."
                : "Le responsable est rattaché au site et les contrôles d'unicité existants sont appliqués."}
            </p>
          </div>
        )}
        {step === 3 && (
          <div className="mt-6 space-y-5">
            <div>
              <p className="font-display text-lg font-bold">Rôle du responsable</p>
              <p className={muted}>
                Le rôle est appliqué automatiquement. Les permissions affichées sont héritées du
                rôle.
              </p>
            </div>
            {roles.isLoading ? (
              <p className={muted}>Chargement du catalogue des rôles…</p>
            ) : roles.isError ? (
              <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning-foreground">
                Le catalogue des rôles est indisponible. Le rôle par défaut sera conservé.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(roles.data ?? []).map((item) => (
                  <button
                    type="button"
                    key={item.name}
                    onClick={() => setRole(item.name)}
                    className={`rounded-2xl border p-4 text-left transition ${role === item.name ? "border-primary bg-primary-soft" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display font-bold">{item.label || item.name}</span>
                      <span className="rounded-full bg-card px-2 py-1 text-[11px] font-bold text-muted-foreground">
                        {item.permissions_count} permissions
                      </span>
                    </div>
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedRole && (
              <div className={`${card} p-4`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <p className="font-display font-bold">
                    Permissions héritées — {selectedRole.label || selectedRole.name}
                  </p>
                </div>
                {selectedRole.permissions.length === 0 ? (
                  <p className={`mt-3 ${muted}`}>Ce rôle ne possède pas de permission déclarée.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedRole.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold"
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Les permissions directes ne sont pas envoyées : seuls les rôles sont utilisés.
                </p>
              </div>
            )}
          </div>
        )}
        {step === 4 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={`${card} p-4`}>
              <p className="text-xs font-bold uppercase text-muted-foreground">Informations</p>
              <h3 className="mt-2 font-display text-lg font-bold">{form.name || "—"}</h3>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {form.location || "—"} · {form.city || "—"}
              </p>
              <p className="mt-3 text-sm">
                {form.is_headquarter ? "Siège social" : "Site secondaire"} ·{" "}
                {form.is_active ? "Actif" : "Inactif"}
              </p>
            </div>
            <div className={`${card} p-4 md:col-span-2`}>
              <p className="text-xs font-bold uppercase text-muted-foreground">
                Rôle et permissions
              </p>
              <h3 className="mt-2 font-display text-lg font-bold">
                {selectedRole?.label || role || "Rôle par défaut"}
              </h3>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {selectedRole?.permissions_count ?? 0} permissions héritées du rôle
              </p>
            </div>
            <div className={`${card} p-4`}>
              <p className="text-xs font-bold uppercase text-muted-foreground">Responsable</p>
              <h3 className="mt-2 font-display text-lg font-bold">
                {managerMode === "new"
                  ? `${newManager.first_name} ${newManager.last_name}`
                  : (collaborators.data?.find((user) => user.id === managerId)?.name ??
                    (form.is_headquarter ? "Responsable par défaut" : "Non défini"))}
              </h3>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {managerMode === "new"
                  ? newManager.position
                  : (collaborators.data?.find((user) => user.id === managerId)?.email ?? "")}
              </p>
            </div>
          </div>
        )}
        <div className="mt-7 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          {step > 1 && (
            <button className={secondary} onClick={() => setStep(step - 1)}>
              Précédent
            </button>
          )}
          {step < 4 ? (
            <button className={primary} onClick={() => setStep(step + 1)}>
              Suivant
            </button>
          ) : (
            <button className={primary} disabled={save.isPending} onClick={() => save.mutate()}>
              <Check className="h-4 w-4" />{" "}
              {save.isPending ? "Enregistrement…" : site ? "Modifier le site" : "Créer le site"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SiteDetails({
  site,
  onClose,
  onEdit,
  onManageSubscription,
}: {
  site: Site;
  onClose: () => void;
  onEdit: () => void;
  onManageSubscription: () => void;
}) {
  const subscriptions = site.subscriptions;
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Détails du site"
    >
      <div
        className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 shadow-2xl sm:max-w-xl sm:p-6 lg:max-w-3xl`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-primary">Détails du site</p>
            <h2 className="font-display text-xl font-bold">{site.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className={`${card} p-4`}>
            <h3 className="font-display font-bold">Informations générales</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Référence</dt>
                <dd className="font-semibold">{site.ref || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Localisation</dt>
                <dd className="text-right font-semibold">
                  {site.location}, {site.city}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Responsable</dt>
                <dd className="text-right font-semibold">{site.manager_name || "Non défini"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Création</dt>
                <dd className="font-semibold">{dateLabel(site.created_at)}</dd>
              </div>
            </dl>
          </div>
          <div className={`${card} p-4`}>
            <h3 className="font-display font-bold">Statistiques</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-background p-3 text-center">
                <p className="font-display text-xl font-extrabold text-primary">
                  {site.users_count}
                </p>
                <p className="text-[11px] text-muted-foreground">Utilisateurs</p>
              </div>
              <div className="rounded-xl bg-background p-3 text-center">
                <p className="font-display text-xl font-extrabold text-primary">
                  {site.processes_count}
                </p>
                <p className="text-[11px] text-muted-foreground">Processus</p>
              </div>
              <div className="rounded-xl bg-background p-3 text-center">
                <p className="font-display text-xl font-extrabold text-primary">
                  {subscriptions.length}
                </p>
                <p className="text-[11px] text-muted-foreground">Abonnements</p>
              </div>
            </div>
          </div>
        </div>
        <div className={`${card} mt-4 p-4`}>
          <h3 className="font-display font-bold">Abonnements</h3>
          {subscriptions.length === 0 ? (
            <p className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning-foreground">
              Aucun abonnement actif pour ce site.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {subscriptions.map((subscription, index) => {
                const offer = objectOf(subscription["offer"]);
                return (
                  <div
                    key={String(subscription["id"] ?? index)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background p-3 text-sm"
                  >
                    <span className="font-semibold">
                      {String(offer["name"] ?? subscription["plan_name"] ?? "Offre")}
                    </span>
                    <span className="text-muted-foreground">
                      {dateLabel(subscription["start_date"])} →{" "}
                      {dateLabel(subscription["expiration_date"])} ·{" "}
                      {subscription["is_active"] ? "Actif" : "Inactif"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Fermer
          </button>
          <button className={secondary} onClick={onManageSubscription}>
            <RefreshCw className="h-4 w-4" /> Gérer l'abonnement
          </button>
          <button className={primary} onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Modifier
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPrice(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("fr-FR").format(Number.isFinite(amount) ? amount : 0);
}

function SubscriptionDialog({
  site,
  onClose,
  onChanged,
}: {
  site: Site;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedOfferIds, setSelectedOfferIds] = useState<number[]>([]);
  const [durationMonths, setDurationMonths] = useState("1");
  const offers = useQuery({
    queryKey: ["enterprise-offers"],
    queryFn: async () => {
      const payload = objectOf(await backendApi.request<unknown>("public/offers"));
      return collection(payload)
        .map((item) => {
          const raw = flatten(item);
          return {
            id: Number(raw["id"] ?? 0),
            name: String(raw["name"] ?? "Offre"),
            description: raw["description"] == null ? undefined : String(raw["description"]),
            price: Number(raw["price"] ?? 0),
            duration_months: Number(raw["duration_months"] ?? 1),
            is_active: raw["is_active"] !== false,
          } satisfies Offer;
        })
        .filter((offer) => offer.id > 0 && offer.is_active !== false);
    },
    staleTime: 60_000,
  });
  const activeSubscription = site.subscriptions.find((item) => item["is_active"] !== false);
  const subscribe = useMutation({
    mutationFn: () => {
      if (selectedOfferIds.length === 0) throw new Error("Sélectionnez au moins une offre.");
      return backendApi.request("subscription/subscribe", {
        method: "POST",
        body: JSON.stringify({ site_id: Number(site.id), offer_ids: selectedOfferIds }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enterprise-sites"] });
      toast.success("Abonnement activé avec succès.");
      onChanged();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Activation impossible."),
  });
  const renew = useMutation({
    mutationFn: () => {
      if (!activeSubscription?.["id"]) throw new Error("Aucun abonnement à renouveler.");
      return backendApi.request(`enterprise-subscriptions/${activeSubscription["id"]}/renew`, {
        method: "POST",
        body: JSON.stringify({ duration_months: Number(durationMonths) }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enterprise-sites"] });
      toast.success("Abonnement renouvelé avec succès.");
      onChanged();
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Renouvellement impossible."),
  });
  const total = (offers.data ?? [])
    .filter((offer) => selectedOfferIds.includes(offer.id))
    .reduce((sum, offer) => sum + offer.price, 0);
  const toggleOffer = (id: number) =>
    setSelectedOfferIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-foreground/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Gérer l'abonnement"
    >
      <div
        className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 shadow-2xl sm:max-w-xl sm:p-6 lg:max-w-4xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Abonnements</p>
            <h2 className="font-display text-xl font-bold">Gérer l'abonnement — {site.name}</h2>
          </div>
          <button
            className="rounded-xl p-2 hover:bg-background"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {activeSubscription ? (
          <div className="mt-5 rounded-2xl border border-success/30 bg-success/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-success">Abonnement actuel</p>
                <p className="mt-1 font-display font-bold">
                  {String(
                    objectOf(activeSubscription["offer"])["name"] ??
                      activeSubscription["plan_name"] ??
                      "Offre",
                  )}
                </p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  Expire le {dateLabel(activeSubscription["expiration_date"])}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={`${input} w-auto`}
                  value={durationMonths}
                  onChange={(event) => setDurationMonths(event.target.value)}
                >
                  <option value="1">1 mois</option>
                  <option value="3">3 mois</option>
                  <option value="6">6 mois</option>
                  <option value="12">12 mois</option>
                </select>
                <button
                  className={secondary}
                  disabled={renew.isPending}
                  onClick={() => renew.mutate()}
                >
                  <RefreshCw className="h-4 w-4" /> Renouveler
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-warning/10 p-4 text-sm text-warning-foreground">
            Ce site n'a pas d'abonnement actif. Choisissez une offre ci-dessous.
          </p>
        )}
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold">Offres disponibles</h3>
              <p className={muted}>
                L'offre est activée immédiatement ; aucun faux paiement n'est déclenché.
              </p>
            </div>
            {selectedOfferIds.length > 0 && (
              <p className="font-display font-bold text-primary">
                Total : {formatPrice(total)} FCFA
              </p>
            )}
          </div>
          {offers.isLoading ? (
            <p className={`mt-4 ${muted}`}>Chargement des offres…</p>
          ) : offers.isError ? (
            <p className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              Impossible de charger les offres.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(offers.data ?? []).map((offer) => (
                <button
                  type="button"
                  key={offer.id}
                  onClick={() => toggleOffer(offer.id)}
                  className={`rounded-2xl border p-4 text-left transition ${selectedOfferIds.includes(offer.id) ? "border-primary bg-primary-soft" : "border-border bg-background hover:border-primary/50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-bold">{offer.name}</span>
                    {selectedOfferIds.includes(offer.id) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="mt-2 font-display text-2xl font-extrabold text-primary">
                    {formatPrice(offer.price)} FCFA
                  </p>
                  <p className="text-xs text-muted-foreground">Pour {offer.duration_months} mois</p>
                  {offer.description && (
                    <p className="mt-2 text-xs text-muted-foreground">{offer.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-7 flex justify-end gap-2">
          <button className={secondary} onClick={onClose}>
            Annuler
          </button>
          <button
            className={primary}
            disabled={subscribe.isPending || selectedOfferIds.length === 0}
            onClick={() => subscribe.mutate()}
          >
            <Check className="h-4 w-4" />{" "}
            {subscribe.isPending
              ? "Activation…"
              : activeSubscription
                ? "Ajouter une offre"
                : "Activer l'abonnement"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SitesPage() {
  const [currentSite, setCurrentSite] = useCurrentSite();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Site | null | undefined>(undefined);
  const [details, setDetails] = useState<Site | null>(null);
  const [subscriptionSite, setSubscriptionSite] = useState<Site | null>(null);
  const sitesQuery = useQuery({
    queryKey: ["enterprise-sites", query, status],
    queryFn: async () => {
      const params = new URLSearchParams("per_page=100");
      if (query.trim()) params.set("search", query.trim());
      if (status) params.set("is_active", status === "active" ? "true" : "false");
      return collection(await backendApi.request<unknown>(`sites?${params.toString()}`)).map(
        normalizeSite,
      );
    },
    staleTime: 20_000,
  });
  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (site: Site) =>
      backendApi.request(`sites/${site.id}/toggle-active`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["enterprise-sites"] });
      toast.success("Statut du site mis à jour.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Mise à jour impossible."),
  });
  const destroy = useMutation({
    mutationFn: (site: Site) => backendApi.request(`sites/${site.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["enterprise-sites"] });
      toast.success("Site supprimé.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Suppression impossible."),
  });
  const stats = useMemo(
    () => ({
      total: sites.length,
      active: sites.filter((site) => site.is_active).length,
      users: sites.reduce((total, site) => total + site.users_count, 0),
      processes: sites.reduce((total, site) => total + site.processes_count, 0),
    }),
    [sites],
  );
  const openDetails = async (site: Site) => {
    try {
      const payload = await backendApi.request<unknown>(`sites/${site.id}/subscriptions`);
      const enriched = { ...site, subscriptions: collection(payload).map((item) => flatten(item)) };
      setDetails(enriched);
    } catch {
      setDetails(site);
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Organisation</p>
          <h1 className="mt-1 min-w-0 break-words font-display text-xl font-extrabold sm:text-2xl md:text-3xl">
            Mes sites
          </h1>
          <p className={`mt-1 ${muted}`}>
            Gérez les sites, leurs responsables, leur statut et leurs rattachements.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap lg:justify-end">
          <button className={secondary} onClick={() => void sitesQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          <button className={primary} onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" /> Nouveau site
          </button>
        </div>
      </div>
      {sitesQuery.isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Impossible de charger les sites depuis le serveur.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${card} p-4`}>
          <p className="font-display text-2xl font-extrabold text-primary">{stats.total}</p>
          <p className="text-xs font-semibold text-muted-foreground">Total sites</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="font-display text-2xl font-extrabold text-success">{stats.active}</p>
          <p className="text-xs font-semibold text-muted-foreground">Sites actifs</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="font-display text-2xl font-extrabold text-info">{stats.users}</p>
          <p className="text-xs font-semibold text-muted-foreground">Utilisateurs</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="font-display text-2xl font-extrabold text-warning">{stats.processes}</p>
          <p className="text-xs font-semibold text-muted-foreground">Processus</p>
        </div>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-3 p-4`}>
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <input
            className={`${input} pl-10`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom, ville ou référence…"
          />
        </div>
        <select
          className={`${input} w-full max-w-full sm:w-auto sm:min-w-40`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>
      {sitesQuery.isLoading ? (
        <p className={muted}>Chargement des sites…</p>
      ) : sites.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <Building2 className="mx-auto h-9 w-9 text-primary" />
          <p className="mt-3 font-display font-bold">Aucun site</p>
          <p className={`mt-1 ${muted}`}>Commencez par créer votre premier site.</p>
        </div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border bg-background text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Site</th>
                  <th className="px-4 py-3">Localisation</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Abonnement</th>
                  <th className="px-4 py-3">Utilisateurs</th>
                  <th className="sticky right-0 bg-card px-4 py-3 text-right shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sites.map((site) => (
                  <tr key={site.id} className="hover:bg-primary-soft/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-xs font-bold text-primary">
                          {initials(site.name)}
                        </span>
                        <div>
                          <p className="font-semibold">{site.name}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {site.ref || `ID #${site.id}`}
                            {site.is_headquarter ? " · Siège" : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <MapPin className="mr-1 inline h-4 w-4" />
                      {site.location || site.city || "Non défini"}
                    </td>
                    <td className="px-4 py-3">
                      {site.manager_name ? (
                        <span>
                          <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                            {initials(site.manager_name)}
                          </span>
                          {site.manager_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Non défini</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle.mutate(site)}
                        disabled={toggle.isPending}
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${site.is_active ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}
                      >
                        {site.is_active ? "Actif" : "Inactif"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {site.active_norms.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-bold text-success">
                            <ShieldCheck className="h-3.5 w-3.5" /> {site.active_norms.join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-warning-foreground">Aucun</span>
                        )}
                        <button
                          className="text-xs font-bold text-primary hover:underline"
                          onClick={() => setSubscriptionSite(site)}
                        >
                          Gérer
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2.5 py-1 text-xs font-bold text-info">
                        <Users className="h-3.5 w-3.5" /> {site.users_count}
                      </span>
                    </td>
                    <td className="sticky right-0 bg-card px-4 py-3 shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                          onClick={() => setCurrentSite(site.id)}
                          title="Utiliser ce site"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                          onClick={() => void openDetails(site)}
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg p-2 text-muted-foreground hover:text-primary"
                          onClick={() => setEditing(site)}
                          title="Modifier"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            toast.info(`Suppression du site « ${site.name} ».`);
                            destroy.mutate(site);
                          }}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {currentSite && (
        <p className="text-xs text-muted-foreground">
          Site courant :{" "}
          <strong>
            {sites.find((site) => site.id === currentSite)?.name ?? `Site ${currentSite}`}
          </strong>
        </p>
      )}
      {editing !== undefined && (
        <SiteDialog
          site={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => void sitesQuery.refetch()}
        />
      )}
      {details && (
        <SiteDetails
          site={details}
          onClose={() => setDetails(null)}
          onEdit={() => {
            setEditing(details);
            setDetails(null);
          }}
          onManageSubscription={() => {
            setSubscriptionSite(details);
            setDetails(null);
          }}
        />
      )}
      {subscriptionSite && (
        <SubscriptionDialog
          key={subscriptionSite.id}
          site={subscriptionSite}
          onClose={() => setSubscriptionSite(null)}
          onChanged={() => void sitesQuery.refetch()}
        />
      )}
    </div>
  );
}
