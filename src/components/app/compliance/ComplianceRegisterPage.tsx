import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileUp, FileWarning, Plus, Scale } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  downloadComplianceExport,
  downloadComplianceTemplate,
  importComplianceRegister,
  useComplianceMutations,
  useObligations,
  type Obligation,
  type ObligationInput,
} from "@/integrations/backend/compliance";
import { downloadBlob } from "@/integrations/backend/realisation";
import { useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "../ConfirmDialog";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { ComplianceDashboardTab } from "./ComplianceDashboardTab";
import { EvaluationDialog } from "./EvaluationDialog";
import { ObligationDetail } from "./ObligationDetail";
import { ObligationForm } from "./ObligationForm";
import { SOURCE_TYPES, STATUS, labelOf } from "./compliance-config";

type Tab = "registre" | "tableau" | "veille";
const TABS: { id: Tab; label: string }[] = [
  { id: "registre", label: "Registre" },
  { id: "tableau", label: "Tableau de bord et échéances" },
  { id: "veille", label: "Veille réglementaire" },
];

/** Registre des obligations de conformité et évaluation périodique — ISO 14001:2026 §6.1.3 et §9.1.2. */
export function ComplianceRegisterPage() {
  const [siteId] = useCurrentSite();
  const queryClient = useQueryClient();
  const mutations = useComplianceMutations();
  const [tab, setTab] = useState<Tab>("registre");
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [status, setStatus] = useState("");
  const [applicability, setApplicability] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState<Obligation | null>(null);
  const [toDelete, setToDelete] = useState<Obligation | null>(null);
  const [busy, setBusy] = useState(false);

  const filters = useMemo(
    () => ({
      site_id: siteId || undefined,
      q: search.trim() || undefined,
      source_type: sourceType || undefined,
      compliance_status: status || undefined,
      is_applicable: applicability || undefined,
    }),
    [siteId, search, sourceType, status, applicability],
  );
  const list = useObligations(filters, Boolean(siteId));
  const watch = useObligations({ site_id: siteId || undefined, analysis_status: "to_analyze" }, Boolean(siteId) && tab === "veille");
  const detail = (list.data ?? []).find((o) => o.id === detailId) ?? (watch.data ?? []).find((o) => o.id === detailId) ?? null;

  const openCreate = (): void => {
    if (!siteId) {
      toast.error("Sélectionnez un site avant de créer une obligation.");
      return;
    }
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async (value: ObligationInput): Promise<void> => {
    setFormError(null);
    try {
      await mutations.save.mutateAsync({ id: editing?.id, input: value });
      toast.success(editing ? "Obligation mise à jour." : "Obligation enregistrée : déterminez maintenant son applicabilité.");
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      setFormError(errorMessage(error, "Enregistrement impossible."));
    }
  };

  const download = async (kind: "template" | "export"): Promise<void> => {
    setBusy(true);
    try {
      const blob = kind === "template" ? await downloadComplianceTemplate() : await downloadComplianceExport(siteId || undefined);
      downloadBlob(blob, kind === "template" ? "canevas-registre-obligations.xlsx" : "registre-obligations-conformite.xlsx");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      await importComplianceRegister(file, siteId);
      toast.success("Registre importé.");
      await queryClient.invalidateQueries({ queryKey: ["compliance-register"] });
    } catch (error) {
      toast.error(errorMessage(error, "Import impossible."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification et évaluation — ISO 14001:2026 §6.1.3 · §9.1.2"
        title="Obligations de conformité"
        description="Recensez les exigences légales et autres exigences, déterminez leur applicabilité, évaluez-les périodiquement avec preuves et suivez les échéances."
        icon={Scale}
      >
        <button type="button" className={secondary} disabled={busy} onClick={() => void download("template")}><FileWarning className="h-4 w-4" /> Canevas</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Fichier Excel du registre" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        <button type="button" className={secondary} disabled={busy || !siteId} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Importer</button>
        <button type="button" className={secondary} disabled={busy || !siteId} onClick={() => void download("export")}><FileDown className="h-4 w-4" /> Exporter</button>
        <button type="button" className={primary} onClick={openCreate}><Plus className="h-4 w-4" /> Nouvelle obligation</button>
      </Header>

      <div role="tablist" aria-label="Sections du registre" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "registre" && (
        <div className={`${card} space-y-4 p-5`}>
          <div className="flex flex-wrap gap-2">
            <input className={`${input} max-w-xs`} placeholder="Rechercher (texte, référence, thème)" aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={`${input} w-auto`} aria-label="Type de source" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="">Toutes les sources</option>
              {SOURCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select className={`${input} w-auto`} aria-label="État de conformité" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous les états</option>
              {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
            </select>
            <select className={`${input} w-auto`} aria-label="Applicabilité" value={applicability} onChange={(e) => setApplicability(e.target.value)}>
              <option value="">Applicabilité : toutes</option>
              <option value="true">Applicables</option>
              <option value="false">Non applicables</option>
            </select>
          </div>

          {list.isError && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{errorMessage(list.error, "Impossible de charger le registre.")}</p>}

          {list.isLoading && siteId ? (
            <PageSkeleton rows={4} />
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-display font-bold">{siteId ? "Aucune obligation pour ces critères." : "Sélectionnez un site."}</p>
              <p className={`mx-auto mt-1 max-w-md ${muted}`}>Commencez par les lois, permis et engagements qui s'appliquent à vos activités, ou importez votre registre de veille avec le canevas.</p>
              {siteId && <button type="button" className={`${primary} mt-4`} onClick={openCreate}><Plus className="h-4 w-4" /> Créer la première obligation</button>}
            </div>
          ) : (
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Réf.</th><th className="px-3 py-2">Obligation</th><th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Applicabilité</th><th className="px-3 py-2">Conformité</th><th className="px-3 py-2">Prochaine évaluation</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const state = STATUS[o.compliance_status];
                    return (
                      <tr key={o.id} className="border-t border-border align-top">
                        <td className="px-3 py-3 font-semibold">{o.ref}</td>
                        <td className="px-3 py-3">
                          <button type="button" className="text-left font-semibold hover:text-primary" onClick={() => setDetailId(o.id)}>{o.title ?? o.regulatory_reference}</button>
                          <p className={muted}>{o.aspect.name}</p>
                          {o.analysis_status === "to_analyze" && <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">À analyser</span>}
                        </td>
                        <td className="px-3 py-3">{labelOf(SOURCE_TYPES, o.source_type)}</td>
                        <td className="px-3 py-3">{o.is_applicable === null ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">À qualifier</span> : o.is_applicable ? "Applicable" : "Non applicable"}</td>
                        <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state.tone}`}>{state.label}</span></td>
                        <td className="px-3 py-3">{o.next_evaluation_date ? formatDateFR(o.next_evaluation_date) : "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" className={secondary} onClick={() => setDetailId(o.id)}>Ouvrir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "tableau" && <ComplianceDashboardTab siteId={siteId} />}

      {tab === "veille" && (
        <div className={`${card} p-5`}>
          <h2 className="font-display text-lg font-bold">Textes à analyser</h2>
          <p className={muted}>Un texte nouveau ou modifié exige une analyse d'impact sur vos aspects et votre système. Le responsable est notifié.</p>
          {watch.isLoading ? <PageSkeleton rows={2} /> : (watch.data ?? []).length === 0 ? (
            <p className={`py-8 text-center ${muted}`}>Aucun texte en attente d'analyse.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(watch.data ?? []).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">{o.ref} — {o.title ?? o.regulatory_reference}</p>
                    <p className={muted}>{o.regulatory_change_status === "new" ? "Texte nouveau" : "Texte modifié"} · {o.aspect.name}{o.watch_source ? ` · source : ${o.watch_source}` : ""}</p>
                  </div>
                  <button type="button" className={primary} onClick={() => setDetailId(o.id)}>Analyser</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {formOpen && (
        <ObligationForm
          key={editing?.id ?? "new"}
          obligation={editing}
          siteId={siteId}
          busy={mutations.save.isPending}
          error={formError}
          onSubmit={(value) => void submit(value)}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}

      {detail && (
        <ObligationDetail
          obligation={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => { setEditing(detail); setFormError(null); setFormOpen(true); setDetailId(null); }}
          onEvaluate={() => setEvaluating(detail)}
          onDelete={() => setToDelete(detail)}
        />
      )}

      {evaluating && (
        <EvaluationDialog
          obligation={evaluating}
          onClose={() => setEvaluating(null)}
          onDone={(message) => { toast.success(message); setEvaluating(null); }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette obligation ?"
        description="L'historique de ses évaluations est conservé dans les journaux, mais l'obligation sort du registre."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          const target = toDelete;
          setToDelete(null);
          if (target) mutations.remove.mutateAsync(target.id).then(() => { toast.success("Obligation supprimée."); setDetailId(null); }, (e: Error) => toast.error(e.message));
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
