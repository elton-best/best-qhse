import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useSaEnterprises } from "@/integrations/backend/superadmin";
import { EnterpriseDrawer, approvalBadge } from "./EnterpriseDrawer";
import { Empty, ErrorNote, Pager, Skeleton, SaHeader, btnGhost, field, formatDate, muted, panel } from "./sa-ui";

const TABS = [
  { value: "pending", label: "En attente" },
  { value: "approved", label: "Validés" },
  { value: "rejected", label: "Rejetés" },
] as const;

/** File de validation des dossiers KYC des entreprises inscrites. */
export function KycPage() {
  const [approval, setApproval] = useState<(typeof TABS)[number]["value"]>("pending");
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, error } = useSaEnterprises({ approval_status: approval, search: search.trim(), page: pageNumber, per_page: 15, kyc_priority: 1 });

  return (
    <>
      <SaHeader title="Validation KYC" description="Examinez les dossiers des entreprises inscrites, consultez leurs pièces justificatives puis validez ou rejetez avec un motif." icon={ShieldCheck} />

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={approval === tab.value}
              onClick={() => { setApproval(tab.value); setPageNumber(1); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${approval === tab.value ? "bg-card shadow" : "text-muted-foreground"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input className={`${field} max-w-xs`} placeholder="Rechercher (nom, e-mail, RCCM)" aria-label="Rechercher" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
      </div>

      <div className={`${panel} p-4`}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <ErrorNote error={error} fallback="Impossible de charger les dossiers." />
        ) : !data || data.items.length === 0 ? (
          <Empty>{approval === "pending" ? "Aucun dossier en attente : tout est à jour." : "Aucun dossier dans cette catégorie."}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Entreprise</th>
                  <th className="px-3 py-2">RCCM</th>
                  <th className="px-3 py-2">Inscrite le</th>
                  <th className="px-3 py-2">KYC</th>
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
                    <td className="px-3 py-3">{enterprise.rccm_number ?? enterprise.registration_number ?? "—"}</td>
                    <td className="px-3 py-3">{formatDate(enterprise.created_at)}</td>
                    <td className="px-3 py-3">{approvalBadge(enterprise.approval_status)}</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className={btnGhost} onClick={() => setOpenId(enterprise.id)}>
                        Examiner le dossier
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
