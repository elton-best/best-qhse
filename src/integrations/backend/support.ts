import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backendApi } from "@/integrations/backend/client";

// ============================================================================
// HELPER UTILITIES
// ============================================================================

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Laravel's JsonApiResource keeps model fields under `attributes` and puts
 * loaded relations under `relationships`.  Keep both parts when crossing the
 * API boundary; flattening attributes alone silently drops data used by the
 * tables and detail dialogs.
 */
function flattenSupportResource(value: unknown): Record<string, unknown> {
  const raw = objectOf(value);
  const attributes = objectOf(raw["attributes"] ?? raw);
  const result: Record<string, unknown> = {
    ...attributes,
    ...(raw["id"] != null ? { id: raw["id"] } : {}),
  };
  const relationships = objectOf(raw["relationships"]);

  for (const [name, relationship] of Object.entries(relationships)) {
    const relation = objectOf(relationship);
    const related = relation["data"] ?? relationship;
    if (Array.isArray(related)) {
      result[name] = related.map((item) => flattenSupportResource(item));
    } else if (related != null && typeof related === "object") {
      result[name] = flattenSupportResource(related);
    } else {
      result[name] = related;
    }
  }

  return result;
}

function collection(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = objectOf(payload);
  if (Array.isArray(root["data"])) return root["data"];
  if (root["data"] && typeof root["data"] === "object") {
    const nested = objectOf(root["data"]);
    if (Array.isArray(nested["data"])) return nested["data"];
  }
  return [];
}

export async function downloadBlobResponse(blob: Blob, defaultFilename: string): Promise<void> {  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Inventaire des équipements : gabarit + import ----------

export type EquipementsImportSummary = {
  total: number;
  created: number;
  updated: number;
  failed: number;
};

export async function downloadEquipementsTemplate(): Promise<void> {
  const blob = await backendApi.blob("equipements/template");
  await downloadBlobResponse(blob, "modele_inventaire_equipements.xlsx");
}

export async function importEquipementsFile(file: File): Promise<{
  success: boolean;
  message: string;
  summary: EquipementsImportSummary;
  report: Array<{ row: number; status: string; message: string }>;
}> {
  const body = new FormData();
  body.append("file", file);
  return backendApi.request<{
    success: boolean;
    message: string;
    summary: EquipementsImportSummary;
    report: Array<{ row: number; status: string; message: string }>;
  }>("equipements/import-file", { method: "POST", body });
}

// ---------- Maintenances : import ----------

export type MaintenancesImportResult = {
  success: boolean;
  message: string;
  summary: { total: number; created: number; failed: number };
  errors: string[];
};

export async function importMaintenancesFile(file: File): Promise<MaintenancesImportResult> {
  const body = new FormData();
  body.append("file", file);
  return backendApi.request<MaintenancesImportResult>("maintenances/import", {
    method: "POST",
    body,
  });
}

// ============================================================================
// 1. RESSOURCES : CODIFICATION & ÉQUIPEMENTS & MAINTENANCES & TRANSFERTS
// ============================================================================

export type CodificationElement = {
  id: string | number;
  code: string;
  libelle: string;
  description?: string;
  type: "categorie" | "localisation";
  actif: boolean;
};

export type Equipement = {
  id: string | number;
  code_complet: string;
  nom_commun: string;
  nom_commun_abrege?: string;
  categorie_id?: string | number;
  localisation_id?: string | number;
  annee_acquisition?: number;
  marque?: string;
  modele?: string;
  numero_serie?: string;
  etat: "tres_bon" | "bon" | "mauvais";
  valeur_acquisition?: number;
  necessite_maintenance: boolean;
  frequence_maintenance_jours?: number;
  actif: boolean;
  observations?: string;
  categorie?: CodificationElement;
  localisation?: CodificationElement;
  site_id?: string | number;
  created_at?: string;
};

export type EquipementTransfer = {
  id: string | number;
  equipement_id: string | number;
  previous_site_id?: string | number;
  new_site_id: string | number;
  previous_localisation_id?: string | number;
  new_localisation_id?: string | number;
  transferred_at: string;
  transfer_reason_code?: string;
  transfer_notes?: string;
  transfer_reason?: { code?: string; name?: string };
  transferred_by_user_id?: string | number;
  transferred_by_user?: { id: string | number; name: string };
  previous_site?: { id: string | number; name: string };
  new_site?: { id: string | number; name: string };
  previous_localisation?: { id: string | number; libelle: string };
  new_localisation?: { id: string | number; libelle: string };
  is_verified?: boolean;
  verified_by_user_id?: string | number;
  verified_at?: string;
  verification_notes?: string;
};

export type Maintenance = {
  id: string | number;
  equipement_id: string | number;
  type: "preventive" | "corrective" | "etalonnage";
  date_prevue: string;
  date_realisee?: string;
  statut: "planifie" | "en_cours" | "realise" | "reporte" | "annule";
  responsable?: string;
  description?: string;
  observations?: string;
  niveau_alerte?: "depassee" | "aujourd_hui" | "veille" | "trois_jours" | "sept_jours";
  suivi_active?: boolean;
  equipement?: Equipement;
  created_at?: string;
};

export type SupportSite = { id: string | number; name: string };

export async function fetchSupportSites(): Promise<SupportSite[]> {
  const payload = await backendApi.request<unknown>("sites?per_page=100");
  const out: SupportSite[] = [];
  for (const item of collection(payload)) {
    const attrs = flattenSupportResource(item);
    const id = attrs["id"];
    if (id == null) continue;
    const normalizedId = typeof id === "string" || typeof id === "number" ? id : String(id);
    out.push({
      id: normalizedId,
      name: String(attrs["name"] ?? attrs["location"] ?? `Site #${normalizedId}`),
    });
  }
  return out;
}

export function useSupportSites() {
  return useQuery({
    queryKey: ["support-sites"],
    queryFn: fetchSupportSites,
    staleTime: 60_000,
  });
}

export type MaintenanceAlerte = {
  id: string | number;
  equipement_id: string | number;
  equipement_nom?: string | undefined;
  equipement_code?: string | undefined;
  type: string;
  date_prevue: string;
  statut: string;
  niveau_alerte: string;
  jours_restants: number;
};

// Codifications
export async function fetchCodifications(type?: "categorie" | "localisation" | undefined) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const payload = await backendApi.request<unknown>(`codifications${query}`);
  return collection(payload).map((item) => flattenSupportResource(item) as CodificationElement);
}

