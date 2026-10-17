import { useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { toast } from "sonner";
import { CHANGE_TYPES, useChangeMutations, useChanges, usePeriodSummary } from "@/integrations/backend/changes";
import { useCurrentSite } from "@/hooks/use-workspace";
import { Modal } from "../overlay";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, formatDateFR, muted, primary } from "../planning/shared";
import { FieldsForm, orNull, type FieldSpec } from "../emergency/FieldsForm";
import { ChangeDetail } from "./ChangeDetail";
import { STATUS } from "./changes-config";

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Intitulé du changement", type: "text", required: true },
  { key: "change_type", label: "Type de changement", type: "select", required: true, options: CHANGE_TYPES.map((t) => ({ value: t.value, label: t.label })) },
  { key: "origin", label: "Origine", type: "select", options: [{ value: "internal", label: "Interne" }, { value: "external", label: "Externe" }] },
  { key: "duration", label: "Durée", type: "select", options: [{ value: "permanent", label: "Permanent" }, { value: "temporary", label: "Temporaire" }] },
  { key: "planned_start_date", label: "Début prévu", type: "date" },
  { key: "planned_end_date", label: "Fin prévue (temporaire)", type: "date" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "is_planned", label: "Changement planifié (décochez s'il a déjà eu lieu)", type: "checkbox", full: true },
  { key: "unplanned_consequences", label: "Conséquences constatées (changement non planifié)", type: "textarea" },
  { key: "mitigation_measures", label: "Mesures d'atténuation (changement non planifié)", type: "textarea" },
];

/** Gestion des changements — ISO 14001:2026 §6.3 : demande, analyse d'impact, décision, mise en œuvre, revue. */
export function ChangesPage() {
  const [siteId] = useCurrentSite();
  const [status, setStatus] = useState("");
  const { data: changes = [], isLoading } = useChanges(siteId || undefined, status || undefined, Boolean(siteId));
  const { data: summary } = usePeriodSummary(Boolean(siteId));
  const actions = useChangeMutations();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification — ISO 14001:2026 §6.3"
        title="Gestion des changements"
        description="Tout changement susceptible d'affecter le système de management est analysé avant approbation, puis suivi jusqu'à sa revue."
        icon={GitBranch}
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Changements (12 mois)", value: summary.total },
            { label: "À approuver", value: summary.by_status["awaiting_approval"] ?? 0 },
            { label: "En mise en œuvre", value: summary.by_status["implementing"] ?? 0 },
            { label: "Non planifiés", value: summary.unplanned },
          ].map((item) => (
            <div key={item.label} className={`${card} p-4`}><p className="text-2xl font-extrabold">{item.value}</p><p className={muted}>{item.label}</p></div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Filtrer par statut" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
        </select>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Nouveau changement</button>
      </div>

      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={4} /> : changes.length === 0 ? (
          <p className={`py-8 text-center ${muted}`}>Aucun changement enregistré.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Changement</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Début prévu</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => setOpenId(change.id)}>
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold underline-offset-2 hover:underline" onClick={() => setOpenId(change.id)}>{change.title}</button><p className={muted}>{change.ref}{change.is_planned ? "" : " · non planifié"}</p></td>
                  <td className="px-3 py-3">{CHANGE_TYPES.find((t) => t.value === change.change_type)?.label}</td>
                  <td className="px-3 py-3">{formatDateFR(change.planned_start_date)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[change.status].tone}`}>{STATUS[change.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <Modal title="Nouveau changement" onClose={() => setCreating(false)}>
          <FieldsForm
            fields={FIELDS}
            busy={actions.save.isPending}
            error={error}
            initial={{ origin: "internal", duration: "permanent", is_planned: true }}
            onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const created = await actions.save.mutateAsync({
                  input: {
                    site_id: siteId, title: String(v["title"]), change_type: String(v["change_type"]), origin: String(v["origin"] || "internal"),
                    duration: String(v["duration"] || "permanent"), is_planned: v["is_planned"] === true, description: orNull(v["description"]),
                    planned_start_date: orNull(v["planned_start_date"]), planned_end_date: orNull(v["planned_end_date"]),
                    unplanned_consequences: orNull(v["unplanned_consequences"]), mitigation_measures: orNull(v["mitigation_measures"]),
                  },
                });
                toast.success("Changement enregistré : réalisez maintenant l'analyse d'impact.");
                setCreating(false);
                setOpenId(created.id);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Modal>
      )}

      {openId !== null && <ChangeDetail id={openId} siteId={siteId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
