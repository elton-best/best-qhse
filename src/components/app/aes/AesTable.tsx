import { AlertTriangle, CheckCircle2, Eye, Flame, PenLine, RefreshCw, Siren, Trash2 } from "lucide-react";
import type { Aes } from "@/integrations/backend/aes";
import { secondary } from "../planning/shared";
import { STATUS_LABEL } from "./aes-config";

function Score({ aspect }: { aspect: Aes }) {
  if (aspect.criticality_score === null) return <span className="text-xs text-muted-foreground">Non coté</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
        aspect.is_significant ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
      }`}
      title={
        aspect.is_significant
          ? aspect.significance_basis === "additional"
            ? "Significatif par un critère additionnel"
            : "Significatif par son impact environnemental"
          : "Non significatif"
      }
    >
      {aspect.is_significant ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {aspect.criticality_score}
      {aspect.is_significant ? " · AES" : ""}
    </span>
  );
}

export function AesTable({
  aspects,
  onOpen,
  onEdit,
  onValidate,
  onDelete,
}: {
  aspects: Aes[];
  onOpen: (aspect: Aes) => void;
  onEdit: (aspect: Aes) => void;
  onValidate: (aspect: Aes) => void;
  onDelete: (aspect: Aes) => void;
}) {
  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">N°</th>
            <th className="px-3 py-2">Processus / activité</th>
            <th className="px-3 py-2">Aspect et impact</th>
            <th className="px-3 py-2 text-center">G · F · S · M</th>
            <th className="px-3 py-2">Cotation</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Alertes</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {aspects.map((aspect) => {
            const status = STATUS_LABEL[aspect.status];
            return (
              <tr key={aspect.id} className="border-t border-border align-top">
                <td className="px-3 py-2 font-semibold">{aspect.aspect_number ?? `#${aspect.id}`}</td>
                <td className="px-3 py-2">
                  <p className="font-semibold">{aspect.process?.title ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{aspect.activity}</p>
                </td>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-semibold hover:text-primary" onClick={() => onOpen(aspect)}>
                    {aspect.aspect}
                  </button>
                  <p className="text-xs text-muted-foreground">{aspect.impact}</p>
                </td>
                <td className="px-3 py-2 text-center tabular-nums">
                  {aspect.criticality_score === null
                    ? "—"
                    : `${aspect.gravity} · ${aspect.frequency} · ${aspect.sensitivity} · ${aspect.mastery}`}
                </td>
                <td className="px-3 py-2">
                  <Score aspect={aspect} />
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {aspect.needs_reassessment && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800" title={aspect.reassessment_reason ?? ""}>
                        <RefreshCw className="h-3 w-3" /> À réévaluer
                      </span>
                    )}
                    {aspect.is_emergency_potential && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                        <Siren className="h-3 w-3" /> Urgence
                      </span>
                    )}
                    {aspect.is_significant && !aspect.additional_actions && !(aspect.action_ids?.length ?? 0) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        <Flame className="h-3 w-3" /> Sans action
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={secondary} onClick={() => onOpen(aspect)} aria-label="Détail">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button type="button" className={secondary} onClick={() => onEdit(aspect)} aria-label="Modifier">
                      <PenLine className="h-4 w-4" />
                    </button>
                    {aspect.status !== "validated" && aspect.status !== "archived" && (
                      <button type="button" className={secondary} onClick={() => onValidate(aspect)}>
                        Valider
                      </button>
                    )}
                    {aspect.status !== "validated" && (
                      <button type="button" className={secondary} onClick={() => onDelete(aspect)} aria-label="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
