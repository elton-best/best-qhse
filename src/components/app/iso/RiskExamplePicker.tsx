import { useRiskExamples, type RiskExample } from "@/integrations/backend/isoFoundation";
import { useI18n } from "@/lib/i18n";
import { input } from "../planning/shared";

export function RiskExamplePicker({
  type,
  onChoose,
}: {
  type: "risque" | "opportunite";
  onChoose: (example: RiskExample, locale: "fr" | "en") => void;
}) {
  const { data: examples = [], isPending, isError } = useRiskExamples();
  const { locale, t } = useI18n();
  return (
    <div className="space-y-2 rounded-xl bg-primary-soft p-4">
      <label className="block text-sm font-bold">
        {t("Bibliothèque d’exemples")}
        <select
          aria-label={t("Bibliothèque d’exemples")}
          className={input}
          value=""
          disabled={isPending || isError}
          onChange={(e) => {
            const example = examples.find((item) => item.id === e.target.value);
            if (example) onChoose(example, locale);
          }}
        >
          <option value="">{t("Choisir un exemple à adapter")}</option>
          {examples
            .filter((e) => e.type === type)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.title[locale]}
              </option>
            ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        {isError
          ? t("Erreur de chargement.")
          : t(
              "Ces exemples sont des suggestions à adapter à votre contexte. Aucun enregistrement automatique.",
            )}
      </p>
    </div>
  );
}