export function useCodifications(type?: "categorie" | "localisation" | undefined) {
  return useQuery({
    queryKey: ["codifications", type ?? "all"],
    queryFn: () => fetchCodifications(type),
    staleTime: 60_000,
  });
}

// Equipements
export async function fetchEquipements(params?: {
  site_id?: string | undefined;
  etat?: string | undefined;
  search?: string | undefined;
  categorie_id?: string | undefined;
  localisation_id?: string | undefined;
  per_page?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.etat && params.etat !== "all") q.set("etat", params.etat);
  if (params?.search) q.set("search", params.search);
  if (params?.categorie_id && params.categorie_id !== "all")
    q.set("categorie_id", params.categorie_id);
  if (params?.localisation_id && params.localisation_id !== "all")
    q.set("localisation_id", params.localisation_id);
  q.set("per_page", String(params?.per_page ?? 100));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`equipements${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as Equipement);
}

export function useEquipements(params?: {
  site_id?: string | undefined;
  etat?: string | undefined;
  search?: string | undefined;
  categorie_id?: string | undefined;
  localisation_id?: string | undefined;
}) {
  return useQuery({
    queryKey: ["equipements", params],
    queryFn: () => fetchEquipements(params),
    staleTime: 15_000,
  });
}

export async function fetchProchainIndice(nomCommunAbrege: string, annee: number): Promise<string> {
  const payload = await backendApi.request<{
    indice?: string | number;
    data?: { prochain_indice?: string | number };
  }>(
    `equipements/prochain-indice?nom_commun=${encodeURIComponent(nomCommunAbrege)}&annee=${encodeURIComponent(String(annee))}`,
  );
  return String(payload.indice ?? payload.data?.prochain_indice ?? "001");
}

// Maintenances
export async function fetchMaintenances(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  statut?: string | undefined;
  equipement_id?: string | undefined;
  per_page?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.type && params.type !== "all") q.set("type", params.type);
  if (params?.statut && params.statut !== "all") q.set("statut", params.statut);
  if (params?.equipement_id && params.equipement_id !== "all")
    q.set("equipement_id", params.equipement_id);
  q.set("per_page", String(params?.per_page ?? 100));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`maintenances${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as Maintenance);
}

export function useMaintenances(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  statut?: string | undefined;
  equipement_id?: string | undefined;
}) {
  return useQuery({
    queryKey: ["maintenances", params],
    queryFn: () => fetchMaintenances(params),
    staleTime: 15_000,
  });
}

