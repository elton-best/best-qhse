import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isoFoundationApi } from "@/integrations/backend/isoFoundation";
import { useI18n } from "@/lib/i18n";
import { card, input, primary, secondary, errorMessage } from "../planning/shared";

export function ScopePublicationPanel({ scopeId }: { scopeId: string }) {
  const { t, date } = useI18n();
  const query = useQuery({
    queryKey: ["scope-publications", scopeId],
    queryFn: () => isoFoundationApi.scope(scopeId),
  });
  const [expires, setExpires] = useState("");
  const [frequency, setFrequency] = useState(12);
  const [reason, setReason] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.data) setFrequency(query.data.data.review.review_frequency_months);
  }, [query.data]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await query.refetch();
    } catch (e) {
      toast.error(errorMessage(e, t("Erreur de chargement.")));
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending) return <p>{t("Chargement…")}</p>;
  if (query.isError)
    return <p role="alert">{errorMessage(query.error, t("Erreur de chargement."))}</p>;
  const { publications, review, can_manage: canManage } = query.data.data;
  return (
    <section className={`${card} space-y-4 p-5`}>
      <h2 className="font-display text-lg font-bold">{t("Publication et revue du périmètre")}</h2>
      <p className="text-sm">
        {t("Prochaine revue")} : {date(review.next_review_date)}
      </p>
      {review.review_required_at && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {review.review_reason || t("Une revue est requise après un changement approuvé.")}
        </p>
      )}
      {canManage && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t("Fréquence de revue (mois)")}
              <input
                type="number"
                min={1}
                max={60}
                className={input}
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
              />
            </label>
            <label className="text-sm">
              {t("Motif / conclusion de revue")}
              <input
                className={input}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["configure", "request", "complete"] as const).map((action, i) => (
              <button
                key={action}
                type="button"
                className={secondary}
                disabled={
                  busy ||
                  frequency < 1 ||
                  frequency > 60 ||
                  (action !== "configure" && !reason.trim())
                }
                onClick={() =>
                  void run(() =>
                    isoFoundationApi.reviewScope(scopeId, {
                      action,
                      review_frequency_months: frequency,
                      reason,
                    }),
                  )
                }
              >
                {t(["Configurer la fréquence", "Demander une revue", "Revue effectuée"][i]!)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <label className="text-sm">
              {t("Expiration du lien")}
              <input
                type="datetime-local"
                className={input}
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={primary}
              disabled={busy || !expires}
              onClick={() =>
                void run(async () => {
                  const result = await isoFoundationApi.publishScope(
                    scopeId,
                    new Date(expires).toISOString(),
                  );
                  setUrl(window.location.origin + result.data.path);
                })
              }
            >
              {t("Créer un lien public")}
            </button>
          </div>
        </>
      )}
      {url && (
        <div className="space-y-2 rounded-xl bg-primary-soft p-3">
          <p className="text-sm">
            {t(
              "Ce lien donne accès à la version enregistrée du périmètre. Copiez-le maintenant pour le partager.",
            )}
          </p>
          <input
            aria-label="Lien public"
            className={input}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-primary">
            {t("Périmètre publié")}
          </a>
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {publications.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background p-3"
          >
            <span>
              #{p.id} · {date(p.created_at)} · {t("Expiration du lien")} : {date(p.expires_at)}{" "}
              {p.revoked_at && `· ${t("Révoqué")}`}
            </span>
            {canManage && !p.revoked_at && (
              <button
                type="button"
                disabled={busy}
                className={secondary}
                onClick={() =>
                  void run(async () => {
                    await isoFoundationApi.revokeScope(scopeId, p.id);
                    setUrl("");
                  })
                }
              >
                {t("Révoquer")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
