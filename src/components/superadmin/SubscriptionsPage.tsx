import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { useSaMutations, useSaSubscriptions, type SaSubscription } from "@/integrations/backend/superadmin";
import { ConfirmDialog } from "../app/ConfirmDialog";
import { PromptDialog } from "../app/PromptDialog";
import { Badge, Empty, ErrorNote, Pager, Skeleton, SaHeader, btnGhost, field, formatDate, muted, panel } from "./sa-ui";

function statusBadge(subscription: SaSubscription) {
  if (subscription.status === "suspended") return <Badge tone="red">Suspendu</Badge>;
  if (subscription.status === "expired" || !subscription.is_active) return <Badge tone="slate">Inactif</Badge>;
  return subscription.is_trial ? <Badge tone="blue">Essai</Badge> : <Badge tone="green">Actif</Badge>;
}

type Pending = { kind: "suspend" | "reactivate" | "delete"; subscription: SaSubscription } | null;

/** Abonnements des sites : offre souscrite, période et suspension. */
export function SubscriptionsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pending, setPending] = useState<Pending>(null);
  const { data, isLoading, error } = useSaSubscriptions({ status, search: search.trim(), page: pageNumber });
  const mutations = useSaMutations();

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setPending(null);
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible.");
    }
  };

  return (
    <>
      <SaHeader title="Abonnements" description="Suivez les abonnements souscrits par les entreprises, leurs échéances, et suspendez un accès en cas d'impayé ou de litige." icon={CreditCard} />

      <div className="flex flex-wrap gap-2">
        <input className={`${field} max-w-xs`} placeholder="Rechercher une entreprise" aria-label="Rechercher" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />
        <select className={`${field} w-auto`} aria-label="Statut" value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1); }}>
          <option value="">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="trial">Essais</option>
          <option value="suspended">Suspendus</option>
          <option value="expired">Expirés</option>
        </select>
      </div>

      <div className={`${panel} p-4`}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <ErrorNote error={error} fallback="Impossible de charger les abonnements." />
        ) : !data || data.items.length === 0 ? (
          <Empty>Aucun abonnement.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Entreprise / site</th>
                  <th className="px-3 py-2">Offre</th>
                  <th className="px-3 py-2">Période</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((subscription) => (
                  <tr key={subscription.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      <p className="font-semibold">{subscription.site?.enterprise?.name ?? subscription.enterprise_name ?? "—"}</p>
                      <p className={muted}>{subscription.site?.name ?? `Site #${subscription.site_id}`} · {subscription.ref}</p>
                    </td>
                    <td className="px-3 py-3">{subscription.offer?.name ?? subscription.offer_name ?? `Offre #${subscription.offer_id}`}</td>
                    <td className="px-3 py-3">{formatDate(subscription.start_date)} → {formatDate(subscription.expiration_date)}</td>
                    <td className="px-3 py-3">{statusBadge(subscription)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {subscription.status === "suspended" ? (
                          <button type="button" className={btnGhost} onClick={() => setPending({ kind: "reactivate", subscription })}>Réactiver</button>
                        ) : (
                          <button type="button" className={btnGhost} onClick={() => setPending({ kind: "suspend", subscription })}>Suspendre</button>
                        )}
                        <button type="button" className={`${btnGhost} text-destructive`} onClick={() => setPending({ kind: "delete", subscription })}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPageNumber} />
      </div>

      <PromptDialog
        open={pending?.kind === "suspend"}
        title="Suspendre l'abonnement"
        label="Motif (10 caractères minimum)"
        required
        minLength={10}
        multiline
        confirmLabel="Suspendre"
        onSubmit={(reason) => pending && void run(() => mutations.suspendSubscription.mutateAsync({ id: pending.subscription.id, reason }), "Abonnement suspendu.")}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === "reactivate"}
        title="Réactiver l'abonnement ?"
        confirmLabel="Réactiver"
        onConfirm={() => pending && void run(() => mutations.reactivateSubscription.mutateAsync(pending.subscription.id), "Abonnement réactivé.")}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Supprimer l'abonnement ?"
        description="Le site perdra l'accès aux modules de cette offre."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => pending && void run(() => mutations.deleteSubscription.mutateAsync(pending.subscription.id), "Abonnement supprimé.")}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