export async function fetchMaintenanceAlertes(siteId?: string): Promise<MaintenanceAlerte[]> {
  const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  const payload = await backendApi.request<unknown>(`maintenances/alertes${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as MaintenanceAlerte);
}

export function useMaintenanceAlertes(siteId?: string) {
  return useQuery({
    queryKey: ["maintenances-alertes", siteId ?? "all"],
    queryFn: () => fetchMaintenanceAlertes(siteId),
    staleTime: 30_000,
    refetchInterval: 300_000, // 5 min
  });
}

// Transferts
export async function fetchEquipmentTransfers(
  equipementId: string | number,
): Promise<EquipementTransfer[]> {
  const payload = await backendApi.request<unknown>(`equipements/${equipementId}/transfers`);
  return collection(payload).map((item) => flattenSupportResource(item) as EquipementTransfer);
}

export async function fetchTransferReasons(
  enterpriseId: string | number,
): Promise<{ code: string; label: string }[]> {
  const payload = await backendApi.request<unknown>(`enterprises/${enterpriseId}/transfer-reasons`);
  const reasons = collection(payload)
    .map((item) => flattenSupportResource(item))
    .map((reason) => ({
      code: String(reason["code"] ?? ""),
      label: String(reason["label"] ?? reason["name"] ?? reason["code"] ?? ""),
    }))
    .filter((reason) => reason.code !== "");
  if (reasons.length > 0) return reasons;
  return [
    { code: "relocation", label: "Changement de localisation" },
    { code: "transfer_site", label: "Transfert vers un autre site" },
    { code: "maintenance", label: "Envoi en maintenance externe" },
    { code: "repair", label: "Réparation" },
    { code: "consolidation", label: "Consolidation d'inventaire" },
    { code: "other", label: "Autre motif" },
  ];
}

// ============================================================================
// 2. COMPÉTENCES : FORMATIONS & PLANS & MATRICE & GAP ANALYSIS
// ============================================================================

export type FormationProof = {
  id: string | number;
  filename: string;
  url: string;
  uploaded_at?: string;
};

export type FormationHistory = {
  id: string | number;
  action: string;
  action_label?: string;
  created_at?: string;
  user_name?: string;
  comment?: string;
};

/**
 * Libellé français d'une entrée d'historique (traçabilité).
 * Le backend expose `action_label`, mais on convertit aussi les codes
 * anglais bruts (`created`, `updated`…) pour ne jamais les afficher tels quels.
 */
export function historyActionLabelFR(action: unknown, label?: unknown): string {
  if (typeof label === "string" && label.trim() !== "") return label;
  const code = typeof action === "string" ? action.trim() : "";
  const labels: Record<string, string> = {
    created: "Création",
    updated: "Modification",
    completed: "Réalisation",
    rescheduled: "Replanification",
    cancelled: "Annulation",
    deleted: "Suppression",
    verified: "Vérifiée",
    approved: "Approuvée",
    rejected: "Rejetée",
    submitted: "Soumise",
    delegated: "Déléguée",
    reminded: "Rappel envoyé",
    downloaded: "Téléchargée",
    previewed: "Prévisualisée",
    generated: "Générée",
    regenerated: "Régénérée",
  };
  return labels[code] ?? (code === "" ? "Événement" : code);
}

export type Formation = {
  id: string | number;
  numero?: number;
  designation: string;
  cibles?: string[];
  target_user_ids?: (string | number)[];
  formateur?: string;
  formateur_user_id?: string | number;
  formateur_type?: "interne" | "externe";
  organizer_user_id?: string | number;
  process_id?: string | number;
  date_debut?: string;
  date_fin?: string;
  period_mode: "standard" | "custom";
  frequency:
    | "ponctuelle"
    | "annuelle"
    | "semestrielle"
    | "trimestrielle"
    | "mensuelle"
    | "biennale"
    | "sur_demande";
  cout?: number;
  observations?: string;
  status: "planifiee" | "en_attente" | "realisee" | "replanifiee" | "annulee";
  alert_state?: string;
  proofs?: FormationProof[];
  history?: FormationHistory[];
  site_id?: string | number;
  plan_year?: number;
  created_at?: string;
};

export type FormationStats = {
  total: number;
  realisees: number;
  taux_realisation: number;
  en_retard: number;
  budget_consomme: number;
  budget_total: number;
};

export type TrainingPlan = {
  id: string | number;
  year: number;
  status: "draft" | "active" | "closed";
  total_budget: number;
  planned_formations: number;
  spent_amount?: number;
  budget_engaged?: number;
  budget_remaining?: number;
  site_id?: string | number;
  created_at?: string;
};

export type FormationInternalEvaluation = {
  id?: string | number;
  formation_id: string | number;
  method?: string;
  scores: {
    pedagogie: number;
    contenu: number;
    applicabilite: number;
    animation: number;
  };
  global_score: number;
  strengths?: string[];
  improvements?: string[];
  comment?: string;
  evaluated_at?: string;
};

export type CompetenceMatrixEntry = {
  user_id: string | number;
  user_name: string;
  job_title?: string;
  competences: {
    competence_id: string | number;
    competence_name: string;
    competence_type: string;
    level_required: "base" | "intermediaire" | "avance" | "expert";
    priority: "obligatoire" | "recommandee" | "optionnelle";
    level_acquired?: "base" | "intermediaire" | "avance" | "expert" | null;
    status: "compliant" | "insufficient" | "missing" | "expired" | "expiring_soon";
    expiry_date?: string | null;
    days_until_expiry?: number | null;
  }[];
};

export type GapAnalysisItem = {
  user_id: string | number;
  user_name: string;
  job_title?: string;
  gap_count: number;
  critical_gaps: number;
  gaps: {
    competence_id: string | number;
    competence_name: string;
    competence_type: string;
    level_required: string;
    level_acquired?: string | null;
    priority: string;
    gap_type: string;
    requires_certification?: boolean;
    suggested_actions?: string[];
  }[];
};

// Formations API
export async function fetchFormations(params?: {
  site_id?: string | undefined;
  status?: string | undefined;
  frequency?: string | undefined;
  search?: string | undefined;
  year?: number | undefined;
  per_page?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.frequency && params.frequency !== "all") q.set("frequency", params.frequency);
  if (params?.search) q.set("search", params.search);
  if (params?.year) q.set("year", String(params.year));
  q.set("per_page", String(params?.per_page ?? 100));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`formations${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as Formation);
}

export async function importFormations(
  file: File,
  year: number,
  targetUserIds: Array<string | number>,
): Promise<{ created: number; updated: number; skipped: number; incomplete?: number }> {
  const body = new FormData();
  body.append("file", file);
  body.append("year", String(year));
  for (const userId of targetUserIds) body.append("target_user_ids[]", String(userId));
  return backendApi.request<{
    created: number;
    updated: number;
    skipped: number;
    incomplete?: number;
  }>("formations/import-file", { method: "POST", body });
}

export function useFormations(params?: {
  site_id?: string | undefined;
  status?: string | undefined;
  frequency?: string | undefined;
  search?: string | undefined;
  year?: number | undefined;
}) {
  return useQuery({
    queryKey: ["formations", params],
    queryFn: () => fetchFormations(params),
    staleTime: 15_000,
  });
}

export async function fetchFormationStats(
  year?: number | undefined,
  siteId?: string | undefined,
): Promise<FormationStats> {
  const q = new URLSearchParams();
  if (year) q.set("year", String(year));
  if (siteId) q.set("site_id", siteId);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`formations/stats${qs}`);
  const root = objectOf(payload);
  const data = (root["data"] && typeof root["data"] === "object" ? root["data"] : root) as Record<
    string,
    unknown
  >;
  return {
    total: Number(data["total"] ?? 0),
    realisees: Number(data["realisees"] ?? 0),
    taux_realisation: Number(data["taux_realisation"] ?? data["tauxRealisation"] ?? 0),
    en_retard: Number(data["en_retard"] ?? data["enRetard"] ?? 0),
    budget_consomme: Number(
      data["budget_consomme"] ?? data["budgetConsomme"] ?? data["spent_amount"] ?? 0,
    ),
    budget_total: Number(data["budget_total"] ?? data["budgetTotal"] ?? data["total_budget"] ?? 0),
  };
}

