import { useState } from "react";
import { Lightbulb, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCollaborators } from "@/integrations/backend/leadership";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useNcMutations, useOpportunitySummary, useSuggestions, type Suggestion } from "@/integrations/backend/nonconformities";
import { Field, Modal } from "../overlay";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, input, muted, primary, secondary } from "../planning/shared";
import { FieldsForm, type FieldSpec } from "../emergency/FieldsForm";

const STATUS: Record<Suggestion["status"], [string, string]> = {
  pending: ["À décider", "bg-amber-100 text-amber-800"], in_progress: ["En cours", "bg-sky-100 text-sky-700"], adopted: ["Adoptée", "bg-emerald-100 text-emerald-700"], rejected: ["Écartée", "bg-slate-200 text-slate-600"],
};
const SOURCE: Record<string, string> = { staff: "Idée du personnel", audit_finding: "Audit", review_decision: "Revue de direction", indicator: "Indicateur" };
const FIELDS: FieldSpec[] = [
  { key: "title", label: "Idée", type: "text", required: true },
  { key: "description", label: "Description et bénéfice attendu", type: "textarea", required: true },
  { key: "impact", label: "Impact attendu", type: "select", options: [{ value: "low", label: "Faible" }, { value: "medium", label: "Moyen" }, { value: "high", label: "Élevé" }] },
];

/** Registre des opportunités d'amélioration (ISO 14001:2026 §10.1) : idées, audits, revue, indicateurs, avec décision motivée. */
export function OpportunitiesPage() {
  const [siteId] = useCurrentSite();
  const { data = [], isLoading } = useSuggestions(siteId || undefined);
  const { data: summary } = useOpportunitySummary();
  const actions = useNcMutations();
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header eyebrow="Amélioration — ISO 14001:2026 §10.1" title="Opportunités d'amélioration"
        description="Chaque idée ou constat d'amélioration reçoit une décision motivée ; une opportunité adoptée devient une action suivie." icon={Lightbulb}>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setCreating(true); }}><Plus className="h-4 w-4" /> Proposer une idée</button>
      </Header>
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([["Enregistrées", summary.total], ["À décider", summary.pending], ["Adoptées en cours", summary.adopted_open], ["Adoptées réalisées", summary.adopted_done]] as const).map(([text, value]) => (
            <div key={text} className={`${card} p-4`}><p className="text-2xl font-extrabold">{value}</p><p className={muted}>{text}</p></div>
          ))}
        </div>
      )}
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : data.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune opportunité enregistrée.</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Opportunité</th><th className="px-3 py-2">Origine</th><th className="px-3 py-2">État</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-3 py-3"><p className="font-semibold">{s.title}</p><p className={muted}>{s.ref}</p>{s.decision_note && <p className="mt-1 text-xs">Décision : {s.decision_note}</p>}</td>
                  <td className="px-3 py-3">{SOURCE[s.source_type] ?? s.source_type}{s.source_ref ? ` · ${s.source_ref}` : ""}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span></td>
                  <td className="px-3 py-3 text-right">{s.status === "pending" && <button type="button" className={secondary} onClick={() => { setError(null); setDeciding(s); }}>Décider</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <Modal title="Proposer une idée d'amélioration" onClose={() => setCreating(false)}>
          <FieldsForm fields={FIELDS} busy={actions.addSuggestion.isPending} error={error} initial={{ impact: "medium" }} onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                await actions.addSuggestion.mutateAsync({ site_id: siteId, title: String(v["title"]), description: String(v["description"]), impact: String(v["impact"] || "medium") as "low" | "medium" | "high" });
                toast.success("Idée enregistrée.");
                setCreating(false);
              } catch (e) { setError(errorMessage(e, "Enregistrement impossible.")); }
            }} />
        </Modal>
      )}
      {deciding && <DecisionModal suggestion={deciding} onClose={() => setDeciding(null)} />}
    </div>
  );
}

function DecisionModal({ suggestion, onClose }: { suggestion: Suggestion; onClose: () => void }) {
  const actions = useNcMutations();
  const [siteId] = useCurrentSite();
  const { data: people = [] } = useCollaborators(siteId);
  const [note, setNote] = useState("");
  const [responsible, setResponsible] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "adopt" | "reject"): Promise<void> => {
    setError(null);
    try {
      await actions.decideSuggestion.mutateAsync({ id: suggestion.id, decision, note: note.trim(), ...(decision === "adopt" ? { responsible_id: Number(responsible), deadline } : {}) });
      toast.success(decision === "adopt" ? "Opportunité adoptée : l'action est créée." : "Opportunité écartée.");
      onClose();
    } catch (e) { setError(errorMessage(e, "Décision impossible.")); }
  };

  return (
    <Modal title={suggestion.title} description={suggestion.description} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Motif de la décision * (10 caractères minimum)"><textarea className={`${input} min-h-16`} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Responsable (si adoptée)"><select className={input} value={responsible} onChange={(e) => setResponsible(e.target.value)}><option value="">— Choisir —</option>{people.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`}</option>)}</select></Field>
          <Field label="Échéance (si adoptée)"><input type="date" className={input} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} disabled={note.trim().length < 10} onClick={() => void decide("reject")}>Écarter</button>
          <button type="button" className={primary} disabled={note.trim().length < 10 || !responsible || !deadline} onClick={() => void decide("adopt")}>Adopter</button>
        </div>
      </div>
    </Modal>
  );
}
