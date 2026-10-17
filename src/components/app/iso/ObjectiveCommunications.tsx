import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isoFoundationApi } from "@/integrations/backend/isoFoundation";
import { useI18n } from "@/lib/i18n";
import { card, input, primary, secondary, errorMessage } from "../planning/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ObjectiveCommunicationButton({ objectiveId }: { objectiveId: string | number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`${secondary} h-8 px-3 text-xs`}>
          {t("Diffuser l’objectif")}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Diffusions et accusés de lecture")}</DialogTitle>
        </DialogHeader>
        {open && <ObjectiveCommunicationForm key={String(objectiveId)} objectiveId={objectiveId} />}
      </DialogContent>
    </Dialog>
  );
}

function ObjectiveCommunicationForm({ objectiveId }: { objectiveId: string | number }) {
  const { locale, t, date } = useI18n();
  const query = useQuery({
    queryKey: ["objective-communications", objectiveId],
    queryFn: () => isoFoundationApi.communications(objectiveId),
    retry: false,
  });
  const [contentLocale, setContentLocale] = useState(locale);
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await isoFoundationApi.sendObjective(objectiveId, {
        recipient_ids: selected,
        message,
        content_locale: contentLocale,
      });
      setSelected([]);
      setMessage("");
      await query.refetch();
      toast.success(t("Diffusion envoyée."));
    } catch (error) {
      toast.error(errorMessage(error, t("Erreur de chargement.")));
    } finally {
      setBusy(false);
    }
  };
  if (query.isPending) return <p>{t("Chargement…")}</p>;
  if (query.isError)
    return <p role="alert">{errorMessage(query.error, t("Erreur de chargement."))}</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {t(
          "Sélectionnez les personnes concernées. La version envoyée est conservée avec leurs accusés de lecture.",
        )}
      </p>
      <fieldset className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
        <legend className="px-2 text-sm font-bold">{t("Destinataires")}</legend>
        {query.data.data.recipients.map((user) => (
          <label className="flex gap-2 text-sm" key={user.id}>
            <input
              type="checkbox"
              checked={selected.includes(user.id)}
              onChange={(e) =>
                setSelected((current) =>
                  e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id),
                )
              }
            />
            {user.name}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        {t("Langue du contenu", "Content language")}
        <select
          className={input}
          value={contentLocale}
          onChange={(e) => setContentLocale(e.target.value as "fr" | "en")}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block text-sm">
        {t("Message")}
        <textarea
          className={input}
          maxLength={5000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={primary}
        disabled={busy || !selected.length}
        onClick={() => void send()}
      >
        {t("Diffuser")}
      </button>
      {query.data.data.communications.map((c) => (
        <section className={`${card} space-y-2 p-3 text-sm`} key={c.id}>
          <h3 className="font-bold">
            {c.snapshot.title} · {date(c.created_at)}
          </h3>
          <p>
            {c.snapshot.target_value} {c.snapshot.unit} · {date(c.snapshot.deadline)}
          </p>
          <p className="whitespace-pre-wrap">{c.message}</p>
          <ul>
            {c.receipts?.map((r) => (
              <li key={r.id}>
                {r.name} —{" "}
                {r.acknowledged_at
                  ? `${t("Lecture confirmée")} : ${date(r.acknowledged_at)}`
                  : t("En attente")}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ObjectiveInbox({ siteId }: { siteId: string }) {
  const { t, date } = useI18n();
  const query = useQuery({
    queryKey: ["objective-inbox", siteId],
    queryFn: () => isoFoundationApi.inbox(siteId),
    enabled: !!siteId,
  });
  const [busyId, setBusyId] = useState<number | null>(null);
  const acknowledge = async (id: number) => {
    setBusyId(id);
    try {
      await isoFoundationApi.acknowledge(id);
      await query.refetch();
    } catch (error) {
      toast.error(errorMessage(error, t("Erreur de chargement.")));
    } finally {
      setBusyId(null);
    }
  };
  if (!siteId) return null;
  return (
    <details className={`${card} p-4`}>
      <summary className="cursor-pointer font-bold">
        {t("Objectifs reçus")} ({query.data?.data.filter((c) => !c.acknowledged_at).length ?? 0})
      </summary>
      {query.isPending ? (
        <p>{t("Chargement…")}</p>
      ) : query.isError ? (
        <p role="alert">{errorMessage(query.error, t("Erreur de chargement."))}</p>
      ) : !query.data.data.length ? (
        <p className="mt-3 text-sm">{t("Aucun objectif reçu.")}</p>
      ) : (
        query.data.data.map((c) => (
          <article
            className="mt-3 space-y-2 rounded-xl border border-border p-4 text-sm"
            key={c.id}
          >
            <h3 className="font-bold">{c.snapshot.title}</h3>
            <p className="whitespace-pre-wrap">{c.snapshot.description}</p>
            <p>
              {c.snapshot.target_value} {c.snapshot.unit} · {date(c.snapshot.deadline)}
            </p>
            <p className="whitespace-pre-wrap">{c.message}</p>
            {c.acknowledged_at ? (
              <p>
                {t("Lecture confirmée")} : {date(c.acknowledged_at)}
              </p>
            ) : (
              <button
                type="button"
                className={primary}
                disabled={busyId !== null}
                onClick={() => void acknowledge(c.id)}
              >
                {t("Accuser réception")}
              </button>
            )}
          </article>
        ))
      )}
    </details>
  );
}
