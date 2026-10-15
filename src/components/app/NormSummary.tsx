import { Link } from "@tanstack/react-router";
import { FileWarning } from "lucide-react";
import { toast } from "sonner";
import { downloadAesTemplate } from "@/integrations/backend/aes";
import { downloadBlob } from "@/integrations/backend/realisation";
import { card, errorMessage, muted, secondary } from "./planning/shared";

export type SummaryLine = {
  label: string;
  key: string;
  slug: string;
  /** Code de sous-module du catalogue : la ligne n'apparaît que si l'offre l'inclut. */
  access?: string;
  alert?: boolean;
};

/** Briques communes à toutes les normes : saisies une seule fois par le système intégré. */
export const COMMON_LINES: SummaryLine[] = [
  { label: "Processus", key: "processes", slug: "processus", access: "systeme_management" },
  { label: "Risques et opportunités", key: "risks", slug: "risques", access: "risques_opportunites" },
  { label: "Objectifs", key: "objectives", slug: "objectifs", access: "objectifs_qualite" },
  { label: "Actions ouvertes", key: "actions_open", slug: "actions", access: "plans_action" },
  { label: "Audits internes", key: "audits", slug: "audits", access: "audits_internes" },
  { label: "Non-conformités ouvertes", key: "non_conformities_open", slug: "non-conformites", access: "non_conformites_actions", alert: true },
  { label: "Documents", key: "documents", slug: "documents", access: "documents" },
  { label: "Revues de direction", key: "management_reviews", slug: "revue-direction", access: "revue_direction" },
];

export const NORM_SECTIONS: Record<string, { title: string; lines: SummaryLine[]; aesTemplate?: boolean }> = {
  "ISO 14001": {
    title: "Environnement",
    aesTemplate: true,
    lines: [
      { label: "Aspects environnementaux", key: "aes_total", slug: "aspects-environnementaux", access: "aspects_environnementaux" },
      { label: "Aspects significatifs (AES)", key: "aes_significant", slug: "aspects-environnementaux", access: "aspects_environnementaux", alert: true },
      { label: "Aspects à réévaluer", key: "aes_to_reassess", slug: "aspects-environnementaux", access: "aspects_environnementaux", alert: true },
      { label: "Situations d'urgence", key: "emergency_procedures", slug: "urgences", access: "urgences_environnementales" },
      { label: "Obligations non conformes", key: "obligations_non_compliant", slug: "obligations", alert: true },
    ],
  },
  "ISO 50001": {
    title: "Énergie",
    lines: [
      { label: "Indicateurs de performance (IPÉ)", key: "ipe", slug: "ipe", access: "ipe" },
      { label: "Objectifs énergétiques ouverts", key: "objectives_open", slug: "objectifs-energetiques", access: "objectifs_cibles_energetiques" },
      { label: "Surveillance : action requise", key: "monitoring_action_required", slug: "surveillance-energetique", access: "surveillance_performance_energetique", alert: true },
      { label: "Conformité énergétique non conforme", key: "compliance_non_compliant", slug: "conformite-energetique", access: "conformite_energetique", alert: true },
    ],
  },
  "ISO 45001": {
    title: "Santé et sécurité au travail",
    lines: [{ label: "Documents uniques (DUERP)", key: "duerp", slug: "dangers", access: "duerp" }],
  },
};

export function visibleLines(lines: SummaryLine[], accessible?: Set<string>): SummaryLine[] {
  return lines.filter((line) => !line.access || !accessible || accessible.has(line.access));
}

export function Counter({ line, value }: { line: SummaryLine; value: number }) {
  return (
    <Link
      to="/app/$section"
      params={{ section: line.slug }}
      className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition hover:border-primary"
    >
      <span className="text-sm font-semibold">{line.label}</span>
      <span className={`font-display text-xl font-extrabold ${line.alert && value > 0 ? "text-red-600" : "text-primary"}`}>{value}</span>
    </Link>
  );
}

/** Cartes par norme active : seuls les modules inclus dans l'offre sont proposés. */
export function NormSummaryCards({
  codes,
  figures,
  accessible,
}: {
  codes: string[];
  figures: Record<string, Record<string, number>>;
  accessible?: Set<string> | undefined;
}) {
  const downloadTemplate = async (): Promise<void> => {
    try {
      downloadBlob(await downloadAesTemplate(), "canevas-registre-aspects-iso14001.xlsx");
    } catch (error) {
      toast.error(errorMessage(error, "Téléchargement impossible."));
    }
  };

  return (
    <>
      {codes.map((code) => {
        const section = NORM_SECTIONS[code];
        const lines = section ? visibleLines(section.lines, accessible) : [];
        return (
          <section key={code} className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">
                  {code} — {section?.title ?? "Exigences propres à la norme"}
                </h2>
                <p className={muted}>
                  {section ? "Modules spécifiques à cette norme." : "Cette norme s'appuie sur les briques communes."}
                </p>
              </div>
              {section?.aesTemplate && (!accessible || accessible.has("aspects_environnementaux")) && (
                <button type="button" className={secondary} onClick={() => void downloadTemplate()}>
                  <FileWarning className="h-4 w-4" /> Canevas du registre des aspects
                </button>
              )}
            </div>
            {lines.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lines.map((line) => (
                  <Counter key={line.key} line={line} value={figures[code]?.[line.key] ?? 0} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
