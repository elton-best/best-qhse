import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

type SectionErrorBoundaryProps = {
  children: ReactNode;
  onResetKey?: string;
};

type SectionErrorBoundaryState = {
  error: Error | undefined;
};

export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  override state: SectionErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): SectionErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[SectionErrorBoundary] Impossible d'afficher la fiche.", error, info);
  }

  override componentDidUpdate(prevProps: SectionErrorBoundaryProps): void {
    if (prevProps.onResetKey !== this.props.onResetKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: undefined });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="mx-auto max-w-3xl p-4 md:p-8">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Fiche processus
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold">
              Cette fiche ne peut pas s&rsquo;afficher
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Une erreur inattendue a emp&ecirc;ch&eacute; l&rsquo;affichage de cette fiche. Vous
              pouvez r&eacute;essayer ou revenir &agrave; la liste des processus.
            </p>
            <p className="mx-auto mt-4 max-w-xl break-words rounded-xl bg-background p-3 text-xs text-muted-foreground">
              {String(error?.message ?? error)}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
              >
                R&eacute;essayer
              </button>
              <Link
                to="/app/$section"
                params={{ section: "processus" }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition hover:border-primary hover:text-primary"
              >
                Retour aux processus
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
