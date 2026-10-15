import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BackendApiError, backendApi } from "@/integrations/backend/client";
import { flattenResource } from "@/integrations/backend/context";

/**
 * Réalisation des activités (§8 ISO 9001).
 * Contrats Laravel attendus (endpoints dédiés, préfixe `/api/v1`) :
 * - opcontrol    -> operational-controls
 * - requirement   -> product-service-requirements
 * - design        -> design-developments
 * - operation     -> production-operations
 * - release       -> product-releases
 * - nonconforming -> nonconforming-outputs
 * - procedure     -> documents (CRUD) + procedures (liste filtrée type=PRC)
 *                    + procedures/template + documents/export-inventory
 *                    + documents/inventory-import (pas de
 *                    `documents/template|export-xlsx|import-xlsx` côté backend).
 * Conventions : `?site_id=&search=&per_page=100`, blobs
 * `{endpoint}/export-xlsx?site_id=`, `{endpoint}/template`,
 * import `POST {endpoint}/import-xlsx` (FormData site_id + file).
 */

export const REALISATION_RESOURCES = {
  opcontrol: "operational-controls",
  requirement: "product-service-requirements",
  design: "design-developments",
  operation: "production-operations",
  release: "product-releases",
  nonconforming: "nonconforming-outputs",
  procedure: "documents",
  compliance: "compliance-obligations",
  provider: "provider-partners",
  // ISO 50001 — contrats Laravel : EnergyRecordController (CRUD + template/export/import).
  energy_baseline: "energy-baselines",
  energy_collection: "energy-data-collection-plans",
  energy_objective: "energy-objectives",
  energy_design: "energy-design-reviews",
  energy_purchase: "energy-purchases",
  energy_equipment: "energy-equipment-purchases",
  energy_monitoring: "energy-monitoring-records",
  energy_compliance: "energy-compliance-evaluations",
  energy_audit: "energy-internal-audits",
} as const;

export type RealisationKey = keyof typeof REALISATION_RESOURCES;

export const REALISATION_KEY = ["realisation"] as const;

export type RealisationItem = Record<string, unknown> & {
  id: string | number;
};

export type RealisationFilters = {
  site_id?: string | undefined;
  search?: string | undefined;
};

export type RealisationSavePayload = Record<string, unknown>;

