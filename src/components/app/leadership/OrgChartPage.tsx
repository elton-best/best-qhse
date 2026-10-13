import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Eye,
  FileText,
  FileType,
  Image as ImageIcon,
  Trash2,
  Upload,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  ORG_CHART_KEY,
  useOrgChart,
  useOrgChartMutations,
  type OrgChart,
} from "@/integrations/backend/leadership";
import {
  card,
  errorMessage,
  formatDateTimeFR,
  formatFileSize,
  muted,
  ORG_CHART_EXTENSIONS,
  ORG_CHART_MAX_SIZE,
  primary,
  secondary,
} from "./shared";
import { ConfirmDialog } from "../ConfirmDialog";

function fileExtension(fileName: unknown): string {
  return (
    String(fileName ?? "")
      .split(".")
      .pop()
      ?.toLowerCase() ?? ""
  );
}

function resolveUrl(chart: OrgChart | null | undefined): string {
  if (!chart) return "";
  const raw =
    chart.download_url ||
    (chart.file_path ? `/storage/${String(chart.file_path).replace(/^\/?/, "")}` : "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const apiBase = String(import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/api\/v1\/?$/, "");
  if (!apiBase) return raw.startsWith("/") ? raw : `/${raw}`;
  return `${apiBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function previewKind(chart: OrgChart | null | undefined): "pdf" | "image" | "other" {
  const name = String(chart?.file_name ?? "").toLowerCase();
  const mime = String(chart?.file_type ?? "").toLowerCase();
  if (name.endsWith(".pdf") || mime.includes("application/pdf")) return "pdf";
  if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    mime.includes("image/")
  )
    return "image";
  return "other";
}

function normalizeCreatedChart(value: unknown): OrgChart | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const wrapped = root["data"];
  const candidate =
    wrapped !== undefined && wrapped !== null && typeof wrapped === "object"
      ? (wrapped as Record<string, unknown>)
      : root;
  if (!("id" in candidate) && !("file_name" in candidate)) return null;
  return candidate as unknown as OrgChart;
}

function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileExtension(fileName);
  if (ext === "pdf") return <FileText className="h-9 w-9 text-red-500" />;
  if (ext === "doc" || ext === "docx") return <FileType className="h-9 w-9 text-blue-600" />;
  if (ext === "png" || ext === "jpg" || ext === "jpeg")
    return <ImageIcon className="h-9 w-9 text-emerald-500" />;
  return <FileText className="h-9 w-9 text-slate-500" />;
}

export function OrgChartPage() {
  const [siteId] = useCurrentSite();
  const normalizedSiteId = siteId ?? "";
  const queryClient = useQueryClient();
  const { data: chart, isLoading, isFetching, isError, refetch } = useOrgChart(normalizedSiteId);
  const { upload, remove } = useOrgChartMutations(normalizedSiteId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobBusy, setBlobBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const chartIdKey = chart?.id;
  const chartDownloadUrl = chart?.download_url ?? null;

  useEffect(() => {
    if (!chartDownloadUrl) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setBlobBusy(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobBusy(true);
    fetch(chartDownloadUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Aperçu indisponible (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const nextUrl: string = objectUrl;
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return nextUrl;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      })
      .finally(() => {
        if (!cancelled) setBlobBusy(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [chartIdKey, chartDownloadUrl]);

  const choose = async (file?: File | null): Promise<void> => {
    if (!file) return;
    // N'envoie site_id que s'il est renseigné et numérique.
    const numericSiteId = Number(normalizedSiteId);
    if (!Number.isFinite(numericSiteId) || numericSiteId <= 0) {
      toast.error("Sélectionnez un site avant d'importer un organigramme.");
      return;
    }
    const extension = fileExtension(file.name);
    if (!ORG_CHART_EXTENSIONS.includes(extension)) {
      toast.error("Format accepté : PDF, DOC, DOCX, PNG, JPG, JPEG.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > ORG_CHART_MAX_SIZE) {
      toast.error("Le fichier dépasse la limite de 10 Mo.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      const createdRaw: unknown = await upload.mutateAsync(file);
      const snapshot = normalizeCreatedChart(createdRaw);
      queryClient.setQueryData([...ORG_CHART_KEY, normalizedSiteId], snapshot);
      toast.success("Organigramme enregistré.");
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'envoyer l'organigramme."));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const view = (): void => {
    const url = resolveUrl(chart);
    if (!url) {
      toast.error("Aucun aperçu disponible pour ce document.");
      return;
    }
    window.open(url, "_blank");
  };

  const download = async (): Promise<void> => {
    try {
      // Refetch avant ouverture pour obtenir une URL signée fraîche (10 min).
      const fresh = await refetch();
      const url = resolveUrl(fresh.data ?? chart);
      if (!url) {
        toast.error("Aucun lien de téléchargement disponible.");
        return;
      }
      window.open(url, "_blank");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    }
  };

  const destroy = (): void => {
    if (!chart?.id) return;
    setConfirmDeleteOpen(true);
  };

  const doDestroy = async (): Promise<void> => {
    if (!chart?.id) return;
    try {
      await remove.mutateAsync(String(chart.id));
      toast.success("Organigramme supprimé.");
    } catch (error) {
      toast.error(errorMessage(error, "Suppression impossible."));
    }
  };

  const preview = resolveUrl(chart);
  const previewSrc = blobUrl ?? preview;
  const kind = previewKind(chart);
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!normalizedSiteId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Aucun site sélectionné — affichage basé sur le site de votre compte.
        </div>
      ) : null}

      {isError ? (
        <div className={`${card} border-destructive/40 p-4`}>
          <p className="text-sm font-semibold">Impossible de charger l'organigramme.</p>
          <p className={`mt-1 ${muted}`}>Vérifiez votre connexion puis réessayez.</p>
          <button className={`${secondary} mt-3`} onClick={() => void refetch()}>
            Réessayer
          </button>
        </div>
      ) : null}

      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg font-bold">Document d'organigramme</h2>
        <p className={`mt-1 ${muted}`}>
          Déposez le document officiel de la structure organisationnelle de votre site.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-disabled={upload.isPending}
          onClick={() => {
            if (!upload.isPending) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !upload.isPending) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!upload.isPending) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (upload.isPending) return;
            void choose(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-primary bg-primary/10"
              : "border-border bg-background hover:border-primary"
          } ${upload.isPending ? "pointer-events-none opacity-70" : ""}`}
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            disabled={upload.isPending}
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <Upload className="mx-auto h-10 w-10 text-primary" />
          {upload.isPending ? (
            <p className="mt-3 font-semibold">Envoi en cours…</p>
          ) : (
            <>
              <p className="mt-3 font-semibold">Glissez-déposez votre fichier ici</p>
              <p className={`mt-1 ${muted}`}>ou cliquez pour parcourir</p>
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">PDF, Word, PNG, JPG • Max 10 Mo</p>
        </div>

        {isLoading ? (
          <p className={`mt-4 ${muted}`}>Chargement…</p>
        ) : chart ? (
          <div className="mt-4 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-3">
              <FileIcon fileName={chart.file_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{chart.file_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {chart.file_type ?? "Document"} · {formatFileSize(chart.file_size)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mis à jour le {formatDateTimeFR(chart.updated_at)}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={secondary} onClick={view} disabled={!preview || busy}>
                <Eye className="h-4 w-4" /> Voir
              </button>
              <button className={secondary} onClick={() => void download()} disabled={busy}>
                <Download className="h-4 w-4" /> Télécharger
              </button>
              <button className={secondary} onClick={() => destroy()} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" /> {remove.isPending ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        ) : (
          <p className={`mt-4 ${muted}`}>Aucun organigramme courant pour ce site.</p>
        )}
      </div>

      <div className={`${card} min-h-[280px] p-5`}>
        <h2 className="font-display text-lg font-bold">Aperçu du document</h2>
        {blobBusy ? <p className={`mt-2 ${muted}`}>Préparation de l'aperçu…</p> : null}
        {isLoading || isFetching ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-[520px] w-full animate-pulse rounded-xl bg-muted" />
          </div>
        ) : !chart ? (
          <p className={`mt-3 ${muted}`}>Aucun document à prévisualiser pour le moment.</p>
        ) : !previewSrc ? (
          <p className={`mt-3 ${muted}`}>Aucune URL de prévisualisation fournie par le serveur.</p>
        ) : kind === "pdf" ? (
          <iframe
            key={String(chart?.id)}
            title={`Aperçu de ${chart.file_name}`}
            src={previewSrc}
            className="mt-4 h-[520px] w-full rounded-xl border border-border bg-background"
          />
        ) : kind === "image" ? (
          <img
            key={String(chart?.id)}
            src={previewSrc}
            alt={`Aperçu de ${chart.file_name}`}
            className="mt-4 max-h-[520px] w-full rounded-xl border border-border bg-background object-contain"
          />
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
            <FileType className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">Aperçu indisponible pour ce format</p>
            <p className={`mt-1 ${muted}`}>
              Les documents Word ne peuvent pas être prévisualisés dans le navigateur. Utilisez Voir
              ou Télécharger.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button className={primary} onClick={view} disabled={!preview}>
                <Eye className="h-4 w-4" /> Voir
              </button>
              <button className={secondary} onClick={() => void download()}>
                <Download className="h-4 w-4" /> Télécharger
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Supprimer l'organigramme courant ?"
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          void doDestroy();
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
