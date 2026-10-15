import { Scale } from "lucide-react";
import { RealisationPage } from "./shared";

export function ObligationsPage() {
  return (
    <RealisationPage
      resource="compliance"
      eyebrow="Réalisation des activités"
      title="Obligations de conformité"
      description="Recensez et évaluez vos obligations légales et réglementaires (veille réglementaire, conformité)."
      icon={Scale}
      statuses={["À analyser", "En cours", "Conforme", "Non conforme"]}
      filePrefix="obligations-conformite"
      fields={[
        { key: "title", label: "Texte / obligation", type: "text", required: true },
        { key: "reference", label: "Référence", type: "text" },
        { key: "aspect", label: "Volet / aspect", type: "text" },
        { key: "source", label: "Source", type: "select", options: ["Loi", "Décret", "Arrêté", "Norme", "Contrat", "Interne"] },
        { key: "frequency", label: "Fréquence de révision", type: "select", options: ["Mensuelle", "Trimestrielle", "Semestrielle", "Annuelle"] },
        { key: "pilot_id", label: "Responsable", type: "text" },
        { key: "due_date", label: "Prochaine révision", type: "date" },
        { key: "description", label: "Exigences / actions", type: "textarea", full: true },
      ]}
    />
  );
}