export type OperationalOverview = {
  projects: RealisationItem[];
  totalProjects: number;
  totalActivities: number;
  totalTasks: number;
  completedTasks: number;
  progressRate: number;
  raw: Record<string, unknown>;
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Minuscules sans accents pour rapprocher libellés FR et codes backend. */
function normFr(value: unknown): string {
  return textOf(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toItemArray(payload: unknown): RealisationItem[] {
  const root = objectOf(payload);
  // Laravel paginé : {data: [...]} ; tolère {data: {data: [...]}} et les listes nues.
  const nested = objectOf(root["data"])["data"];
  const data = (Array.isArray(nested) ? nested : undefined) ?? root["data"] ?? payload;
  const list = Array.isArray(data) ? data : [];
  return list.map((entry) => {
    const flat = flattenResource(entry) as RealisationItem;
    return { ...flat, id: (flat["id"] ?? "") as string | number };
  });
}

function toOneItem(payload: unknown): RealisationItem | null {
  const root = objectOf(payload);
  const data = root["data"] ?? payload;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const flat = flattenResource(data) as RealisationItem;
  return { ...flat, id: (flat["id"] ?? "") as string | number };
}

export type RealisationEndpoints = {
  /** GET liste (paginée ou non). */
  list: string;
  /** POST création. */
  create: string;
  /** Base show/update/delete (`${detail}/${id}`). */
  detail: string;
  /** GET modèle d'import. */
  template: string;
  /** GET export. */
  exportXlsx: string;
  /** POST import (FormData site_id + file). */
  importXlsx: string;
};

function standardEndpoints(base: string): RealisationEndpoints {
  return {
    list: base,
    create: base,
    detail: base,
    template: `${base}/template`,
    exportXlsx: `${base}/export-xlsx`,
    importXlsx: `${base}/import-xlsx`,
  };
}

const REALISATION_ENDPOINTS: Record<RealisationKey, RealisationEndpoints> = {
  opcontrol: standardEndpoints(REALISATION_RESOURCES.opcontrol),
  requirement: standardEndpoints(REALISATION_RESOURCES.requirement),
  design: standardEndpoints(REALISATION_RESOURCES.design),
  operation: standardEndpoints(REALISATION_RESOURCES.operation),
  release: standardEndpoints(REALISATION_RESOURCES.release),
  nonconforming: standardEndpoints(REALISATION_RESOURCES.nonconforming),
  // Pas de `documents/template|export-xlsx|import-xlsx` côté backend :
  // liste via `procedures` (type=PRC), modèle via `procedures/template`,
  // export/import via l'inventaire documentaire (même contrat FormData).
  procedure: {
    list: "procedures",
    create: "documents",
    detail: "documents",
    template: "procedures/template",
    exportXlsx: "documents/export-inventory",
    importXlsx: "documents/inventory-import",
  },
  compliance: {
    list: "compliance-obligations",
    create: "compliance-obligations",
    detail: "compliance-obligations",
    template: "compliance-obligations/template",
    exportXlsx: "compliance-obligations/export-xlsx",
    importXlsx: "compliance-obligations/import-xlsx",
  },
  provider: {
    list: "provider-partners",
    create: "provider-partners",
    detail: "provider-partners",
    // GET template via the same export-xlsx endpoint
    template: "provider-partners/export-xlsx",
    exportXlsx: "provider-partners/export-xlsx",
    importXlsx: "provider-partners/import-file",
  },
  energy_baseline: standardEndpoints(REALISATION_RESOURCES.energy_baseline),
  energy_collection: standardEndpoints(REALISATION_RESOURCES.energy_collection),
  energy_objective: standardEndpoints(REALISATION_RESOURCES.energy_objective),
  energy_design: standardEndpoints(REALISATION_RESOURCES.energy_design),
  energy_purchase: standardEndpoints(REALISATION_RESOURCES.energy_purchase),
  energy_equipment: standardEndpoints(REALISATION_RESOURCES.energy_equipment),
  energy_monitoring: standardEndpoints(REALISATION_RESOURCES.energy_monitoring),
  energy_compliance: standardEndpoints(REALISATION_RESOURCES.energy_compliance),
  energy_audit: standardEndpoints(REALISATION_RESOURCES.energy_audit),
};

function endpointsOf(key: RealisationKey): RealisationEndpoints {
  return REALISATION_ENDPOINTS[key];
}

// ---------- Statuts : libellés FR affichés <-> codes backend ----------

export type RealisationStatusTarget = {
  code: string;
  /** Champs dérivés (ex. conception : statut FR -> {status + stage}). */
  extra?: Record<string, string | null>;
};

export type RealisationStatusRule = {
  /** Clé backend portant le statut (affichage + filtre + sauvegarde). */
  key: string;
  /** Libellé FR affiché -> code backend accepté. */
  frToBackend: Record<string, RealisationStatusTarget>;
  /**
   * false : statut jamais envoyé (workflow dédié côté backend qui force ou
   * ignore le statut : libération, sorties non conformes).
   */
  persist: boolean;
};

export const REALISATION_STATUS_RULES: Record<RealisationKey, RealisationStatusRule> = {
  opcontrol: {
    key: "status",
    persist: true,
    frToBackend: {
      "Planifié": { code: "planifie" },
      Conforme: { code: "conforme" },
      "Non conforme": { code: "non_conforme" },
    },
  },
  requirement: {
    // Pas de colonne `status` : le statut affiché est la conformité.
    key: "compliance_status",
    persist: true,
    frToBackend: {
      "À analyser": { code: "not_applicable" },
      Revue: { code: "partial" },
      Satisfaite: { code: "compliant" },
      Archivé: { code: "non_compliant" },
    },
  },
  design: {
    key: "status",
    persist: true,
    frToBackend: {
      Planification: { code: "draft", extra: { stage: "planning" } },
      Entrées: { code: "in_progress", extra: { stage: "inputs" } },
      Revue: { code: "in_review", extra: { stage: "controls" } },
      Vérification: { code: "in_review", extra: { stage: "outputs" } },
      Validé: { code: "validated", extra: { stage: "outputs" } },
    },
  },
  operation: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifiée: { code: "planifiee" },
      "En cours": { code: "en_cours" },
      Contrôlée: { code: "controlee" },
      Libérée: { code: "liberee" },
      Bloquée: { code: "bloquee" },
    },
  },
  release: {
    key: "status",
    // Création forcée à `en_attente`, décision via POST validate : jamais envoyé.
    persist: false,
    frToBackend: {
      "En attente": { code: "en_attente" },
      Libéré: { code: "libere" },
      Dérogation: { code: "derogation" },
      Rejeté: { code: "rejete" },
    },
  },
  nonconforming: {
    key: "status",
    // Statut piloté par les transitions isoler/corriger/déroger/rebuter/clôturer.
    persist: false,
    frToBackend: {
      Détectée: { code: "detected" },
      Isolée: { code: "isolated" },
      Corrigée: { code: "corrected" },
      Dérogation: { code: "under_derogation" },
      Rebutée: { code: "scrapped" },
      Clôturée: { code: "closed" },
    },
  },
  procedure: {
    key: "status",
    persist: true,
    // Seuls ces codes passent la validation `status` du DocumentController ;
    // les autres libellés (vérification, correction, rejet) sont omis à
    // l'enregistrement (création forcée à `draft`, circuit de validation dédié).
    frToBackend: {
      Brouillon: { code: "draft" },
      "En approbation": { code: "pending_approval" },
      Publié: { code: "approved" },
      Archivé: { code: "obsolete" },
    },
  },
  compliance: {
    key: "compliance_status",
    persist: true,
    frToBackend: {
      "À analyser": { code: "not_applicable" },
      "En cours": { code: "partial" },
      Conforme: { code: "compliant" },
      "Non conforme": { code: "non_compliant" },
    },
  },
  provider: {
    key: "status",
    persist: true,
    frToBackend: {
      Actif: { code: "active" },
      Suspendu: { code: "suspended" },
      Exclu: { code: "excluded" },
    },
  },
  energy_baseline: {
    key: "status",
    persist: true,
    frToBackend: {
      Brouillon: { code: "draft" },
      Validée: { code: "validated" },
      Révisée: { code: "revised" },
      Archivée: { code: "archived" },
    },
  },
  energy_collection: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifiée: { code: "planned" },
      Active: { code: "active" },
      Suspendue: { code: "suspended" },
      Archivée: { code: "archived" },
    },
  },
  energy_objective: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifié: { code: "planned" },
      "En cours": { code: "in_progress" },
      Atteint: { code: "achieved" },
      "Non atteint": { code: "missed" },
      Annulé: { code: "cancelled" },
    },
  },
  energy_design: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifiée: { code: "planned" },
      "En revue": { code: "in_review" },
      Validée: { code: "validated" },
      Rejetée: { code: "rejected" },
    },
  },
  energy_purchase: {
    key: "status",
    persist: true,
    frToBackend: {
      Brouillon: { code: "draft" },
      Commandé: { code: "ordered" },
      Reçu: { code: "received" },
      Évalué: { code: "evaluated" },
      Annulé: { code: "cancelled" },
    },
  },
  energy_equipment: {
    key: "status",
    persist: true,
    frToBackend: {
      Brouillon: { code: "draft" },
      Commandé: { code: "ordered" },
      Reçu: { code: "received" },
      Évalué: { code: "evaluated" },
      Annulé: { code: "cancelled" },
    },
  },
  energy_monitoring: {
    key: "status",
    persist: true,
    frToBackend: {
      Enregistré: { code: "recorded" },
      Analysé: { code: "analysed" },
      "Action requise": { code: "action_required" },
      Clôturé: { code: "closed" },
    },
  },
  energy_compliance: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifiée: { code: "planned" },
      Évaluée: { code: "evaluated" },
      "Action ouverte": { code: "action_open" },
      Clôturée: { code: "closed" },
    },
  },
  energy_audit: {
    key: "status",
    persist: true,
    frToBackend: {
      Planifié: { code: "planned" },
      "En cours": { code: "in_progress" },
      Réalisé: { code: "completed" },
      Clôturé: { code: "closed" },
    },
  },
};