export function useFormationStats(year?: number | undefined, siteId?: string | undefined) {
  return useQuery({
    queryKey: ["formations-stats", year, siteId],
    queryFn: () => fetchFormationStats(year, siteId),
    staleTime: 30_000,
  });
}

// Training Plans API
export async function fetchTrainingPlans(params?: {
  site_id?: string | undefined;
  year?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.year) q.set("year", String(params.year));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`training-plans${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as TrainingPlan);
}

export function useTrainingPlans(params?: {
  site_id?: string | undefined;
  year?: number | undefined;
}) {
  return useQuery({
    queryKey: ["training-plans", params],
    queryFn: () => fetchTrainingPlans(params),
    staleTime: 30_000,
  });
}

// Matrice des compétences
export async function fetchCompetenceMatrix(params?: {
  job_description_id?: string;
  competence_type?: string;
}): Promise<CompetenceMatrixEntry[]> {
  const q = new URLSearchParams();
  if (params?.job_description_id && params.job_description_id !== "all")
    q.set("job_description_id", params.job_description_id);
  if (params?.competence_type && params.competence_type !== "all")
    q.set("competence_type", params.competence_type);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`competence-matrix${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as CompetenceMatrixEntry);
}

export function useCompetenceMatrix(params?: {
  job_description_id?: string;
  competence_type?: string;
}) {
  return useQuery({
    queryKey: ["competence-matrix", params],
    queryFn: () => fetchCompetenceMatrix(params),
    staleTime: 30_000,
  });
}

export async function fetchGapAnalysis(): Promise<{
  data: GapAnalysisItem[];
  summary: Record<string, number>;
}> {
  const payload = await backendApi.request<unknown>("competence-matrix/gap-analysis");
  const root = objectOf(payload);
  const dataRoot = objectOf(root["data"]);
  const rawData = Array.isArray(root["data"])
    ? root["data"]
    : Array.isArray(dataRoot["data"])
      ? dataRoot["data"]
      : [];
  return {
    data: rawData.map((item) => flattenSupportResource(item) as GapAnalysisItem),
    summary: (objectOf(root["summary"] ?? dataRoot["summary"]) as Record<string, number>) ?? {},
  };
}

export function useGapAnalysis() {
  return useQuery({
    queryKey: ["gap-analysis"],
    queryFn: fetchGapAnalysis,
    staleTime: 30_000,
  });
}

// ============================================================================
// 3. COMMUNICATION & SENSIBILISATION
// ============================================================================

