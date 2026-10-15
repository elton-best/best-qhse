import { Truck } from "lucide-react";
import { RealisationPage } from "./shared";

export function FournisseursPage() {
  return (
    <RealisationPage
      resource="provider"
      eyebrow="Réalisation des activités"
      title="Gestion des prestataires"
      description="Qualifiez, évaluez et suivez vos fournisseurs et prestataires (sélection, contrats, évaluation)."
      icon={Truck}
      statuses={["Actif", "Suspendu", "Exclu"]}
      filePrefix="gestion-prestataires"
      titleKeys={["name", "designation", "title"]}
      codeKeys={["reference", "ref", "code"]}
      fields={[
        { key: "name", label: "Raison sociale", type: "text", required: true },
        { key: "provider_type", label: "Type", type: "select", options: ["Fournisseur", "Sous-traitant", "Prestataire de service", "Consultant"] },
        { key: "service_offers", label: "Offres de service", type: "text" },
        { key: "phone", label: "Téléphone", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "ifu", label: "IFU / SIRET", type: "text" },
        { key: "years_experience", label: "Années d'expérience", type: "number" },
        { key: "quality_score", label: "Note qualité (/5)", type: "number" },
        { key: "delay_score", label: "Note délais (/5)", type: "number" },
        { key: "compliance_score", label: "Note conformité (/5)", type: "number" },
        { key: "decision", label: "Décision", type: "select", options: ["Retenu", "Sous réserve", "Exclu"] },
        { key: "observation", label: "Observation", type: "textarea", full: true },
      ]}
    />
  );
}
