import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { REPORT_SOURCES, isOffline, syncDeclarations, useNcMutations, type ReportSource, type Severity } from "@/integrations/backend/nonconformities";
import { Field } from "../overlay";
import { card, errorMessage, input, muted, primary, secondary } from "../planning/shared";
import { discard, enqueue, newId, queued, resolve, type QueuedDeclaration } from "./offline-queue";

/** Déclaration rapide (M17-01) : source, description, lieu et photos ; conservée sur l'appareil si le réseau manque. */
export function QuickDeclare() {
  const actions = useNcMutations();
  const [source, setSource] = useState<ReportSource | "">("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<Severity>("minor");
  const [environmental, setEnvironmental] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<QueuedDeclaration[]>(() => queued());
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async (): Promise<void> => {
    const items = queued().filter((i) => !i.rejected);
    if (items.length === 0) return;
    setSyncing(true);
    try {
      const results = await syncDeclarations(items.map(({ queued_at: _q, rejected: _r, ...rest }) => rest));
      resolve(results);
      const created = results.filter((r) => r.status === "created").length;
      if (created > 0) toast.success(`${created} déclaration(s) synchronisée(s).`);
    } catch (e) {
      if (!isOffline(e)) toast.error(errorMessage(e, "Synchronisation impossible."));
    } finally {
      setSyncing(false);
      setPending(queued());
    }
  }, []);

  useEffect(() => {
    window.addEventListener("online", sync);
    if (navigator.onLine) void sync();
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!source) { setError("Choisissez la source de la déclaration."); return; }
    if (description.trim().length < 10) { setError("Décrivez le constat en au moins 10 caractères."); return; }
    const input: Parameters<typeof actions.declare.mutateAsync>[0]["input"] = {
      report_source: source, description: description.trim(), severity, environmental_impact: environmental, client_uuid: newId(), ...(location.trim() ? { location: location.trim() } : {}),
    };
    try {
      const response = await actions.declare.mutateAsync({ input, photos });
      toast.success(`Déclaration enregistrée : ${response.data.ref}.`);
      setDescription(""); setLocation(""); setPhotos([]); setEnvironmental(false); setSeverity("minor");
    } catch (e) {
      if (isOffline(e) && photos.length === 0) {
        enqueue(input);
        setPending(queued());
        toast.message("Hors connexion : la déclaration est conservée sur cet appareil et sera envoyée au retour du réseau.");
        setDescription(""); setLocation("");
      } else {
        setError(isOffline(e) ? "Les photos nécessitent le réseau : retirez-les ou réessayez en ligne." : errorMessage(e, "Déclaration impossible."));
      }
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className={`${card} space-y-4 p-5`}>
        <Field label="Source *">
          <select className={input} value={source} onChange={(e) => setSource(e.target.value as ReportSource)}>
            <option value="">— Choisir —</option>
            {REPORT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Que s'est-il passé ? *"><textarea className={`${input} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Lieu"><input className={input} value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        <Field label="Gravité estimée">
          <select className={input} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="minor">Mineure</option><option value="major">Majeure</option><option value="critical">Critique</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={environmental} onChange={(e) => setEnvironmental(e.target.checked)} /> Impact environnemental (rejet, déversement, pollution…)</label>
        <Field label="Photos (jusqu'à 5)"><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 5))} /></Field>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="button" className={`${primary} w-full justify-center py-3 text-base`} disabled={actions.declare.isPending} onClick={() => void submit()}>Déclarer</button>
      </section>
      {pending.length > 0 && (
        <section className={`${card} space-y-2 p-4`} aria-label="Déclarations en attente d'envoi">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><CloudOff className="h-4 w-4" /> {pending.length} déclaration(s) en attente d'envoi</p>
            <button type="button" className={secondary} disabled={syncing} onClick={() => void sync()}><RefreshCw className="h-4 w-4" /> Synchroniser</button>
          </div>
          <ul className="space-y-1 text-sm">
            {pending.map((item) => (
              <li key={item.client_uuid} className="flex items-center justify-between gap-2">
                <span className="truncate">{item.description}</span>
                {item.rejected ? <span className="text-xs text-red-700">{item.rejected} <button type="button" className="font-bold underline" onClick={() => { discard(item.client_uuid); setPending(queued()); }}>Retirer</button></span> : <span className={muted}>En attente</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
