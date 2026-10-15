import { PenTool } from "lucide-react";
import { RealisationPage } from "./shared";

export function DesignPage() {
  return (
    <RealisationPage
      resource="design"
      eyebrow="Réalisation des activités"
      title="Conception & développement"
      description="Pilotez les projets de conception : planification, entrées, revues, vérification et validation."
      icon={PenTool}
      statuses={["Planification", "Entrées", "Revue", "Vérification", "Validé"]}
      filePrefix="conception-developpement"
      fields={[
        { key: "title", label: "Projet", type: "text", required: true },
        { key: "pilot_id", label: "Responsable de projet", type: "text" },
        { key: "team", label: "Équipe projet", type: "text", full: true },
        { key: "process_id", label: "Processus", type: "text" },
        { key: "due_date", label: "Échéance", type: "date" },
        { key: "needs", label: "Besoins", type: "textarea", full: true },
        { key: "outputs", label: "Éléments de sortie", type: "textarea", full: true },
        { key: "risks", label: "Risques", type: "textarea", full: true },
      ]}
    />
  );
}
