import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useGuide, useGuideMutations, type GuideStep, type StepState } from "@/integrations/backend/guide";
import { Field } from "../overlay";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, input, muted, primary, secondary } from "../planning/shared";

const STATE: Record<StepState, [string, string]> = {
  done: ["Fait", "bg-emerald-100 text-emerald-700"], in_progress: ["Commencé", "bg-sky-100 text-sky-700"], todo: ["À faire", "bg-amber-100 text-amber-800"], skipped: ["Reporté", "bg-slate-200 text-slate-600"],
};

/** Assistant de démarrage (T-01) : huit étapes, des exemples préremplis par secteur, reprise possible à tout moment. */
export function SetupGuidePage() {
  const [siteId] = useCurrentSite();
  const { data, isLoading } = useGuide(siteId || undefined, Boolean(siteId));
  const actions = useGuideMutations(siteId || undefined);
  const [sector, setSector] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try { await job; toast.success(success); } catch (e) { setError(errorMessage(e, "Action impossible.")); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header eyebrow="Accueil" title="Démarrage guidé" icon={Rocket}
        description="Huit étapes pour poser les bases de votre système de management environnemental. Les exemples créent des brouillons du secteur : relisez-les, adaptez-les, puis validez-les." />
      {isLoading || !data ? <PageSkeleton rows={5} /> : (
        <>
          <section className={`${card} space-y-3 p-4`}>
            <p className="text-sm font-semibold" role="status">{data.done} étape(s) sur {data.total} terminée(s) — {data.site.name}</p>
            <progress className="h-2 w-full" value={data.done} max={data.total} aria-label="Progression du démarrage" />
            <Field label="Votre secteur d'activité (pour les exemples)">
              <select className={input} value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">— Choisir —</option>
                {data.sectors.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </section>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <ol className="space-y-3">
            {data.steps.map((step, index) => <StepCard key={step.key} index={index + 1} step={step} sector={sector}
              onApply={() => run(actions.apply.mutateAsync({ step: step.key, sector }), "Exemple créé en brouillon : relisez-le avant de le valider.")}
              onSkip={(skipped) => run(actions.skip.mutateAsync({ step: step.key, skipped }), skipped ? "Étape reportée." : "Étape reprise.")} />)}
          </ol>
        </>
      )}
    </div>
  );
}

function StepCard({ index, step, sector, onApply, onSkip }: { index: number; step: GuideStep; sector: string; onApply: () => Promise<void>; onSkip: (skipped: boolean) => Promise<void> }) {
  const [label, tone] = STATE[step.state];
  return (
    <li className={`${card} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {step.state === "done" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden />}
          <div>
            <h2 className="font-semibold">{index}. {step.title}</h2>
            <p className={muted}>{step.why}</p>
            {step.applied_sector && <p className="text-xs text-muted-foreground">Exemple du secteur appliqué — à relire et à valider.</p>}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}{step.count > 0 && step.state !== "done" ? ` (${step.count})` : ""}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/app/$section" params={{ section: step.slug }} className={step.state === "done" ? secondary : primary}>{step.state === "done" ? "Consulter" : "Renseigner"}</Link>
        {step.can_apply && <button type="button" className={secondary} disabled={!sector} title={sector ? undefined : "Choisissez d'abord votre secteur"} onClick={() => void onApply()}>Préremplir avec un exemple</button>}
        {step.state === "skipped" ? <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => void onSkip(false)}>Reprendre cette étape</button>
          : step.state !== "done" && <button type="button" className="text-sm font-semibold text-muted-foreground hover:underline" onClick={() => void onSkip(true)}>Plus tard</button>}
      </div>
    </li>
  );
}
