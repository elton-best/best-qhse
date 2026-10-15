import { Link } from "@tanstack/react-router";
import { AlertTriangle, LayoutDashboard } from "lucide-react";
import { useSaEnterprises, useSaLogStats, useSaStats } from "@/integrations/backend/superadmin";
import { Empty, ErrorNote, SaHeader, Skeleton, StatCard, btnGhost, formatDate, muted, panel } from "./sa-ui";

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${30 - (value / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" className="h-12 w-full" role="img" aria-label="Évolution hebdomadaire des revenus">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
    </svg>
  );
}

/** Vue d'ensemble de la plateforme : inscriptions, KYC en attente, abonnements et alertes de sécurité. */
export function DashboardPage() {
  const { data: stats, isLoading, error } = useSaStats();
  const { data: pending } = useSaEnterprises({ approval_status: "pending", per_page: 5, kyc_priority: 1 });
  const { data: logStats } = useSaLogStats({});

  return (
    <>
      <SaHeader title="Tableau de bord de la plateforme" description="Suivi des entreprises inscrites, des validations KYC, des abonnements et de la sécurité." icon={LayoutDashboard} />

      {isLoading ? (
        <Skeleton rows={3} />
      ) : error || !stats ? (
        <ErrorNote error={error} fallback="Impossible de charger les statistiques." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="KYC en attente" value={stats.kyc.pending} tone={stats.kyc.pending ? "text-amber-600" : "text-emerald-600"} />
            <StatCard label="Entreprises actives" value={stats.companies.active} />
            <StatCard label="Entreprises suspendues" value={stats.companies.suspended} tone={stats.companies.suspended ? "text-red-600" : "text-primary"} />
            <StatCard label="Abonnements actifs" value={`${stats.subscriptions.active}/${stats.subscriptions.total}`} />
            <StatCard label="Inscriptions (semaine)" value={stats.weekly.new_registrations} />
            <StatCard label="KYC validés (semaine)" value={stats.weekly.kyc_validations} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className={`${panel} p-5 lg:col-span-2`}>
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold">Dossiers KYC à traiter</h2>
                <Link to="/superadmin/$section" params={{ section: "kyc" }} className={btnGhost}>
                  Voir tout
                </Link>
              </div>
              {!pending || pending.items.length === 0 ? (
                <Empty>Aucun dossier en attente.</Empty>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {pending.items.map((enterprise) => (
                    <li key={enterprise.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-semibold">{enterprise.name}</p>
                        <p className={muted}>Inscrite le {formatDate(enterprise.created_at)}</p>
                      </div>
                      <Link to="/superadmin/$section" params={{ section: "kyc" }} className="text-sm font-semibold text-primary hover:underline">
                        Examiner
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-4">
              <section className={`${panel} p-5`}>
                <h2 className="font-display font-bold">Revenus des offres actives</h2>
                <p className="mt-1 font-display text-2xl font-extrabold text-primary">{Number(stats.revenue.total).toLocaleString("fr-FR")} FCFA</p>
                <p className={muted}>{stats.revenue.trend_pct >= 0 ? "+" : ""}{stats.revenue.trend_pct} % vs semaine précédente</p>
                <Sparkline values={stats.revenue.series} />
              </section>

              <section className={`${panel} p-5`}>
                <h2 className="flex items-center gap-2 font-display font-bold">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Sécurité
                </h2>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Événements aujourd'hui</dt><dd className="font-bold">{logStats?.events_today ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt>Risque élevé</dt><dd className="font-bold">{logStats?.high_risk_events ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt>Critiques</dt><dd className={`font-bold ${logStats?.critical_events ? "text-red-600" : ""}`}>{logStats?.critical_events ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt>Échecs de connexion (jour)</dt><dd className="font-bold">{logStats?.failed_logins_today ?? "—"}</dd></div>
                </dl>
                <Link to="/superadmin/$section" params={{ section: "journaux" }} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                  Ouvrir les journaux
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