export function statusKeyOf(key: RealisationKey): string {
  return REALISATION_STATUS_RULES[key]?.key ?? "status";
}

/** Libellé FR à afficher pour un item (badge, filtre, formulaire). */
export function statusLabelOf(key: RealisationKey, item: RealisationItem): string {
  const rule = REALISATION_STATUS_RULES[key];
  if (!rule) return textOf(item["status"]);
  const raw = textOf(item[rule.key]);
  if (!raw) return "";
  const norm = normFr(raw);
  const entries = Object.entries(rule.frToBackend);
  const itemStage = normFr(item["stage"]);
  // 1) couple exact (ex. conception : in_review + outputs -> "Vérification").
  const pair = entries.find(
    ([, target]) =>
      normFr(target.code) === norm &&
      (target.extra?.["stage"] == null || normFr(target.extra["stage"]) === itemStage),
  );
  if (pair) return pair[0];
  // 2) code seul (premier libellé).
  const loose = entries.find(([, target]) => normFr(target.code) === norm);
  if (loose) return loose[0];
  // 3) libellé FR déjà stocké tel quel.
  const asIs = entries.find(([label]) => normFr(label) === norm);
  if (asIs) return asIs[0];
  return raw;
}

/** Code backend (+ extras) pour un libellé FR ; null si à omettre. */
export function statusForBackend(
  key: RealisationKey,
  frLabel: string,
): RealisationStatusTarget | null {
  const rule = REALISATION_STATUS_RULES[key];
  if (!rule || !rule.persist) return null;
  const norm = normFr(frLabel);
  const direct = Object.entries(rule.frToBackend).find(([label]) => normFr(label) === norm);
  if (direct) return direct[1].extra ? { code: direct[1].code, extra: direct[1].extra } : { code: direct[1].code };
  return null;
}

