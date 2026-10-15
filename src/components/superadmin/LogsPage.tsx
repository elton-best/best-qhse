import { useState } from "react";
import { ScrollText } from "lucide-react";
import { useSaLogStats, useSaLogs, type SaLog } from "@/integrations/backend/superadmin";
import { Badge, Empty, ErrorNote, Pager, SaHeader, Skeleton, StatCard, field, formatDate, muted, panel } from "./sa-ui";

const RISK_TONE: Record<string, "green" | "amber" | "red" | "slate"> = { low: "slate", medium: "amber", high: "red", critical: "red" };
const RISK_LABEL: Record<string, string> = { low: "Faible", medium: "Moyen", high: "Élevé", critical: "Critique" };

function who(log: SaLog): string {
  return log.user?.name ?? log.user?.email ?? "Système";
}

/** Historique des événements de sécurité de toute la plateforme (lecture seule, non modifiable). */
export function LogsPage() {
  const [risk, setRisk] = useState("");
  const [eventType, setEventType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const dateFilters = { ...(from ? { date_from: from } : {}), ...(to ? { date_to: to } : {}) };
  const filters = { ...dateFilters, ...(risk ? { risk_level: risk } : {}), ...(eventType.trim() ? { event_type: eventType.trim() } : {}), page: pageNumber };
  const { data, isLoading, error } = useSaLogs(filters);
  const { data: stats } = useSaLogStats(dateFilters);
  const reset = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPageNumber(1);
  };

  return (
    <>
      <SaHeader title="Journaux de sécurité" description="Historique en lecture seule des connexions, accès et actions sensibles, toutes entreprises confondues." icon={ScrollText} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Événements" value={stats?.total_events ?? "—"} />
        <StatCard label="Aujourd'hui" value={stats?.events_today ?? "—"} />
        <StatCard label="Risque élevé" value={stats?.high_risk_events ?? "—"} tone="text-amber-600" />
        <StatCard label="Critiques" value={stats?.critical_events ?? "—"} tone="text-red-600" />
        <StatCard label="Échecs de connexion (jour)" value={stats?.failed_logins_today ?? "—"} tone="text-red-600" />
      </div>

      <div className="flex flex-wrap gap-2">
        <select className={`${field} w-auto`} aria-label="Niveau de risque" value={risk} onChange={(e) => reset(setRisk)(e.target.value)}>
          <option value="">Tous les risques</option>
          {Object.entries(RISK_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input className={`${field} w-48`} placeholder="Type d'événement" aria-label="Type d'événement" value={eventType} onChange={(e) => reset(setEventType)(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">Du <input type="date" className={field} value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm">au <input type="date" className={field} value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
      </div>

      <div className={`${panel} p-4`}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <ErrorNote error={error} fallback="Impossible de charger les journaux." />
        ) : !data || data.items.length === 0 ? (
          <Empty>Aucun événement pour ces critères.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Utilisateur</th>
                  <th className="px-3 py-2">Entreprise</th>
                  <th className="px-3 py-2">Événement</th>
                  <th className="px-3 py-2">Risque</th>
                  <th className="px-3 py-2">Adresse IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => (
                  <tr key={log.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(log.created_at, true)}</td>
                    <td className="px-3 py-2">{who(log)}</td>
                    <td className="px-3 py-2">{log.enterprise?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{log.action}</p>
                      <p className={muted}>{log.event_type}{log.resource_type ? ` · ${log.resource_type}${log.resource_id ? ` #${log.resource_id}` : ""}` : ""}</p>
                    </td>
                    <td className="px-3 py-2"><Badge tone={RISK_TONE[log.risk_level] ?? "slate"}>{RISK_LABEL[log.risk_level] ?? log.risk_level}</Badge></td>
                    <td className="px-3 py-2">{log.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPageNumber} />
      </div>
    </>
  );
}
