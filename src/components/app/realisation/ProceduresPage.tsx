import { FileSearch } from "lucide-react";
import { RealisationPage } from "./shared";
import type { RealisationItem } from "@/integrations/backend/realisation";

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Les procédures vivent dans le registre `documents` (type=Procédure). */
function isProcedure(item: RealisationItem): boolean {
  const type = str(item["type"]).toLowerCase();
  if (!type) return true;
  return type.includes("procéd") || type.includes("proced");
}

export function ProceduresPage() {
  return (
    <RealisationPage
      resource="procedure"
      eyebrow="Réalisation des activités"
      title="Procédures"
      description="Rédigez et diffusez les procédures et consignes opérationnelles de l'organisme."
      icon={FileSearch}
      statuses={[
        "Brouillon",
        "En vérification",
        "En approbation",
        "Publié",
        "À corriger",
        "Rejeté",
        "Archivé",
      ]}
      filePrefix="procedures"
      defaults={{ type: "Procédure" }}
      clientFilter={isProcedure}
      fields={[
        { key: "title", label: "Intitulé de la procédure", type: "text", required: true },
        { key: "process_id", label: "Processus", type: "process" },
        { key: "version", label: "Version", type: "text" },
        { key: "pilot_id", label: "Responsable", type: "text" },
        { key: "users", label: "Utilisateurs concernés", type: "text", full: true },
        { key: "review_date", label: "Prochaine révision", type: "date" },
        { key: "steps", label: "Consignes / étapes", type: "textarea", required: true, full: true },
      ]}
    />
  );
}
