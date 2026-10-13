const WORDS = 9;

/**
 * Loader global LOGIQUALI (animation "Loading", couleurs du thème).
 * Utilisé pendant les chargements de rubriques et les rechargements.
 */
export function GlobalLoader({ label = "Chargement" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid min-h-[40dvh] place-items-center p-8"
    >
      <div className="lq-loader" aria-hidden="true">
        {Array.from({ length: WORDS }).map((_, i) => (
          <div key={i} className="text">
            <span>Loading</span>
          </div>
        ))}
        <div className="line" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