export type CommunicationProof = {
  id: string | number;
  filename: string;
  url: string;
  uploaded_at?: string;
};

export type CommunicationHistory = {
  id: string | number;
  action: string;
  action_label?: string;
  created_at?: string;
  user_name?: string;
  comment?: string;
};

export type Communication = {
  id: string | number;
  numero?: number;
  type: "communication" | "sensibilisation";
  designation: string;
  cibles?: string[];
  moyens?: string[];
  period_mode: "standard" | "custom";
  date_debut?: string;
  date_fin?: string;
  frequency:
    | "ponctuelle"
    | "annuelle"
    | "semestrielle"
    | "trimestrielle"
    | "mensuelle"
    | "biennale"
    | "sur_demande";
  chronogramme?: boolean[];
  organizer_user_id?: string | number;
  responsible_user_id?: string | number;
  responsable?: string;
  participant_user_ids?: (string | number)[];
  cout?: number;
  observations?: string;
  status: "planifiee" | "en_attente" | "realisee" | "replanifiee" | "annulee";
  alert_state?: string;
  proofs?: CommunicationProof[];
  history?: CommunicationHistory[];
  site_id?: string | number;
  plan_year?: number;
  created_at?: string;
};

export type CommunicationStats = {
  total: number;
  realisees: number;
  taux_realisation: number;
  en_retard: number;
  budget_consomme: number;
  budget_total: number;
};

export type CommunicationPlan = {
  id: string | number;
  year: number;
  status: "draft" | "active" | "closed";
  total_budget: number;
  planned_actions: number;
  spent_amount?: number;
  budget_engaged?: number;
  budget_remaining?: number;
  site_id?: string | number;
  created_at?: string;
};

