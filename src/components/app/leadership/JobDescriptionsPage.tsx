import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Download,
  Eye,
  FileText,
  Filter,
  PenLine,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";
import {
  downloadBlob,
  downloadJobDescriptionPdf,
  downloadJobImportErrors,
  downloadJobImportTemplate,
  fetchJobImportLogs,
  getJobImportStatusColor,
  getJobImportStatusLabel,
  previewJobImport,
  useCollaborators,
  useJobDescriptionMutations,
  useJobDescriptions,
  useJobCollaborators,
  useJobImportMutations,
  type Collaborator,
  type FetchJobImportLogsParams,
  type JobDescription,
  type JobImportLog,
  type JobImportMode,
  type JobImportPreview,
} from "@/integrations/backend/leadership";
import {
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
  isJobSigned,
  jobTitleOf,
  join,
  muted,
  primary,
  secondary,
  statusBadge,
} from "./shared";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";

// Helpers (parité Vue : split ; / \n, collaborateurs, aperçu brandé)

function splitList(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((i) => i.trim())
    .filter(Boolean);
}
function toList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  return value == null ? [] : splitList(String(value));
}
function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function strField(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  return typeof v === "string" ? v : "";
}
function collabFullName(p: Collaborator): string {
  return strField(recordOf(p), "full_name").trim() || collaboratorDisplayName(p);
}
function collabSiteName(p: Collaborator): string {
  const r = recordOf(p);
  return strField(r, "site_name").trim() || strField(recordOf(r["site"]), "name").trim();
}
function collabLabel(p: Collaborator): string {
  const site = collabSiteName(p);
  return site ? `${collabFullName(p)} - ${site}` : collabFullName(p);
}
function collabSignature(p: Collaborator): string | null {
  const r = recordOf(p);
  for (const k of ["signature_url", "signature_path", "signature", "signature_data"]) {
    const v = strField(r, k).trim();
    if (v) return v;
  }
  return null;
}
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function sec(title: string, inner: string): string {
  return `<section style="margin:18px 0"><h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;border-bottom:2px solid #dbeafe;padding-bottom:6px">${esc(title)}</h2><div style="margin-top:8px;font-size:13px;color:#1f2937">${inner}</div></section>`;
}
function listHtml(items: string[]): string {
  return items.length
    ? `<ul style="margin:4px 0;padding-left:20px">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : `<p style="color:#9ca3af">Non renseigné</p>`;
}
function textHtml(value: unknown): string {
  const t = String(value ?? "").trim();
  return t
    ? `<p style="white-space:pre-line">${esc(t)}</p>`
    : `<p style="color:#9ca3af">Non renseigné</p>`;
}
function h3(t: string): string {
  return `<h3 style="font-size:12px;color:#374151">${esc(t)}</h3>`;
}
function travelLabelOf(job: JobDescription): string {
  const v = job.travel_required;
  if (v === true || v === "1") return "Oui";
  return v === false || v === "0" ? "Non" : "Non renseigné";
}
function orDash(v: unknown): string {
  return esc(String(v ?? "").trim() || "Non renseigné");
}
function previewHtml(job: JobDescription): string {
  const title = jobTitleOf(job);
  return (
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:Arial,sans-serif;margin:0;background:#f8fafc;padding:24px">` +
    `<div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">` +
    `<div style="background:#1e3a8a;color:#fff;padding:20px 24px"><p style="margin:0;font-size:11px;letter-spacing:.14em;opacity:.8">FICHE DE POSTE</p><h1 style="margin:4px 0 0;font-size:22px">${esc(title)}</h1><p style="margin:6px 0 0;font-size:12px;opacity:.85">${orDash(job.department)}${job.ref ? ` · Réf. ${esc(job.ref)}` : ""}</p></div><div style="padding:8px 24px 24px">` +
    sec("Mission", textHtml(job.mission)) +
    sec(
      "Activités",
      `${textHtml(job.activities)}${h3("Principales")}${listHtml(toList(job.main_activities))}${h3("Secondaires")}${listHtml(toList(job.secondary_activities))}`,
    ) +
    sec(
      "Relations",
      `${h3("Internes")}${listHtml(toList(job.internal_relations))}${h3("Externes")}${listHtml(toList(job.external_relations))}`,
    ) +
    sec(
      "Conditions de travail",
      `<p><strong>Lieu :</strong> ${orDash(job.work_location)}<br><strong>Horaires :</strong> ${orDash(job.work_schedule)}<br><strong>Déplacements :</strong> ${esc(travelLabelOf(job))}<br><strong>Exigences physiques :</strong> ${orDash(job.physical_requirements)}</p>`,
    ) +
    sec(
      "Compétences requises",
      `${h3("Savoir-faire")}${listHtml(toList(job.required_skills))}<p><strong>Expérience :</strong> ${orDash(job.required_experience)}<br><strong>Formation :</strong> ${orDash(job.required_education)}</p>${h3("Certifications")}${listHtml(toList(job.certifications_required))}`,
    ) +
    sec(
      "Signatures",
      `<p><strong>Employé :</strong> ${job.employee_signed_at ? esc(formatDateFR(job.employee_signed_at)) : "En attente"}<br><strong>Direction :</strong> ${job.ceo_signed_at ? esc(formatDateFR(job.ceo_signed_at)) : "En attente"}</p>`,
    ) +
    `</div></div></body></html>`
  );
}

