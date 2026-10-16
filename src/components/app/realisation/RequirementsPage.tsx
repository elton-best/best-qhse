import { ClipboardCheck } from "lucide-react";
import { RealisationPage } from "./shared";

export function RequirementsPage() {
  return (
    <RealisationPage
      resource="requirement"
      eyebrow="Réalisation des activités"
      title="Exigences produits & services"
      description="Recensez et revoyez les exigences clients, réglementaires et internes avant de vous engager."
      icon={ClipboardCheck}
      statuses={["À analyser", "Revue", "Satisfaite", "Archivé"]}
      filePrefix="exigences-produits-services"
      fields={[
        { key: "title", label: "Exigence", type: "text", required: true },
        {
          key: "origin",
          label: "Origine",
          type: "select",
          options: ["Client", "Réglementaire", "Interne"],
          required: true,
        },
        { key: "client", label: "Client / source", type: "text" },
        { key: "process_id", label: "Processus", type: "process" },
        { key: "description", label: "Description", type: "textarea", full: true },
      ]}
    />
  );
}
