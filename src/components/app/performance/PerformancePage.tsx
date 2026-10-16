import { useState } from "react";
import { Activity } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { Header, SiteNotice } from "../planning/shared";
import { IndicatorsTab } from "./IndicatorsTab";
import { InstrumentsTab } from "./InstrumentsTab";
import { OverviewTab } from "./OverviewTab";
import { QuickEntryTab } from "./QuickEntryTab";
import { ReadingsTab } from "./ReadingsTab";
import { ReportTab } from "./ReportTab";

type Tab = "overview" | "entry" | "indicators" | "readings" | "instruments" | "report";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "entry", label: "Saisie rapide" },
  { id: "indicators", label: "Indicateurs" },
  { id: "readings", label: "Relevés" },
  { id: "instruments", label: "Instruments" },
  { id: "report", label: "Rapport" },
];

/** Performance environnementale et surveillance — ISO 14001:2026 §9.1.1. */
export function PerformancePage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Évaluation des performances — ISO 14001:2026 §9.1.1"
        title="Performance environnementale et surveillance"
        description="Mesurez, tracez et analysez vos indicateurs ; gardez la preuve de chaque valeur et la validité de vos instruments de mesure."
        icon={Activity}
      />
      <div role="tablist" aria-label="Sections de la performance environnementale" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab siteId={siteId} />}
      {tab === "entry" && <QuickEntryTab siteId={siteId} />}
      {tab === "indicators" && <IndicatorsTab siteId={siteId} />}
      {tab === "readings" && <ReadingsTab siteId={siteId} />}
      {tab === "instruments" && <InstrumentsTab siteId={siteId} />}
      {tab === "report" && <ReportTab siteId={siteId} />}
    </div>
  );
}