// Formulaire : 15 champs Vue + 4 backend (internal/external/physical/certs)

type JobForm = {
  user_id: string;
  job_title: string;
  mission: string;
  department: string;
  reports_to_id: string;
  replacement_job_title: string;
  activities: string;
  main_activities: string;
  secondary_activities: string;
  internal_relations: string;
  external_relations: string;
  work_location: string;
  work_schedule: string;
  travel: "" | "yes" | "no";
  required_skills: string;
  required_experience: string;
  required_education: string;
  physical_requirements: string;
  certifications_required: string;
};
type JobFormTextKey = Exclude<keyof JobForm, "travel">;
const emptyJob: JobForm = {
  user_id: "",
  job_title: "",
  mission: "",
  department: "",
  reports_to_id: "",
  replacement_job_title: "",
  activities: "",
  main_activities: "",
  secondary_activities: "",
  internal_relations: "",
  external_relations: "",
  work_location: "",
  work_schedule: "",
  travel: "",
  required_skills: "",
  required_experience: "",
  required_education: "",
  physical_requirements: "",
  certifications_required: "",
};
const PROGRESS_KEYS: Array<keyof JobForm> = [
  "user_id",
  "job_title",
  "mission",
  "department",
  "reports_to_id",
  "replacement_job_title",
  "activities",
  "main_activities",
  "secondary_activities",
  "work_location",
  "work_schedule",
  "travel",
  "required_skills",
  "required_experience",
  "required_education",
];
type SignatureFilter = "all" | "signed" | "pending";
function travelToForm(value: unknown): JobForm["travel"] {
  if (value === true || value === "1" || value === 1) return "yes";
  if (value === false || value === "0" || value === 0) return "no";
  return "";
}

// Import : params étendus from/to (ignore si 422) + dialogs + logs

type ExtendedLogParams = FetchJobImportLogsParams & {
  from_date?: string | undefined;
  to_date?: string | undefined;
};
function logsOf(payload: unknown): JobImportLog[] {
  const data = recordOf(payload)["data"];
  if (!Array.isArray(data)) return [];
  return data.map((item) => flattenResource(item) as unknown as JobImportLog);
}
function inRange(log: JobImportLog, from: string, to: string): boolean {
  const raw = log.created_at ?? log.started_at ?? log.finished_at;
  if (typeof raw !== "string" || !raw) return true;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return true;
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}
async function fetchLogsExtended(params: ExtendedLogParams): Promise<JobImportLog[]> {
  const from = params.from_date ?? "";
  const to = params.to_date ?? "";
  if (!from && !to) return fetchJobImportLogs(params);
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page != null) query.set("page", String(params.page));
  query.set("per_page", String(params.per_page ?? 10));
  query.set("from_date", from);
  query.set("to_date", to);
  try {
    return logsOf(
      await backendApi.request<unknown>(`job-descriptions/import/logs?${query.toString()}`),
    );
  } catch (error) {
    if ((error as { status?: unknown } | null)?.status !== 422) throw error;
    return (await fetchJobImportLogs(params)).filter((log) => inRange(log, from, to));
  }
}
const IMPORT_TONES: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-sky-100 text-sky-700",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-slate-100 text-slate-600",
};
function importBadge(status: unknown): string {
  return `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${IMPORT_TONES[getJobImportStatusColor(status)] ?? "bg-slate-100 text-slate-600"}`;
}

