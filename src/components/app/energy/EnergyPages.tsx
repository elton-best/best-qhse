import {
  BadgeCheck,
  ClipboardCheck,
  Gauge,
  PenTool,
  ScanSearch,
  Scale,
  ShoppingCart,
  Target,
  Wrench,
} from "lucide-react";
import { RealisationPage, type RealisationField } from "../realisation/shared";

/** Sections du système de management de l'énergie (ISO 50001) — données persistées par l'API Laravel. */

const EYEBROW_PLANNING = "Planification — ISO 50001";
const EYEBROW_OPERATION = "Réalisation des activités — ISO 50001";
const EYEBROW_EVALUATION = "Évaluation des performances — ISO 50001";

const RESPONSIBLE: RealisationField = {
  key: "responsible_id",
  label: "Responsable",
  type: "relation",
  source: "users",
};
const IPE_LINK: RealisationField = { key: "ipe_id", label: "IPÉ lié", type: "relation", source: "ipe" };
const EQUIPMENT_LINK: RealisationField = {
  key: "equipment_id",
  label: "Équipement",
  type: "relation",
  source: "equipment",
};
const PROVIDER_LINK: RealisationField = {
  key: "provider_partner_id",
  label: "Prestataire référencé",
  type: "relation",
  source: "provider",
};
const UNIT: RealisationField = { key: "unit", label: "Unité", type: "text" };
const ENERGY_SOURCE: RealisationField = { key: "energy_source", label: "Source d'énergie", type: "text" };

