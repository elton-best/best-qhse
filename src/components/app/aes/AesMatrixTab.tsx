import type { AesStats } from "@/integrations/backend/aes";
import { card, muted } from "../planning/shared";

const LEVELS = [7, 6, 5, 4, 3, 2, 1];
const COLUMNS = [1, 2, 3, 4, 5, 6, 7];

function zone(gravity: number, frequency: number): string {
  const product = gravity * frequency;
  if (product >= 25) return "bg-red-100 text-red-900 border-red-200";
  if (product >= 9) return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-emerald-100 text-emerald-900 border-emerald-200";
}

/** Carte de chaleur Gravité × Fréquence (M4-10) ; un clic filtre le registre. */
export function AesMatrixTab({
  stats,
  selected,
  onSelect,
}: {
  stats: AesStats | undefined;
  selected: { g: number; f: number } | null;
  onSelect: (cell: { g: number; f: number } | null) => void;
}) {
  return (
    <div className={`${card} p-5`}>
      <h2 className="font-display text-lg font-bold">Matrice gravité × fréquence</h2>
      <p className={muted}>Nombre d'aspects par couple (G, F). Cliquez sur une case pour filtrer le registre.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-1 text-sm" aria-label="Matrice gravité fréquence">
          <thead>
            <tr>
              <th />
              {COLUMNS.map((f) => (
                <th key={f} className="px-2 text-xs font-bold text-muted-foreground">
                  F {f}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((g) => (
              <tr key={g}>
                <th className="pr-2 text-right text-xs font-bold text-muted-foreground">G {g}</th>
                {COLUMNS.map((f) => {
                  const count = stats?.heatmap[`${g}-${f}`] ?? 0;
                  const active = selected?.g === g && selected.f === f;
                  return (
                    <td key={f}>
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => onSelect(active ? null : { g, f })}
                        className={`h-12 w-14 rounded-lg border text-base font-bold transition ${zone(g, f)} ${
                          active ? "ring-2 ring-primary" : ""
                        } ${count === 0 ? "opacity-40" : "hover:scale-105"}`}
                        aria-label={`Gravité ${g}, fréquence ${f} : ${count} aspect(s)`}
                      >
                        {count || ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-center ${muted}`}>Vert : faible exposition · Orange : à surveiller · Rouge : priorité</p>
    </div>
  );
}
