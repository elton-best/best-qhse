import { Factory } from "lucide-react";
import { RealisationPage } from "./shared";

export function ProductionPage() {
  return (
    <RealisationPage
      resource="operation"
      eyebrow="Réalisation des activités"
      title="Production & prestation"
      description="Suivez les opérations de production et de prestation, de la planification à la libération."
      icon={Factory}
      statuses={["Planifiée", "En cours", "Contrôlée", "Libérée", "Bloquée"]}
      filePrefix="production-prestation"
      fields={[
        { key: "title", label: "Produit / service", type: "text", required: true },
        { key: "process_id", label: "Processus", type: "text" },
        { key: "client", label: "Client / commande", type: "text" },
        { key: "date", label: "Date prévue", type: "date" },
        { key: "equipment_id", label: "Équipement", type: "text" },
        { key: "requirements", label: "Critères", type: "textarea", full: true },
        { key: "description", label: "Description", type: "textarea", full: true },
      ]}
    />
  );
}
