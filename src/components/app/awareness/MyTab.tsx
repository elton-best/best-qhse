import { useState } from "react";
import { toast } from "sonner";
import { downloadAttestation, useAwarenessMutations, useMyCampaigns, useMyContent } from "@/integrations/backend/awareness";
import { downloadBlob } from "@/integrations/backend/realisation";
import { PageSkeleton, card, errorMessage, formatDateFR, muted } from "../planning/shared";
import { CampaignPlayer } from "./CampaignPlayer";

/** Espace du salarié : les sensibilisations qui lui sont adressées, avec accusé de lecture et attestation. */
export function MyTab() {
  const { data: campaigns = [], isLoading } = useMyCampaigns();
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: content } = useMyContent(openId);
  const actions = useAwarenessMutations();

  if (isLoading) return <PageSkeleton rows={3} />;
  if (openId !== null) {
    return (
      <div className="space-y-3">
        <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setOpenId(null)}>← Mes sensibilisations</button>
        {!content ? <PageSkeleton rows={3} /> : (
          <CampaignPlayer
            content={content}
            onRead={async (materialId) => { await actions.read.mutateAsync({ campaignId: openId, materialId }); toast.success("Lecture enregistrée."); }}
            onQuiz={async (materialId, answers) => { const response = await actions.quiz.mutateAsync({ campaignId: openId, materialId, answers }); if (response.data.passed) toast.success("Quiz validé."); return response.data; }}
            onAttestation={() => downloadAttestation(openId).then((blob) => downloadBlob(blob, `attestation-${content.attestation_number ?? openId}.pdf`), (e: unknown) => { toast.error(errorMessage(e, "Téléchargement impossible.")); })}
          />
        )}
      </div>
    );
  }

  return campaigns.length === 0 ? <p className={`${card} p-6 text-center ${muted}`}>Aucune sensibilisation ne vous est adressée pour le moment.</p> : (
    <ul className="grid gap-3 md:grid-cols-2">
      {campaigns.map((c) => (
        <li key={c.campaign_id} className={`${card} p-4`}>
          <p className="font-semibold">{c.title}</p>
          <p className={muted}>{c.ref}{c.end_date ? ` · à terminer avant le ${formatDateFR(c.end_date)}` : ""}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.completed_at ? "bg-emerald-100 text-emerald-700" : c.status === "closed" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{c.completed_at ? "Terminée" : c.status === "closed" ? "Clôturée" : "À suivre"}</span>
            <button type="button" className="text-sm font-bold text-primary hover:underline" onClick={() => setOpenId(c.campaign_id)}>{c.completed_at ? "Revoir" : "Commencer"}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
