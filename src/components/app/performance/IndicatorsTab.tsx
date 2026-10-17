import { useState } from "react";
import { Library, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIES, FREQUENCIES, useAnalysis, useIndicators, useLibrary, usePerformanceMutations, type Indicator,
} from "@/integrations/backend/performance";
import { Drawer, Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, orNull, orNumber, type FieldSpec } from "../emergency/FieldsForm";
import { Sparkline } from "./Sparkline";
import { STATE, TREND } from "./performance-config";

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Nom de l'indicateur", type: "text", required: true },
  { key: "unit", label: "Unité", type: "text", required: true },
  { key: "category", label: "Catégorie", type: "select", options: CATEGORIES },
  { key: "frequency", label: "Fréquence de mesure", type: "select", options: FREQUENCIES },
  { key: "threshold_direction", label: "Le seuil d'alerte est…", type: "select", options: [{ value: "max", label: "Un maximum (alerte au-dessus)" }, { value: "min", label: "Un minimum (alerte en dessous)" }] },
  { key: "target_value", label: "Cible", type: "number" },
  { key: "alert_threshold", label: "Seuil d'alerte", type: "number" },
  { key: "normalization", label: "Normalisation par l'activité", type: "select", options: [{ value: "none", label: "Aucune" }, { value: "per_unit_produced", label: "Par unité produite" }, { value: "per_employee", label: "Par employé" }, { value: "per_surface", label: "Par surface" }] },
  { key: "scope", label: "Périmètre", type: "text" },
  { key: "data_source", label: "Source de la donnée", type: "text" },
  { key: "formula", label: "Formule de calcul", type: "textarea" },
  { key: "measurement_method", label: "Méthode de mesure", type: "textarea" },
];

/** Définition des indicateurs (M14-01), bibliothèque (M14-02) et analyse (M14-06). */
export function IndicatorsTab({ siteId }: { siteId: string }) {
  const { data: indicators = [], isLoading } = useIndicators(siteId || undefined, Boolean(siteId));
  const actions = usePerformanceMutations();
  const [editing, setEditing] = useState<Indicator | "new" | null>(null);
  const [library, setLibrary] = useState(false);
  const [analysed, setAnalysed] = useState<Indicator | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={muted}>Chaque indicateur précise l'unité, la fréquence, la source de la donnée et ses seuils.</p>
        <div className="flex gap-2">
          <button type="button" className={secondary} disabled={!siteId} onClick={() => setLibrary(true)}><Library className="h-4 w-4" /> Bibliothèque</button>
          <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setEditing("new"); }}><Plus className="h-4 w-4" /> Nouvel indicateur</button>
        </div>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : indicators.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucun indicateur : activez-en depuis la bibliothèque ou créez le vôtre.</p> : (
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Indicateur</th><th className="px-3 py-2">Fréquence</th><th className="px-3 py-2">Cible / alerte</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => setAnalysed(i)}>{i.title}</button><p className={muted}>{i.ref} · {i.unit}{i.is_active ? "" : " · désactivé"}</p></td>
                  <td className="px-3 py-3">{FREQUENCIES.find((f) => f.value === i.frequency)?.label}</td>
                  <td className="px-3 py-3">{i.target_value ?? "—"} / {i.alert_threshold ?? "—"} {i.unit}</td>
                  <td className="px-3 py-3 text-right"><button type="button" className={secondary} onClick={() => { setError(null); setEditing(i); }}>Modifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <Modal title={editing === "new" ? "Nouvel indicateur" : "Modifier l'indicateur"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            busy={actions.saveIndicator.isPending}
            error={error}
            initial={editing === "new" ? { frequency: "monthly", threshold_direction: "max", normalization: "none", category: "other" } : {
              title: editing.title, unit: editing.unit, category: editing.category, frequency: editing.frequency, threshold_direction: editing.threshold_direction,
              target_value: editing.target_value === null ? "" : String(editing.target_value), alert_threshold: editing.alert_threshold === null ? "" : String(editing.alert_threshold),
              normalization: editing.normalization, scope: editing.scope ?? "", data_source: editing.data_source ?? "", formula: editing.formula ?? "", measurement_method: editing.measurement_method ?? "",
            }}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await actions.saveIndicator.mutateAsync({
                  id: editing === "new" ? undefined : editing.id,
                  input: {
                    ...(editing === "new" ? { site_id: siteId } : {}),
                    title: String(v["title"]), unit: String(v["unit"]), category: String(v["category"] || "other"), frequency: String(v["frequency"] || "monthly") as Indicator["frequency"],
                    threshold_direction: String(v["threshold_direction"] || "max") as Indicator["threshold_direction"], target_value: orNumber(v["target_value"]), alert_threshold: orNumber(v["alert_threshold"]),
                    normalization: String(v["normalization"] || "none") as Indicator["normalization"], scope: orNull(v["scope"]), data_source: orNull(v["data_source"]),
                    formula: orNull(v["formula"]), measurement_method: orNull(v["measurement_method"]),
                  },
                });
                toast.success("Indicateur enregistré.");
                setEditing(null);
              } catch (e) {
                setError(errorMessage(e, "Enregistrement impossible."));
              }
            }}
          />
        </Modal>
      )}
      {library && <LibraryModal siteId={siteId} onClose={() => setLibrary(false)} />}
      {analysed && <AnalysisDrawer indicator={analysed} onClose={() => setAnalysed(null)} />}
    </div>
  );
}

function LibraryModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const { data = [] } = useLibrary(siteId || undefined, Boolean(siteId));
  const actions = usePerformanceMutations();
  const [picked, setPicked] = useState<string[]>([]);

  return (
    <Modal title="Bibliothèque d'indicateurs" description="Activez les indicateurs utiles à votre site ; vous pourrez ensuite ajuster cibles et seuils." onClose={onClose}>
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {data.map((item) => (
          <li key={item.code}>
            <label className={`flex items-center gap-2 rounded-lg p-2 text-sm ${item.activated ? "opacity-50" : "hover:bg-muted"}`}>
              <input type="checkbox" disabled={item.activated} checked={picked.includes(item.code)} onChange={(e) => setPicked(e.target.checked ? [...picked, item.code] : picked.filter((c) => c !== item.code))} />
              <span className="flex-1 font-semibold">{item.title}</span><span className={muted}>{item.unit}{item.activated ? " · déjà activé" : ""}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <button type="button" className={primary} disabled={picked.length === 0 || actions.activateLibrary.isPending}
          onClick={() => actions.activateLibrary.mutateAsync({ siteId, codes: picked }).then((r) => { toast.success(`${r.created} indicateur(s) activé(s).`); onClose(); }, (e: unknown) => toast.error(errorMessage(e, "Activation impossible.")))}>
          Activer la sélection
        </button>
      </div>
    </Modal>
  );
}

function AnalysisDrawer({ indicator, onClose }: { indicator: Indicator; onClose: () => void }) {
  const { data, isLoading } = useAnalysis(indicator.id);
  const actions = usePerformanceMutations();

  return (
    <Drawer title={indicator.title} subtitle={`${indicator.ref} · analyse sur 12 mois`} onClose={onClose} wide>
      {isLoading || !data ? <PageSkeleton rows={3} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATE[data.threshold_state].tone}`}>{STATE[data.threshold_state].label}</span>
            <span className={muted}>Tendance : {TREND[data.trend]}{data.change_vs_previous_pct !== null ? ` · ${data.change_vs_previous_pct > 0 ? "+" : ""}${data.change_vs_previous_pct} % vs période précédente` : ""}</span>
          </div>
          <Sparkline values={data.series.map((s) => s.value)} target={indicator.target_value} alert={indicator.alert_threshold} label={`Évolution de ${indicator.title}`} />
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[["Relevés", data.count], ["Moyenne", data.average], ["Minimum", data.min], ["Maximum", data.max]].map(([label, value]) => (
              <div key={String(label)}><dt className={muted}>{label}</dt><dd className="font-bold">{value ?? "—"}</dd></div>
            ))}
          </dl>
          {data.flagged_readings > 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{data.flagged_readings} relevé(s) signalé(s) (doublon, valeur aberrante ou instrument hors validité).</p>}
          {data.threshold_state === "alert" && (
            <button type="button" className={primary} disabled={actions.createAction.isPending}
              onClick={() => actions.createAction.mutateAsync(indicator.id).then((r) => toast.success(`Action ${r.data.ref} créée dans le plan d'actions.`), (e: unknown) => toast.error(errorMessage(e, "Création impossible.")))}>
              Créer une action corrective
            </button>
          )}
        </div>
      )}
    </Drawer>
  );
}
