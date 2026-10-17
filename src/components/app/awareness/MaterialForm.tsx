import { useState } from "react";
import { X } from "lucide-react";
import { TOPICS, type Material, type MaterialType, type Question, type Topic } from "@/integrations/backend/awareness";
import { Field } from "../overlay";
import { errorMessage, input, primary, secondary } from "../planning/shared";

const TYPES: { value: MaterialType; label: string }[] = [
  { value: "sheet", label: "Fiche (texte court)" }, { value: "video", label: "Vidéo (lien https)" }, { value: "quiz", label: "Quiz" },
];

/** Support de sensibilisation : fiche, vidéo ou quiz noté par le serveur. */
export function MaterialForm({ material, busy, onSubmit, onCancel }: {
  material: Material | null; busy: boolean; onSubmit: (input: Record<string, unknown>) => Promise<void>; onCancel: () => void;
}) {
  const [topic, setTopic] = useState<Topic>(material?.topic ?? "policy");
  const [type, setType] = useState<MaterialType>(material?.type ?? "sheet");
  const [title, setTitle] = useState(material?.title ?? "");
  const [body, setBody] = useState(material?.body ?? "");
  const [url, setUrl] = useState(material?.url ?? "");
  const [passMark, setPassMark] = useState(String(material?.pass_mark ?? 70));
  const [questions, setQuestions] = useState<Question[]>(material?.questions?.length ? material.questions : [{ question: "", options: ["", ""], correct: 0 }]);
  const [error, setError] = useState<string | null>(null);

  const patch = (index: number, change: Partial<Question>): void => setQuestions(questions.map((q, i) => (i === index ? { ...q, ...change } : q)));

  const submit = async (): Promise<void> => {
    setError(null);
    try {
      await onSubmit({
        topic, type, title: title.trim(), pass_mark: Number(passMark) || 70,
        ...(type === "sheet" ? { body: body.trim() } : {}),
        ...(type === "video" ? { url: url.trim() } : {}),
        ...(type === "quiz" ? { questions: questions.map((q) => ({ question: q.question.trim(), options: q.options.map((o) => o.trim()), correct: q.correct ?? 0 })) } : {}),
      });
    } catch (e) {
      setError(errorMessage(e, "Enregistrement impossible."));
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Point de la clause 7.3 couvert *">
        <select className={input} value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>{TOPICS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type de support *"><select className={input} value={type} onChange={(e) => setType(e.target.value as MaterialType)}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="Titre *"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      </div>
      {type === "sheet" && <Field label="Contenu *"><textarea className={`${input} min-h-28`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>}
      {type === "video" && <Field label="Lien de la vidéo (https) *"><input className={input} value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
      {type === "quiz" && (
        <div className="space-y-3">
          <Field label="Note minimale pour valider (%)"><input type="number" min={50} max={100} className={input} value={passMark} onChange={(e) => setPassMark(e.target.value)} /></Field>
          {questions.map((q, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <input aria-label={`Question ${index + 1}`} className={input} placeholder={`Question ${index + 1}`} value={q.question} onChange={(e) => patch(index, { question: e.target.value })} />
                {questions.length > 1 && <button type="button" aria-label="Retirer la question" onClick={() => setQuestions(questions.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button>}
              </div>
              {q.options.map((option, optionIndex) => (
                <label key={optionIndex} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`correct-${index}`} aria-label={`Bonne réponse ${optionIndex + 1} de la question ${index + 1}`} checked={q.correct === optionIndex} onChange={() => patch(index, { correct: optionIndex })} />
                  <input className={input} placeholder={`Proposition ${optionIndex + 1}`} value={option} onChange={(e) => patch(index, { options: q.options.map((o, i) => (i === optionIndex ? e.target.value : o)) })} />
                </label>
              ))}
              {q.options.length < 6 && <button type="button" className="text-xs font-bold text-primary" onClick={() => patch(index, { options: [...q.options, ""] })}>+ Proposition</button>}
            </div>
          ))}
          <button type="button" className="text-sm font-bold text-primary" onClick={() => setQuestions([...questions, { question: "", options: ["", ""], correct: 0 }])}>+ Question</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={onCancel}>Annuler</button><button type="button" className={primary} disabled={busy} onClick={() => void submit()}>Enregistrer</button></div>
    </div>
  );
}
