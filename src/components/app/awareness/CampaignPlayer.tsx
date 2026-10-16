import { useState } from "react";
import { CheckCircle2, ExternalLink, FileDown } from "lucide-react";
import { toast } from "sonner";
import { TOPICS, type Content, type ParticipantMaterial, type QuizResult } from "@/integrations/backend/awareness";
import { card, errorMessage, muted, primary, secondary } from "../planning/shared";

/**
 * Parcours d'une campagne : lecture des supports avec accusé de lecture, quiz corrigés par le serveur, attestation.
 * Utilisé par les salariés (compte) et par les personnes extérieures invitées (lien personnel).
 */
export function CampaignPlayer({
  content, onRead, onQuiz, onAttestation,
}: {
  content: Content;
  onRead: (materialId: number) => Promise<void>;
  onQuiz: (materialId: number, answers: number[]) => Promise<QuizResult>;
  onAttestation: () => Promise<void>;
}) {
  const done = content.materials.filter((m) => m.done).length;
  const total = content.materials.length;

  return (
    <div className="space-y-4">
      <div className={`${card} p-4`}>
        <h2 className="font-display text-lg font-bold">{content.campaign.title}</h2>
        {content.campaign.objective && <p className={muted}>{content.campaign.objective}</p>}
        <p className="mt-2 text-sm font-semibold" role="status">{done} support(s) validé(s) sur {total}</p>
        <progress className="mt-1 h-2 w-full" value={done} max={Math.max(total, 1)} aria-label="Progression" />
        {content.completed_at && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5" /> Sensibilisation terminée — attestation {content.attestation_number}
            <button type="button" className={secondary} onClick={() => void onAttestation()}><FileDown className="h-4 w-4" /> Télécharger l'attestation</button>
          </div>
        )}
      </div>

      {content.aspects.length > 0 && (
        <section className={`${card} p-4`}>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Aspects environnementaux liés à votre travail</h3>
          <ul className="mt-2 space-y-1 text-sm">{content.aspects.map((a) => <li key={a.id}><strong>{a.aspect}</strong> — {a.impact}</li>)}</ul>
        </section>
      )}

      {TOPICS.map((topic) => {
        const materials = content.materials.filter((m) => m.topic === topic.value);
        if (materials.length === 0) return null;
        return (
          <section key={topic.value} className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{topic.label}</h3>
            {materials.map((material) => <MaterialCard key={material.id} material={material} open={content.campaign.status === "active"} onRead={onRead} onQuiz={onQuiz} />)}
          </section>
        );
      })}
    </div>
  );
}

function MaterialCard({ material, open, onRead, onQuiz }: {
  material: ParticipantMaterial; open: boolean; onRead: (id: number) => Promise<void>; onQuiz: (id: number, answers: number[]) => Promise<QuizResult>;
}) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (job: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await job();
    } catch (e) {
      toast.error(errorMessage(e, "Action impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`${card} space-y-3 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold">{material.title}</h4>
        {material.done && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Validé</span>}
      </div>
      {material.type === "sheet" && <p className="whitespace-pre-line text-sm">{material.body}</p>}
      {material.type === "video" && (
        <a href={material.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"><ExternalLink className="h-4 w-4" /> Ouvrir la vidéo</a>
      )}
      {material.type !== "quiz" && !material.done && open && (
        <button type="button" className={primary} disabled={busy} onClick={() => void run(() => onRead(material.id))}>{material.type === "video" ? "J'ai regardé la vidéo" : "J'ai lu et compris"}</button>
      )}
      {material.type === "quiz" && !material.done && open && (
        <div className="space-y-3">
          {material.questions.map((question, index) => (
            <fieldset key={index} className="space-y-1">
              <legend className="text-sm font-semibold">{index + 1}. {question.question}</legend>
              {question.options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`q-${material.id}-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers(Object.assign([...answers], { [index]: optionIndex }))} /> {option}
                </label>
              ))}
            </fieldset>
          ))}
          {result && !result.passed && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Score {result.score} % ({result.correct}/{result.total}) : {material.pass_mark} % sont nécessaires. Relisez les supports et réessayez.</p>}
          <button type="button" className={primary} disabled={busy || answers.filter((a) => a !== undefined).length < material.questions.length}
            onClick={() => void run(async () => setResult(await onQuiz(material.id, material.questions.map((_, i) => answers[i] ?? 0))))}>Valider mes réponses</button>
        </div>
      )}
    </article>
  );
}
