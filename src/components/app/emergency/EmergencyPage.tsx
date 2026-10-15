import { useState } from "react";
import { Siren } from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { Header, SiteNotice } from "../planning/shared";
import { ContactsTab } from "./ContactsTab";
import { EventsTab } from "./EventsTab";
import { ExercisesTab } from "./ExercisesTab";
import { OverviewTab } from "./OverviewTab";
import { ResourcesTab } from "./ResourcesTab";
import { ScenariosTab } from "./ScenariosTab";

type Tab = "overview" | "scenarios" | "contacts" | "resources" | "exercises" | "events";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "scenarios", label: "Scénarios" },
  { id: "contacts", label: "Annuaire" },
  { id: "resources", label: "Moyens d'intervention" },
  { id: "exercises", label: "Exercices" },
  { id: "events", label: "Situations réelles" },
];

/** Préparation et réponse aux situations d'urgence — ISO 14001:2026 §8.2. */
export function EmergencyPage() {
  const [siteId] = useCurrentSite();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Réalisation des activités — ISO 14001:2026 §8.2"
        title="Préparation et réponse aux situations d'urgence"
        description="Identifiez vos scénarios, tenez à jour l'annuaire et les moyens d'intervention, testez-les par des exercices et tirez les enseignements de chaque situation réelle."
        icon={Siren}
      />

      <div role="tablist" aria-label="Sections des urgences" className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab siteId={siteId} onNavigate={setTab} />}
      {tab === "scenarios" && <ScenariosTab siteId={siteId} />}
      {tab === "contacts" && <ContactsTab siteId={siteId} />}
      {tab === "resources" && <ResourcesTab siteId={siteId} />}
      {tab === "exercises" && <ExercisesTab siteId={siteId} />}
      {tab === "events" && <EventsTab siteId={siteId} />}
    </div>
  );
}
