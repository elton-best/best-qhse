import { useState } from "react";
import { toast } from "sonner";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { downloadBlob } from "@/integrations/backend/realisation";
import { downloadEvidence, useComplianceMutations, useEvaluations, type Obligation } from "@/integrations/backend/compliance";
import { PromptDialog } from "../PromptDialog";
import { Drawer, Field, Modal } from "../overlay";
import { errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { FREQUENCIES, SOURCE_TYPES, STATUS, labelOf } from "./compliance-config";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm">{children || "—"}</dd>
    </div>
  );
}

const RESULT = { compliant: "Conforme", partial: "Partiellement conforme", non_compliant: "Non conforme" } as const;

type Step = "qualify" | "analysis" | "agreement" | null;

/** Fiche d'une obligation : qualification, historique des évaluations, veille et accords. */
export function ObligationDetail({
  obligation, onClose, onEdit, onEvaluate, onDelete,
}: {
  obligation: Obligation; onClose: () => void; onEdit: () => void; onEvaluate: () => void; onDelete: () => void;
}) {
  const mutations = useComplianceMutations();
  const { data: history = [] } = useEvaluations(obligation.id);
  const [step, setStep] = useState<Step>(null);
  const [applicable, setApplicable] = useState(true);
  const [justification, setJustification] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planActions, setPlanActions] = useState<{ title: string; due_date: string }[]>([{ title: "", due_date: "" }]);
  const status = STATUS[obligation.compliance_status];

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    try {
      await action();
      toast.success(success);
      setStep(null);
    } catch (e) {
      toast.error(errorMessage(e, "Action impossible."));
    }
  };

  const downloadProof = async (id: number): Promise<void> => {
    try {
      downloadBlob(await downloadEvidence(id), `preuve-${obligation.ref}-${id}`);
    } catch (e) {
      toast.error(errorMessage(e, "Téléchargement impossible."));
    }
  };

  return (
    <Drawer title={obligation.title ?? obligation.regulatory_reference} subtitle={obligation.ref} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
        {obligation.is_applicable === null && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Applicabilité à déterminer</span>}
        {obligation.analysis_status === "to_analyze" && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Analyse d'impact à mener</span>}
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Row label="Type de source">{labelOf(SOURCE_TYPES, obligation.source_type)}</Row>
        <Row label="Thème">{obligation.aspect.name}</Row>
        <Row label="Référence">{obligation.regulatory_reference}</Row>
        <Row label="Autorité">{obligation.authority}</Row>
        <Row label="Exigences applicables">{obligation.applicable_requirement}</Row>
        <Row label="Description">{obligation.description}</Row>
        <Row label="Responsable">{obligation.responsible_name}</Row>
        <Row label="Fréquence d'évaluation">{labelOf(FREQUENCIES, obligation.evaluation_frequency)}</Row>
        <Row label="Dernière évaluation">{obligation.last_evaluation_date ? formatDateFR(obligation.last_evaluation_date) : ""}</Row>
        <Row label="Prochaine évaluation">{obligation.next_evaluation_date ? formatDateFR(obligation.next_evaluation_date) : ""}</Row>
        {obligation.expiry_date && <Row label={`Échéance${obligation.permit_number ? ` — n° ${obligation.permit_number}` : ""}`}>{formatDateFR(obligation.expiry_date)}</Row>}
        <Row label="Applicabilité">{obligation.is_applicable === null ? "" : `${obligation.is_applicable ? "Applicable" : "Non applicable"} — ${obligation.applicability_justification ?? ""}`}</Row>
        <Row label="Aspects environnementaux liés">{obligation.environmental_aspects.map((a) => `${a.aspect_number ?? ""} ${a.aspect}`.trim()).join("\n")}</Row>
        {obligation.analysis_note && <Row label="Conclusion de l'analyse d'impact">{obligation.analysis_note}</Row>}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <button type="button" className={secondary} onClick={() => { setApplicable(obligation.is_applicable ?? true); setJustification(obligation.applicability_justification ?? ""); setStep("qualify"); }}>Déterminer l'applicabilité</button>
        {obligation.is_applicable === true && <button type="button" className={primary} onClick={onEvaluate}>Évaluer la conformité</button>}
        {obligation.analysis_status === "to_analyze" && <button type="button" className={primary} onClick={() => setStep("analysis")}>Conclure l'analyse d'impact</button>}
        <button type="button" className={secondary} onClick={() => setStep("agreement")}><Plus className="h-4 w-4" /> Plan convenu avec l'autorité</button>
        <button type="button" className={secondary} onClick={onEdit}>Modifier</button>
        <button type="button" className={`${secondary} ml-auto text-destructive`} onClick={onDelete}><Trash2 className="h-4 w-4" /> Supprimer</button>
      </div>

      <section>
        <h3 className="font-display font-bold">Historique des évaluations</h3>
        <p className={muted}>Chaque évaluation est une preuve : elle ne peut pas être modifiée ; une erreur se corrige par une nouvelle évaluation.</p>
        {history.length === 0 ? (
          <p className={`mt-3 ${muted}`}>Aucune évaluation enregistrée.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((evaluation) => (
              <li key={evaluation.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatDateFR(evaluation.evaluated_at)} — {RESULT[evaluation.result]}</span>
                  <span className={muted}>{evaluation.evaluator?.name ?? "—"}{evaluation.external ? ` · externe : ${evaluation.external_body}` : ""}</span>
                </div>
                {evaluation.method && <p className={muted}>Méthode : {evaluation.method}</p>}
                {evaluation.evidence && <p className="mt-1 whitespace-pre-line">{evaluation.evidence}</p>}
                {evaluation.comment && <p className={`mt-1 ${muted}`}>{evaluation.comment}</p>}
                <div className="mt-2 flex flex-wrap gap-3">
                  {evaluation.gap_status === "nc_opened" && <span className="text-xs font-bold text-red-700">Non-conformité ouverte (M17)</span>}
                  {evaluation.gap_status === "gap_treated" && <span className="text-xs font-bold text-amber-700">Écart traité consigné</span>}
                  {evaluation.evidence_path && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => void downloadProof(evaluation.id)}>
                      <FileDown className="h-3 w-3" /> Fichier de preuve
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {step === "qualify" && (
        <Modal title="Applicabilité de l'obligation" description="La décision est toujours justifiée et conservée." onClose={() => setStep(null)}>
          <fieldset className="grid grid-cols-2 gap-2" aria-label="Applicabilité">
            {[{ value: true, label: "Applicable" }, { value: false, label: "Non applicable" }].map((choice) => (
              <label key={String(choice.value)} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${applicable === choice.value ? "border-primary bg-primary-soft" : "border-border"}`}>
                <input type="radio" name="applicability" checked={applicable === choice.value} onChange={() => setApplicable(choice.value)} />
                {choice.label}
              </label>
            ))}
          </fieldset>
          <Field label={applicable ? "Pourquoi cette obligation s'applique *" : "Pourquoi elle ne s'applique pas *"}>
            <textarea className={`${input} min-h-24`} value={justification} onChange={(e) => setJustification(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setStep(null)}>Annuler</button>
            <button
              type="button"
              className={primary}
              disabled={justification.trim().length < 5 || mutations.qualify.isPending}
              onClick={() => void run(() => mutations.qualify.mutateAsync({ id: obligation.id, isApplicable: applicable, justification: justification.trim() }), "Applicabilité enregistrée.")}
            >
              Enregistrer la décision
            </button>
          </div>
        </Modal>
      )}
      {step === "analysis" && (
        <PromptDialog
          open
          title="Analyse d'impact du texte"
          description="Les aspects environnementaux liés seront signalés « à réévaluer »."
          label="Conclusion de l'analyse (10 caractères minimum)"
          required
          minLength={10}
          multiline
          confirmLabel="Conclure"
          onSubmit={(note) => void run(async () => {
            const result = await mutations.analyze.mutateAsync({ id: obligation.id, note });
            toast.info(`${result.data.aspects_flagged} aspect(s) à réévaluer.`);
          }, "Analyse conclue.")}
          onCancel={() => setStep(null)}
        />
      )}
      {step === "agreement" && (
        <Modal title="Plan d'actions convenu avec l'autorité" description="Il devient lui-même une obligation de conformité suivie." onClose={() => setStep(null)}>
          <Field label="Intitulé du plan *"><input className={input} value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} /></Field>
          {planActions.map((action, index) => (
            <div key={index} className="grid grid-cols-[1fr_9rem] gap-2">
              <input className={input} placeholder={`Action ${index + 1}`} aria-label={`Action ${index + 1}`} value={action.title} onChange={(e) => setPlanActions((current) => current.map((item, i) => (i === index ? { ...item, title: e.target.value } : item)))} />
              <input type="date" className={input} aria-label={`Échéance ${index + 1}`} value={action.due_date} onChange={(e) => setPlanActions((current) => current.map((item, i) => (i === index ? { ...item, due_date: e.target.value } : item)))} />
            </div>
          ))}
          <button type="button" className={secondary} onClick={() => setPlanActions((current) => [...current, { title: "", due_date: "" }])}><Plus className="h-4 w-4" /> Ajouter une action</button>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setStep(null)}>Annuler</button>
            <button
              type="button"
              className={primary}
              disabled={!planTitle.trim() || planActions.every((a) => !a.title.trim()) || mutations.agreementPlan.isPending}
              onClick={() => void run(() => mutations.agreementPlan.mutateAsync({
                id: obligation.id,
                title: planTitle.trim(),
                actions: planActions.filter((a) => a.title.trim()).map((a) => ({ title: a.title.trim(), ...(a.due_date ? { due_date: a.due_date } : {}) })),
              }), "Plan enregistré comme obligation suivie.")}
            >
              Enregistrer
            </button>
          </div>
        </Modal>
      )}
    </Drawer>
  );
}
