import { useState } from "react";
import { Building2 } from "lucide-react";
import { useSaEnterprises } from "@/integrations/backend/superadmin";
import { EnterpriseDrawer, approvalBadge, statusBadge } from "./EnterpriseDrawer";
import { Empty, ErrorNote, Pager, Skeleton, SaHeader, btnGhost, field, formatDate, muted, panel } from "./sa-ui";

/** Contrôle des entreprises inscrites : statut, suspension, réactivation et suppression. */
export function EnterprisesPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, error } = useSaEnterprises({ status, search: search.trim(), page: pageNumber, per_page: 15 });

  return (
    <>
      <SaHeader title="Entreprises" description="Suivez toutes les entreprises inscrites, leur statut et leur dossier, et suspendez ou réactivez un accès en cas de besoin." icon={Building2} />

      <div className="flex flex-wrap gap-2">
        <input className={`${field} max-w-xs`} placeholder="Rechercher (nom, e-mail, RCCM)" aria-label="Rechercher" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <select className={`${field} w-auto`} aria-label="Statut" value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1); }}>
          <option value="">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="pending">En attente</option>
          <option value="suspended">Suspendues</option>
          <option value="rejected">Rejetées</option>
        </select>
      </div>

      <div className={`${panel} p-4`}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <ErrorNote error={error} fallback="Impossible de charger les entreprises." />
        ) : !data || data.items.length === 0 ? (
          <Empty>Aucune entreprise ne correspond à ces critères.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Entreprise</th>
                  <th className="px-3 py-2">Référence</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">KYC</th>
                  <th className="px-3 py-2">Inscrite le</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((enterprise) => (
                  <tr key={enterprise.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{enterprise.name}</p>
                      <p className={muted}>{enterprise.email}</p>
                    </td>
                    <td className="px-3 py-3">{enterprise.ref}</td>
                    <td className="px-3 py-3">{statusBadge(enterprise.status)}</td>
                    <td className="px-3 py-3">{approvalBadge(enterprise.approval_status)}</td>
                    <td className="px-3 py-3">{formatDate(enterprise.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className={btnGhost} onClick={() => setOpenId(enterprise.id)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPageNumber} />
      </div>

      {openId !== null && <EnterpriseDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
