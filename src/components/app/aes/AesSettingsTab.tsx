import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { useAesMutations, useAesSettings, type AesSettings } from "@/integrations/backend/aes";
import { Label, PageSkeleton, card, errorMessage, input, muted, primary } from "../planning/shared";
import { DEFAULT_SETTINGS } from "./aes-config";

/** Paramètres de cotation et de significativité de l'organisme (M4-04). */
export function AesSettingsTab({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading } = useAesSettings();
  const mutations = useAesMutations();
  const [form, setForm] = useState<AesSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (isLoading || !data) return <PageSkeleton rows={2} />;

  const number = (key: keyof AesSettings) => (
    <input
      type="number"
      className={input}
      disabled={!canEdit}
      value={Number(form[key])}
      onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
    />
  );

  const save = async (): Promise<void> => {
    try {
      const result = await mutations.saveSettings.mutateAsync(form);
      toast.success(`Paramètres enregistrés — ${result.data.recalculated ?? 0} aspect(s) recalculé(s).`);
    } catch (error) {
      toast.error(errorMessage(error, "Enregistrement impossible."));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className={`${card} p-5`}>
        <h2 className="font-display text-lg font-bold">Méthode de cotation</h2>
        <p className={muted}>
          {data.is_default ? "Paramètres par défaut (canevas BASE AES)." : "Paramètres personnalisés de votre organisme."}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Seuil de significativité (Cr &gt; seuil)</Label>
            {number("significance_threshold")}
          </div>
          <div>
            <Label>Revue périodique (mois)</Label>
            {number("review_frequency_months")}
          </div>
          <div>
            <Label>Échelle maximale — Gravité</Label>
            {number("max_gravity")}
          </div>
          <div>
            <Label>Échelle maximale — Fréquence</Label>
            {number("max_frequency")}
          </div>
          <div>
            <Label>Échelle maximale — Sensibilité</Label>
            {number("max_sensitivity")}
          </div>
          <div>
            <Label>Échelle maximale — Maîtrise</Label>
            {number("max_mastery")}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.use_legal_criterion}
              onChange={(e) => setForm({ ...form, use_legal_criterion: e.target.checked })}
            />
            Critère additionnel : exigence légale
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={form.use_stakeholder_criterion}
              onChange={(e) => setForm({ ...form, use_stakeholder_criterion: e.target.checked })}
            />
            Critère additionnel : parties intéressées
          </label>
        </div>
        {canEdit ? (
          <div className="mt-5 flex items-center gap-3">
            <button type="button" className={primary} disabled={mutations.saveSettings.isPending} onClick={() => void save()}>
              Enregistrer et recalculer
            </button>
            <span className={muted}>Tous les aspects sont recalculés ; les versions figées conservent leur méthode.</span>
          </div>
        ) : (
          <p className={`mt-4 ${muted}`}>Seuls les responsables habilités peuvent modifier ces paramètres.</p>
        )}
      </div>

      <aside className={`${card} space-y-2 p-5 text-sm`}>
        <p className="flex items-center gap-2 font-display font-bold">
          <Info className="h-4 w-4 text-primary" /> Méthode documentée
        </p>
        <p>{data.method.formula}</p>
        <p className={muted}>{data.method.rule}</p>
        <p className={muted}>Score maximal : {data.method.maximum_score}.</p>
        <p className={muted}>
          Critères additionnels actifs : {data.method.additional_criteria.length ? data.method.additional_criteria.join(", ") : "aucun"}.
        </p>
      </aside>
    </div>
  );
}