// ---------- Normalisation des payloads create/update ----------

const ID_KEYS = new Set([
  "site_id",
  "process_id",
  "equipment_id",
  "production_operation_id",
  "responsible_id",
  "pilot_id",
]);

/** Clés acceptées par le backend (create + update) par ressource. */
const PAYLOAD_ALLOWLIST: Record<RealisationKey, Set<string>> = {
  opcontrol: new Set([
    "site_id",
    "process_id",
    "title",
    "description",
    "criteria",
    "acceptance_criteria",
    "pilot_id",
    "responsible_id",
    "date",
    "planned_date",
    "control_points",
    "operating_instructions",
    "related_document_ids",
    "status",
  ]),
  requirement: new Set([
    "site_id",
    "title",
    "origin",
    "requirement_type",
    "client",
    "source",
    "process_id",
    "description",
    "customer_requirements",
    "delivery_requirements",
    "compliance_status",
    "responsible_id",
    "deadline",
  ]),
  design: new Set([
    "site_id",
    "title",
    "pilot_id",
    "responsible_id",
    "team",
    "process_id",
    "due_date",
    "planned_date",
    "actual_date",
    "needs",
    "inputs",
    "outputs",
    "risks",
    "project_code",
    "stage",
    "status",
    "description",
    "controls",
    "changes",
  ]),
  operation: new Set([
    "site_id",
    "process_id",
    "equipment_id",
    "title",
    "client",
    "client_order",
    "date",
    "planned_date",
    "requirements",
    "criteria",
    "description",
    "control_result",
    "status",
    "released_by",
  ]),
  release: new Set([
    "site_id",
    "title",
    "batch_number",
    "operation_id",
    "production_operation_id",
    "criteria",
    "date",
    "release_date",
    "description",
    "decision_notes",
    "status",
  ]),
  nonconforming: new Set([
    "site_id",
    "process_id",
    "operation_id",
    "title",
    "description",
    "detection_source",
    "detection_date",
    "quantity",
    "unit",
    "impact",
    "severity",
    "decision",
    "responsible_id",
    "status",
  ]),
  procedure: new Set([
    "site_id",
    "process_id",
    "processus",
    "title",
    "version",
    "type",
    "status",
    "description",
    "keywords",
    "effective_date",
    "review_due_date",
    "review_date",
    "category_id",
    "document_type_configuration_id",
    "steps",
    "users",
    "pilot_id",
  ]),
  compliance: new Set([
    "site_id",
    "title",
    "reference",
    "aspect",
    "source",
    "frequency",
    "pilot_id",
    "due_date",
    "description",
    "compliance_status",
  ]),
  provider: new Set([
    "site_id",
    "name",
    "provider_type",
    "service_offers",
    "phone",
    "email",
    "ifu",
    "years_experience",
    "quality_score",
    "delay_score",
    "compliance_score",
    "decision",
    "observation",
    "status",
  ]),
  energy_baseline: new Set([
    "site_id",
    "title",
    "responsible_id",
    "energy_source",
    "period_start",
    "period_end",
    "baseline_consumption",
    "unit",
    "relevant_variables",
    "normalization_method",
    "adjustment_notes",
    "ipe_id",
  ]),
  energy_collection: new Set([
    "site_id",
    "title",
    "responsible_id",
    "data_point",
    "energy_source",
    "measurement_method",
    "equipment_id",
    "frequency",
    "unit",
    "data_source",
    "storage_location",
    "last_collected_at",
    "next_due_date",
  ]),
  energy_objective: new Set([
    "site_id",
    "title",
    "responsible_id",
    "objective_type",
    "ipe_id",
    "energy_source",
    "baseline_value",
    "target_value",
    "current_value",
    "unit",
    "deadline",
    "action_plan",
    "resources_needed",
    "progress_percent",
  ]),
  energy_design: new Set([
    "site_id",
    "title",
    "responsible_id",
    "project_ref",
    "design_stage",
    "description",
    "performance_criteria",
    "expected_saving",
    "unit",
    "review_notes",
    "outputs",
    "review_date",
  ]),
  energy_purchase: new Set([
    "site_id",
    "title",
    "responsible_id",
    "provider_partner_id",
    "supplier_name",
    "energy_type",
    "contract_ref",
    "quantity",
    "unit",
    "unit_price",
    "total_amount",
    "purchase_date",
    "delivery_date",
    "evaluation_criteria",
    "supplier_score",
    "evaluation_notes",
  ]),
  energy_equipment: new Set([
    "site_id",
    "title",
    "responsible_id",
    "equipment_id",
    "provider_partner_id",
    "supplier_name",
    "efficiency_class",
    "expected_consumption",
    "unit",
    "purchase_cost",
    "lifecycle_cost",
    "purchase_date",
    "efficiency_criteria",
    "evaluation_notes",
  ]),
  energy_monitoring: new Set([
    "site_id",
    "title",
    "responsible_id",
    "ipe_id",
    "equipment_id",
    "period_start",
    "period_end",
    "planned_value",
    "measured_value",
    "unit",
    "analysis",
    "action_required",
  ]),
  energy_compliance: new Set([
    "site_id",
    "title",
    "responsible_id",
    "legal_requirement",
    "source",
    "evaluation_method",
    "evaluation_date",
    "next_evaluation_date",
    "result",
    "gap_description",
    "action_required",
    "evidence",
  ]),
  energy_audit: new Set([
    "site_id",
    "title",
    "responsible_id",
    "audit_id",
    "scope",
    "criteria",
    "planned_date",
    "actual_date",
    "auditors",
    "nonconformities_count",
    "observations_count",
    "findings",
    "improvement_opportunities",
    "conclusion",
    "next_audit_date",
  ]),
};

