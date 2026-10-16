import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { BackendApiError } from "@/integrations/backend/client";
import { useAwarenessMutations, useCampaigns } from "@/integrations/backend/awareness";
import { Header, SiteNotice } from "../planning/shared";
import { CampaignsTab } from "./CampaignsTab";
import { FollowUpTab } from "./FollowUpTab";
import { MyTab } from "./MyTab";
import { TalksTab } from "./TalksTab";

type Tab = "mine" | "campaigns" | "talks" | "follow";

/** Sensibilisation — ISO 14001:2026 §7.3 : campagnes, supports, causeries, personnes extérieures et attestations. */
export function AwarenessCampaignsPage({ signingToken }: { signingToken?: string | undefined }) {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<Tab>("mine");
  const probe = useCampaigns(siteId || undefined, Boolean(siteId));
  const canManage = !(probe.error instanceof BackendApiError && probe.error.status === 403);
  const actions = useAwarenessMutations();

  // Émargement d'une causerie : le QR code ouvre cette page avec le jeton de la causerie.
  useEffect(() => {
    if (!signingToken) return;
    actions.sign.mutateAsync(signingToken).then(
      (r) => toast.success(r.data.already_signed ? `Vous aviez déjà signé « ${r.data.talk} ».` : `Présence enregistrée : ${r.data.talk}.`),
      (e: unknown) => toast.error(e instanceof Error ? e.message : "Émargement impossible."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signingToken]);

  const tabs: { id: Tab; label: string }[] = [{ id: "mine", label: "Mes sensibilisations" }, ...(canManage ? [
    { id: "campaigns" as const, label: "Campagnes" }, { id: "talks" as const, label: "Causeries" }, { id: "follow" as const, label: "Suivi" },
  ] : [])];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Support — ISO 14001:2026 §7.3"
        title="Campagnes de sensibilisation"
        description="Politique, aspects significatifs, contribution au système et conséquences d'un manquement : sensibilisez, tracez et attestez."
        icon={Megaphone}
      />
      <div role="tablist" aria-label="Sections de la sensibilisation" className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "mine" && <MyTab />}
      {tab === "campaigns" && canManage && <CampaignsTab siteId={siteId} />}
      {tab === "talks" && canManage && <TalksTab siteId={siteId} />}
      {tab === "follow" && canManage && <FollowUpTab siteId={siteId} />}
    </div>
  );
}
