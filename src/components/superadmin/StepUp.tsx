import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { setStepUpHandler, verifyStepUp } from "@/integrations/backend/superadmin";
import { btnGhost, btnPrimary, field, muted, panel } from "./sa-ui";

type Pending = { mfaToken: string; resolve: (ok: boolean) => void };
/**
 * Les actions sensibles du super administrateur exigent une confirmation récente par code e-mail.
 * Quand le serveur répond « MFA_REQUIRED », ce dialogue demande le code puis l'action est rejouée.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const ask = useCallback(
    (mfaToken: string) =>
      new Promise<boolean>((resolve) => {
        setCode("");
        setError("");
        setPending({ mfaToken, resolve });
      }),
    [],
  );

  useEffect(() => {
    setStepUpHandler(ask);
    return () => setStepUpHandler(null);
  }, [ask]);

  const close = (ok: boolean) => {
    pendingRef.current?.resolve(ok);
    setPending(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await verifyStepUp(pending.mfaToken, code.trim());
      close(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Code invalide ou expiré.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Confirmation de sécurité">
          <form onSubmit={submit} className={`${panel} w-full max-w-md space-y-4 p-6 shadow-2xl`}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-6 w-6 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">Confirmation de sécurité</h2>
                <p className={muted}>Cette action est sensible. Saisissez le code de vérification envoyé à votre adresse e-mail.</p>
              </div>
            </div>
            <input
              className={`${field} text-center text-lg tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="000000"
              aria-label="Code de vérification"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => close(false)}>
                Annuler
              </button>
              <button type="submit" className={btnPrimary} disabled={busy || code.length !== 6}>
                Confirmer
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
