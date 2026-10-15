import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/**
 * Bouton « Retour » commun à tous les espaces : revient à l'écran précédent de l'historique
 * (fiche ouverte, formulaire, rubrique) ou, à défaut d'historique, à la page de repli.
 */
export function BackButton({
  fallback = "/app",
  label = "Retour",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? router.history.back() : void navigate({ to: fallback }))}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary ${className}`}
      aria-label={`${label} à l'écran précédent`}
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
