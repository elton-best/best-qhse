import { SlidersHorizontal } from "lucide-react";
import { RealisationPage } from "./shared";

export function OperationalControlPage() {
  return (
    <RealisationPage
      resource="opcontrol"
      eyebrow="Réalisation des activités"
      title="Maîtrise opérationnelle"
      description="Planifiez et évaluez les contrôles opérationnels de chaque processus (critères, conformité, écarts)."
      icon={SlidersHorizontal}
      statuses={["Planifié", "Conforme", "Non conforme"]}
      filePrefix="maitrise-operationnelle"
      fields={[
        { key: "title", label: "Activité / contrôle", type: "text", required: true },
        { key: "process_id", label: "Processus", type: "text" },
        { key: "pilot_id", label: "Responsable", type: "text" },
        { key: "date", label: "Date prévue", type: "date" },
        { key: "criteria", label: "Critères", type: "textarea", required: true, full: true },
        { key: "description", label: "Description", type: "textarea", full: true },
      ]}
    />
  );
}
