import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FileText } from "lucide-react";
import { useSaEnterprise, useSaMutations } from "@/integrations/backend/superadmin";
import { ConfirmDialog } from "../app/ConfirmDialog";
import { PromptDialog } from "../app/PromptDialog";
import { Badge, Drawer, ErrorNote, Skeleton, btnDanger, btnGhost, btnPrimary, formatDate, muted, panel } from "./sa-ui";

export function approvalBadge(status: string | null | undefined) {
  if (status === "approved") return <Badge tone="green">KYC validé</Badge>;
  if (status === "rejected") return <Badge tone="red">KYC rejeté</Badge>;
  return <Badge tone="amber">KYC en attente</Badge>;
}

export function statusBadge(status: string | null | undefined) {
  if (status === "active") return <Badge tone="green">Active</Badge>;
  if (status === "suspended") return <Badge tone="red">Suspendue</Badge>;
  if (status === "rejected") return <Badge tone="red">Rejetée</Badge>;
  return <Badge tone="slate">{status ?? "—"}</Badge>;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}

type Step = "approve" | "reject" | "suspend" | "reactivate" | "delete" | null;

/** Fiche d'une entreprise : informations KYC, pièces justificatives et décisions de la plateforme. */
export function EnterpriseDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: enterprise, isLoading, error } = useSaEnterprise(id);
  const mutations = useSaMutations();
  const [step, setStep] = useState<Step>(null);

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setStep(null);
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible.");
    }
  };

  return (
    <Drawer title={enterprise?.name ?? "Entreprise"} subtitle={enterprise?.ref ?? "Fiche entreprise"} onClose={onClose} wide>
      {isLoading && <Skeleton rows={3} />}
      {error && <ErrorNote error={error} fallback="Impossible de charger l'entreprise." />}
      {enterprise && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {approvalBadge(enterprise.approval_status)}
            {statusBadge(enterprise.status)}
            <span className={muted}>Inscrite le {formatDate(enterprise.created_at)}</span>
          </div>

          {enterprise.rejection_reason && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">Motif du rejet : {enterprise.rejection_reason}</p>
          )}
          {enterprise.suspension_reason && enterprise.status === "suspended" && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Motif de la suspension : {enterprise.suspension_reason}</p>
          )}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Row label="E-mail" value={enterprise.email} />
            <Row label="Secteur" value={enterprise.field} />
            <Row label="RCCM / immatriculation" value={enterprise.rccm_number ?? enterprise.registration_number} />
            <Row label="IFU" value={enterprise.ifu_number} />
            <Row label="Adresse" value={[enterprise.address, enterprise.city, enterprise.country].filter(Boolean).join(", ")} />
            <Row label="Essai jusqu'au" value={enterprise.trial_ends_at ? formatDate(enterprise.trial_ends_at) : null} />
            <Row label="Administrateur" value={enterprise.enterprise_admin ? `${enterprise.enterprise_admin.name} — ${enterprise.enterprise_admin.email}` : null} />
            <Row label="Téléphone" value={enterprise.enterprise_admin?.phone} />
          </dl>

          <section className={`${panel} p-4`}>
            <h3 className="font-display font-bold">Pièces justificatives (KYC)</h3>
            {(enterprise.documents ?? []).length === 0 ? (
              <p className={`mt-2 ${muted}`}>Aucun document déposé.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {(enterprise.documents ?? []).map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 p-3 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <FileText className="h-4 w-4 text-primary" />
                      {document.type ?? document.name ?? document.original_name ?? document.file_name ?? `Document ${document.id}`}
                    </span>
                    <span className="flex gap-3">
                      {document.preview_url && (
                        <a href={document.preview_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          Aperçu <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {document.download_url && (
                        <a href={document.download_url} className="font-semibold text-primary hover:underline">
                          Télécharger
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${panel} p-4`}>
            <h3 className="font-display font-bold">Sites ({enterprise.sites?.length ?? 0}) · Utilisateurs ({enterprise.users?.length ?? 0})</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(enterprise.sites ?? []).map((site) => (
                <li key={site.id}>
                  {site.name}
                  {site.is_headquarter ? " (siège)" : ""}
                  {site.city ? ` — ${site.city}` : ""}
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {enterprise.approval_status !== "approved" && (
              <button type="button" className={btnPrimary} onClick={() => setStep("approve")}>
                Valider le KYC
              </button>
            )}
            {enterprise.approval_status !== "rejected" && enterprise.approval_status !== "approved" && (
              <button type="button" className={btnDanger} onClick={() => setStep("reject")}>
                Rejeter
              </button>
            )}
            {enterprise.status === "suspended" ? (
              <button type="button" className={btnGhost} onClick={() => setStep("reactivate")}>
                Réactiver
              </button>
            ) : (
              enterprise.approval_status === "approved" && (
                <button type="button" className={btnGhost} onClick={() => setStep("suspend")}>
                  Suspendre
                </button>
              )
            )}
            <button type="button" className={`${btnGhost} ml-auto text-destructive`} onClick={() => setStep("delete")}>
              Supprimer
            </button>
          </div>

          <ConfirmDialog
            open={step === "approve"}
            title="Valider le dossier KYC ?"
            description={`${enterprise.name} pourra utiliser la plateforme. Cette décision est journalisée.`}
            confirmLabel="Valider"
            onConfirm={() => void run(() => mutations.approveEnterprise.mutateAsync(id), "KYC validé.")}
            onCancel={() => setStep(null)}
          />
          <ConfirmDialog
            open={step === "reactivate"}
            title="Réactiver l'entreprise ?"
            confirmLabel="Réactiver"
            onConfirm={() => void run(() => mutations.reactivateEnterprise.mutateAsync(id), "Entreprise réactivée.")}
            onCancel={() => setStep(null)}
          />
          <ConfirmDialog
            open={step === "delete"}
            title="Supprimer cette entreprise ?"
            description="L'entreprise et ses données ne seront plus accessibles. Cette action est sensible et journalisée."
            confirmLabel="Supprimer"
            destructive
            onConfirm={() => void run(async () => { await mutations.deleteEnterprise.mutateAsync(id); onClose(); }, "Entreprise supprimée.")}
            onCancel={() => setStep(null)}
          />
          <PromptDialog
            open={step === "reject"}
            title="Rejeter le dossier KYC"
            description="Le motif est communiqué à l'entreprise."
            label="Motif du rejet (10 caractères minimum)"
            required
            minLength={10}
            multiline
            confirmLabel="Rejeter"
            onSubmit={(reason) => void run(() => mutations.rejectEnterprise.mutateAsync({ id, reason }), "Dossier rejeté.")}
            onCancel={() => setStep(null)}
          />
          <PromptDialog
            open={step === "suspend"}
            title="Suspendre l'entreprise"
            description="L'entreprise perd l'accès à la plateforme jusqu'à sa réactivation."
            label="Motif de la suspension (10 caractères minimum)"
            required
            minLength={10}
            multiline
            confirmLabel="Suspendre"
            onSubmit={(reason) => void run(() => mutations.suspendEnterprise.mutateAsync({ id, reason }), "Entreprise suspendue.")}
            onCancel={() => setStep(null)}
          />
        </>
      )}
    </Drawer>
  );
}
