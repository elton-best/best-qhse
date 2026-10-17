/** Courbe simple des relevés, avec la cible et le seuil d'alerte en pointillés. */
export function Sparkline({ values, target, alert, label }: { values: number[]; target?: number | null; alert?: number | null; label: string }) {
  if (values.length < 2) return <p className="text-sm text-muted-foreground">Au moins deux relevés sont nécessaires pour tracer la courbe.</p>;
  const extras = [target, alert].filter((v): v is number => typeof v === "number");
  const all = [...values, ...extras];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const x = (i: number): number => 8 + (i / (values.length - 1)) * 304;
  const y = (v: number): number => 8 + (1 - (v - min) / span) * 84;
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg role="img" aria-label={label} viewBox="0 0 320 100" className="h-28 w-full">
      {typeof target === "number" && <line x1="8" x2="312" y1={y(target)} y2={y(target)} stroke="currentColor" strokeDasharray="4 3" className="text-emerald-600" />}
      {typeof alert === "number" && <line x1="8" x2="312" y1={y(alert)} y2={y(alert)} stroke="currentColor" strokeDasharray="4 3" className="text-red-600" />}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" className="fill-primary" />)}
    </svg>
  );
}
