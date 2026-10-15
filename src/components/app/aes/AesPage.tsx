import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileDown, FileUp, FileWarning, Leaf, Plus, RefreshCw } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useNormMode } from "@/hooks/use-norm-mode";
import {
  downloadAesExport,
  downloadAesTemplate,
  useAesList,
  useAesMutations,
  useAesSettings,
  useAesStats,
  type Aes,
  type AesInput,
} from "@/integrations/backend/aes";
import { downloadBlob } from "@/integrations/backend/realisation";
import { ConfirmDialog } from "../ConfirmDialog";
import { PromptDialog } from "../PromptDialog";
import { Header, PageSkeleton, SiteNotice, Stat, card, errorMessage, input, muted, primary, secondary } from "../planning/shared";
import { AesDetail } from "./AesDetail";
import { AesForm } from "./AesForm";
import { AesImportDialog } from "./AesImportDialog";
import { AesMatrixTab } from "./AesMatrixTab";
import { AesSettingsTab } from "./AesSettingsTab";
import { AesSheetTab } from "./AesSheetTab";
import { AesTable } from "./AesTable";
import { AesVersionsTab } from "./AesVersionsTab";
import { DEFAULT_SETTINGS, LIFECYCLE_PHASES, SITUATIONS, STATUS_LABEL } from "./aes-config";

type Tab = "registre" | "matrice" | "aes" | "versions" | "parametres";

const TABS: { id: Tab; label: string }[] = [
  { id: "registre", label: "Registre" },
  { id: "matrice", label: "Matrice G × F" },
  { id: "aes", label: "Fiche des AES" },
  { id: "versions", label: "Versions" },
  { id: "parametres", label: "Paramètres" },
];

