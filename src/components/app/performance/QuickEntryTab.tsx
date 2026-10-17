import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  confirmationNeeded, isNetworkError, syncBatch, useIndicators, useInstruments, usePerformanceMutations, type ReadingInput,
} from "@/integrations/backend/performance";
import { Field } from "../overlay";
import { card, errorMessage, input, muted, primary, secondary } from "../planning/shared";
import { discard, enqueue, newClientId, queued, resolveQueued, type QueuedReading } from "./offline-queue";

/**
 * Saisie rapide d'un relevé (M14-03) : trois champs obligatoires, utilisable sur téléphone.
 * Sans connexion, le relevé est mis en file et envoyé dès le retour du réseau.
 */
export function QuickEntryTab({ siteId }: { siteId: string }) {
  const { data: indicators = [] } = useIndicators(siteId || undefined, Boolean(siteId));
  const { data: instruments = [] } = useInstruments(siteId || undefined, Boolean(siteId));
  const actions = usePerformanceMutations();
  const today = new Date().toISOString().slice(0, 10);
  const [indicatorId, setIndicatorId] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [instrumentId, setInstrumentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState<{ code: "OUTLIER" | "DUPLICATE"; message: string } | null>(null);
  const [pending, setPending] = useState<QueuedReading[]>(() => queued());
  const [syncing, setSyncing] = useState(false);

  const indicator = indicators.find((i) => String(i.id) === indicatorId);
  const refreshQueue = (): void => setPending(queued());

  const sync = useCallback(async (): Promise<void> => {
    const items = queued().filter((item) => !item.rejected);
    if (items.length === 0) return;
    setSyncing(true);
    try {
      const results = await syncBatch(items.map(({ queued_at: _queuedAt, rejected: _rejected, ...rest }) => rest));
      resolveQueued(results);
      const created = results.filter((r) => r.status === "created").length;
      if (created > 0) toast.success(`${created} relevé(s) synchronisé(s).`);
    } catch (e) {
      if (!isNetworkError(e)) toast.error(errorMessage(e, "Synchronisation impossible."));
    } finally {
      setSyncing(false);
      refreshQueue();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("online", sync);
    if (navigator.onLine) void sync();
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  const submit = async (confirm?: "OUTLIER" | "DUPLICATE"): Promise<void> => {
    setError(null);
    if (!indicatorId || value.trim() === "" || Number.isNaN(Number(value.replace(",", ".")))) {
      setError("Choisissez l'indicateur et saisissez une valeur numérique.");
      return;
    }
    const payload: ReadingInput = {
      indicator_id: Number(indicatorId), value: Number(value.replace(",", ".")), measured_on: date, client_uuid: newClientId(),
      ...(instrumentId ? { instrument_id: Number(instrumentId) } : {}),
      ...(quantity ? { activity_quantity: Number(quantity.replace(",", ".")) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(confirm === "OUTLIER" ? { confirm_outlier: true } : {}),
      ...(confirm === "DUPLICATE" ? { confirm_duplicate: true } : {}),
    };
    try {
      const response = await actions.record.mutateAsync({ input: payload, evidence });
      const flags = response.data.flags ?? [];
      toast.success(flags.includes("instrument_out_of_validity") ? "Relevé enregistré — signalé : instrument hors validité." : "Relevé enregistré.");
      setValue(""); setNote(""); setEvidence(null); setQuantity(""); setNeedsConfirm(null);
    } catch (e) {
      const confirmation = confirmationNeeded(e);
      if (confirmation) {
        setNeedsConfirm(confirmation);
      } else if (isNetworkError(e) && !evidence) {
        enqueue(payload);
        refreshQueue();
        toast.message("Hors connexion : le relevé est conservé sur cet appareil et sera envoyé au retour du réseau.");
        setValue(""); setNote("");
      } else {
        setError(errorMessage(e, "Enregistrement impossible."));
      }
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className={`${card} space-y-4 p-5`}>
        <Field label="Indicateur *">
          <select className={input} value={indicatorId} onChange={(e) => { setIndicatorId(e.target.value); setNeedsConfirm(null); }}>
            <option value="">— Choisir —</option>
            {indicators.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.id}>{i.title} ({i.unit})</option>)}
          </select>
        </Field>
        <Field label={`Valeur *${indicator ? ` (${indicator.unit})` : ""}`}>
          <input inputMode="decimal" className={`${input} text-lg`} value={value} onChange={(e) => { setValue(e.target.value); setNeedsConfirm(null); }} />
        </Field>
        <Field label="Date de la mesure"><input type="date" max={today} className={input} value={date} onChange={(e) => { setDate(e.target.value); setNeedsConfirm(null); }} /></Field>
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">Précisions (instrument, activité, preuve)</summary>
          <div className="mt-3 space-y-3">
            <Field label="Instrument utilisé">
              <select className={input} value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
                <option value="">— Aucun —</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.title} — {i.validity === "valid" || i.validity === "due_soon" ? "valide" : "hors validité"}</option>)}
              </select>
            </Field>
            {indicator && indicator.normalization !== "none" && (
              <Field label="Quantité d'activité (pour la normalisation)"><input inputMode="decimal" className={input} value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
            )}
            <Field label="Preuve jointe (facture, photo, bordereau)"><input type="file" accept="image/*,.pdf,.xlsx,.csv" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} /></Field>
            <Field label="Commentaire"><input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </details>
        {needsConfirm && (
          <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{needsConfirm.message}</p>
            <button type="button" className={primary} onClick={() => void submit(needsConfirm.code)}>Oui, la valeur est exacte</button>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="button" className={`${primary} w-full justify-center py-3 text-base`} disabled={actions.record.isPending} onClick={() => void submit()}>Enregistrer le relevé</button>
      </section>

      {pending.length > 0 && (
        <section className={`${card} space-y-2 p-4`} aria-label="Relevés en attente d'envoi">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><CloudOff className="h-4 w-4" /> {pending.length} relevé(s) en attente d'envoi</p>
            <button type="button" className={secondary} disabled={syncing} onClick={() => void sync()}><RefreshCw className="h-4 w-4" /> Synchroniser</button>
          </div>
          <ul className="space-y-1 text-sm">
            {pending.map((item) => (
              <li key={item.client_uuid} className="flex items-center justify-between gap-2">
                <span>{indicators.find((i) => i.id === item.indicator_id)?.title ?? `Indicateur ${item.indicator_id}`} : {item.value} ({item.measured_on})</span>
                {item.rejected ? <span className="text-xs text-red-700">{item.rejected} <button type="button" className="font-bold underline" onClick={() => { discard(item.client_uuid); refreshQueue(); }}>Retirer</button></span> : <span className={muted}>En attente</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
