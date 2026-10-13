import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Eye,
  FileDown,
  Filter,
  PenLine,
  Plus,
  Printer,
  Save,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { downloadCsv, useCurrentSite } from "@/hooks/use-workspace";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import { backendApi, type BackendProfile } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";
import {
  downloadBlob,
  exportPersonnelDocx,
  useCollaboratorMutations,
  useCollaborators,
  usePendingApprovals,
  type Collaborator,
} from "@/integrations/backend/leadership";
import {
  EMAIL_REGEX,
  Header,
  Label,
  PageSkeleton,
  SelectField,
  SiteNotice,
  Stat,
  TextAreaField,
  TextField,
  card,
  collaboratorDisplayName,
  errorMessage,
  formatDateFR,
  input,
  muted,
  primary,
  secondary,
  statusBadge,
} from "./shared";

type CollaboratorForm = {
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  phone: string;
  address: string;
  start_date: string;
  site_id: string;
  access_role: string;
  custom_role_name: string;
};
type StatusFilter = "all" | "active" | "inactive";
type SiteOption = { id: string; name: string };
type RoleOption = { id: string; name: string };
const emptyCollaborator: CollaboratorForm = {
  first_name: "",
  last_name: "",
  email: "",
  job_title: "",
  phone: "",
  address: "",
  start_date: "",
  site_id: "",
  access_role: "",
  custom_role_name: "",
};
const IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "address",
  "job_title",
  "start_date",
  "site",
] as const;