export async function fetchCommunications(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  year?: number | undefined;
  per_page?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.type && params.type !== "all") q.set("type", params.type);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  if (params?.year) q.set("year", String(params.year));
  q.set("per_page", String(params?.per_page ?? 100));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`communications${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as Communication);
}

export function useCommunications(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  year?: number | undefined;
}) {
  return useQuery({
    queryKey: ["communications", params],
    queryFn: () => fetchCommunications(params),
    staleTime: 15_000,
  });
}

export async function fetchCommunicationStats(
  year?: number | undefined,
  siteId?: string | undefined,
  type?: string | undefined,
): Promise<CommunicationStats> {
  const q = new URLSearchParams();
  if (year) q.set("year", String(year));
  if (siteId) q.set("site_id", siteId);
  if (type && type !== "all") q.set("type", type);
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`communications/stats${qs}`);
  const root = objectOf(payload);
  const data = (root["data"] && typeof root["data"] === "object" ? root["data"] : root) as Record<
    string,
    unknown
  >;
  return {
    total: Number(data["total"] ?? 0),
    realisees: Number(data["realisees"] ?? 0),
    taux_realisation: Number(data["taux_realisation"] ?? data["tauxRealisation"] ?? 0),
    en_retard: Number(data["en_retard"] ?? data["enRetard"] ?? 0),
    budget_consomme: Number(
      data["budget_consomme"] ?? data["budgetConsomme"] ?? data["spent_amount"] ?? 0,
    ),
    budget_total: Number(data["budget_total"] ?? data["budgetTotal"] ?? data["total_budget"] ?? 0),
  };
}

export function useCommunicationStats(
  year?: number | undefined,
  siteId?: string | undefined,
  type?: string | undefined,
) {
  return useQuery({
    queryKey: ["communications-stats", year, siteId, type],
    queryFn: () => fetchCommunicationStats(year, siteId, type),
    staleTime: 30_000,
  });
}

export async function fetchCommunicationPlans(params?: {
  site_id?: string | undefined;
  year?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.year) q.set("year", String(params.year));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`communication-plans${qs}`);
  return collection(payload).map((item) => flattenSupportResource(item) as CommunicationPlan);
}

export function useCommunicationPlans(params?: {
  site_id?: string | undefined;
  year?: number | undefined;
}) {
  return useQuery({
    queryKey: ["communication-plans", params],
    queryFn: () => fetchCommunicationPlans(params),
    staleTime: 30_000,
  });
}

// ============================================================================
// 4. INFORMATION DOCUMENTÉE (GED)
// ============================================================================

export type GedDocument = {
  id: string | number;
  code: string;
  title: string;
  type?: string | undefined;
  version: string;
  status: string;
  workflow_status: string;
  process_id?: string | number | undefined;
  process_label?: string | undefined;
  author_id?: string | number | undefined;
  author_name?: string | undefined;
  approver_name?: string | undefined;
  verifier_name?: string | undefined;
  site_id?: string | number | undefined;
  file_url?: string | undefined;
  file_name?: string | undefined;
  file_size?: number | undefined;
  file_type?: string | undefined;
  summary?: string | undefined;
  review_date?: string | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
  rejection_reason?: string | undefined;
  current_version_id?: string | number | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type DocumentStats = {
  total: number;
  draft: number;
  pending_verification: number;
  pending_approval: number;
  approved: number;
  rejected: number;
  obsolete: number;
};

export type PyramideStats = {
  n1: { label: string; count: number; approved: number };
  n2: { label: string; count: number; approved: number };
  n3: { label: string; count: number; approved: number };
  n4: { label: string; count: number; approved: number };
  n5: { label: string; count: number; approved: number };
};

export async function fetchDocumentsList(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  workflow_status?: string | undefined;
  process_id?: string | undefined;
  search?: string | undefined;
  per_page?: number | undefined;
}) {
  const q = new URLSearchParams();
  if (params?.site_id) q.set("site_id", params.site_id);
  if (params?.type && params.type !== "all") q.set("type", params.type);
  if (params?.status && params.status !== "all") q.set("status", params.status);
  if (params?.workflow_status && params.workflow_status !== "all")
    q.set("workflow_status", params.workflow_status);
  if (params?.process_id && params.process_id !== "all") q.set("process_id", params.process_id);
  if (params?.search) q.set("search", params.search);
  q.set("per_page", String(params?.per_page ?? 100));
  const qs = q.toString() ? `?${q.toString()}` : "";
  const payload = await backendApi.request<unknown>(`documents${qs}`);
  const rawList = collection(payload);
  return rawList.map((item) => {
    const attrs = flattenSupportResource(item);
    const id = attrs["id"];
    const author = objectOf(attrs["author"]);
    const process = objectOf(attrs["process"]);
    return {
      id: String(id),
      code: String(attrs["code"] ?? `DOC-${id}`),
      title: String(attrs["title"] ?? attrs["name"] ?? "Document sans titre"),
      type: attrs["type"] ? String(attrs["type"]) : undefined,
      version: String(attrs["version"] ?? "1.0"),
      status: String(attrs["status"] ?? ""),
      workflow_status: String(attrs["workflow_status"] ?? attrs["status"] ?? ""),
      process_id: attrs["process_id"] ? String(attrs["process_id"]) : undefined,
      process_label: String(process["title"] ?? process["name"] ?? process["code"] ?? "—"),
      author_name: String(author["name"] ?? author["email"] ?? "—"),
      approver_name: attrs["approver_name"] ? String(attrs["approver_name"]) : undefined,
      verifier_name: attrs["verifier_name"] ? String(attrs["verifier_name"]) : undefined,
      file_url: attrs["file_url"] ? String(attrs["file_url"]) : undefined,
      file_name: attrs["file_name"] ? String(attrs["file_name"]) : undefined,
      file_size: attrs["file_size"] ? Number(attrs["file_size"]) : undefined,
      file_type: attrs["file_type"] ? String(attrs["file_type"]) : undefined,
      summary: attrs["summary"] ? String(attrs["summary"]) : undefined,
      review_date: attrs["review_date"] ? String(attrs["review_date"]) : undefined,
      created_at: attrs["created_at"] ? String(attrs["created_at"]) : undefined,
      updated_at: attrs["updated_at"] ? String(attrs["updated_at"]) : undefined,
      rejection_reason: attrs["rejection_reason"] ? String(attrs["rejection_reason"]) : undefined,
      current_version_id: attrs["current_version_id"]
        ? String(attrs["current_version_id"])
        : undefined,
    } as GedDocument;
  });
}

export function useDocumentsList(params?: {
  site_id?: string | undefined;
  type?: string | undefined;
  status?: string | undefined;
  workflow_status?: string | undefined;
  process_id?: string | undefined;
  search?: string | undefined;
}) {
  return useQuery({
    queryKey: ["documents-list", params],
    queryFn: () => fetchDocumentsList(params),
    staleTime: 15_000,
  });
}

export async function fetchDocumentStats(siteId?: string | undefined): Promise<DocumentStats> {
  const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  const payload = await backendApi.request<unknown>(`documents/stats${qs}`);
  const root = objectOf(payload);
  const data = (root["data"] && typeof root["data"] === "object" ? root["data"] : root) as Record<
    string,
    unknown
  >;
  return {
    total: Number(data["total"] ?? 0),
    draft: Number(data["draft"] ?? 0),
    pending_verification: Number(data["pending_verification"] ?? 0),
    pending_approval: Number(data["pending_approval"] ?? 0),
    approved: Number(data["approved"] ?? 0),
    rejected: Number(data["rejected"] ?? 0),
    obsolete: Number(data["obsolete"] ?? 0),
  };
}

export function useDocumentStats(siteId?: string | undefined) {
  return useQuery({
    queryKey: ["documents-stats", siteId],
    queryFn: () => fetchDocumentStats(siteId),
    staleTime: 30_000,
  });
}

export async function fetchPyramideStats(siteId?: string | undefined): Promise<PyramideStats> {
  try {
    const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
    const payload = await backendApi.request<unknown>(`documents/pyramide/stats${qs}`);
    const root = objectOf(payload);
    const data = (root["data"] && typeof root["data"] === "object" ? root["data"] : root) as Record<
      string,
      unknown
    >;
    const getLevel = (k: string, label: string) => {
      const item = objectOf(data[k]);
      return {
        label,
        count: Number(item["total"] ?? item["count"] ?? 0),
        approved: Number(item["approved"] ?? 0),
      };
    };
    return {
      n1: getLevel("N1", "N1 — Manuel & Politiques"),
      n2: getLevel("N2", "N2 — Procédures"),
      n3: getLevel("N3", "N3 — Instructions & Modes opératoires"),
      n4: getLevel("N4", "N4 — Enregistrements & Formulaires"),
      n5: getLevel("N5", "N5 — Documents externes"),
    };
  } catch {
    return {
      n1: { label: "N1 — Manuel & Politiques", count: 0, approved: 0 },
      n2: { label: "N2 — Procédures", count: 0, approved: 0 },
      n3: { label: "N3 — Instructions & Modes opératoires", count: 0, approved: 0 },
      n4: { label: "N4 — Enregistrements & Formulaires", count: 0, approved: 0 },
      n5: { label: "N5 — Documents externes", count: 0, approved: 0 },
    };
  }
}

export function usePyramideStats(siteId?: string | undefined) {
  return useQuery({
    queryKey: ["pyramide-stats", siteId],
    queryFn: () => fetchPyramideStats(siteId),
    staleTime: 60_000,
  });
}

// ---------- Plan de communication : gabarit + import ----------

export type CommunicationsImportResult = {
  message?: string;
  created: number;
  updated: number;
  skipped: number;
  incomplete?: number;
};

export async function downloadCommunicationsTemplate(): Promise<void> {
  const blob = await backendApi.blob("communications/template");
  await downloadBlobResponse(blob, "modele_plan_communication.xlsx");
}

export async function importCommunicationsFile(
  file: File,
  year: number,
): Promise<CommunicationsImportResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("year", String(year));
  const payload = await backendApi.request<CommunicationsImportResult>(
    "communications/import-file",
    { method: "POST", body },
  );
  return {
    ...(payload.message !== undefined ? { message: payload.message } : {}),
    created: Number(payload.created ?? 0),
    updated: Number(payload.updated ?? 0),
    skipped: Number(payload.skipped ?? 0),
    ...(payload.incomplete === undefined ? {} : { incomplete: Number(payload.incomplete) }),
  };
}

// ---------- Inventaire documentaire : gabarit + import (M5-D2) ----------

export type InventoryImportResult = {
  success: number;
  errors: number;
  error_details: Array<{ row: number; errors: string[] }>;
};

export async function downloadInventoryTemplate(): Promise<void> {
  const blob = await backendApi.blob("documents/inventory-template");
  await downloadBlobResponse(blob, "modele_inventaire_documentaire.xlsx");
}

export async function importDocumentsInventory(
  file: File,
  siteId: string | number,
): Promise<InventoryImportResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("site_id", String(siteId));
  const payload = await backendApi.request<unknown>("documents/inventory-import", {
    method: "POST",
    body,
  });
  const root =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const details = Array.isArray(root["error_details"]) ? root["error_details"] : [];
  return {
    success: Number(root["success"] ?? 0),
    errors: Number(root["errors"] ?? details.length),
    error_details: details.map((entry) => {
      const raw = (entry ?? {}) as Record<string, unknown>;
      const messages = Array.isArray(raw["errors"]) ? raw["errors"].map(String) : [];
      return { row: Number(raw["row"] ?? 0), errors: messages };
    }),
  };
}

export function useInventoryImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; siteId: string | number }) =>
      importDocumentsInventory(input.file, input.siteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents-list"] });
      queryClient.invalidateQueries({ queryKey: ["documents-stats"] });
      queryClient.invalidateQueries({ queryKey: ["pyramide-stats"] });
    },
  });
}

export async function fetchDocumentPreviewBlob(documentId: string | number): Promise<Blob> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`/api/v1/documents/${documentId}/preview`, {
    headers: {
      Accept: "application/pdf, */*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Erreur lors de la prévisualisation (${res.status})`);
  }
  return res.blob();
}

