import { Link } from "@tanstack/react-router";
import { RefreshCw, Siren, X } from "lucide-react";
import type { Aes } from "@/integrations/backend/aes";
import { card, formatDateFR, muted, primary, secondary } from "../planning/shared";
import {
  ASPECT_TYPES,
  CONTROL_LEVELS,
  IMPACT_KINDS,
  IMPACT_NATURES,
  IMPACT_SCALES,
  LIFECYCLE_PHASES,
  SITUATIONS,
  STATUS_LABEL,
  labelOf,
} from "./aes-config";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-background p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-line text-sm">{children || "—"}</dd>
    </div>
  );
}

export function AesDetail({
  aspect,
  onClose,
  onEdit,
  onValidate,
  onArchive,
  onReopen,
  onFlag,
}: {
  aspect: Aes;
  onClose: () => void;
  onEdit: () => void;
  onValidate: () => void;
  onArchive: () => void;
  onReopen: () => void;
  onFlag: () => void;
}) {
  const status = STATUS_LABEL[aspect.status];
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Détail de l'aspect">
      <div className={`${card} flex h-full w-full max-w-2xl flex-col overflow-y-auto rounded-none p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">{aspect.aspect_number ?? `Aspect #${aspect.id}`}</p>
            <h2 className="font-display text-xl font-bold">{aspect.aspect}</h2>
            <p className={muted}>{aspect.activity}</p>
          </div>
          <button type="button" className="rounded-xl p-2 text-muted-foreground hover:bg-secondary" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
          {aspect.criticality_score !== null && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${aspect.is_significant ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
              Cr = {aspect.criticality_score} {aspect.is_significant ? "— AES" : "— non significatif"}
            </span>
          )}
          {aspect.significance_basis === "additional" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Relevé par un critère additionnel</span>
          )}
        </div>

        {aspect.needs_reassessment && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <RefreshCw className="mt-0.5 h-4 w-4" />
            <p>
              <span className="font-bold">À réévaluer.</span> {aspect.reassessment_reason}
            </p>
          </div>
        )}
        {aspect.emergency_procedure && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            <Siren className="mt-0.5 h-4 w-4" />
            <p>
              Situation d'urgence liée :{" "}
              <Link to="/app/$section" params={{ section: "urgences" }} className="font-bold underline">
                {aspect.emergency_procedure.title}
              </Link>
            </p>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="Processus">{aspect.process?.title}</Row>
          <Row label="Sous-processus / zone">{aspect.sub_process}</Row>
          <Row label="Type d'aspect">{labelOf(ASPECT_TYPES, aspect.aspect_type)}</Row>
          <Row label="Cycle de vie">{labelOf(LIFECYCLE_PHASES, aspect.lifecycle_phase)}</Row>
          <Row label="Situation">{labelOf(SITUATIONS, aspect.situation)}</Row>
          <Row label="Maîtrise">{labelOf(CONTROL_LEVELS, aspect.control_level)}</Row>
          <Row label="Impact">{aspect.impact}</Row>
          <Row label="Nature · échelle · effet">
            {[labelOf(IMPACT_NATURES, aspect.impact_nature), labelOf(IMPACT_SCALES, aspect.impact_scale), labelOf(IMPACT_KINDS, aspect.impact_kind)].join(" · ")}
          </Row>
          <Row label="Risque associé">{aspect.risk}</Row>
          <Row label="Regroupement">{aspect.group_label}</Row>
          <Row label="Activités ou produits regroupés">{aspect.group_members?.join(" · ")}</Row>
          <Row label="Caractéristiques communes">{aspect.group_characteristics}</Row>
          <Row label="Cotation G · F · S · M">
            {aspect.criticality_score === null ? "Non cotée" : `${aspect.gravity} · ${aspect.frequency} · ${aspect.sensitivity} · ${aspect.mastery}`}
          </Row>
          <Row label="Critères additionnels">
            {[aspect.legal_criterion ? "Exigence légale" : "", aspect.stakeholder_criterion ? "Partie intéressée" : ""].filter(Boolean).join(", ")}
          </Row>
          <Row label="Mesures de maîtrise existantes">{aspect.existing_controls}</Row>
          <Row label="Actions complémentaires">{aspect.additional_actions}</Row>
          <Row label="Responsable">{aspect.responsible?.name ?? aspect.responsible_name}</Row>
          <Row label="Délai">{aspect.deadline ? formatDateFR(aspect.deadline) : ""}</Row>
          <Row label="Critère d'effectivité">{aspect.effectiveness_criterion}</Row>
          <Row label="Critère d'efficacité">{aspect.efficiency_criterion}</Row>
          <Row label="Dernière revue">{aspect.last_reviewed_at ? formatDateFR(aspect.last_reviewed_at) : ""}</Row>
          <Row label="Prochaine revue">{aspect.next_review_date ? formatDateFR(aspect.next_review_date) : ""}</Row>
          <div className="sm:col-span-2">
            <Row label="Observations">{aspect.observations}</Row>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          {aspect.status !== "archived" && (
            <button type="button" className={secondary} onClick={onEdit}>
              Modifier
            </button>
          )}
          {(aspect.status === "draft" || aspect.status === "in_review") && (
            <button type="button" className={primary} onClick={onValidate}>
              Valider
            </button>
          )}
          {aspect.status !== "archived" && (
            <button type="button" className={secondary} onClick={onFlag}>
              Signaler à réévaluer
            </button>
          )}
          {aspect.status === "archived" ? (
            <button type="button" className={secondary} onClick={onReopen}>
              Rouvrir
            </button>
          ) : (
            <button type="button" className={secondary} onClick={onArchive}>
              Archiver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