const REQUIREMENT_TYPE_FR: Record<string, string> = {
  client: "client",
  reglementaire: "regulatory",
  regulatory: "regulatory",
  legal: "legal",
  normative: "normative",
  contractual: "contractual",
  contractuel: "contractual",
  interne: "internal",
  internal: "internal",
};

const SEVERITY_FR: Record<string, string> = {
  minor: "minor",
  faible: "minor",
  major: "major",
  moyen: "major",
  critical: "critical",
  fort: "critical",
};

const NC_DECISION_CODES = new Set(["correction", "derogation", "rebut", "retour"]);

function mapRequirementType(value: unknown): string | null {
  return REQUIREMENT_TYPE_FR[normFr(value)] ?? null;
}

function mapSeverity(value: unknown): string {
  return SEVERITY_FR[normFr(value)] ?? "minor";
}

/** Texte libre -> décision enum backend, ou null (= omis, évite le 422). */
function mapNonconformingDecision(value: unknown): string | null {
  const norm = normFr(value);
  if (!norm) return null;
  if (NC_DECISION_CODES.has(norm)) return norm;
  if (norm.includes("deroga")) return "derogation";
  if (norm.includes("rebut")) return "rebut";
  if (norm.includes("retour")) return "retour";
  if (norm.includes("correc")) return "correction";
  return null;
}

/**
 * Filtre + convertit un payload assemblé depuis le formulaire vers le contrat
 * backend : clés inconnues retirées, chaînes vides omises (champs `nullable` /
 * règles `sometimes`), identifiants numériques coercés, enums FR normalisées,
 * statut FR converti en code (omis si non persisté ou non mappable).
 */
