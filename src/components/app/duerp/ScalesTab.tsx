import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDuerpMutations, useScales, type ScaleRow, type Scales } from "@/integrations/backend/duerp";
import { PageSkeleton, card, errorMessage, input, muted, primary } from "../planning/shared";

const SECTIONS: { key: keyof Scales; title: string }[] = [
  { key: "gravity", title: "Gravité" },
  { key: "frequency", title: "Fréquence d'exposition" },
  { key: "maitrise", title: "Maîtrise des mesures existantes (1 = bonne)" },
];

/** Échelles de cotation : la méthode INRS laisse l'entreprise définir ses niveaux, tant qu'ils restent cohérents. */
export function ScalesTab() {
  const { data } = useScales();
  const actions = useDuerpMutations();
  const [draft, setDraft] = useState<Scales | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setDraft(structuredClone(data.scales));
  }, [data]);

  if (!draft || !data) return <PageSkeleton rows={4} />;

  const patch = (key: keyof Scales, index: number, change: Partial<ScaleRow>): void =>
    setDraft({ ...draft, [key]: draft[key].map((row, i) => (i === index ? { ...row, ...change } : row)) });
  const add = (key: keyof Scales): void => {
    const rows = draft[key];
    const level = (rows.at(-1)?.level ?? 0) + 1;
    setDraft({ ...draft, [key]: [...rows, { level, label: `Niveau ${level}`, score_value: level }] });
  };
  const remove = (key: keyof Scales): void => {
    if (draft[key].length > 2) setDraft({ ...draft, [key]: draft[key].slice(0, -1) });
  };

  return (
    <div className="space-y-4">
      <p className={muted}>
        {data.isCustom ? "Échelles personnalisées de votre entreprise." : "Échelles par défaut de la plateforme : enregistrez-les pour les adapter à votre activité."}
        {" "}Le risque évalué est Gravité × Fréquence × Maîtrise. Un niveau déjà utilisé par un risque évalué ne peut pas être retiré.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {SECTIONS.map(({ key, title }) => (
          <section key={key} className={`${card} space-y-2 p-4`}>
            <h3 className="font-display font-bold">{title}</h3>
            {draft[key].map((row, index) => (
              <div key={row.level} className="flex items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{row.level}</span>
                <input aria-label={`${title} niveau ${row.level}`} className={`${input} flex-1`} value={row.label} onChange={(e) => patch(key, index, { label: e.target.value })} />
                <input aria-label={`${title} valeur du niveau ${row.level}`} type="number" min={1} className={`${input} w-16`} value={row.score_value} onChange={(e) => patch(key, index, { score_value: Number(e.target.value) })} />
              </div>
            ))}
            <div className="flex gap-3 text-xs font-bold text-primary">
              <button type="button" onClick={() => add(key)}>+ Niveau</button>
              <button type="button" onClick={() => remove(key)} className="text-muted-foreground">− Dernier niveau</button>
            </div>
          </section>
        ))}
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" className={primary} disabled={actions.saveScales.isPending}
        onClick={() => { setError(null); actions.saveScales.mutateAsync(draft).then(() => toast.success("Échelles enregistrées."), (e: unknown) => setError(errorMessage(e, "Enregistrement impossible."))); }}>
        Enregistrer les échelles
      </button>
    </div>
  );
}