function initialsOf(item: Collaborator): string {
  const ini = `${String(item.first_name ?? "")
    .trim()
    .charAt(0)}${String(item.last_name ?? "")
    .trim()
    .charAt(0)}`.toUpperCase();
  return (
    ini ||
    String(item.email ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase()
  );
}
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function siteNameOf(item: Collaborator, sites: SiteOption[]): string {
  const raw = item["site"] as Record<string, unknown> | null | undefined;
  const embedded = raw && typeof raw === "object" ? String(raw["name"] ?? "").trim() : "";
  if (embedded) return embedded;
  return (
    sites.find((s) => s.id === String(item.site_id ?? ""))?.name ?? String(item.site_id ?? "—")
  );
}
function isAdminProfile(profile: BackendProfile | null): boolean {
  if (!profile) return false;
  if (profile.permissions.map((p) => p.toLowerCase()).includes("admin_entreprise")) return true;
  const raw = profile.raw as Record<string, unknown>;
  const roles = [
    ...(Array.isArray(raw["role_names"]) ? (raw["role_names"] as unknown[]) : []),
    raw["role"],
  ].map((r) => String(r ?? "").toLowerCase());
  return roles.some((r) => r.includes("admin"));
}
function listPayload(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>)["data"] ?? payload;
  return Array.isArray(data)
    ? data.filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
    : [];
}
function personnelPreviewHtml(
  rows: Collaborator[],
  sites: SiteOption[],
  siteLabel: string,
): string {
  const date = new Date().toLocaleDateString("fr-FR");
  const body = rows
    .map(
      (item) =>
        `<tr><td>${escapeHtml(collaboratorDisplayName(item))}</td><td>${escapeHtml(item.email ?? "")}</td><td>${escapeHtml(item.job_title ?? item.role ?? "")}</td><td>${escapeHtml(String(item.start_date ?? "").slice(0, 10))}</td><td>${escapeHtml(item.phone ?? "")}</td><td>${item.is_active === false ? "Inactif" : "Actif"}</td><td>${escapeHtml(siteNameOf(item, sites))}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Liste du personnel — ${escapeHtml(siteLabel)} — ${date}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#111}.header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1d4ed8;padding-bottom:16px;margin-bottom:24px}.logo{width:56px;height:56px;border-radius:14px;background:#1d4ed8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:24px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}th{background:#eff6ff}h1{font-size:22px;margin:0}p{color:#475569;font-size:13px}</style></head><body><div class="header"><div class="logo">L</div><div><h1>Liste du personnel</h1><p>${escapeHtml(siteLabel)} · ${rows.length} collaborateur(s) · édité le ${date}</p></div></div><table><thead><tr><th>Nom</th><th>Email</th><th>Poste</th><th>Prise de service</th><th>Téléphone</th><th>Statut</th><th>Site</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function CollaboratorsPage() {
  const [siteId] = useCurrentSite();
  const { data = [], isLoading, refetch } = useCollaborators(siteId);
  const { data: pendingApprovals = [], refetch: refetchPending } = usePendingApprovals(siteId);
  const { save, remove, approve, reject, toggleActive } = useCollaboratorMutations(siteId);
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [form, setForm] = useState<CollaboratorForm>(emptyCollaborator);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Collaborator | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [docId, setDocId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Collaborator | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Collaborator | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    backendApi.auth
      .me()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    backendApi
      .request<unknown>("sites?per_page=100")
      .then((payload) => {
        if (cancelled) return;
        setSites(
          listPayload(payload)
            .map((s) => {
              const f = flattenResource(s);
              return {
                id: String(f["id"] ?? ""),
                name: String(f["name"] ?? f["label"] ?? ""),
              };
            })
            .filter((s) => s.id && s.name),
        );
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    backendApi
      .request<unknown>("roles?per_page=100")
      .then((payload) => {
        if (cancelled) return;
        setRoles(
          // L'API renvoie des ressources JSON:API {id, attributes:{name,...}} :
          // le nom du rôle est dans `attributes`, pas à la racine.
          listPayload(payload)
            .map((r) => {
              const f = flattenResource(r);
              return {
                id: String(f["id"] ?? f["name"] ?? ""),
                name: String(f["name"] ?? ""),
              };
            })
            .filter((r) => r.id && r.name),
        );
        setRolesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setRoles([]);
          setRolesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (siteId) setForm((c) => (c.site_id ? c : { ...c, site_id: siteId }));
  }, [siteId]);

  const isAdmin = useMemo(() => isAdminProfile(profile), [profile]);
  const isSuperAdmin = profile?.user_type === "super_admin";
  // Les rôles système super_admin* ne sont jamais assignables par un compte
  // entreprise (le backend les refuse) : on ne les propose qu'aux super-admins.
  const assignableRoles = useMemo(
    () =>
      isSuperAdmin ? roles : roles.filter((r) => !r.name.toLowerCase().startsWith("super_admin")),
    [roles, isSuperAdmin],
  );
  const jobTitles = useMemo(
    () =>
      Array.from(
        new Set(
          data
            .map((item) => String(item.job_title ?? item.role ?? "").trim())
            .filter((t) => t.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [data],
  );
  const visible = useMemo(
    () =>
      data.filter((item) => {
        const haystack =
          `${String(item.first_name ?? "")} ${String(item.last_name ?? "")} ${String(item.email ?? "")} ${String(item.job_title ?? item.role ?? "")} ${String(item.phone ?? "")}`.toLowerCase();
        if (!haystack.includes(query.trim().toLowerCase())) return false;
        if (statusFilter === "active" && item.is_active === false) return false;
        if (statusFilter === "inactive" && item.is_active !== false) return false;
        if (jobFilter !== "all" && String(item.job_title ?? item.role ?? "") !== jobFilter)
          return false;
        return true;
      }),
    [data, query, statusFilter, jobFilter],
  );

  const emailTrimmed = form.email.trim();
  const emailError =
    emailTrimmed && !EMAIL_REGEX.test(emailTrimmed) ? "L'adresse e-mail n'est pas valide." : "";
  const isStepValid =
    form.first_name.trim().length > 0 &&
    form.last_name.trim().length > 0 &&
    EMAIL_REGEX.test(emailTrimmed) &&
    form.job_title.trim().length > 0 &&
    (form.site_id || siteId).trim().length > 0;
  const isRoleStepValid =
    form.access_role.trim().length > 0 &&
    (form.access_role !== "__custom__" || form.custom_role_name.trim().length > 0);
  const canSave = isStepValid && isRoleStepValid && !save.isPending;

  const change = (key: keyof CollaboratorForm, value: string): void =>
    setForm((c) => ({ ...c, [key]: value }));
  const resetForm = (): void => {
    setForm({ ...emptyCollaborator, site_id: siteId });
    setEditingId(undefined);
  };
  const edit = (item: Collaborator): void => {
    setEditingId(item.id != null ? String(item.id) : undefined);
    setDetail(null);
    // `role_names` (Spatie) porte le vrai rôle d'accès ; `role` legacy peut
    // contenir l'intitulé du poste, donc on préfère role_names[0].
    const assigned = Array.isArray(item["role_names"])
      ? (item["role_names"] as unknown[]).map((r) => String(r ?? "")).filter(Boolean)
      : [];
    setForm({
      first_name: String(item.first_name ?? ""),
      last_name: String(item.last_name ?? ""),
      email: String(item.email ?? ""),
      job_title: String(item.job_title ?? item.role ?? ""),
      phone: String(item.phone ?? ""),
      address: String(item["address"] ?? ""),
      start_date: String(item.start_date ?? "").slice(0, 10),
      site_id: item.site_id != null ? String(item.site_id) : siteId,
      access_role: assigned[0] ?? String(item.role ?? ""),
      custom_role_name: "",
    });
    setOpen(true);
  };
  const submit = async (): Promise<void> => {
    if (!isStepValid) {
      toast.error("Les prénom, nom, e-mail valide, poste et site sont requis.");
      return;
    }
    if (!isRoleStepValid) {
      toast.error(
        form.access_role === "__custom__"
          ? "Le nom du rôle personnalisé est requis."
          : "Le rôle d'accès est requis.",
      );
      return;
    }
    let accessRole =
      form.access_role === "__custom__" ? form.custom_role_name.trim() : form.access_role.trim();
    if (!isSuperAdmin && accessRole.toLowerCase().startsWith("super_admin")) {
      toast.error("Ce rôle système ne peut pas être attribué par votre compte.");
      return;
    }
    try {
      // Un rôle personnalisé n'existe pas encore en base : le créer d'abord,
      // sinon `exists:roles,name` rejette l'enregistrement du collaborateur.
      if (
        form.access_role === "__custom__" &&
        !roles.some((r) => r.name.toLowerCase() === accessRole.toLowerCase())
      ) {
        const enterpriseId = profile?.enterprise_id ? Number(profile.enterprise_id) : NaN;
        if (!Number.isFinite(enterpriseId) || enterpriseId <= 0) {
          toast.error("Entreprise introuvable : impossible de créer le rôle personnalisé.");
          return;
        }
        try {
          const created = await backendApi.request<unknown>("roles", {
            method: "POST",
            body: JSON.stringify({
              name: accessRole,
              enterprise_id: enterpriseId,
              description: "Rôle personnalisé créé depuis la liste du personnel.",
            }),
          });
          const node =
            created && typeof created === "object"
              ? ((created as Record<string, unknown>)["data"] ?? created)
              : null;
          const attrs =
            node && typeof node === "object" && (node as Record<string, unknown>)["attributes"];
          const flat = attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>) : {};
          const createdName = String(
            flat["name"] ?? (node as Record<string, unknown>)?.["name"] ?? accessRole,
          );
          const createdId = String((node as Record<string, unknown>)?.["id"] ?? createdName);
          accessRole = createdName;
          setRoles((current) =>
            current.some((r) => r.name === createdName)
              ? current
              : [...current, { id: createdId, name: createdName }],
          );
        } catch (error) {
          toast.error(errorMessage(error, "Création du rôle personnalisé impossible."));
          return;
        }
      }
      const result = await save.mutateAsync({
        id: editingId,
        payload: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: emailTrimmed,
          job_title: form.job_title.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          start_date: form.start_date,
          site_id: Number(form.site_id || siteId),
          ...(profile?.enterprise_id ? { enterprise_id: profile.enterprise_id } : {}),
          ...(accessRole ? { access_role: accessRole } : {}),
          name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
          user_type: "company",
          is_active: true,
          send_welcome_email: true,
        },
      });
      const notifications = (result as Record<string, unknown> | null)?.["notifications"] as
        Record<string, unknown> | undefined;
      toast.success("Collaborateur enregistré.");
      if (notifications?.["approval_required"])
        toast.info("Validation requise : ouvrez Approbations.");
      setOpen(false);
      resetForm();
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'enregistrer le collaborateur."));
    }
  };
  const destroy = async (id: string): Promise<void> => {
    try {
      await remove.mutateAsync(id);
      toast.success("Collaborateur supprimé.");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };
  const toggle = async (id: string): Promise<void> => {
    try {
      await toggleActive.mutateAsync(id);
      toast.success("Statut du collaborateur mis à jour.");
    } catch (error) {
      toast.error(errorMessage(error, "Action impossible."));
    }
  };
  const approveOne = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      await approve.mutateAsync(id);
      toast.success("Collaborateur approuvé.");
    } catch (error) {
      toast.error(errorMessage(error, "Approbation impossible."));
    } finally {
      setBusyId(null);
    }
  };
  const rejectOne = async (id: string, reason: string): Promise<void> => {
    if (reason.trim().length < 5) {
      toast.error("Le motif doit contenir au moins 5 caractères.");
      return;
    }
    setBusyId(id);
    try {
      await reject.mutateAsync({ id, reason: reason.trim() });
      toast.success("Collaborateur rejeté.");
    } catch (error) {
      toast.error(errorMessage(error, "Rejet impossible."));
    } finally {
      setBusyId(null);
    }
  };
  const resetFilters = (): void => {
    setQuery("");
    setStatusFilter("all");
    setJobFilter("all");
  };
  const exportCsv = (): void => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`personnel_${stamp}.csv`, [
      ["Nom", "Email", "Poste", "Prise de service", "Téléphone", "Statut", "Site"],
      ...visible.map((item) => [
        collaboratorDisplayName(item),
        String(item.email ?? ""),
        String(item.job_title ?? item.role ?? ""),
        String(item.start_date ?? "").slice(0, 10),
        String(item.phone ?? ""),
        item.is_active === false ? "Inactif" : "Actif",
        siteNameOf(item, sites),
      ]),
    ]);
    toast.success("Export CSV téléchargé.");
  };
  const exportDocx = async (): Promise<void> => {
    try {
      const blob = await exportPersonnelDocx(siteId);
      downloadBlob(blob, "liste-du-personnel.docx");
      toast.success("Document Word exporté.");
    } catch (error) {
      toast.error(errorMessage(error, "Export Word impossible."));
    }
  };
  const exportPdf = (): void => {
    setPreviewOpen(true);
  };
  const openVerifyDialog = (): void => {
    if (!docId.trim()) {
      toast.info(
        "La vérification nécessite l'identifiant du document exporté (reçu lors d'un export).",
      );
      return;
    }
    setVerifyOpen(true);
  };
  const verifyCode = async (code: string): Promise<void> => {
    if (!code.trim()) return;
    try {
      await backendApi.request(`documents/${encodeURIComponent(docId.trim())}/confirm-code`, {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      toast.success("Document vérifié.");
    } catch (error) {
      toast.error(errorMessage(error, "Vérification impossible."));
    }
  };
  const downloadTemplate = async (): Promise<void> => {
    try {
      const blob = await backendApi.blob("users/import/template");
      downloadBlob(blob, "modele-import-personnel.xlsx");
      toast.success("Modèle d'import téléchargé.");
    } catch {
      const legend =
        "Légende: first_name=Prénom* ; last_name=Nom* ; email=Email* ; phone=Téléphone ; address=Adresse ; job_title=Poste* ; start_date=AAAA-MM-JJ ; site=Site\n";
      downloadBlob(
        new Blob(["﻿" + legend + IMPORT_COLUMNS.join(";") + "\n"], {
          type: "text/csv;charset=utf-8",
        }),
        "modele-import-personnel.csv",
      );
      toast.success("Modèle CSV local téléchargé (avec feuille Légende).");
    }
  };
  const uploadImport = async (): Promise<void> => {
    if (!importFile) {
      toast.error("Sélectionnez un fichier à importer.");
      return;
    }
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", importFile);
      body.append("site_id", String(Number(siteId)));
      await backendApi.request("users/import", { method: "POST", body });
      toast.success("Import en masse terminé.");
      setImportFile(null);
      await refetch();
      await refetchPending();
    } catch (error) {
      toast.error(errorMessage(error, "Import impossible."));
    } finally {
      setImporting(false);
    }
  };
  const detailRows: [string, string][] = detail
    ? [
        ["Prénom", String(detail.first_name ?? "—")],
        ["Nom", String(detail.last_name ?? "—")],
        ["Email", String(detail.email ?? "—")],
        ["Poste", String(detail.job_title ?? detail.role ?? "—")],
        ["Téléphone", String(detail.phone ?? "—")],
        ["Adresse", String(detail["address"] ?? "—")],
        ["Prise de service", formatDateFR(detail.start_date)],
        ["Site", siteNameOf(detail, sites)],
        ["Statut", detail.is_active === false ? "Inactif" : "Actif"],
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Leadership"
        title="Liste du personnel"
        description="Identifiez les collaborateurs du site, leurs postes et leur date de prise de service."
        icon={Users}
      >
        <button className={secondary} onClick={() => setPreviewOpen(true)}>
          <Eye className="h-4 w-4" /> Aperçu
        </button>
        <button className={secondary} onClick={exportCsv}>
          <FileDown className="h-4 w-4" /> CSV
        </button>
        <button className={secondary} onClick={() => void exportDocx()}>
          <FileDown className="h-4 w-4" /> Word
        </button>
        <button className={secondary} onClick={exportPdf}>
          <Printer className="h-4 w-4" /> PDF
        </button>
        <button
          className={primary}
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Ajouter un collaborateur
        </button>
      </Header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={data.length} label="Collaborateurs" />
        <Stat
          value={data.filter((i) => i.is_active !== false).length}
          label="Actifs"
          tone="text-emerald-600"
        />
        <Stat
          value={data.filter((i) => i.is_active === false).length}
          label="Inactifs"
          tone="text-amber-600"
        />
        <Stat
          value={pendingApprovals.length}
          label="En attente d'approbation"
          tone="text-sky-600"
        />
      </div>
      {open && (
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Modifier le collaborateur" : "Nouveau collaborateur"}
              </h2>
              <p className={muted}>
                Le compte est enregistré dans le registre utilisateurs du site, avec e-mail de
                bienvenue.
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Prénom *"
              value={form.first_name}
              onChange={(v) => change("first_name", v)}
            />
            <TextField
              label="Nom *"
              value={form.last_name}
              onChange={(v) => change("last_name", v)}
            />
            <div>
              <TextField
                label="E-mail *"
                type="email"
                value={form.email}
                onChange={(v) => change("email", v)}
                placeholder="prenom.nom@entreprise.tld"
              />
              {emailError && (
                <p className="mt-1 text-xs font-semibold text-red-600">{emailError}</p>
              )}
            </div>
            <TextField
              label="Poste *"
              value={form.job_title}
              onChange={(v) => change("job_title", v)}
            />
            <TextField label="Téléphone" value={form.phone} onChange={(v) => change("phone", v)} />
            <TextField
              label="Date de prise de service"
              type="date"
              value={form.start_date}
              onChange={(v) => change("start_date", v)}
            />
            <TextAreaField
              label="Adresse"
              value={form.address}
              onChange={(v) => change("address", v)}
              span
            />
            {sites.length > 1 ? (
              <SelectField
                label="Site *"
                value={form.site_id || siteId}
                onChange={(v) => change("site_id", v)}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <TextField
                label="Site *"
                value={sites[0]?.name ?? (form.site_id || siteId ? `Site ${siteId}` : "")}
                onChange={() => undefined}
              />
            )}
            <div>
              <SelectField
                label="Rôle d'accès *"
                value={form.access_role}
                onChange={(v) => change("access_role", v)}
              >
                <option value="">Sélectionner un rôle…</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
                <option value="__custom__">Rôle personnalisé…</option>
              </SelectField>
              {rolesLoaded && assignableRoles.length === 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-600">
                  Aucun rôle éligible : utilisez un rôle personnalisé.
                </p>
              )}
            </div>
            {form.access_role === "__custom__" && (
              <TextField
                label="Nom du rôle personnalisé *"
                value={form.custom_role_name}
                onChange={(v) => change("custom_role_name", v)}
                placeholder="Ex. référent QHSE"
              />
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button className={primary} disabled={!canSave} onClick={() => void submit()}>
              <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button className={secondary} onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-sky-600" />
          <h2 className="font-display text-lg font-bold">
            Approbations en attente ({pendingApprovals.length})
          </h2>
        </div>
        {!isAdmin ? (
          <p className={`mt-3 ${muted}`}>
            Seul l&apos;admin entreprise peut approuver ou rejeter les collaborateurs en attente.
          </p>
        ) : pendingApprovals.length === 0 ? (
          <p className={`mt-3 ${muted}`}>Aucune demande en attente.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pendingApprovals.map((item) => {
              const busy = busyId === String(item.id);
              return (
                <li
                  key={String(item.id ?? collaboratorDisplayName(item))}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{collaboratorDisplayName(item)}</p>
                      <span className={statusBadge("En attente")}>En attente</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {String(item.email ?? "—")} ·{" "}
                      {String(item.job_title ?? item.role ?? "Poste non renseigné")} ·{" "}
                      {siteNameOf(item, sites)}
                      {item["created_at"]
                        ? ` · Demandé le ${formatDateFR(item["created_at"])}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={primary}
                      disabled={busy}
                      onClick={() => void approveOne(String(item.id))}
                    >
                      <BadgeCheck className="h-4 w-4" /> {busy ? "Traitement…" : "Approuver"}
                    </button>
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() => setRejectTarget(item)}
                    >
                      <X className="h-4 w-4" /> Rejeter
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Filtres</span>
          </div>
          <input
            className={`${input} max-w-full sm:max-w-xs`}
            placeholder="Rechercher nom, e-mail, poste, téléphone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`${input} max-w-full sm:max-w-[180px]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
          <select
            className={`${input} max-w-full sm:max-w-[220px]`}
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value="all">Tous les postes</option>
            {jobTitles.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
          <button className={secondary} onClick={resetFilters}>
            Réinitialiser
          </button>
        </div>
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : data.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            Aucun collaborateur enregistré pour ce site. Ajoutez le premier via « Ajouter un
            collaborateur ».
          </p>
        ) : visible.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>
            Aucun collaborateur ne correspond aux filtres.{" "}
            <button className="font-bold text-primary" onClick={resetFilters}>
              Réinitialiser
            </button>
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Poste</th>
                  <th className="px-3 py-2">Prise de service</th>
                  <th className="px-3 py-2">Téléphone</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="sticky right-0 bg-card px-3 py-2 text-right shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const active = item.is_active !== false;
                  return (
                    <tr key={String(item.id)} className="border-t border-border align-middle">
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-extrabold text-primary">
                            {initialsOf(item)}
                          </span>
                          <span className="min-w-0 truncate font-bold">
                            {collaboratorDisplayName(item)}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[220px] break-all px-3 py-2 text-muted-foreground">
                        {String(item.email ?? "—")}
                      </td>
                      <td className="px-3 py-2">
                        <span className={statusBadge(item.job_title ?? item.role ?? "")}>
                          {String(item.job_title ?? item.role ?? "—")}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatDateFR(item.start_date)}</td>
                      <td className="px-3 py-2">{String(item.phone ?? "—")}</td>
                      <td className="px-3 py-2">
                        <span className={statusBadge(active ? "Actif" : "Inactif")}>
                          {active ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="sticky right-0 bg-card px-3 py-2 shadow-[-8px_0_12px_-8px_rgb(0_0_0/0.15)]">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            className={secondary}
                            title="Voir"
                            onClick={() => setDetail(item)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button className={secondary} title="Modifier" onClick={() => edit(item)}>
                            <PenLine className="h-4 w-4" />
                          </button>
                          <button
                            className={secondary}
                            title={active ? "Désactiver" : "Activer"}
                            disabled={toggleActive.isPending}
                            onClick={() => void toggle(String(item.id))}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            className={secondary}
                            title="Supprimer"
                            onClick={() => setConfirmDelete(item)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Import en masse</h2>
        </div>
        <p className={`mt-2 ${muted}`}>
          Fichier CSV ou Excel avec les 8 colonnes : {IMPORT_COLUMNS.join(", ")}.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={secondary} onClick={() => void downloadTemplate()}>
            <FileDown className="h-4 w-4" /> Modèle
          </button>
          <input
            className={input}
            style={{ maxWidth: 320 }}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <button
            className={primary}
            disabled={!importFile || importing}
            onClick={() => void uploadImport()}
          >
            <Upload className="h-4 w-4" /> {importing ? "Import…" : "Importer"}
          </button>
        </div>
      </div>
      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg font-bold">Exports & vérification</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={secondary} onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" /> Aperçu brandé
          </button>
          <button className={secondary} onClick={exportCsv}>
            <FileDown className="h-4 w-4" /> CSV daté
          </button>
          <button className={secondary} onClick={() => void exportDocx()}>
            <FileDown className="h-4 w-4" /> Word
          </button>
          <button className={secondary} onClick={exportPdf}>
            <Printer className="h-4 w-4" /> PDF
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Identifiant du document exporté</Label>
            <input
              className={`${input} max-w-full sm:max-w-[280px]`}
              placeholder="Ex. 42"
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
            />
          </div>
          <button className={secondary} onClick={openVerifyDialog}>
            <BadgeCheck className="h-4 w-4" /> Vérifier un document
          </button>
        </div>
      </div>
      {detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div
            className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 sm:max-w-xl sm:p-5 lg:max-w-2xl`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">
                  {collaboratorDisplayName(detail)}
                </h2>
                <p className={muted}>Fiche collaborateur (9 champs).</p>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detailRows.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-background p-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className={primary} onClick={() => edit(detail)}>
                <PenLine className="h-4 w-4" /> Modifier
              </button>
              <button className={secondary} onClick={() => setDetail(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {previewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div
            className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 sm:max-w-xl sm:p-5 lg:max-w-3xl`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-bold">Aperçu — Liste du personnel</h2>
                <p className={muted}>Astuce : utilisez Imprimer puis Enregistrer au format PDF.</p>
              </div>
              <button onClick={() => setPreviewOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              ref={previewFrameRef}
              srcDoc={personnelPreviewHtml(visible, sites, `Site ${siteId}`)}
              className="mt-4 h-[60vh] w-full rounded-xl border bg-white"
              title="Aperçu — Liste du personnel"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className={primary}
                onClick={() => previewFrameRef.current?.contentWindow?.print()}
              >
                <Printer className="h-4 w-4" /> Imprimer / PDF
              </button>
              <button className={secondary} onClick={() => setPreviewOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Supprimer ce collaborateur ?"
        {...(confirmDelete
          ? {
              description: `${collaboratorDisplayName(confirmDelete)} sera définitivement supprimé.`,
            }
          : {})}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        destructive
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) void destroy(String(target.id));
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <PromptDialog
        open={!!rejectTarget}
        title="Rejeter la demande"
        {...(rejectTarget ? { description: collaboratorDisplayName(rejectTarget) } : {})}
        label="Motif du rejet"
        multiline
        required
        minLength={5}
        confirmLabel="Rejeter"
        cancelLabel="Annuler"
        onSubmit={(reason) => {
          const target = rejectTarget;
          setRejectTarget(null);
          if (target) void rejectOne(String(target.id), reason);
        }}
        onCancel={() => setRejectTarget(null)}
      />
      <PromptDialog
        open={verifyOpen}
        title="Vérifier le document"
        description="Saisissez le code de vérification du document"
        label="Code"
        required
        confirmLabel="Vérifier"
        cancelLabel="Annuler"
        onSubmit={(code) => {
          setVerifyOpen(false);
          void verifyCode(code);
        }}
        onCancel={() => setVerifyOpen(false)}
      />
    </div>
  );
}