export function normalizeRealisationPayload(
  key: RealisationKey,
  payload: Record<string, unknown>,
  frStatus: string,
): Record<string, unknown> {
  const allow = PAYLOAD_ALLOWLIST[key] ?? new Set<string>();
  const statusKey = statusKeyOf(key);
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (field === "status" || field === statusKey) continue;
    if (!allow.has(field)) continue;
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;

    // Coercition d'identifiants : numériques -> nombre, autres -> chaîne pour résolution backend
    if (field === "site_id" || field === "equipment_id") {
      const num = Number(value);
      if (Number.isFinite(num)) out[field] = num;
      continue;
    }
    if (
      field === "process_id" ||
      field === "production_operation_id" ||
      field === "responsible_id" ||
      field === "ipe_id" ||
      field === "provider_partner_id" ||
      field === "audit_id"
    ) {
      const num = Number(value);
      out[field] = Number.isFinite(num) ? num : value;
      continue;
    }

    // Mapping des alias frontend -> backend
    if (field === "impact") {
      out["severity"] = mapSeverity(value);
      continue;
    }
    if (field === "severity") {
      out["severity"] = mapSeverity(value);
      continue;
    }
    if (field === "origin") {
      const mapped = mapRequirementType(value);
      if (mapped) out["requirement_type"] = mapped;
      continue;
    }
    if (field === "requirement_type") {
      const mapped = mapRequirementType(value);
      if (mapped) out[field] = mapped;
      continue;
    }
    if (field === "client" && key === "requirement") {
      out["source"] = value;
      out["customer_requirements"] = value;
      continue;
    }
    if (field === "client" && key === "operation") {
      out["client_order"] = value;
      continue;
    }
    if (field === "needs" && key === "design") {
      out["inputs"] = value;
      continue;
    }
    if (field === "due_date" && key === "design") {
      out["planned_date"] = value;
      continue;
    }
    if (field === "date" && key === "operation") {
      out["planned_date"] = value;
      continue;
    }
    if (field === "date" && key === "release") {
      out["release_date"] = value;
      continue;
    }
    if (field === "title" && key === "release") {
      out["batch_number"] = value;
      continue;
    }
    if (field === "operation_id" && key === "release") {
      const num = Number(value);
      out["production_operation_id"] = Number.isFinite(num) ? num : value;
      continue;
    }
    if (field === "criteria" && key === "opcontrol") {
      out["acceptance_criteria"] = value;
      continue;
    }
    if (field === "pilot_id") {
      const num = Number(value);
      out["responsible_id"] = Number.isFinite(num) ? num : value;
      continue;
    }
    if (field === "steps" && key === "procedure") {
      out["description"] = out["description"]
        ? `${out["description"]}\n\n${value}`
        : value;
      continue;
    }
    if (field === "review_date" && key === "procedure") {
      out["review_due_date"] = value;
      continue;
    }
    if (field === "decision" && key === "nonconforming") {
      const mapped = mapNonconformingDecision(value);
      if (mapped) out[field] = mapped;
      continue;
    }
    out[field] = value;
  }
  const backendStatus = statusForBackend(key, frStatus);
  if (backendStatus) {
    out[statusKey] = backendStatus.code;
    for (const [extraKey, extraValue] of Object.entries(backendStatus.extra ?? {})) {
      if (extraValue != null && extraValue !== "" && allow.has(extraKey)) {
        out[extraKey] = extraValue;
      }
    }
  }
  return out;
}

// ---------- Erreurs FR + blobs tableur ----------

function frenchError(error: unknown, fallback: string): Error {
  if (error instanceof BackendApiError) return error;
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}

function backendMessageFromJsonText(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record["message"] === "string" && record["message"].trim()) {
        return record["message"].trim();
      }
      const errors = record["errors"];
      if (errors && typeof errors === "object") {
        const first = Object.values(errors as Record<string, unknown>)[0];
        const text = Array.isArray(first) ? first[0] : first;
        if (typeof text === "string" && text.trim()) return text.trim();
      }
    }
  } catch {
    return trimmed.slice(0, 300) || fallback;
  }
  return fallback;
}

/** Extension selon le contenu réel (un .docx nommé .xlsx serait illisible). */
export function spreadsheetExtension(blob: Blob, fallback = "xlsx"): string {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("wordprocessingml") || type.includes("msword")) return "docx";
  if (type.includes("spreadsheetml") || type.includes("excel") || type.includes("octet-stream"))
    return "xlsx";
  return fallback;
}

