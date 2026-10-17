import { useOverview, type Overview } from "@/integrations/backend/performance";
import { PageSkeleton, card, muted } from "../planning/shared";

const pct = (value: number | null): string => (value === null ? "—" : `${value} %`);

/** Indicateurs d'efficacité du SME (M14-07) calculés sur les données réelles des autres modules. */
export function OverviewTab({ siteId }: { siteId: string }) {
  const { data, isLoading } = useOverview(siteId || undefined, Boolean(siteId));
  if (isLoading || !data) return <PageSkeleton rows={4} />;

  const tiles = (o: Overview) => [
    { label: "Objectifs atteints", value: pct(o.objectives.rate), detail: `${o.objectives.achieved} sur ${o.objectives.total}` },
    { label: "Actions à l'heure", value: pct(o.actions.rate), detail: `${o.actions.on_time} sur ${o.actions.due} échues ou terminées` },
    { label: "Obligations évaluées (12 mois)", value: pct(o.obligations.rate), detail: `${o.obligations.evaluated_12m} sur ${o.obligations.applicable} applicables` },
    { label: "Non-conformités récurrentes", value: pct(o.nonconformities.recurring_rate), detail: `${o.nonconformities.recurring} sur ${o.nonconformities.total_12m}` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles(data).map((tile) => (
          <div key={tile.label} className={`${card} p-4`}><p className="text-2xl font-extrabold">{tile.value}</p><p className="text-sm font-semibold">{tile.label}</p><p className={muted}>{tile.detail}</p></div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={`${card} p-4`}><p className="text-2xl font-extrabold">{data.indicators.active}</p><p className="text-sm font-semibold">Indicateurs actifs</p></div>
        <div className={`${card} p-4`}><p className="text-2xl font-extrabold text-red-700">{data.indicators.by_state.alert}</p><p className="text-sm font-semibold">Seuils d'alerte dépassés</p></div>
        <div className={`${card} p-4`}><p className="text-2xl font-extrabold text-amber-700">{data.indicators.readings_overdue}</p><p className="text-sm font-semibold">Relevés en retard</p></div>
        <div className={`${card} p-4`}><p className="text-2xl font-extrabold text-red-700">{data.instruments.not_valid}</p><p className="text-sm font-semibold">Instruments hors validité</p><p className={muted}>sur {data.instruments.total}</p></div>
      </div>
    </div>
  );
}
