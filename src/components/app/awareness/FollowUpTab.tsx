import { useAwarenessOverview } from "@/integrations/backend/awareness";
import { PageSkeleton, card, muted } from "../planning/shared";

/** Taux de sensibilisation par site et par campagne (M9-05). */
export function FollowUpTab({ siteId }: { siteId: string }) {
  const { data, isLoading } = useAwarenessOverview(undefined, true);
  if (isLoading || !data) return <PageSkeleton rows={3} />;
  void siteId;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {data.by_site.map((site) => (
          <div key={site.site_id} className={`${card} p-4`}>
            <p className="font-semibold">{site.site}</p>
            <p className="text-3xl font-extrabold">{site.rate === null ? "—" : `${site.rate} %`}</p>
            <p className={muted}>{site.completed} sur {site.participants} sensibilisé(s) · {site.talks_90d} causerie(s) sur 90 jours</p>
          </div>
        ))}
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Campagne</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Terminée par</th><th className="px-3 py-2">Taux</th></tr></thead>
          <tbody>
            {data.campaigns.map((c) => (
              <tr key={c.id} className="border-t border-border"><td className="px-3 py-3 font-semibold">{c.title}<p className={muted}>{c.ref}</p></td><td className="px-3 py-3">{c.status === "active" ? "En cours" : "Clôturée"}</td><td className="px-3 py-3">{c.completed} / {c.participants}</td><td className="px-3 py-3 font-bold">{c.rate === null ? "—" : `${c.rate} %`}</td></tr>
            ))}
            {data.campaigns.length === 0 && <tr><td colSpan={4} className={`px-3 py-6 text-center ${muted}`}>Aucune campagne lancée.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
