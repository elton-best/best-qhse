import { useState } from "react";
import { toast } from "sonner";
import { GitCompare, Lock } from "lucide-react";
import { useAesMutations, useAesVersionDiff, useAesVersions } from "@/integrations/backend/aes";
import { PageSkeleton, card, errorMessage, formatDateFR, input, muted, primary } from "../planning/shared";

const FIELD_LABEL: Record<string, string> = {
  gravity: "Gravité", frequency: "Fréquence", sensitivity: "Sensibilité", mastery: "Maîtrise",
  criticality_score: "Cr", is_significant: "Significatif", significance_basis: "Base de significativité",
  status: "Statut", existing_controls: "Mesures existantes", additional_actions: "Actions complémentaires",
  group_label: "Regroupement", group_members: "Activités ou produits regroupés", group_characteristics: "Caractéristiques communes",
  activity: "Activité", aspect: "Aspect", impact: "Impact", aspect_number: "N°",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

/** Versions figées du registre (preuve) et comparaison entre deux versions (M4-10). */
export function AesVersionsTab({ siteId }: { siteId: string }) {
  const { data: versions = [], isLoading } = useAesVersions(siteId || undefined);
  const mutations = useAesMutations();
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const { data: diff, isFetching } = useAesVersionDiff(from, to);

  const freeze = async (): Promise<void> => {
    try {
      const result = await mutations.freezeVersion.mutateAsync({
        ...(siteId ? { site_id: siteId } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setLabel("");
      toast.success(`Version ${result.data.version_number} figée.`);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible de figer une version."));
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex items-start gap-3">
          <Lock className="mt-1 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">Versions figées du registre</h2>
            <p className={muted}>
              Une version conserve l'état complet du registre et la méthode de cotation utilisée. Elle ne peut plus être modifiée
              ni supprimée. Tous les aspects doivent être validés.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${input} max-w-xs`}
                placeholder="Libellé (ex. Revue annuelle 2026)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button type="button" className={primary} disabled={mutations.freezeVersion.isPending} onClick={() => void freeze()}>
                Figer une version
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        {isLoading ? (
          <PageSkeleton rows={2} />
        ) : versions.length === 0 ? (
          <p className={`py-6 text-center ${muted}`}>Aucune version figée.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Version</th>
                <th className="px-3 py-2">Libellé</th>
                <th className="px-3 py-2">Aspects</th>
                <th className="px-3 py-2">AES</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => (
                <tr key={version.id} className="border-t border-border">
                  <td className="px-3 py-2 font-bold">V{version.version_number}</td>
                  <td className="px-3 py-2">{version.label ?? "—"}</td>
                  <td className="px-3 py-2">{version.aspects_count}</td>
                  <td className="px-3 py-2">{version.significant_count}</td>
                  <td className="px-3 py-2">{formatDateFR(version.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {versions.length >= 2 && (
        <div className={`${card} p-5`}>
          <h3 className="flex items-center gap-2 font-display font-bold">
            <GitCompare className="h-4 w-4" /> Comparer deux versions
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[
              { value: from, set: setFrom, label: "De" },
              { value: to, set: setTo, label: "À" },
            ].map((side) => (
              <label key={side.label} className="flex items-center gap-2 text-sm">
                {side.label}
                <select className={input} value={side.value ?? ""} onChange={(e) => side.set(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">—</option>
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      V{version.version_number} {version.label ? `— ${version.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {isFetching && <p className={`mt-3 ${muted}`}>Comparaison en cours…</p>}
          {diff && (
            <div className="mt-4 space-y-3 text-sm">
              {diff.method_changed && (
                <p className="rounded-xl bg-amber-50 p-3 text-amber-900">La méthode de cotation a changé entre ces deux versions.</p>
              )}
              <p>
                <span className="font-bold text-emerald-700">{diff.added.length} ajouté(s)</span> ·{" "}
                <span className="font-bold text-red-700">{diff.removed.length} retiré(s)</span> ·{" "}
                <span className="font-bold text-amber-700">{diff.changed.length} modifié(s)</span>
              </p>
              {diff.added.map((row) => (
                <p key={`a${row.id}`}>+ {row.aspect} {row.is_significant ? "(AES)" : ""}</p>
              ))}
              {diff.removed.map((row) => (
                <p key={`r${row.id}`}>− {row.aspect}</p>
              ))}
              {diff.changed.map((row) => (
                <div key={`c${row.id}`} className="rounded-xl bg-secondary/50 p-3">
                  <p className="font-semibold">{row.aspect}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {Object.entries(row.changes).map(([field, change]) => (
                      <li key={field}>
                        {FIELD_LABEL[field] ?? field} : {show(change.from)} → {show(change.to)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
