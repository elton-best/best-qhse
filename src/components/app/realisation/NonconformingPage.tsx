import { PackageX } from "lucide-react";
import { RealisationPage } from "./shared";

export function NonconformingPage() {
  return (
    <RealisationPage
      resource="nonconforming"
      eyebrow="Réalisation des activités"
      title="Sorties non conformes"
      description="Isolez, traitez et clôturez les sorties non conformes (correction, dérogation, rebut)."
      icon={PackageX}
      statuses={["Détectée", "Isolée", "Corrigée", "Dérogation", "Rebutée", "Clôturée"]}
      filePrefix="sorties-non-conformes"
      fields={[
        { key: "title", label: "Défaut constaté", type: "text", required: true },
        { key: "operation_id", label: "Opération", type: "text" },
        {
          key: "impact",
          label: "Impact",
          type: "select",
          options: ["Faible", "Moyen", "Fort"],
        },
        { key: "decision", label: "Décision", type: "textarea", full: true },
        { key: "description", label: "Description", type: "textarea", full: true },
      ]}
    />
  );
}
