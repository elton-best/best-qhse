import { Package } from "lucide-react";
import { RealisationPage } from "./shared";

export function ReleasePage() {
  return (
    <RealisationPage
      resource="release"
      eyebrow="Réalisation des activités"
      title="Libération"
      description="Enregistrez les décisions de libération des lots et prestations, y compris sous dérogation."
      icon={Package}
      statuses={["En attente", "Libéré", "Dérogation", "Rejeté"]}
      filePrefix="liberation"
      fields={[
        { key: "title", label: "Lot / prestation", type: "text", required: true },
        { key: "operation_id", label: "Opération", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "criteria", label: "Critères de libération", type: "textarea", full: true },
        { key: "description", label: "Décision et personne autorisée", type: "textarea", full: true },
      ]}
    />
  );
}
