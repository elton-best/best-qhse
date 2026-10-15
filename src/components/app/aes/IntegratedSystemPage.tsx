import { Layers } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useNormMode } from "@/hooks/use-norm-mode";
import { useAccessibleSubModules } from "@/integrations/backend/access";
import { useManagementOverview } from "@/integrations/backend/aes";
import { COMMON_LINES, Counter, NormSummaryCards, visibleLines } from "../NormSummary";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, muted } from "../planning/shared";

/** Pilotage consolidé d'un système de management intégré (plusieurs normes) ou d'un système mono-norme. */
export function IntegratedSystemPage() {
  const [siteId] = useCurrentSite();
  const { mode, codes } = useNormMode(siteId);
  const { data, isLoading, isError, error } = useManagementOverview(siteId || undefined);

  const { data: accessible } = useAccessibleSubModules(siteId || undefined);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Système de management"
        title={mode === "integrated" ? "Pilotage du système intégré" : "Pilotage du système de management"}
        description={
          mode === "integrated"
            ? "Les exigences communes sont saisies une seule fois et servent toutes les normes ; chaque norme garde ses modules propres."
            : "Votre système repose sur une seule norme : les interfaces et canevas sont ceux de cette norme."
        }
        icon={Layers}
      />

      <div className="flex flex-wrap gap-2" aria-label="Normes actives">
        {codes.length === 0 ? (
          <span className={muted}>Aucune norme active sur ce site.</span>
        ) : (
          codes.map((code) => (
            <span key={code} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {code}
            </span>
          ))
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {errorMessage(error, "Impossible de charger le pilotage.")}
        </div>
      )}

      {isLoading ? (
        <PageSkeleton rows={3} />
      ) : (
        data && (
          <>
            <section className={`${card} p-5`}>
              <h2 className="font-display text-lg font-bold">
                {mode === "integrated" ? "Briques communes (saisies une seule fois)" : "Briques du système"}
              </h2>
              <p className={muted}>
                Contexte, leadership, risques, objectifs, support, audits, revue de direction et amélioration continue.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {visibleLines(COMMON_LINES, accessible).map((line) => (
                  <Counter key={line.key} line={line} value={data.common[line.key] ?? 0} />
                ))}
              </div>
            </section>

            <NormSummaryCards codes={codes} figures={data.norms} accessible={accessible} />
          </>
        )
      )}
    </div>
  );
}
