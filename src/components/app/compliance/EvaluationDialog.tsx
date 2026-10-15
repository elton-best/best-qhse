import { useState } from "react";
import { useComplianceMutations, type Obligation } from "@/integrations/backend/compliance";
import { Field, Modal } from "../overlay";
import { errorMessage, input, primary, secondary } from "../planning/shared";

/** Évaluation périodique (§9.1.2) : résultat, preuve, évaluateur externe éventuel et suite donnée à un écart. */
export function EvaluationDialog({ obligation, onClose, onDone }: { obligation: Obligation; onClose: () => void; onDone: (message: string) => void }) {
  const mutations = useComplianceMutations();
  const [result, setResult] = useState<"compliant" | "partial" | "non_compliant">("compliant");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [evidence, setEvidence] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [external, setExternal] = useState(false);
  const [body, setBody] = useState("");
  const [comment, setComment] = useState("");
  const [treated, setTreated] = useState(false);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    if (result === "compliant" && !evidence.trim() && !file) {
      setError("Une preuve (description ou fichier) est exigée pour déclarer l'obligation conforme.");
      return;
    }
    if (external && !body.trim()) {
      setError("Indiquez l'organisme externe qui a mené l'évaluation.");
      return;
    }
    setError("");
    try {
      await mutations.evaluate.mutateAsync({
        id: obligation.id,
        input: { result, evaluated_at: date, method, evidence, evidence_file: file, external, external_body: body, comment, gap_already_treated: result === "non_compliant" && treated },
      });
      onDone(
        result === "non_compliant"
          ? treated ? "Évaluation enregistrée : écart traité consigné." : "Évaluation enregistrée : une non-conformité a été ouverte."
          : "Évaluation enregistrée.",
      );
    } catch (e) {
      setError(errorMessage(e, "Enregistrement impossible."));
    }
  };

  return (
    <Modal title="Évaluer la conformité" description={`${obligation.ref} — ${obligation.title ?? obligation.regulatory_reference}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Résultat *">
          <select className={input} value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
            <option value="compliant">Conforme</option>
            <option value="partial">Partiellement conforme</option>
            <option value="non_compliant">Non conforme</option>
          </select>
        </Field>
        <Field label="Date d'évaluation *"><input type="date" max={new Date().toISOString().slice(0, 10)} className={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Méthode"><input className={input} placeholder="Revue documentaire, inspection, mesure…" value={method} onChange={(e) => setMethod(e.target.value)} /></Field>
      <Field label={`Preuve${result === "compliant" ? " *" : ""}`}><textarea className={`${input} min-h-20`} placeholder="Document, enregistrement, constat…" value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field>
      <Field label="Fichier de preuve (PDF, image, Office — 10 Mo max)">
        <input type="file" aria-label="Fichier de preuve" className="block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} /> Évaluation réalisée par une partie externe (contrôle, audit)</label>
      {external && <Field label="Organisme externe *"><input className={input} value={body} onChange={(e) => setBody(e.target.value)} /></Field>}
      <Field label="Commentaire / écart constaté"><textarea className={`${input} min-h-16`} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      {result === "non_compliant" && (
        <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-1" checked={treated} onChange={(e) => setTreated(e.target.checked)} />
          <span>
            <span className="font-semibold">L'écart est déjà corrigé par le système.</span>
            <span className="block text-xs">Une fiche « écart traité » est consignée ; sinon une non-conformité est ouverte automatiquement.</span>
          </span>
        </label>
      )}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onClose}>Annuler</button>
        <button type="button" className={primary} disabled={mutations.evaluate.isPending} onClick={() => void submit()}>Enregistrer l'évaluation</button>
      </div>
    </Modal>
  );
}
