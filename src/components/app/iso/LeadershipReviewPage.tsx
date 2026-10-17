import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { isoFoundationApi, type LeadershipAnswer } from "@/integrations/backend/isoFoundation";
import { useI18n } from "@/lib/i18n";
import { card, input, primary, secondary, errorMessage } from "../planning/shared";

export function LeadershipReviewPage() {
  const [siteId] = useCurrentSite();
  const { locale, t, date } = useI18n();
  const [year, setYear] = useState(new Date().getFullYear());
  const [answers, setAnswers] = useState<Record<string, LeadershipAnswer>>({});
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["leadership-reviews", siteId],
    queryFn: () => isoFoundationApi.leadership(siteId),
    enabled: !!siteId,
  });
  const review = query.data?.data.reviews.find((r) => r.year === year);
  useEffect(() => {
    setAnswers(review?.answers ?? {});
  }, [review, siteId, year]);
  const locked = !query.data?.data.can_manage || review?.status === "completed";
  const complete = Object.keys(query.data?.data.commitments ?? {}).every(
    (code) => answers[code]?.status && answers[code]?.justification.trim(),
  );
  const save = async (status: "draft" | "completed") => {
    setBusy(true);
    const normalized = Object.fromEntries(
      Object.entries(answers)
        .filter(([, answer]) => answer.status || answer.justification.trim())
        .map(([key, answer]) => [key, answer]),
    );
    try {
      await isoFoundationApi.saveLeadership({ site_id: siteId, year, answers: normalized, status });
      await query.refetch();
      toast.success(t("Revue enregistrée."));
    } catch (error) {
      toast.error(errorMessage(error, t("Erreur de chargement.")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <h1 className="font-display text-2xl font-bold">{t("Engagements de leadership")}</h1>
      <p>{t("Revue annuelle de la direction — article 5.1 a à i")}</p>
      {!siteId ? (
        <p>{t("Sélectionnez un site", "Select a site")}</p>
      ) : query.isPending ? (
        <p>{t("Chargement…")}</p>
      ) : query.isError ? (
        <p role="alert">{errorMessage(query.error, t("Erreur de chargement."))}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <label>
              {t("Année")}
              <input
                type="number"
                min={2000}
                max={2100}
                className={`${input} max-w-32`}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <span>
              {review?.status === "completed"
                ? `${t("Finalisée")} · ${date(review.completed_at)}`
                : t("Brouillon")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Une revue finalisée est conservée et ne peut plus être modifiée.")}
          </p>
          {Object.entries(query.data.data.commitments).map(([code, labels]) => (
            <fieldset key={code} disabled={locked || busy} className={`${card} space-y-3 p-5`}>
              <legend className="px-2 font-bold">5.1 {code}</legend>
              <p>{labels[locale]}</p>
              <label className="block text-sm">
                {t("Évaluation", "Assessment")}
                <select
                  className={`${input} max-w-xs`}
                  aria-label={`5.1 ${code}`}
                  value={answers[code]?.status ?? ""}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [code]: {
                        justification: current[code]?.justification ?? "",
                        status: e.target.value as LeadershipAnswer["status"],
                      },
                    }))
                  }
                >
                  <option value="">—</option>
                  <option value="yes">{t("Oui")}</option>
                  <option value="partial">{t("Partiellement")}</option>
                  <option value="no">{t("Non")}</option>
                </select>
              </label>
              <label className="block text-sm">
                {t("Justification et preuves")}
                <textarea
                  className={input}
                  maxLength={5000}
                  value={answers[code]?.justification ?? ""}
                  onChange={(e) =>
                    setAnswers((current) => ({
                      ...current,
                      [code]: {
                        status: current[code]?.status ?? "",
                        justification: e.target.value,
                      },
                    }))
                  }
                />
              </label>
            </fieldset>
          ))}
          {!locked && (
            <div className="flex gap-3">
              <button className={secondary} disabled={busy} onClick={() => void save("draft")}>
                {t("Enregistrer")}
              </button>
              <button
                className={primary}
                disabled={busy || !complete}
                onClick={() => void save("completed")}
              >
                {t("Finaliser la revue")}
              </button>
            </div>
          )}
          <div className={`${card} space-y-2 p-4`}>
            {query.data.data.reviews.map((r) => (
              <button
                type="button"
                key={r.id}
                className="mr-2 rounded-lg border border-border p-2 text-sm"
                onClick={() => setYear(r.year)}
              >
                {r.year} · {t(r.status === "completed" ? "Finalisée" : "Brouillon")}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