function JobImportDialog({
  onClose,
  mode,
  onModeChange,
  file,
  onFileChange,
  onUpload,
  uploading,
  onTemplate,
}: {
  onClose: () => void;
  mode: JobImportMode;
  onModeChange: (m: JobImportMode) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  onUpload: () => void;
  uploading: boolean;
  onTemplate: () => void;
}) {
  const [step, setStep] = useState(0);
  const heavy = file != null && file.size > 5 * 1024 * 1024;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl sm:max-w-xl sm:p-6 lg:max-w-[800px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-bold">Import des fiches de poste</h2>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-3 flex gap-2 text-xs font-bold">
          {["1. Instructions", "2. Dépôt du fichier"].map((label, i) => (
            <li key={label}>
              <button
                className={`rounded-full px-3 py-1.5 ${step === i ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                onClick={() => setStep(i)}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
        {step === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              Téléchargez le modèle, renseignez une ligne par fiche (intitulé et mission requis).
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Formats acceptés : .xlsx, .xls, .csv — 50 Mo maximum.</li>
              <li>
                Mode strict : toute ligne en erreur bloque l&apos;import. Mode flexible : les lignes
                valides passent.
              </li>
              <li>Un avertissement s&apos;affiche au-delà de 5000 lignes.</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={secondary} onClick={onTemplate}>
                <Download className="h-4 w-4" /> Télécharger le modèle
              </button>
              <button className={primary} onClick={() => setStep(1)}>
                Continuer
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label>Mode d&apos;import</Label>
              <div className="flex gap-4 text-sm font-semibold">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "flexible"}
                    onChange={() => onModeChange("flexible")}
                  />{" "}
                  Flexible
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "strict"}
                    onChange={() => onModeChange("strict")}
                  />{" "}
                  Strict
                </label>
              </div>
            </div>
            <div>
              <Label>Fichier (.xlsx, .xls, .csv — 50 Mo max)</Label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="text-sm"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  if (picked && picked.size > 50 * 1024 * 1024) {
                    toast.error("Fichier trop volumineux (50 Mo maximum).");
                    return;
                  }
                  onFileChange(picked);
                }}
              />
              {file && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {file.name} · {(file.size / 1024).toFixed(0)} Ko
                </p>
              )}
              {heavy && (
                <p className="mt-1 text-xs font-semibold text-amber-600">
                  Fichier volumineux : avertissement possible au-delà de 5000 lignes.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={primary} disabled={uploading || !file} onClick={onUpload}>
                <Upload className="h-4 w-4" /> {uploading ? "Envoi…" : "Téléverser"}
              </button>
              <button className={secondary} onClick={() => setStep(0)}>
                Retour
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function JobImportPreviewDialog({
  preview,
  confirming,
  onConfirm,
  onClose,
}: {
  preview: JobImportPreview | null;
  confirming: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl sm:max-w-xl sm:p-6 lg:max-w-[900px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-lg font-bold">Aperçu de l&apos;import</h2>
          <button onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!preview ? (
          <p className={`mt-3 ${muted}`}>Aucun aperçu disponible.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat value={String(preview.total_rows ?? "—")} label="Lignes totales" />
              <Stat
                value={String(preview.successful_rows ?? "—")}
                label="Lignes valides"
                tone="text-emerald-600"
              />
              <Stat
                value={String(preview.failed_rows ?? "—")}
                label="Lignes en erreur"
                tone="text-destructive"
              />
              <Stat
                value={getJobImportStatusLabel(preview.status)}
                label="Statut"
                tone="text-sky-600"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={primary} disabled={confirming} onClick={onConfirm}>
                <Check className="h-4 w-4" /> {confirming ? "Confirmation…" : "Confirmer l'import"}
              </button>
              <button className={secondary} onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function JobImportLogsSection({ refreshKey }: { refreshKey: number }) {
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<JobImportLog[]>([]);
  const [loading, setLoading] = useState(false);
  const perPage = 10;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchLogsExtended({
      status: status === "all" ? undefined : status,
      page,
      per_page: perPage,
      from_date: from || undefined,
      to_date: to || undefined,
    })
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(errorMessage(error, "Chargement des imports impossible."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, from, to, page, refreshKey]);
  const downloadErrors = async (logId: string): Promise<void> => {
    try {
      downloadBlob(await downloadJobImportErrors(logId), `rapport-erreurs-import-${logId}.xlsx`);
      toast.success("Rapport d'erreurs téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement des erreurs impossible."));
    }
  };
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Historique des imports
      </h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label>Statut</Label>
          <select
            className={`${input} max-w-full sm:max-w-[200px]`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tous</option>
            <option value="pending">En attente</option>
            <option value="validating">Validation en cours</option>
            <option value="processing">Traitement en cours</option>
            <option value="completed">Terminé</option>
            <option value="failed">Échoué</option>
          </select>
        </div>
        <div>
          <Label>Du</Label>
          <input
            type="date"
            className={input}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label>Au</Label>
          <input
            type="date"
            className={input}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {loading ? (
        <PageSkeleton rows={4} />
      ) : logs.length === 0 ? (
        <p className={`mt-3 ${muted}`}>Aucun import enregistré.</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {logs.map((log, i) => (
              <li
                key={String(log.id ?? i)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3"
              >
                <div>
                  <p className="text-sm font-bold">{String(log.file_name ?? "Import")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {String(log.successful_rows ?? 0)}/{String(log.total_rows ?? 0)} lignes réussies
                    {log.created_at ? ` · ${formatDateFR(log.created_at)}` : ""}
                  </p>
                  <span className={importBadge(log.status)}>
                    {getJobImportStatusLabel(log.status)}
                  </span>
                </div>
                <button
                  className={secondary}
                  onClick={() => void downloadErrors(String(log.id ?? ""))}
                >
                  <Download className="h-4 w-4" /> Erreurs (.xlsx)
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
            <button
              className={secondary}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <span>
              Page {page} · {logs.length} import(s)
            </span>
            <button
              className={secondary}
              disabled={logs.length < perPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Page isolée : Fiches de poste

export function JobDescriptionsPage() {
  const [siteId] = useCurrentSite();
  const { data = [], isLoading } = useJobDescriptions(siteId);
  const { data: jobCollaborators = [] } = useJobCollaborators(siteId);
  const { data: collaborators = [] } = useCollaborators(siteId);
  const { save, remove, signEmployee, signCeo, generateDraft } = useJobDescriptionMutations(siteId);
  const jobImport = useJobImportMutations(siteId);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [query, setQuery] = useState("");
  const [signatureFilter, setSignatureFilter] = useState<SignatureFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [viewJob, setViewJob] = useState<JobDescription | null>(null);
  const [docJob, setDocJob] = useState<JobDescription | null>(null);
  const [docCatalog, setDocCatalog] = useState("");
  const [docProcess, setDocProcess] = useState("");
  const [docId, setDocId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<JobImportMode>("strict");
  const [lastImportId, setLastImportId] = useState<string | undefined>(undefined);
  const [importPreview, setImportPreview] = useState<JobImportPreview | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [logsRefresh, setLogsRefresh] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);

  const assignees: Collaborator[] = useMemo(
    () => (jobCollaborators.length > 0 ? jobCollaborators : collaborators),
    [jobCollaborators, collaborators],
  );
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of assignees) map.set(String(p.id ?? ""), collabFullName(p));
    return map;
  }, [assignees]);
  const departments = useMemo(
    () =>
      Array.from(
        new Set(data.map((j) => String(j.department ?? "").trim()).filter((d) => d.length > 0)),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [data],
  );
  const visible = useMemo(
    () =>
      data.filter((job) => {
        const collaborator = nameById.get(String(job.user_id ?? "")) ?? "";
        const hay =
          `${jobTitleOf(job)} ${String(job.department ?? "")} ${String(job.mission ?? "")} ${collaborator}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
        if (signatureFilter === "signed" && !isJobSigned(job)) return false;
        if (signatureFilter === "pending" && isJobSigned(job)) return false;
        if (departmentFilter !== "all" && String(job.department ?? "") !== departmentFilter)
          return false;
        return true;
      }),
    [data, nameById, query, signatureFilter, departmentFilter],
  );
  const filledCount = useMemo(
    () => PROGRESS_KEYS.filter((k) => form[k].trim().length > 0).length,
    [form],
  );

  const change = (key: JobFormTextKey, value: string): void =>
    setForm((c) => ({ ...c, [key]: value }));
  const onAssigneeChange = (value: string): void =>
    setForm((c) => {
      const next = { ...c, user_id: value };
      if (!next.job_title.trim()) {
        const title = assignees.find((p) => String(p.id ?? "") === value)?.job_title;
        if (typeof title === "string" && title.trim()) next.job_title = title;
      }
      return next;
    });
  const resetForm = (): void => {
    setForm(emptyJob);
    setEditingId(undefined);
  };
  const selectedCollaborator = assignees.find((p) => String(p.id ?? "") === form.user_id) ?? null;
  const selectedSignature = selectedCollaborator ? collabSignature(selectedCollaborator) : null;

  const edit = (item: JobDescription): void => {
    setEditingId(item.id != null ? String(item.id) : undefined);
    setForm({
      user_id: item.user_id != null ? String(item.user_id) : "",
      job_title: String(item.job_title ?? item.title ?? ""),
      mission: String(item.mission ?? ""),
      department: String(item.department ?? ""),
      reports_to_id: item.reports_to_id != null ? String(item.reports_to_id) : "",
      replacement_job_title: String(item.replacement_job_title ?? ""),
      activities: String(item.activities ?? ""),
      main_activities: join(item.main_activities),
      secondary_activities: join(item.secondary_activities),
      internal_relations: join(item.internal_relations),
      external_relations: join(item.external_relations),
      work_location: String(item.work_location ?? ""),
      work_schedule: String(item.work_schedule ?? ""),
      travel: travelToForm(item.travel_required),
      required_skills: join(item.required_skills),
      required_experience: String(item.required_experience ?? ""),
      required_education: String(item.required_education ?? ""),
      physical_requirements: String(item.physical_requirements ?? ""),
      certifications_required: join(item.certifications_required),
    });
    setFormOpen(true);
  };
  const submit = async (): Promise<void> => {
    if (!form.job_title.trim() || !form.mission.trim()) {
      toast.error("L'intitulé et la mission sont requis.");
      return;
    }
    try {
      await save.mutateAsync({
        id: editingId,
        payload: {
          site_id: Number(siteId),
          user_id: form.user_id ? Number(form.user_id) : null,
          job_title: form.job_title,
          mission: form.mission,
          department: form.department,
          reports_to_id: form.reports_to_id ? Number(form.reports_to_id) : null,
          replacement_job_title: form.replacement_job_title,
          activities: form.activities,
          main_activities: splitList(form.main_activities),
          secondary_activities: splitList(form.secondary_activities),
          internal_relations: splitList(form.internal_relations),
          external_relations: splitList(form.external_relations),
          work_location: form.work_location,
          work_schedule: form.work_schedule,
          travel_required: form.travel === "" ? null : form.travel === "yes",
          required_skills: splitList(form.required_skills),
          required_experience: form.required_experience,
          required_education: form.required_education,
          physical_requirements: form.physical_requirements,
          certifications_required: splitList(form.certifications_required),
        },
      });
      toast.success("Fiche de poste enregistrée.");
      setLastSavedAt(new Date().toLocaleString("fr-FR"));
      setFormOpen(false);
      resetForm();
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'enregistrer la fiche."));
    }
  };
  const destroy = (id: string): void => {
    setConfirmDeleteId(id);
  };
  const doDestroy = async (id: string): Promise<void> => {
    try {
      await remove.mutateAsync(id);
      toast.success("Fiche supprimée.");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };
  const downloadPdf = async (id: string): Promise<void> => {
    try {
      downloadBlob(await downloadJobDescriptionPdf(id), `fiche-poste-${id}.pdf`);
      toast.success("PDF téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement du PDF impossible."));
    }
  };
  const signAs = (id: string, kind: "employee" | "ceo"): void => {
    const mutation = kind === "employee" ? signEmployee : signCeo;
    void mutation.mutateAsync({ id }).then(
      () =>
        toast.success(
          kind === "employee"
            ? "Fiche signée par le collaborateur."
            : "Fiche validée par la direction.",
        ),
      (error: unknown) =>
        toast.error(
          errorMessage(
            error,
            kind === "employee"
              ? "Signature employé impossible."
              : "Validation direction impossible.",
          ),
        ),
    );
  };
  const openDocDialog = (job: JobDescription): void => {
    setDocJob(job);
    setDocCatalog("");
    setDocProcess("");
    setDocId("");
  };
  const confirmDocConfig = async (): Promise<void> => {
    if (!docJob?.id || !docCatalog.trim() || !docProcess.trim()) {
      toast.error("Catalogue et processus requis.");
      return;
    }
    try {
      const result = await generateDraft.mutateAsync({
        id: String(docJob.id),
        payload: { catalog: docCatalog.trim(), process: docProcess.trim() },
      });
      const record = recordOf(recordOf(result)["data"] ?? result);
      const id = record["id"] ?? record["document_id"];
      setDocId(id != null ? String(id) : String(docJob.id));
      toast.success("Document généré.");
    } catch (error) {
      const message = errorMessage(error, "Génération du document impossible.");
      if (message.toLowerCase().includes("nomenclature")) {
        toast.error(
          "Aucun template de nomenclature publié pour ce site — publiez un template dans Référentiels > Nomenclature, puis réessayez.",
        );
      } else {
        toast.error(message);
      }
    }
  };
  const previewDoc = async (): Promise<void> => {
    if (!docId) {
      toast.error("Générez d'abord le document.");
      return;
    }
    try {
      const blob = await backendApi.blob(`documents/${encodeURIComponent(docId)}/preview`);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast.error(errorMessage(error, "Prévisualisation impossible."));
    }
  };
  const downloadDoc = async (): Promise<void> => {
    if (!docId) {
      toast.error("Générez d'abord le document.");
      return;
    }
    try {
      downloadBlob(
        await backendApi.blob(`documents/${encodeURIComponent(docId)}/download`),
        `document-${docId}.pdf`,
      );
      toast.success("Document téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    }
  };
  const verifyDoc = (): void => {
    if (!docId) {
      toast.error("Générez d'abord le document.");
      return;
    }
    setVerifyDialogOpen(true);
  };
  const doVerifyDoc = async (code: string): Promise<void> => {
    if (!docId) return;
    try {
      await backendApi.request(`documents/${encodeURIComponent(docId)}/confirm-code`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      toast.success("Document vérifié.");
    } catch (error) {
      toast.error(errorMessage(error, "Vérification impossible."));
    }
  };
  const uploadImport = async (): Promise<void> => {
    if (!importFile) {
      toast.error("Sélectionnez un fichier à importer.");
      return;
    }
    try {
      const result = await jobImport.upload.mutateAsync({ file: importFile, mode: importMode });
      setLastImportId(result?.import_id != null ? String(result.import_id) : undefined);
      setImportPreview(null);
      setLogsRefresh((n) => n + 1);
      toast.success(
        result?.warning
          ? `Fichier téléversé : ${String(result.warning)}`
          : "Fichier téléversé, lancez l'aperçu avant confirmation.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Import impossible."));
    }
  };
  const downloadTemplate = async (): Promise<void> => {
    try {
      downloadBlob(await downloadJobImportTemplate(), "modele-import-fiches-poste.xlsx");
      toast.success("Modèle d'import téléchargé.");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement du modèle impossible."));
    }
  };
  const loadPreview = async (): Promise<void> => {
    if (!lastImportId) {
      toast.error("Téléversez d'abord un fichier d'import.");
      return;
    }
    try {
      const result = await previewJobImport(lastImportId);
      setImportPreview(result);
      if (result) setPreviewDialogOpen(true);
      else toast.error("Aucun aperçu disponible pour cet import.");
    } catch (error) {
      toast.error(errorMessage(error, "Aperçu impossible."));
    }
  };
  const confirmImport = async (): Promise<void> => {
    if (!lastImportId) {
      toast.error("Téléversez d'abord un fichier d'import.");
      return;
    }
    try {
      await jobImport.confirm.mutateAsync({ importId: lastImportId, mode: importMode });
      toast.success("Import confirmé.");
      setLastImportId(undefined);
      setImportPreview(null);
      setImportFile(null);
      setPreviewDialogOpen(false);
      setLogsRefresh((n) => n + 1);
    } catch (error) {
      toast.error(errorMessage(error, "Confirmation impossible."));
    }
  };
  const collaboratorOptions = assignees.map((p) => (
    <option key={String(p.id ?? "")} value={String(p.id ?? "")}>
      {collabLabel(p)}
    </option>
  ));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Leadership"
        title="Fiches de poste"
        description="Décrivez les missions, activités et compétences attendues pour chaque poste de l'organisme."
        icon={Users}
      >
        <button
          className={primary}
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Nouvelle fiche
        </button>
        <button className={secondary} onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" /> Importer
        </button>
      </Header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat value={data.length} label="Fiches de poste" />
        <Stat
          value={data.filter((j) => isJobSigned(j)).length}
          label="Signées"
          tone="text-emerald-600"
        />
        <Stat
          value={data.filter((j) => !isJobSigned(j)).length}
          label="En attente de signature"
          tone="text-amber-600"
        />
      </div>

      {formOpen && (
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Modifier la fiche" : "Nouvelle fiche de poste"}
              </h2>
              <p className={muted}>Progression : {filledCount}/15 champs renseignés.</p>
            </div>
            <button onClick={() => setFormOpen(false)} aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-background p-3">
            <Stat value={`${filledCount}/15`} label="Champs renseignés" />
            <p className="text-xs text-muted-foreground">
              Dernier enregistrement : {lastSavedAt || "—"}
            </p>
            <button className={secondary} onClick={resetForm}>
              Réinitialiser
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <details open className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
                1. Informations générales
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2">
                <div>
                  <SelectField
                    label="Collaborateur concerné"
                    value={form.user_id}
                    onChange={onAssigneeChange}
                  >
                    <option value="">Aucun collaborateur</option>
                    {collaboratorOptions}
                  </SelectField>
                  <div className="mt-2 rounded-xl bg-background p-3">
                    {selectedSignature ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={selectedSignature}
                          alt="Signature"
                          className="h-12 max-w-full sm:max-w-[160px] object-contain"
                        />
                        <div>
                          <span className={statusBadge("Signé")}>
                            <Check className="h-3.5 w-3.5" /> Lu et approuvé
                          </span>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date().toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aucune signature disponible</p>
                    )}
                  </div>
                </div>
                <TextField
                  label="Intitulé du poste *"
                  value={form.job_title}
                  onChange={(v) => change("job_title", v)}
                />
                <TextAreaField
                  label="Mission *"
                  value={form.mission}
                  onChange={(v) => change("mission", v)}
                  span
                />
                <TextField
                  label="Département / service"
                  value={form.department}
                  onChange={(v) => change("department", v)}
                />
                <SelectField
                  label="Responsable hiérarchique"
                  value={form.reports_to_id}
                  onChange={(v) => change("reports_to_id", v)}
                >
                  <option value="">Aucun responsable</option>
                  {collaboratorOptions}
                </SelectField>
                <TextField
                  label="Remplaçant (intitulé)"
                  value={form.replacement_job_title}
                  onChange={(v) => change("replacement_job_title", v)}
                />
              </div>
            </details>
            <details open className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold">2. Activités</summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2">
                <TextAreaField
                  label="Activités"
                  value={form.activities}
                  onChange={(v) => change("activities", v)}
                  placeholder="Séparez par ; ou par ligne"
                />
                <TextAreaField
                  label="Activités principales ( ; ou ligne)"
                  value={form.main_activities}
                  onChange={(v) => change("main_activities", v)}
                />
                <TextAreaField
                  label="Activités secondaires ( ; ou ligne)"
                  value={form.secondary_activities}
                  onChange={(v) => change("secondary_activities", v)}
                />
                <TextAreaField
                  label="Relations internes — Optionnel backend"
                  value={form.internal_relations}
                  onChange={(v) => change("internal_relations", v)}
                />
                <TextAreaField
                  label="Relations externes — Optionnel backend"
                  value={form.external_relations}
                  onChange={(v) => change("external_relations", v)}
                />
              </div>
            </details>
            <details open className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
                3. Conditions de travail
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2">
                <TextField
                  label="Lieu de travail"
                  value={form.work_location}
                  onChange={(v) => change("work_location", v)}
                />
                <TextField
                  label="Horaires de travail"
                  value={form.work_schedule}
                  onChange={(v) => change("work_schedule", v)}
                />
                <SelectField
                  label="Déplacements"
                  value={form.travel}
                  onChange={(v) =>
                    setForm((c) => ({ ...c, travel: v === "yes" ? "yes" : v === "no" ? "no" : "" }))
                  }
                >
                  <option value="">Non renseigné</option>
                  <option value="yes">Oui</option>
                  <option value="no">Non</option>
                </SelectField>
                <TextField
                  label="Exigences physiques — Optionnel backend"
                  value={form.physical_requirements}
                  onChange={(v) => change("physical_requirements", v)}
                />
              </div>
            </details>
            <details open className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
                4. Compétences
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2">
                <TextAreaField
                  label="Compétences requises ( ; ou ligne)"
                  value={form.required_skills}
                  onChange={(v) => change("required_skills", v)}
                />
                <TextField
                  label="Expérience requise"
                  value={form.required_experience}
                  onChange={(v) => change("required_experience", v)}
                />
                <TextField
                  label="Formation / niveau"
                  value={form.required_education}
                  onChange={(v) => change("required_education", v)}
                />
                <TextAreaField
                  label="Certifications requises — Optionnel backend"
                  value={form.certifications_required}
                  onChange={(v) => change("certifications_required", v)}
                />
              </div>
            </details>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className={primary}
              disabled={save.isPending || !form.job_title.trim() || !form.mission.trim()}
              onClick={() => void submit()}
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button className={secondary} onClick={() => setFormOpen(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Filtres</span>
          </div>
          <input
            className={`${input} max-w-full sm:max-w-xs`}
            placeholder="Rechercher intitulé, collaborateur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={`${input} max-w-full sm:max-w-[200px]`}
            value={signatureFilter}
            onChange={(e) => setSignatureFilter(e.target.value as SignatureFilter)}
          >
            <option value="all">Toutes signatures</option>
            <option value="signed">Signées</option>
            <option value="pending">En attente</option>
          </select>
          <select
            className={`${input} max-w-full sm:max-w-[220px]`}
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="all">Tous les départements</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            className={secondary}
            onClick={() => {
              setQuery("");
              setSignatureFilter("all");
              setDepartmentFilter("all");
            }}
          >
            Réinitialiser
          </button>
        </div>
        {isLoading ? (
          <PageSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <p className={`py-10 text-center ${muted}`}>Aucune fiche ne correspond aux filtres.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((job) => {
              const signed = isJobSigned(job);
              return (
                <li
                  key={String(job.id ?? jobTitleOf(job))}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold">{jobTitleOf(job)}</p>
                      <span className={statusBadge(signed ? "Signé" : "En attente")}>
                        {signed ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Signée
                          </>
                        ) : (
                          "En attente"
                        )}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {String(job.department ?? "Département non renseigné")}
                      {job.employee_signed_at
                        ? ` · Employé : ${formatDateFR(job.employee_signed_at)}`
                        : ""}
                      {job.ceo_signed_at ? ` · Direction : ${formatDateFR(job.ceo_signed_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={secondary} onClick={() => setViewJob(job)}>
                      <Eye className="h-4 w-4" /> Voir
                    </button>
                    <button className={secondary} onClick={() => edit(job)}>
                      <PenLine className="h-4 w-4" /> Modifier
                    </button>
                    <button
                      className={secondary}
                      onClick={() => void downloadPdf(String(job.id ?? ""))}
                    >
                      <Download className="h-4 w-4" /> PDF
                    </button>
                    <button className={secondary} onClick={() => openDocDialog(job)}>
                      <FileText className="h-4 w-4" /> Document
                    </button>
                    {!job.employee_signed_at && (
                      <button
                        className={secondary}
                        disabled={signEmployee.isPending}
                        onClick={() => signAs(String(job.id ?? ""), "employee")}
                      >
                        <PenLine className="h-4 w-4" /> Signer employé
                      </button>
                    )}
                    {!job.ceo_signed_at && (
                      <button
                        className={secondary}
                        disabled={signCeo.isPending}
                        onClick={() => signAs(String(job.id ?? ""), "ceo")}
                      >
                        <BadgeCheck className="h-4 w-4" /> Valider direction
                      </button>
                    )}
                    <button className={secondary} onClick={() => destroy(String(job.id ?? ""))}>
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Import en masse</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Importer un fichier
            </button>
            <button className={secondary} onClick={() => void downloadTemplate()}>
              <Download className="h-4 w-4" /> Modèle
            </button>
            <button
              className={secondary}
              disabled={!lastImportId}
              onClick={() => void loadPreview()}
            >
              <Eye className="h-4 w-4" /> Aperçu
            </button>
          </div>
        </div>
        <div className="mt-4">
          <JobImportLogsSection refreshKey={logsRefresh} />
        </div>
      </div>

      {viewJob && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
          onClick={() => setViewJob(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl sm:max-w-xl sm:p-6 lg:max-w-[800px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display text-lg font-bold">{jobTitleOf(viewJob)}</h2>
              <button onClick={() => setViewJob(null)} aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title={`Aperçu ${jobTitleOf(viewJob)}`}
              srcDoc={previewHtml(viewJob)}
              className="mt-4 h-[60vh] w-full rounded-xl border border-border bg-white"
            />
          </div>
        </div>
      )}

      {docJob && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-foreground/40 p-4"
          onClick={() => setDocJob(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-display text-lg font-bold">Document — {jobTitleOf(docJob)}</h2>
              <button onClick={() => setDocJob(null)} aria-label="Fermer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <TextField label="Catalogue (id)" value={docCatalog} onChange={setDocCatalog} />
              <TextField label="Processus (id)" value={docProcess} onChange={setDocProcess} />
              <button
                className={primary}
                disabled={generateDraft.isPending}
                onClick={() => void confirmDocConfig()}
              >
                <Check className="h-4 w-4" />{" "}
                {generateDraft.isPending ? "Génération…" : "Confirmer"}
              </button>
              {docId && (
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <button className={secondary} onClick={() => void previewDoc()}>
                    <Eye className="h-4 w-4" /> Prévisualiser
                  </button>
                  <button className={secondary} onClick={() => void downloadDoc()}>
                    <Download className="h-4 w-4" /> Télécharger PDF
                  </button>
                  <button className={secondary} onClick={() => verifyDoc()}>
                    <BadgeCheck className="h-4 w-4" /> Vérifier
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }}
        >
          <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
            <iframe
              title="Prévisualisation du document"
              src={previewUrl}
              className="h-full w-full rounded-xl bg-white"
            />
          </div>
        </div>
      )}

      {importOpen && (
        <JobImportDialog
          onClose={() => setImportOpen(false)}
          mode={importMode}
          onModeChange={setImportMode}
          file={importFile}
          onFileChange={setImportFile}
          onUpload={() => void uploadImport()}
          uploading={jobImport.upload.isPending}
          onTemplate={() => void downloadTemplate()}
        />
      )}
      {previewDialogOpen && (
        <JobImportPreviewDialog
          preview={importPreview}
          confirming={jobImport.confirm.isPending}
          onConfirm={() => void confirmImport()}
          onClose={() => setPreviewDialogOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Supprimer définitivement cette fiche de poste ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) void doDestroy(id);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <PromptDialog
        open={verifyDialogOpen}
        title="Vérification du document"
        description="Saisissez le code de vérification :"
        label="Code de vérification"
        placeholder="Code"
        required
        confirmLabel="Vérifier"
        onSubmit={(value) => {
          setVerifyDialogOpen(false);
          void doVerifyDoc(value);
        }}
        onCancel={() => setVerifyDialogOpen(false)}
      />
    </div>
  );
}