export async function exportDocumentsInventory(siteId?: string | undefined): Promise<void> {
  const token = localStorage.getItem("token") || "";
  const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  const res = await fetch(`/api/v1/documents/export-inventory${qs}`, {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error("Échec de l'export de l'inventaire");
  const blob = await res.blob();
  await downloadBlobResponse(
    blob,
    `inventaire_documentaire_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export async function exportPyramideLevel(
  level: string,
  siteId?: string | undefined,
): Promise<void> {  const token = localStorage.getItem("token") || "";
  const qs = siteId ? `?site_id=${encodeURIComponent(siteId)}` : "";
  const res = await fetch(`/api/v1/documents/pyramide/export/${encodeURIComponent(level)}${qs}`, {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Échec de l'export de la pyramide ${level}`);
  const blob = await res.blob();
  await downloadBlobResponse(
    blob,
    `pyramide_${level}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useEquipementMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["equipements"] });
    queryClient.invalidateQueries({ queryKey: ["maintenances"] });
    queryClient.invalidateQueries({ queryKey: ["maintenances-alertes"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: Record<string, unknown>;
      }) => {
        if (id) {
          return backendApi.request(`equipements/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        return backendApi.request("equipements", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`equipements/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    transfer: useMutation({
      mutationFn: ({ id, payload }: { id: string | number; payload: Record<string, unknown> }) =>
        backendApi.request(`equipements/${id}/transfer`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useCodificationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["codifications"] });
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: Record<string, unknown>;
      }) => {
        if (id) {
          return backendApi.request(`codifications/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        return backendApi.request("codifications", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`codifications/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useMaintenanceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["maintenances"] });
    queryClient.invalidateQueries({ queryKey: ["maintenances-alertes"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: Record<string, unknown>;
      }) => {
        if (id) {
          return backendApi.request(`maintenances/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        return backendApi.request("maintenances", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`maintenances/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
  };
}

export function useFormationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["formations"] });
    queryClient.invalidateQueries({ queryKey: ["formations-stats"] });
    queryClient.invalidateQueries({ queryKey: ["training-plans"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: Record<string, unknown>;
      }) => {
        if (id) {
          return backendApi.request(`formations/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        return backendApi.request("formations", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`formations/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    importFile: useMutation({
      mutationFn: (input: { file: File; year: number; targetUserIds: Array<string | number> }) =>
        importFormations(input.file, input.year, input.targetUserIds),
      onSuccess: invalidate,
    }),
    reschedule: useMutation({
      mutationFn: ({
        id,
        payload,
      }: {
        id: string | number;
        payload: { date_debut: string; date_fin: string; comment?: string | undefined };
      }) =>
        backendApi.request(`formations/${id}/reschedule`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string | number; reason: string }) =>
        backendApi.request(`formations/${id}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useCommunicationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["communications"] });
    queryClient.invalidateQueries({ queryKey: ["communications-stats"] });
    queryClient.invalidateQueries({ queryKey: ["communication-plans"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: Record<string, unknown>;
      }) => {
        if (id) {
          return backendApi.request(`communications/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        return backendApi.request("communications", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`communications/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    reschedule: useMutation({
      mutationFn: ({
        id,
        payload,
      }: {
        id: string | number;
        payload: { date_debut: string; date_fin: string; comment?: string | undefined };
      }) =>
        backendApi.request(`communications/${id}/reschedule`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: string | number; reason: string }) =>
        backendApi.request(`communications/${id}/cancel`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useDocumentMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["documents-list"] });
    queryClient.invalidateQueries({ queryKey: ["documents-stats"] });
    queryClient.invalidateQueries({ queryKey: ["pyramide-stats"] });
  };
  return {
    save: useMutation({
      mutationFn: async ({
        id,
        payload,
      }: {
        id?: string | number | undefined;
        payload: FormData | Record<string, unknown>;
      }) => {
        const isFormData = payload instanceof FormData;
        if (id) {
          if (isFormData) {
            const token = localStorage.getItem("token") || "";
            const res = await fetch(`/api/v1/documents/${id}`, {
              method: "POST",
              headers: {
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "X-HTTP-Method-Override": "PUT",
              },
              body: payload,
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || "Erreur de mise à jour");
            }
            return res.json();
          }
          return backendApi.request(`documents/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        }
        if (isFormData) {
          const token = localStorage.getItem("token") || "";
          const res = await fetch("/api/v1/documents", {
            method: "POST",
            headers: {
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: payload,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || "Erreur lors de la création du document");
          }
          return res.json();
        }
        return backendApi.request("documents", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`documents/${id}`, { method: "DELETE" }),
      onSuccess: invalidate,
    }),
    uploadVersion: useMutation({
      mutationFn: async ({ id, formData }: { id: string | number; formData: FormData }) => {
        const token = localStorage.getItem("token") || "";
        const res = await fetch(`/api/v1/documents/${id}/versions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || "Échec de l'upload de version");
        }
        return res.json();
      },
      onSuccess: invalidate,
    }),
    submitForApproval: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`documents/${id}/submit-for-approval`, { method: "POST" }),
      onSuccess: invalidate,
    }),
    confirmRejectionDecision: useMutation({
      mutationFn: ({
        id,
        release_code,
        comment,
      }: {
        id: string | number;
        release_code: boolean;
        comment?: string | undefined;
      }) =>
        backendApi.request(`documents/${id}/confirm-rejection-decision`, {
          method: "POST",
          body: JSON.stringify({ release_code, comment }),
        }),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (id: string | number) =>
        backendApi.request(`documents/${id}/archive`, { method: "POST" }),
      onSuccess: invalidate,
    }),
  };
}
