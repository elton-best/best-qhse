import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useInstruments, usePerformanceMutations, type Instrument } from "@/integrations/backend/performance";
import { Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "../emergency/FieldsForm";
import { INSTRUMENT_TYPES, VALIDITY } from "./performance-config";

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Instrument", type: "text", required: true },
  { key: "instrument_type", label: "Type", type: "select", options: INSTRUMENT_TYPES },
  { key: "serial_number", label: "N° de série", type: "text" },
  { key: "location", label: "Emplacement", type: "text" },
  { key: "measurement_range", label: "Étendue de mesure", type: "text" },
  { key: "last_calibration_date", label: "Dernier étalonnage", type: "date" },
  { key: "calibration_frequency_days", label: "Périodicité (jours)", type: "number" },
];

const CALIBRATION_FIELDS: FieldSpec[] = [
  { key: "calibrated_on", label: "Date de l'étalonnage", type: "date", required: true },
  { key: "result", label: "Résultat", type: "select", required: true, options: [{ value: "pass", label: "Conforme" }, { value: "fail", label: "Non conforme (mise hors service)" }] },
  { key: "certificate_ref", label: "Référence du certificat (obligatoire si conforme)", type: "text" },
  { key: "provider", label: "Organisme", type: "text" },
  { key: "note", label: "Observations", type: "textarea" },
];

/** Registre des instruments de surveillance et de mesure (M14-05). */
export function InstrumentsTab({ siteId }: { siteId: string }) {
  const { data: instruments = [], isLoading } = useInstruments(siteId || undefined, Boolean(siteId));
  const actions = usePerformanceMutations();
  const [editing, setEditing] = useState<Instrument | "new" | null>(null);
  const [calibrating, setCalibrating] = useState<Instrument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Une mesure faite avec un instrument hors validité est signalée dans l'historique des relevés.</p>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Ajouter un instrument</button>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : instruments.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucun instrument enregistré.</p> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Instrument</th><th className="px-3 py-2">Dernier étalonnage</th><th className="px-3 py-2">Échéance</th><th className="px-3 py-2">Validité</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => { setError(null); setEditing(i); }}>{i.title}</button><p className={muted}>{i.ref}{i.serial_number ? ` · N° ${i.serial_number}` : ""}{i.location ? ` · ${i.location}` : ""}</p></td>
                  <td className="px-3 py-3">{formatDateFR(i.last_calibration_date)}</td>
                  <td className="px-3 py-3">{formatDateFR(i.next_calibration_date)}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${VALIDITY[i.validity].tone}`}>{VALIDITY[i.validity].label}</span></td>
                  <td className="px-3 py-3 text-right"><button type="button" className={secondary} onClick={() => { setError(null); setCalibrating(i); }}>Enregistrer un étalonnage</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing === "new" ? "Nouvel instrument" : "Modifier l'instrument"} onClose={() => setEditing(null)}>
          <FieldsForm fields={FIELDS} busy={actions.saveInstrument.isPending} error={error} onCancel={() => setEditing(null)}
            initial={editing === "new" ? { instrument_type: "meter", calibration_frequency_days: "365" } : {
              title: editing.title, instrument_type: editing.instrument_type, serial_number: editing.serial_number ?? "", location: editing.location ?? "",
              measurement_range: editing.measurement_range ?? "", last_calibration_date: editing.last_calibration_date?.slice(0, 10) ?? "", calibration_frequency_days: String(editing.calibration_frequency_days),
            }}
            onSubmit={async (v) => {
              setError(null);
              try {
                await actions.saveInstrument.mutateAsync({
                  id: editing === "new" ? undefined : editing.id,
                  input: {
                    ...(editing === "new" ? { site_id: siteId } : {}), title: String(v["title"]), instrument_type: String(v["instrument_type"] || "other"),
                    serial_number: orNull(v["serial_number"]), location: orNull(v["location"]), measurement_range: orNull(v["measurement_range"]),
                    last_calibration_date: orNull(v["last_calibration_date"]), calibration_frequency_days: orNumber(v["calibration_frequency_days"]) ?? 365,
                  },
                });
                toast.success("Instrument enregistré.");
                setEditing(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }} />
        </Modal>
      )}
      {calibrating && (
        <Modal title="Étalonnage ou vérification" description={calibrating.title} onClose={() => setCalibrating(null)}>
          <FieldsForm fields={CALIBRATION_FIELDS} busy={actions.calibrate.isPending} error={error} initial={{ calibrated_on: today, result: "pass" }} onCancel={() => setCalibrating(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const response = await actions.calibrate.mutateAsync({
                  id: calibrating.id, calibrated_on: String(v["calibrated_on"]), result: String(v["result"]) as "pass" | "fail",
                  ...(orNull(v["certificate_ref"]) ? { certificate_ref: orNull(v["certificate_ref"])! } : {}),
                  ...(orNull(v["provider"]) ? { provider: orNull(v["provider"])! } : {}), ...(orNull(v["note"]) ? { note: orNull(v["note"])! } : {}),
                });
                toast.success(response.readings_to_review > 0 ? `Instrument mis hors service : ${response.readings_to_review} relevé(s) à réexaminer.` : "Étalonnage enregistré.");
                setCalibrating(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }} />
        </Modal>
      )}
    </div>
  );
}