/**
 * Le client blob lève déjà une erreur sur les statuts HTTP non-2xx, mais un
 * backend peut renvoyer une erreur JSON avec un 200 : détecte le JSON et les
 * blobs vides pour afficher un message FR au lieu de télécharger un fichier
 * illisible.
 */
export async function assertSpreadsheetBlob(blob: Blob, action: string): Promise<Blob> {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("json")) {
    const text = await blob.text().catch(() => "");
    throw new Error(
      backendMessageFromJsonText(text, `Le serveur a renvoyé une erreur lors du ${action}.`),
    );
  }
  if (blob.size === 0) {
    throw new Error(`Le fichier reçu pour le ${action} est vide.`);
  }
  return blob;
}

function querySuffix(filters: RealisationFilters): string {
  const query = new URLSearchParams({ per_page: "100" });
  if (filters.site_id) query.set("site_id", filters.site_id);
  if (filters.search) query.set("search", filters.search);
  return `?${query.toString()}`;
}

export async function fetchRealisationList(
  key: RealisationKey,
  filters: RealisationFilters = {},
): Promise<RealisationItem[]> {
  try {
    const payload = await backendApi.request<unknown>(
      `${endpointsOf(key).list}${querySuffix(filters)}`,
    );
    return toItemArray(payload);
  } catch (error) {
    throw frenchError(
      error,
      "Impossible de charger la liste. Vérifiez votre connexion puis réessayez.",
    );
  }
}

export async function fetchRealisationOne(
  key: RealisationKey,
  id: string | number,
): Promise<RealisationItem | null> {
  const payload = await backendApi.request<unknown>(
    `${endpointsOf(key).detail}/${encodeURIComponent(String(id))}`,
  );
  return toOneItem(payload);
}

