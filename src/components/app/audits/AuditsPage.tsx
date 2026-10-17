import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { Header, SiteNotice } from "../planning/shared";
import { PlansTab } from "./PlansTab";
import { ProposalsTab } from "./ProposalsTab";

type Tab = "plans" | "program";

/** Audits internes — ISO 14001:2026 §9.2 et ISO 19011 : programme, plans, conduite, constats et rapport. */
export function AuditsPage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<Tab>("plans");
  const [preset, setPreset] = useState<number | undefined>();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Évaluation des performances — ISO 14001:2026 §9.2"
        title="Audits internes"
        description="Établissez le programme selon l'importance environnementale, choisissez des auditeurs indépendants, conduisez l'audit et suivez les constats."
        icon={ClipboardCheck}
      />
      <div role="tablist" aria-label="Sections des audits" className="flex flex-wrap gap-1 border-b border-border">
        {([["plans", "Plans d'audit"], ["program", "Programme proposé"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
        ))}
      </div>
      {tab === "plans" && <PlansTab siteId={siteId} presetProcessId={preset} />}
      {tab === "program" && <ProposalsTab siteId={siteId} onPlan={(processId) => { setPreset(processId); setTab("plans"); }} />}
    </div>
  );
}