export function EnergyBaselinePage() {
  return (
    <RealisationPage
      resource="energy_baseline"
      eyebrow={EYEBROW_PLANNING}
      title="Situation énergétique de référence"
      description="Définissez la base de comparaison de la performance énergétique : période, consommation de référence et variables pertinentes (§6.5)."
      icon={Gauge}
      statuses={["Brouillon", "Validée", "Révisée", "Archivée"]}
      filePrefix="situation-energetique-reference"
      summaryKeys={["energy_source", "baseline_consumption", "period_start"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        { ...ENERGY_SOURCE, required: true },
        { key: "period_start", label: "Début de la période de référence", type: "date", required: true },
        { key: "period_end", label: "Fin de la période de référence", type: "date", required: true },
        { key: "baseline_consumption", label: "Consommation de référence", type: "number", required: true },
        { ...UNIT, required: true },
        IPE_LINK,
        RESPONSIBLE,
        { key: "relevant_variables", label: "Variables pertinentes (production, climat, occupation…)", type: "textarea", full: true },
        { key: "normalization_method", label: "Méthode de normalisation", type: "textarea", full: true },
        { key: "adjustment_notes", label: "Ajustements et révisions", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyDataCollectionPage() {
  return (
    <RealisationPage
      resource="energy_collection"
      eyebrow={EYEBROW_PLANNING}
      title="Planification de la collecte des données énergétiques"
      description="Planifiez les mesures à relever : donnée, méthode, équipement, fréquence et responsable (§6.6)."
      icon={ScanSearch}
      statuses={["Planifiée", "Active", "Suspendue", "Archivée"]}
      filePrefix="collecte-donnees-energetiques"
      summaryKeys={["data_point", "frequency", "next_due_date"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        { key: "data_point", label: "Donnée à collecter", type: "text", required: true },
        ENERGY_SOURCE,
        {
          key: "frequency",
          label: "Fréquence",
          type: "select",
          choices: [
            { value: "continuous", label: "En continu" },
            { value: "daily", label: "Quotidienne" },
            { value: "weekly", label: "Hebdomadaire" },
            { value: "monthly", label: "Mensuelle" },
            { value: "quarterly", label: "Trimestrielle" },
            { value: "annual", label: "Annuelle" },
          ],
        },
        UNIT,
        EQUIPMENT_LINK,
        RESPONSIBLE,
        { key: "data_source", label: "Source de la donnée", type: "text" },
        { key: "storage_location", label: "Lieu de stockage", type: "text" },
        { key: "last_collected_at", label: "Dernière collecte", type: "date" },
        { key: "next_due_date", label: "Prochaine échéance", type: "date" },
        { key: "measurement_method", label: "Méthode de mesure", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyObjectivesPage() {
  return (
    <RealisationPage
      resource="energy_objective"
      eyebrow={EYEBROW_PLANNING}
      title="Objectifs et cibles énergétiques"
      description="Fixez les objectifs et cibles de performance énergétique, rattachez-les à un IPÉ et suivez leur plan d'action (§6.2)."
      icon={Target}
      statuses={["Planifié", "En cours", "Atteint", "Non atteint", "Annulé"]}
      filePrefix="objectifs-cibles-energetiques"
      summaryKeys={["objective_type", "target_value", "deadline", "progress_percent"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        {
          key: "objective_type",
          label: "Type",
          type: "select",
          choices: [
            { value: "objective", label: "Objectif" },
            { value: "target", label: "Cible" },
          ],
        },
        IPE_LINK,
        ENERGY_SOURCE,
        { key: "baseline_value", label: "Valeur de référence", type: "number" },
        { key: "target_value", label: "Valeur cible", type: "number" },
        { key: "current_value", label: "Valeur actuelle", type: "number" },
        UNIT,
        { key: "deadline", label: "Échéance", type: "date" },
        { key: "progress_percent", label: "Avancement (%)", type: "number" },
        RESPONSIBLE,
        { key: "action_plan", label: "Plan d'action", type: "textarea", full: true },
        { key: "resources_needed", label: "Ressources nécessaires", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyDesignPage() {
  return (
    <RealisationPage
      resource="energy_design"
      eyebrow={EYEBROW_OPERATION}
      title="Conception énergétique"
      description="Intégrez la performance énergétique dès la conception : critères, gains attendus et revues (§8.3)."
      icon={PenTool}
      statuses={["Planifiée", "En revue", "Validée", "Rejetée"]}
      filePrefix="conception-energetique"
      summaryKeys={["project_ref", "design_stage", "expected_saving"]}
      fields={[
        { key: "title", label: "Projet", type: "text", required: true },
        { key: "project_ref", label: "Référence du projet", type: "text" },
        {
          key: "design_stage",
          label: "Étape",
          type: "select",
          choices: [
            { value: "concept", label: "Concept" },
            { value: "design", label: "Conception" },
            { value: "review", label: "Revue" },
            { value: "validation", label: "Validation" },
            { value: "commissioning", label: "Mise en service" },
          ],
        },
        RESPONSIBLE,
        { key: "expected_saving", label: "Gain énergétique attendu", type: "number" },
        UNIT,
        { key: "review_date", label: "Date de revue", type: "date" },
        { key: "description", label: "Description", type: "textarea", full: true },
        { key: "performance_criteria", label: "Critères de performance énergétique", type: "textarea", full: true },
        { key: "outputs", label: "Éléments de sortie", type: "textarea", full: true },
        { key: "review_notes", label: "Conclusions de la revue", type: "textarea", full: true },
      ]}
    />
  );
}

const PURCHASE_STATUSES = ["Brouillon", "Commandé", "Reçu", "Évalué", "Annulé"];

export function EnergyPurchasesPage() {
  return (
    <RealisationPage
      resource="energy_purchase"
      eyebrow={EYEBROW_OPERATION}
      title="Achats d'énergie"
      description="Suivez les achats d'énergie et évaluez les fournisseurs selon les critères de performance énergétique (§8.4)."
      icon={ShoppingCart}
      statuses={PURCHASE_STATUSES}
      filePrefix="achats-energie"
      summaryKeys={["energy_type", "supplier_name", "total_amount"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        { key: "energy_type", label: "Type d'énergie", type: "text", required: true },
        PROVIDER_LINK,
        { key: "supplier_name", label: "Fournisseur", type: "text" },
        { key: "contract_ref", label: "Référence du contrat", type: "text" },
        { key: "quantity", label: "Quantité", type: "number" },
        UNIT,
        { key: "unit_price", label: "Prix unitaire", type: "number" },
        { key: "total_amount", label: "Montant total (calculé si vide)", type: "number" },
        { key: "purchase_date", label: "Date d'achat", type: "date" },
        { key: "delivery_date", label: "Date de livraison", type: "date" },
        { key: "supplier_score", label: "Note du fournisseur (0-100)", type: "number" },
        RESPONSIBLE,
        { key: "evaluation_criteria", label: "Critères d'évaluation", type: "textarea", full: true },
        { key: "evaluation_notes", label: "Observations", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyEquipmentPurchasesPage() {
  return (
    <RealisationPage
      resource="energy_equipment"
      eyebrow={EYEBROW_OPERATION}
      title="Achats d'équipements énergétiques"
      description="Évaluez l'efficacité énergétique et le coût sur cycle de vie des équipements achetés (§8.4)."
      icon={Wrench}
      statuses={PURCHASE_STATUSES}
      filePrefix="achats-equipements-energetiques"
      summaryKeys={["efficiency_class", "supplier_name", "purchase_cost"]}
      fields={[
        { key: "title", label: "Équipement acheté", type: "text", required: true },
        EQUIPMENT_LINK,
        PROVIDER_LINK,
        { key: "supplier_name", label: "Fournisseur", type: "text" },
        { key: "efficiency_class", label: "Classe d'efficacité énergétique", type: "text" },
        { key: "expected_consumption", label: "Consommation attendue", type: "number" },
        UNIT,
        { key: "purchase_cost", label: "Coût d'achat", type: "number" },
        { key: "lifecycle_cost", label: "Coût sur cycle de vie", type: "number" },
        { key: "purchase_date", label: "Date d'achat", type: "date" },
        RESPONSIBLE,
        { key: "efficiency_criteria", label: "Critères d'efficacité énergétique", type: "textarea", full: true },
        { key: "evaluation_notes", label: "Observations", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyMonitoringPage() {
  return (
    <RealisationPage
      resource="energy_monitoring"
      eyebrow={EYEBROW_EVALUATION}
      title="Surveillance de la performance énergétique"
      description="Comparez valeurs mesurées et prévues : l'écart est calculé automatiquement et déclenche l'analyse (§9.1.1)."
      icon={ClipboardCheck}
      statuses={["Enregistré", "Analysé", "Action requise", "Clôturé"]}
      filePrefix="surveillance-performance-energetique"
      summaryKeys={["measured_value", "deviation_percent"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        IPE_LINK,
        EQUIPMENT_LINK,
        { key: "period_start", label: "Début de période", type: "date", required: true },
        { key: "period_end", label: "Fin de période", type: "date", required: true },
        { key: "planned_value", label: "Valeur prévue", type: "number" },
        { key: "measured_value", label: "Valeur mesurée", type: "number", required: true },
        UNIT,
        RESPONSIBLE,
        { key: "analysis", label: "Analyse des écarts", type: "textarea", full: true },
        { key: "deviation", label: "Écart (mesuré − prévu)", type: "number", readOnly: true },
        { key: "deviation_percent", label: "Écart (%)", type: "number", readOnly: true },
      ]}
    />
  );
}

export function EnergyCompliancePage() {
  return (
    <RealisationPage
      resource="energy_compliance"
      eyebrow={EYEBROW_EVALUATION}
      title="Évaluation de la conformité énergétique"
      description="Évaluez périodiquement la conformité aux exigences légales et autres exigences énergétiques (§9.1.2)."
      icon={Scale}
      statuses={["Planifiée", "Évaluée", "Action ouverte", "Clôturée"]}
      filePrefix="conformite-energetique"
      summaryKeys={["source", "result", "next_evaluation_date"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        { key: "legal_requirement", label: "Exigence légale ou autre", type: "textarea", required: true, full: true },
        { key: "source", label: "Source (texte, norme, contrat)", type: "text" },
        { key: "evaluation_method", label: "Méthode d'évaluation", type: "text" },
        { key: "evaluation_date", label: "Date d'évaluation", type: "date" },
        { key: "next_evaluation_date", label: "Prochaine évaluation", type: "date" },
        {
          key: "result",
          label: "Résultat",
          type: "select",
          choices: [
            { value: "not_evaluated", label: "Non évalué" },
            { value: "compliant", label: "Conforme" },
            { value: "partial", label: "Partiellement conforme" },
            { value: "non_compliant", label: "Non conforme" },
          ],
        },
        RESPONSIBLE,
        { key: "gap_description", label: "Écart constaté", type: "textarea", full: true },
        { key: "action_required", label: "Action requise", type: "textarea", full: true },
        { key: "evidence", label: "Preuves", type: "textarea", full: true },
      ]}
    />
  );
}

export function EnergyAuditPage() {
  return (
    <RealisationPage
      resource="energy_audit"
      eyebrow={EYEBROW_EVALUATION}
      title="Audit énergétique interne"
      description="Planifiez et consignez les audits internes du système de management de l'énergie (§9.2)."
      icon={BadgeCheck}
      statuses={["Planifié", "En cours", "Réalisé", "Clôturé"]}
      filePrefix="audit-energetique-interne"
      summaryKeys={["planned_date", "nonconformities_count", "observations_count"]}
      fields={[
        { key: "title", label: "Intitulé", type: "text", required: true },
        { key: "planned_date", label: "Date prévue", type: "date" },
        { key: "actual_date", label: "Date réalisée", type: "date" },
        { key: "auditors", label: "Auditeurs", type: "text" },
        RESPONSIBLE,
        { key: "nonconformities_count", label: "Non-conformités", type: "number" },
        { key: "observations_count", label: "Observations", type: "number" },
        { key: "next_audit_date", label: "Prochain audit", type: "date" },
        { key: "scope", label: "Périmètre", type: "textarea", full: true },
        { key: "criteria", label: "Critères d'audit", type: "textarea", full: true },
        { key: "findings", label: "Constats", type: "textarea", full: true },
        { key: "improvement_opportunities", label: "Opportunités d'amélioration", type: "textarea", full: true },
        { key: "conclusion", label: "Conclusion", type: "textarea", full: true },
      ]}
    />
  );
}