/** Gestion des aspects environnementaux et des AES — ISO 14001:2026 §6.1.2. */
export function AesPage() {
  const [siteId] = useCurrentSite();
  const { mode, codes } = useNormMode(siteId);
  const [tab, setTab] = useState<Tab>("registre");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [significance, setSignificance] = useState("");
  const [situation, setSituation] = useState("");
  const [lifecycle, setLifecycle] = useState("");
  const [cell, setCell] = useState<{ g: number; f: number } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Aes | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Aes | null>(null);
  const [toArchive, setToArchive] = useState<Aes | null>(null);
  const [toFlag, setToFlag] = useState<Aes | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(
    () => ({
      site_id: siteId || undefined,
      search: search.trim() || undefined,
      status: status || undefined,
      is_significant: significance || undefined,
      situation: situation || undefined,
      lifecycle_phase: lifecycle || undefined,
    }),
    [siteId, search, status, significance, situation, lifecycle],
  );

  const list = useAesList(filters, Boolean(siteId));
  const stats = useAesStats(siteId || undefined, Boolean(siteId));
  const settingsQuery = useAesSettings();
  const mutations = useAesMutations();
  const settings = settingsQuery.data?.settings ?? DEFAULT_SETTINGS;

  const aspects = useMemo(() => {
    const all = list.data ?? [];
    return cell ? all.filter((a) => a.gravity === cell.g && a.frequency === cell.f && a.criticality_score !== null) : all;
  }, [list.data, cell]);
  const detail = (list.data ?? []).find((a) => a.id === detailId) ?? null;
  const uncovered = stats.data?.significant_without_action.length ?? 0;

  const openCreate = (): void => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant de créer un aspect.");
      return;
    }
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async (input: AesInput): Promise<void> => {
    setFormError(null);
    try {
      await mutations.save.mutateAsync({ id: editing?.id, input });
      toast.success(editing ? "Aspect mis à jour." : "Aspect enregistré en brouillon.");
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      setFormError(errorMessage(error, "Enregistrement impossible."));
    }
  };

  const run = async (action: () => Promise<unknown>, success: string, fallback: string): Promise<void> => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error, fallback));
    }
  };

  const validate = (aspect: Aes): Promise<void> =>
    run(() => mutations.transition.mutateAsync({ id: aspect.id, action: "validate" }), "Aspect validé.", "Validation impossible.");

  const download = async (kind: "template" | "export"): Promise<void> => {
    setBusy(true);
    try {
      const blob = kind === "template" ? await downloadAesTemplate() : await downloadAesExport(siteId || undefined);
      downloadBlob(blob, kind === "template" ? "canevas-registre-aspects-iso14001.xlsx" : "registre-aspects-iso14001.xlsx");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    } finally {
      setBusy(false);
    }
  };

  const loading = list.isLoading && Boolean(siteId);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification — ISO 14001:2026 §6.1.2"
        title="Aspects environnementaux et AES"
        description="Identifiez vos aspects et impacts, cotez-les avec la méthode de votre organisme et suivez les aspects environnementaux significatifs."
        icon={Leaf}
      >
        <button type="button" className={secondary} disabled={busy} onClick={() => void download("template")}>
          <FileWarning className="h-4 w-4" /> Canevas
        </button>
        <button type="button" className={secondary} disabled={!siteId} onClick={() => setImportOpen(true)}>
          <FileUp className="h-4 w-4" /> Importer
        </button>
        <button type="button" className={secondary} disabled={busy || !siteId} onClick={() => void download("export")}>
          <FileDown className="h-4 w-4" /> Exporter
        </button>
        <button type="button" className={primary} onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nouvel aspect
        </button>
      </Header>

      {mode !== "unknown" && (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="norm-context">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
            {mode === "single" ? "Système mono-norme" : "Système intégré"}
          </span>
          <span className={muted}>{codes.join(" · ")}</span>
          {mode === "integrated" && (
            <Link to="/app/$section" params={{ section: "systeme-integre" }} className="font-semibold text-primary underline">
              Voir le pilotage intégré
            </Link>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat value={stats.data?.total ?? 0} label="Aspects" />
        <Stat value={stats.data?.significant ?? 0} label="AES" tone="text-red-600" />
        <Stat value={uncovered} label="AES sans action" tone={uncovered ? "text-red-600" : "text-emerald-600"} />
        <Stat value={stats.data?.needs_reassessment ?? 0} label="À réévaluer" tone="text-amber-600" />
        <Stat value={stats.data?.review_due ?? 0} label="Revues échues" tone="text-amber-600" />
      </div>

      {uncovered > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
          <span className="font-bold">{uncovered} aspect(s) significatif(s) n'ont aucune action de maîtrise.</span> Les AES doivent être
          traités en priorité (ISO 14001 §6.1.5).{" "}
          <button type="button" className="font-bold underline" onClick={() => { setTab("registre"); setSignificance("true"); }}>
            Afficher les AES
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Sections AES" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "registre" && (
        <div className={`${card} space-y-4 p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${input} max-w-xs`}
              placeholder="Rechercher (activité, aspect, impact…)"
              aria-label="Rechercher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className={`${input} w-auto`} aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUS_LABEL).map(([value, item]) => (
                <option key={value} value={value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select className={`${input} w-auto`} aria-label="Significativité" value={significance} onChange={(e) => setSignificance(e.target.value)}>
              <option value="">Tous</option>
              <option value="true">AES uniquement</option>
              <option value="false">Non significatifs</option>
            </select>
            <select className={`${input} w-auto`} aria-label="Situation" value={situation} onChange={(e) => setSituation(e.target.value)}>
              <option value="">Toutes situations</option>
              {SITUATIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select className={`${input} w-auto`} aria-label="Cycle de vie" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}>
              <option value="">Tout le cycle de vie</option>
              {LIFECYCLE_PHASES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {cell && (
              <button type="button" className={secondary} onClick={() => setCell(null)}>
                Case G{cell.g} · F{cell.f} ✕
              </button>
            )}
            <button type="button" className={`${secondary} ml-auto`} onClick={() => setEventOpen(true)}>
              <RefreshCw className="h-4 w-4" /> Événement : réévaluer
            </button>
          </div>

          {list.isError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
              {errorMessage(list.error, "Impossible de charger le registre.")}
            </div>
          )}

          {loading ? (
            <PageSkeleton rows={4} />
          ) : aspects.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-display font-bold">{siteId ? "Aucun aspect pour ces critères." : "Sélectionnez un site."}</p>
              <p className={`mx-auto mt-1 max-w-md ${muted}`}>
                Commencez par recenser les activités de chaque processus et leurs aspects, ou importez votre registre existant
                avec le canevas.
              </p>
              {siteId && (
                <button type="button" className={`${primary} mt-4`} onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Créer le premier aspect
                </button>
              )}
            </div>
          ) : (
            <AesTable
              aspects={aspects}
              onOpen={(aspect) => setDetailId(aspect.id)}
              onEdit={(aspect) => {
                setEditing(aspect);
                setFormError(null);
                setFormOpen(true);
              }}
              onValidate={(aspect) => void validate(aspect)}
              onDelete={setToDelete}
            />
          )}
        </div>
      )}

      {tab === "matrice" && (
        <AesMatrixTab
          stats={stats.data}
          selected={cell}
          onSelect={(next) => {
            setCell(next);
            if (next) setTab("registre");
          }}
        />
      )}
      {tab === "aes" && <AesSheetTab siteId={siteId} />}
      {tab === "versions" && <AesVersionsTab siteId={siteId} />}
      {tab === "parametres" && <AesSettingsTab canEdit />}

      {formOpen && (
        <AesForm
          key={editing?.id ?? "new"}
          aspect={editing}
          siteId={siteId}
          settings={settings}
          busy={mutations.save.isPending}
          error={formError}
          onSubmit={(value) => void submit(value)}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {detail && (
        <AesDetail
          aspect={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditing(detail);
            setFormError(null);
            setFormOpen(true);
            setDetailId(null);
          }}
          onValidate={() => void validate(detail)}
          onArchive={() => setToArchive(detail)}
          onReopen={() =>
            void run(() => mutations.transition.mutateAsync({ id: detail.id, action: "reopen" }), "Aspect rouvert.", "Réouverture impossible.")
          }
          onFlag={() => setToFlag(detail)}
        />
      )}

      {importOpen && <AesImportDialog siteId={siteId} onClose={() => setImportOpen(false)} />}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cet aspect ?"
        description="Seuls les aspects non validés peuvent être supprimés ; un aspect validé s'archive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) void run(() => mutations.remove.mutateAsync(target.id), "Aspect supprimé.", "Suppression impossible.");
        }}
        onCancel={() => setToDelete(null)}
      />
      <ConfirmDialog
        open={toArchive !== null}
        title="Archiver cet aspect ?"
        description="L'aspect reste consultable comme preuve mais sort du registre actif."
        confirmLabel="Archiver"
        onConfirm={() => {
          const target = toArchive;
          setToArchive(null);
          if (target) void run(() => mutations.transition.mutateAsync({ id: target.id, action: "archive" }), "Aspect archivé.", "Archivage impossible.");
        }}
        onCancel={() => setToArchive(null)}
      />
      <PromptDialog
        open={toFlag !== null}
        title="Signaler une réévaluation"
        description="Précisez l'événement qui remet en question la cotation de cet aspect."
        label="Motif"
        required
        multiline
        onSubmit={(reason) => {
          const target = toFlag;
          setToFlag(null);
          if (target) void run(() => mutations.flagReassessment.mutateAsync({ id: target.id, reason }), "Réévaluation demandée.", "Signalement impossible.");
        }}
        onCancel={() => setToFlag(null)}
      />
      <PromptDialog
        open={eventOpen}
        title="Événement déclencheur de réévaluation"
        description="Tous les aspects du site courant sont signalés « à réévaluer » (changement, incident, nouvelle obligation, plainte…)."
        label="Description de l'événement"
        required
        multiline
        onSubmit={(reason) => {
          setEventOpen(false);
          void run(
            async () => {
              const result = await mutations.triggerReassessment.mutateAsync({ trigger: "other", reason, ...(siteId ? { site_id: siteId } : {}) });
              toast.info(`${result.data.flagged} aspect(s) à réévaluer.`);
            },
            "Réévaluation déclenchée.",
            "Déclenchement impossible.",
          );
        }}
        onCancel={() => setEventOpen(false)}
      />
    </div>
  );
}