export async function createRealisationItem(
  key: RealisationKey,
  payload: RealisationSavePayload,
): Promise<RealisationItem | null> {
  const result = await backendApi.request<unknown>(endpointsOf(key).create, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return toOneItem(result);
}

export async function updateRealisationItem(
  key: RealisationKey,
  id: string | number,
  payload: RealisationSavePayload,
): Promise<RealisationItem | null> {
  const result = await backendApi.request<unknown>(
    `${endpointsOf(key).detail}/${encodeURIComponent(String(id))}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  return toOneItem(result);
}

export async function deleteRealisationItem(
  key: RealisationKey,
  id: string | number,
): Promise<unknown> {
  return backendApi.request<unknown>(
    `${endpointsOf(key).detail}/${encodeURIComponent(String(id))}`,
    { method: "DELETE" },
  );
}

export async function exportRealisationXlsx(
  key: RealisationKey,
  siteId?: string,
): Promise<Blob> {
  const suffix = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  return backendApi.blob(`${endpointsOf(key).exportXlsx}${suffix}`);
}

export async function templateRealisationXlsx(key: RealisationKey): Promise<Blob> {
  return backendApi.blob(endpointsOf(key).template);
}

export async function importRealisationXlsx(
  key: RealisationKey,
  siteId: string,
  file: File,
): Promise<unknown> {
  const formData = new FormData();
  formData.append("site_id", siteId);
  formData.append("file", file);
  return backendApi.request<unknown>(endpointsOf(key).importXlsx, {
    method: "POST",
    body: formData,
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  window.document.body.append(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// ---------- Vue d'ensemble des projets opérationnels (§8.1) ----------

function overviewProjectsOf(raw: Record<string, unknown>): RealisationItem[] {
  const candidates = [
    raw["projects"],
    raw["operational_projects"],
    objectOf(raw["data"])["projects"],
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((entry) => {
        const flat = flattenResource(entry) as RealisationItem;
        return { ...flat, id: (flat["id"] ?? "") as string | number };
      });
    }
  }
  return [];
}

function numberOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchOperationalOverview(siteId?: string): Promise<OperationalOverview> {
  try {
    const suffix = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
    const payload = await backendApi.request<unknown>(`operational-planning/overview${suffix}`);
    const raw = objectOf(objectOf(payload)["data"] ?? payload);
    const projects = overviewProjectsOf(raw);
  const totalTasks =
    numberOf(raw["total_tasks"]) ||
    projects.reduce((sum, p) => sum + numberOf(p["tasks_count"] ?? p["total_tasks"]), 0);
  const completedTasks =
    numberOf(raw["completed_tasks"]) ||
    projects.reduce(
      (sum, p) => sum + numberOf(p["completed_tasks_count"] ?? p["completed_tasks"]),
      0,
    );
  const totalActivities =
    numberOf(raw["total_activities"]) ||
    projects.reduce(
      (sum, p) => sum + numberOf(p["activities_count"] ?? p["total_activities"]),
      0,
    );
  return {
    projects,
    totalProjects: numberOf(raw["total_projects"]) || projects.length,
    totalActivities,
    totalTasks,
    completedTasks,
    progressRate: totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100),
    raw,
  };
  } catch (error) {
    throw frenchError(
      error,
      "Impossible de charger la vue d'ensemble. Vérifiez votre connexion puis réessayez.",
    );
  }
}

export function useOperationalOverview(siteId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...REALISATION_KEY, "operational-overview", siteId],
    queryFn: () => fetchOperationalOverview(siteId || undefined),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}

// ---------- Hooks génériques ----------

export function useRealisationList(
  key: RealisationKey,
  filters: RealisationFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...REALISATION_KEY, key, filters],
    queryFn: () => fetchRealisationList(key, filters),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRealisationItem(key: RealisationKey, id: string | number | null) {
  return useQuery({
    queryKey: [...REALISATION_KEY, key, "detail", id],
    queryFn: () => fetchRealisationOne(key, id as string | number),
    enabled: id != null && String(id) !== "",
    staleTime: 60_000,
  });
}

export function useRealisationMutations(key: RealisationKey, siteId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: [...REALISATION_KEY, key] });
  };
  return {
    create: useMutation({
      mutationFn: (payload: RealisationSavePayload) =>
        createRealisationItem(key, { ...payload, ...(siteId ? { site_id: siteId } : {}) }),
      onSuccess: () => {
        invalidate();
        toast.success("Élément créé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Création impossible."),
    }),
    update: useMutation({
      mutationFn: (input: { id: string | number; payload: RealisationSavePayload }) =>
        updateRealisationItem(key, input.id, input.payload),
      onSuccess: () => {
        invalidate();
        toast.success("Modifications enregistrées.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible."),
    }),
    remove: useMutation({
      mutationFn: (id: string | number) => deleteRealisationItem(key, id),
      onSuccess: () => {
        invalidate();
        toast.success("Élément supprimé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Suppression impossible."),
    }),
    importFile: useMutation({
      mutationFn: (file: File) => importRealisationXlsx(key, siteId, file),
      onSuccess: () => {
        invalidate();
        toast.success("Import terminé.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Import impossible."),
    }),
  };
}

// ---------- Hooks nommés par module ----------

export function useOperationalControls(filters: RealisationFilters) {
  return useRealisationList("opcontrol", filters);
}
export function useOperationalControlMutations(siteId: string) {
  return useRealisationMutations("opcontrol", siteId);
}

export function useRequirements(filters: RealisationFilters) {
  return useRealisationList("requirement", filters);
}
export function useRequirementMutations(siteId: string) {
  return useRealisationMutations("requirement", siteId);
}

export function useDesigns(filters: RealisationFilters) {
  return useRealisationList("design", filters);
}
export function useDesignMutations(siteId: string) {
  return useRealisationMutations("design", siteId);
}

export function useOperations(filters: RealisationFilters) {
  return useRealisationList("operation", filters);
}
export function useOperationMutations(siteId: string) {
  return useRealisationMutations("operation", siteId);
}

export function useReleases(filters: RealisationFilters) {
  return useRealisationList("release", filters);
}
export function useReleaseMutations(siteId: string) {
  return useRealisationMutations("release", siteId);
}

export function useNonconformingOutputs(filters: RealisationFilters) {
  return useRealisationList("nonconforming", filters);
}
export function useNonconformingMutations(siteId: string) {
  return useRealisationMutations("nonconforming", siteId);
}

export function useProcedures(filters: RealisationFilters) {
  return useRealisationList("procedure", filters);
}
export function useProcedureMutations(siteId: string) {
  return useRealisationMutations("procedure", siteId);
}

export function useCompliances(filters: RealisationFilters) {
  return useRealisationList("compliance", filters);
}
export function useComplianceMutations(siteId: string) {
  return useRealisationMutations("compliance", siteId);
}

export function useProviders(filters: RealisationFilters) {
  return useRealisationList("provider", filters);
}
export function useProviderMutations(siteId: string) {
  return useRealisationMutations("provider", siteId);
}
