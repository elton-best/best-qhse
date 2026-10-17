import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { downloadEvidence, useIndicators, usePerformanceMutations, useReadings, type Reading } from "@/integrations/backend/performance";
import { downloadBlob } from "@/integrations/backend/realisation";
import { Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, muted } from "../planning/shared";
import { FieldsForm, orNull, type FieldSpec } from "../emergency/FieldsForm";
import { FLAG_LABEL } from "./performance-config";

const FIELDS: FieldSpec[] = [
  { key: "value", label: "Valeur corrigée", type: "text", required: true },
  { key: "correction_reason", label: "Motif de la correction (5 caractères minimum)", type: "textarea", required: true },
];

/** Historique des relevés avec traçabilité (M14-04) : auteur, instrument, preuve, signalements et corrections. */
export function ReadingsTab({ siteId }: { siteId: string }) {
  const [indicatorId, setIndicatorId] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const { data: indicators = [] } = useIndicators(siteId || undefined, Boolean(siteId));
  const { data: readings = [], isLoading } = useReadings({ site_id: siteId || undefined, indicator_id: indicatorId || undefined, flagged: flaggedOnly ? "1" : undefined }, Boolean(siteId));
  const actions = usePerformanceMutations();
  const [correcting, setCorrecting] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Filtrer par indicateur" className="rounded-xl border border-border bg-background px-3 py-2 text-sm" value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
          <option value="">Tous les indicateurs</option>
          {indicators.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} /> Relevés signalés uniquement</label>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={4} /> : readings.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucun relevé.</p> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Indicateur</th><th className="px-3 py-2">Valeur</th><th className="px-3 py-2">Traçabilité</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-3">{formatDateFR(r.measured_on)}</td>
                  <td className="px-3 py-3">{r.indicator?.title}</td>
                  <td className="px-3 py-3 font-semibold">{r.value} {r.unit}{r.correction_reason && <p className={muted}>Corrige un relevé : {r.correction_reason}</p>}</td>
                  <td className="px-3 py-3 text-xs">
                    <p>{r.recorder?.name ?? "—"} · {r.source === "offline" ? "hors connexion" : r.source === "import" ? "import" : "saisie"}{r.instrument ? ` · ${r.instrument.title}` : ""}</p>
                    {(r.flags ?? []).map((flag) => <span key={flag} className="mr-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{FLAG_LABEL[flag] ?? flag}</span>)}
                    {r.evidence_name && (
                      <button type="button" className="mt-1 flex items-center gap-1 font-semibold text-primary hover:underline"
                        onClick={() => downloadEvidence(r.id).then((blob) => downloadBlob(blob, r.evidence_name ?? "preuve"), (e: unknown) => toast.error(errorMessage(e, "Téléchargement impossible.")))}><Paperclip className="h-3 w-3" /> {r.evidence_name}</button>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{!r.superseded_by_id && <button type="button" className="text-xs font-bold text-primary hover:underline" onClick={() => { setError(null); setCorrecting(r); }}>Corriger</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {correcting && (
        <Modal title="Corriger un relevé" description="Le relevé d'origine est conservé avec le motif de la correction." onClose={() => setCorrecting(null)}>
          <FieldsForm fields={FIELDS} busy={actions.correct.isPending} error={error} initial={{ value: String(correcting.value) }} submitLabel="Enregistrer la correction" onCancel={() => setCorrecting(null)}
            onSubmit={async (v) => {
              setError(null);
              const parsed = Number(String(v["value"]).replace(",", "."));
              if (Number.isNaN(parsed)) { setError("La valeur doit être numérique."); return; }
              try {
                await actions.correct.mutateAsync({ id: correcting.id, value: parsed, correction_reason: orNull(v["correction_reason"]) ?? "" });
                toast.success("Correction enregistrée.");
                setCorrecting(null);
              } catch (e) {
                setError(errorMessage(e, "Correction impossible."));
              }
            }} />
        </Modal>
      )}
    </div>
  );
}
