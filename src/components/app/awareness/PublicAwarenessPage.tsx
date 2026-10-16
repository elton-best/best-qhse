import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { publicAttestation, publicContent, publicQuiz, publicRead, type Content } from "@/integrations/backend/awareness";
import { downloadBlob } from "@/integrations/backend/realisation";
import { errorMessage } from "../planning/shared";
import { CampaignPlayer } from "./CampaignPlayer";

/**
 * Page d'une personne extérieure invitée (sous-traitant…) : accessible par lien personnel, sans compte.
 * Elle ne donne accès qu'aux supports de sa campagne et à son attestation.
 */
export function PublicAwarenessPage({ token }: { token: string }) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setContent(await publicContent(token));
    } catch (e) {
      setError(errorMessage(e, "Ce lien n'est plus valable."));
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="font-display text-2xl font-extrabold">Sensibilisation environnementale</h1>
          {content?.participant && <p className="text-sm text-muted-foreground">{content.participant.name}{content.participant.organization ? ` — ${content.participant.organization}` : ""}</p>}
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {!content && !error && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {content && (
        <CampaignPlayer
          content={content}
          onRead={async (materialId) => { await publicRead(token, materialId); toast.success("Lecture enregistrée."); await load(); }}
          onQuiz={async (materialId, answers) => { const result = await publicQuiz(token, materialId, answers); if (result.passed) toast.success("Quiz validé."); await load(); return result; }}
          onAttestation={() => publicAttestation(token).then((blob) => downloadBlob(blob, "attestation-sensibilisation.pdf"), (e: unknown) => { toast.error(errorMessage(e, "Téléchargement impossible.")); })}
        />
      )}
    </main>
  );
}
