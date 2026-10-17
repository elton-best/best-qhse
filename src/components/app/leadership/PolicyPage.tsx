import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Eye,
  FileDown,
  History,
  PenLine,
  Plus,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { backendApi } from "@/integrations/backend/client";
import {
  downloadBlob,
  exportPolicyDocx,
  exportPolicyPdf,
  generatePolicyDraft,
  useCurrentPolicy,
  usePublishedPolicy,
  usePolicyAcknowledgements,
  usePolicyHistory,
  usePolicyMutations,
} from "@/integrations/backend/leadership";
import { useEnterpriseNorms } from "@/integrations/backend/norms";
import { ConfirmDialog } from "../ConfirmDialog";
import { EthicsReportsPanel } from "./EthicsReportsPanel";
import {
  Header,
  Label,
  TextAreaField,
  TextField,
  card,
  errorMessage,
  formatDateFR,
  input,
  muted,
  primary,
  secondary,
  statusBadge,
} from "./shared";

type PolicyForm = {
  title: string;
  presentation: string;
  mission: string;
  vision: string;
  values: string[];
  axes: string[];
  commitments: string[];
  environmental_policy: string;
  health_safety_policy: string;
  ethics_charter: string;
  effective_date: string;
  leadership_reviews: AnnualLeadershipReview[];
  customer_orientation_reviews: CustomerOrientationReview[];
};
type LeadershipChecklistStatus = "demontre" | "ecart" | "non_applicable" | "";
type LeadershipChecklistAnswer = {
  status: LeadershipChecklistStatus;
  rationale: string;
  evidence: string;
};
type AnnualLeadershipReview = {
  period_year: number;
  reviewed_at: string | null;
  reviewed_by?: string | number | null;
  items: Record<string, LeadershipChecklistAnswer>;
};
type CustomerOrientationReview = AnnualLeadershipReview;
type ListKey = "values" | "axes" | "commitments";
type GenerationContext = { document_type_catalog_id: string; process_id: string };

const LEADERSHIP_CHECKLIST_ITEMS = [
  {
    id: "a",
    text: "Assumer la responsabilité de l’efficacité du système de management de la qualité.",
  },
  {
    id: "b",
    text: "S’assurer que la politique et les objectifs qualité sont établis et cohérents avec le contexte et l’orientation stratégique.",
  },
  { id: "c", text: "Intégrer les exigences du système de management dans les processus métier." },
  { id: "d", text: "Promouvoir l’approche processus et l’approche par les risques." },
  { id: "e", text: "S’assurer de la disponibilité des ressources nécessaires au système." },
  {
    id: "f",
    text: "Communiquer sur l’importance d’un management efficace et du respect des exigences.",
  },
  { id: "g", text: "S’assurer que le système atteint les résultats attendus." },
  {
    id: "h",
    text: "Engager, orienter et soutenir les personnes pour contribuer à l’efficacité du système.",
  },
  { id: "i", text: "Promouvoir l’amélioration continue." },
  {
    id: "j",
    text: "Soutenir les responsables concernés dans l’exercice de leurs responsabilités.",
  },
  { id: "k", text: "Promouvoir l’orientation client dans toute l’organisation." },
  { id: "l", text: "Démontrer le leadership dans les domaines relevant de sa responsabilité." },
] as const;

const CUSTOMER_ORIENTATION_ITEMS = [
  {
    id: "requirements",
    text: "Les exigences des clients et les exigences légales applicables sont déterminées, comprises et satisfaites.",
  },
  {
    id: "risk_opportunity",
    text: "Les risques et opportunités susceptibles d’affecter la conformité des produits et services ou la satisfaction client sont traités.",
  },
  {
    id: "satisfaction",
    text: "L’amélioration de la satisfaction client est maintenue comme priorité de l’organisation.",
  },
] as const;

const asArray = (value: unknown, fallback: string[] = []): string[] =>
  Array.isArray(value) && value.length > 0 ? value.map((item) => String(item)) : fallback;
const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (value: string): string => esc(value).replace(/\n/g, "<br>");
const nonEmpty = (items: string[]): string[] => items.map((v) => v.trim()).filter(Boolean);

function normalizeLeadershipReviews(value: unknown): AnnualLeadershipReview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const review = raw as Record<string, unknown>;
    const rawItems =
      review["items"] && typeof review["items"] === "object"
        ? (review["items"] as Record<string, unknown>)
        : {};
    const items: Record<string, LeadershipChecklistAnswer> = {};
    for (const prompt of LEADERSHIP_CHECKLIST_ITEMS) {
      const rawAnswer = rawItems[prompt.id];
      const answer =
        rawAnswer && typeof rawAnswer === "object" ? (rawAnswer as Record<string, unknown>) : {};
      const status = String(answer["status"] ?? "");
      items[prompt.id] = {
        status:
          status === "demontre" || status === "ecart" || status === "non_applicable" ? status : "",
        rationale: String(answer["rationale"] ?? ""),
        evidence: String(answer["evidence"] ?? ""),
      };
    }
    const year = Number(review["period_year"]);
    if (!Number.isInteger(year)) return [];
    return [
      {
        period_year: year,
        reviewed_at: review["reviewed_at"] ? String(review["reviewed_at"]) : null,
        reviewed_by:
          typeof review["reviewed_by"] === "string" || typeof review["reviewed_by"] === "number"
            ? review["reviewed_by"]
            : null,
        items,
      },
    ];
  });
}

function normalizeCustomerOrientationReviews(value: unknown): CustomerOrientationReview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const review = raw as Record<string, unknown>;
    const rawItems =
      review["items"] && typeof review["items"] === "object"
        ? (review["items"] as Record<string, unknown>)
        : {};
    const items: Record<string, LeadershipChecklistAnswer> = {};
    for (const control of CUSTOMER_ORIENTATION_ITEMS) {
      const rawAnswer = rawItems[control.id];
      const answer =
        rawAnswer && typeof rawAnswer === "object" ? (rawAnswer as Record<string, unknown>) : {};
      const status = String(answer["status"] ?? "");
      items[control.id] = {
        status:
          status === "demontre" || status === "ecart" || status === "non_applicable" ? status : "",
        rationale: String(answer["rationale"] ?? ""),
        evidence: String(answer["evidence"] ?? ""),
      };
    }
    const year = Number(review["period_year"]);
    if (!Number.isInteger(year)) return [];
    return [
      {
        period_year: year,
        reviewed_at: review["reviewed_at"] ? String(review["reviewed_at"]) : null,
        reviewed_by:
          typeof review["reviewed_by"] === "string" || typeof review["reviewed_by"] === "number"
            ? review["reviewed_by"]
            : null,
        items,
      },
    ];
  });
}

function idOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = ((payload as Record<string, unknown>)["data"] ?? payload) as Record<string, unknown>;
  const attrs = (data["attributes"] ?? data) as Record<string, unknown>;
  const id = data["id"] ?? attrs["id"];
  return id == null || id === "" ? null : String(id);
}

function docCodeOf(payload: unknown): { id: string; code: string } | null {
  const id = idOf(payload);
  if (!id) return null;
  const data = ((payload as Record<string, unknown>)["data"] ?? payload) as Record<string, unknown>;
  const attrs = (data["attributes"] ?? data) as Record<string, unknown>;
  return { id, code: String(attrs["code"] ?? "") };
}

function DynamicList({
  label,
  items,
  placeholder,
  addLabel,
  refs,
  onAdd,
  onChange,
  onRemove,
}: {
  label: string;
  items: string[];
  placeholder: string;
  addLabel: string;
  refs: { current: Array<HTMLInputElement | null> };
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${placeholder}-${index}`} className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-extrabold text-primary">
              {index + 1}
            </span>
            <input
              ref={(el) => {
                refs.current[index] = el;
              }}
              className={input}
              value={item}
              placeholder={`${placeholder} ${index + 1}`}
              onChange={(e) => onChange(index, e.target.value)}
            />
            <button
              type="button"
              aria-label="Retirer"
              className={`${secondary} h-10 w-10 shrink-0 !px-0`}
              disabled={items.length <= 1}
              onClick={() => onRemove(index)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" className={secondary} onClick={onAdd}>
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      </div>
    </div>
  );
}

export function PolicyPage() {
  const [siteId] = useCurrentSite();
  const { data: policy, isLoading, isError } = useCurrentPolicy(siteId);
  const { data: history = [], isLoading: historyLoading } = usePolicyHistory(siteId);
  const { data: publication } = usePublishedPolicy(siteId);
  const publishedPolicyId = publication?.policy?.id;
  const { data: acknowledgementReport } = usePolicyAcknowledgements(siteId, publishedPolicyId);
  const { data: catalog } = useEnterpriseNorms({ site_id: siteId });
  const { save, submit, validate, acknowledge } = usePolicyMutations(siteId);

  const [form, setForm] = useState<PolicyForm>({
    title: "Politique QHSE",
    presentation: "",
    mission: "",
    vision: "",
    values: [""],
    axes: [""],
    commitments: [""],
    environmental_policy: "",
    health_safety_policy: "",
    ethics_charter: "",
    effective_date: "",
    leadership_reviews: [],
    customer_orientation_reviews: [],
  });
  const [tab, setTab] = useState<"form" | "preview">("form");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [genCtx, setGenCtx] = useState<GenerationContext>({
    document_type_catalog_id: "",
    process_id: "",
  });
  const [showConfig, setShowConfig] = useState(false);
  const [pendingAction, setPendingAction] = useState<"draft" | "verify">("draft");
  const [doc, setDoc] = useState<{ id: string; code: string } | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [confirmState, setConfirmState] = useState<
    { kind: "new" } | { kind: "restore"; version: unknown } | null
  >(null);

  const valueRefs = useRef<Array<HTMLInputElement | null>>([]);
  const axisRefs = useRef<Array<HTMLInputElement | null>>([]);
  const commitmentRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hydratedKey = useRef<string | null>(null);
  const policyId = policy?.id != null ? String(policy.id) : null;
  const currentYear = new Date().getFullYear();
  const currentLeadershipReview = form.leadership_reviews.find(
    (review) => review.period_year === currentYear,
  );
  const currentCustomerOrientationReview = form.customer_orientation_reviews.find(
    (review) => review.period_year === currentYear,
  );

  const norms = catalog?.norms ?? [];
  const isQualityOnly =
    norms.length === 1 &&
    (String(norms[0]?.code).includes("9001") ||
      String(norms[0]?.name ?? norms[0]?.title ?? "")
        .toLowerCase()
        .includes("qualité"));
  const pageTitle = isQualityOnly ? "Politique Qualité" : form.title.trim() || "Politique QHSE";

  const axes = nonEmpty(form.axes);
  const commitments = nonEmpty(form.commitments);
  const required = [
    form.title.trim(),
    form.presentation.trim(),
    form.mission.trim(),
    form.vision.trim(),
  ];
  const isFormValid = required.every(Boolean);
  const quizStatements = [form.mission.trim(), form.presentation.trim(), commitments[0] ?? ""];
  const canPublishPolicy =
    isFormValid &&
    Boolean(form.effective_date) &&
    quizStatements.every(Boolean) &&
    new Set(quizStatements).size === 3;
  const filled =
    required.filter(Boolean).length + (axes.length > 0 ? 1 : 0) + (commitments.length > 0 ? 1 : 0);

  const rawStatus = String(policy?.status ?? "draft").toLowerCase();
  const statusKey =
    rawStatus.includes("valid") && !rawStatus.includes("revision")
      ? "validated"
      : rawStatus.includes("revision") || rawStatus.includes("validation")
        ? "en_revision"
        : "draft";
  const pending =
    save.isPending || submit.isPending || validate.isPending || acknowledge.isPending || docBusy;

  useEffect(() => {
    setQuizAnswers({});
  }, [publishedPolicyId]);

  useEffect(() => {
    if (!policy) {
      setIsHydrating(false);
      return;
    }
    const key = `${String(policy.id ?? "new")}@${String(policy.updated_at ?? "")}`;
    if (hydratedKey.current === key) return;
    hydratedKey.current = key;
    setIsHydrating(true);
    setForm({
      title: "Politique QHSE",
      presentation: String(policy.quality_policy ?? ""),
      mission: String(policy.mission ?? ""),
      vision: String(policy.vision ?? ""),
      values: asArray(policy.values, [""]),
      axes: asArray(policy.axes, [""]),
      commitments: asArray(policy.commitments, [""]),
      environmental_policy: String(policy.environmental_policy ?? ""),
      health_safety_policy: String(policy.health_safety_policy ?? ""),
      ethics_charter: String(policy.ethics_charter ?? ""),
      effective_date: String(policy.effective_date ?? "").slice(0, 10),
      leadership_reviews: normalizeLeadershipReviews(policy.leadership_reviews),
      customer_orientation_reviews: normalizeCustomerOrientationReviews(
        policy.customer_orientation_reviews,
      ),
    });
    setLastSavedAt(policy.updated_at ? new Date(String(policy.updated_at)) : null);
    setIsDirty(false);
    setIsHydrating(false);
  }, [policy]);

  const buildPayload = (): Record<string, unknown> => ({
    ...(siteId ? { site_id: Number(siteId) } : {}),
    mission: form.mission.trim(),
    vision: form.vision.trim(),
    values: nonEmpty(form.values),
    axes,
    commitments,
    quality_policy: form.presentation.trim(),
    environmental_policy: form.environmental_policy.trim(),
    health_safety_policy: form.health_safety_policy.trim(),
    ethics_charter: form.ethics_charter.trim(),
    effective_date: form.effective_date || null,
    leadership_reviews: form.leadership_reviews,
    customer_orientation_reviews: form.customer_orientation_reviews,
  });

  useEffect(() => {
    if (isHydrating || !isDirty || forceNew || !policyId || !form.mission.trim()) return;
    const payload = buildPayload();
    const timer = setTimeout(() => {
      void save
        .mutateAsync({ id: policyId, payload })
        .then(() => {
          setLastSavedAt(new Date());
          setIsDirty(false);
        })
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, isDirty, isHydrating, policyId, forceNew]);

  const touch = <K extends keyof PolicyForm>(key: K, value: PolicyForm[K]): void => {
    setForm((c) => ({ ...c, [key]: value }));
    setIsDirty(true);
  };
  const updateLeadershipAnswer = (
    promptId: string,
    patch: Partial<LeadershipChecklistAnswer>,
  ): void => {
    const review =
      currentLeadershipReview ??
      ({
        period_year: currentYear,
        reviewed_at: null,
        items: Object.fromEntries(
          LEADERSHIP_CHECKLIST_ITEMS.map(({ id }) => [
            id,
            { status: "", rationale: "", evidence: "" },
          ]),
        ),
      } as AnnualLeadershipReview);
    const nextReview: AnnualLeadershipReview = {
      ...review,
      reviewed_at: null,
      reviewed_by: null,
      items: {
        ...review.items,
        [promptId]: {
          status: patch.status ?? review.items[promptId]?.status ?? "",
          rationale: patch.rationale ?? review.items[promptId]?.rationale ?? "",
          evidence: patch.evidence ?? review.items[promptId]?.evidence ?? "",
        },
      },
    };
    touch(
      "leadership_reviews",
      [
        ...form.leadership_reviews.filter((item) => item.period_year !== currentYear),
        nextReview,
      ].sort((left, right) => right.period_year - left.period_year),
    );
  };
  const updateCustomerOrientationAnswer = (
    controlId: string,
    patch: Partial<LeadershipChecklistAnswer>,
  ): void => {
    const review =
      currentCustomerOrientationReview ??
      ({
        period_year: currentYear,
        reviewed_at: null,
        items: Object.fromEntries(
          CUSTOMER_ORIENTATION_ITEMS.map(({ id }) => [
            id,
            { status: "", rationale: "", evidence: "" },
          ]),
        ),
      } as CustomerOrientationReview);
    const nextReview: CustomerOrientationReview = {
      ...review,
      reviewed_at: null,
      reviewed_by: null,
      items: {
        ...review.items,
        [controlId]: {
          status: patch.status ?? review.items[controlId]?.status ?? "",
          rationale: patch.rationale ?? review.items[controlId]?.rationale ?? "",
          evidence: patch.evidence ?? review.items[controlId]?.evidence ?? "",
        },
      },
    };
    touch(
      "customer_orientation_reviews",
      [
        ...form.customer_orientation_reviews.filter((item) => item.period_year !== currentYear),
        nextReview,
      ].sort((left, right) => right.period_year - left.period_year),
    );
  };
  const completeCustomerOrientationReview = async (): Promise<void> => {
    if (!policyId || !currentCustomerOrientationReview) {
      toast.error("Enregistrez d’abord la politique et renseignez les trois contrôles.");
      return;
    }
    const complete = CUSTOMER_ORIENTATION_ITEMS.every((control) => {
      const answer = currentCustomerOrientationReview.items[control.id];
      if (!answer?.status) return false;
      return answer.rationale.trim().length > 0 && answer.evidence.trim().length > 0;
    });
    if (!complete) {
      toast.error("Chaque contrôle doit comporter une décision, une justification et une preuve.");
      return;
    }
    const updatedReviews = form.customer_orientation_reviews.map((review) =>
      review.period_year === currentYear
        ? { ...review, reviewed_at: new Date().toISOString() }
        : review,
    );
    try {
      await save.mutateAsync({
        id: policyId,
        payload: { ...buildPayload(), customer_orientation_reviews: updatedReviews },
      });
      setForm((current) => ({ ...current, customer_orientation_reviews: updatedReviews }));
      setIsDirty(false);
      toast.success(`Revue d’orientation client ${currentYear} enregistrée.`);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d’enregistrer la revue d’orientation client."));
    }
  };
  const completeLeadershipReview = async (): Promise<void> => {
    if (!policyId || !currentLeadershipReview) {
      toast.error("Enregistrez d’abord la politique et saisissez les réponses de l’audit.");
      return;
    }
    const complete = LEADERSHIP_CHECKLIST_ITEMS.every((prompt) => {
      const answer = currentLeadershipReview.items[prompt.id];
      if (!answer?.status) return false;
      return answer.rationale.trim().length > 0 || answer.evidence.trim().length > 0;
    });
    if (!complete) {
      toast.error("Chaque question doit avoir une réponse et une justification ou une preuve.");
      return;
    }
    const updatedReviews = form.leadership_reviews.map((review) =>
      review.period_year === currentYear
        ? { ...review, reviewed_at: new Date().toISOString() }
        : review,
    );
    try {
      await save.mutateAsync({
        id: policyId,
        payload: { ...buildPayload(), leadership_reviews: updatedReviews },
      });
      setForm((current) => ({ ...current, leadership_reviews: updatedReviews }));
      setIsDirty(false);
      toast.success(`Revue de leadership ${currentYear} enregistrée.`);
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d’enregistrer la revue annuelle."));
    }
  };
  const setItem = (key: ListKey, index: number, value: string): void => {
    setForm((c) => {
      const next = [...c[key]];
      next[index] = value;
      return { ...c, [key]: next };
    });
    setIsDirty(true);
  };
  const addItem = (key: ListKey, refs: { current: Array<HTMLInputElement | null> }): void => {
    setForm((c) => ({ ...c, [key]: ["", ...c[key]] }));
    setIsDirty(true);
    requestAnimationFrame(() => refs.current[0]?.focus());
  };
  const removeItem = (key: ListKey, index: number): void => {
    setForm((c) =>
      c[key].length <= 1 ? c : { ...c, [key]: c[key].filter((_, i) => i !== index) },
    );
    setIsDirty(true);
  };

  const saveForm = async (): Promise<boolean> => {
    if (!isFormValid) {
      toast.error("Renseignez le titre, la présentation, la mission et la vision.");
      return false;
    }
    try {
      await save.mutateAsync({
        id: forceNew ? undefined : (policyId ?? undefined),
        payload: buildPayload(),
      });
      setLastSavedAt(new Date());
      setIsDirty(false);
      setForceNew(false);
      toast.success("Politique QHSE enregistrée.");
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d'enregistrer la politique."));
      return false;
    }
  };

  const startNewPolicy = (): void => {
    setConfirmState({ kind: "new" });
  };

  const doStartNewPolicy = (): void => {
    hydratedKey.current = "new";
    setForm({
      title: "Nouvelle politique",
      presentation: "",
      mission: "",
      vision: "",
      values: [""],
      axes: [""],
      commitments: [""],
      environmental_policy: "",
      health_safety_policy: "",
      ethics_charter: "",
      effective_date: "",
      leadership_reviews: [],
      customer_orientation_reviews: [],
    });
    setForceNew(true);
    setTab("form");
    toast.info("Saisissez la nouvelle politique puis Enregistrez (nouvelle version majeure).");
  };

  const promoteHistoryToNewVersion = (version: unknown): void => {
    setConfirmState({ kind: "restore", version });
  };

  const doPromoteHistoryToNewVersion = (): void => {
    hydratedKey.current = "new";
    setForceNew(true);
    setTab("form");
    toast.info("Modifiez le formulaire puis Enregistrez pour créer une nouvelle version majeure");
  };

  const ensurePolicyId = async (): Promise<string | null> => {
    if (policyId && !forceNew) return policyId;
    if (!isFormValid) {
      toast.error(
        "Renseignez le titre, la présentation, la mission et la vision avant de continuer.",
      );
      return null;
    }
    try {
      const id = idOf(await save.mutateAsync({ payload: buildPayload() }));
      if (id) {
        setLastSavedAt(new Date());
        setIsDirty(false);
        setForceNew(false);
        return id;
      }
      toast.error("Sauvegarde impossible : identifiant introuvable.");
      return null;
    } catch (error) {
      toast.error(errorMessage(error, "Sauvegarde impossible."));
      return null;
    }
  };

  const workflow = async (kind: "submit" | "validate"): Promise<void> => {
    try {
      if (kind === "validate") {
        if (!policyId) {
          toast.error("Enregistrez d'abord la politique.");
          return;
        }
        await validate.mutateAsync(policyId);
        toast.success("Politique validée.");
      } else {
        const id = await ensurePolicyId();
        if (!id) return;
        await submit.mutateAsync(id);
        toast.success("Politique soumise à validation.");
      }
      setLastSavedAt(new Date());
    } catch (error) {
      toast.error(errorMessage(error, "Action impossible."));
    }
  };

  const submitPolicyAcknowledgement = async (): Promise<void> => {
    if (!publishedPolicyId || publication?.quiz.length !== 3) return;
    try {
      const result = await acknowledge.mutateAsync({
        policyId: String(publishedPolicyId),
        answers: quizAnswers,
      });
      if (result.quiz_passed) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Impossible d’enregistrer l’accusé de lecture."));
    }
  };

  const exportFile = async (kind: "pdf" | "docx"): Promise<void> => {
    const id = await ensurePolicyId();
    if (!id) return;
    setDocBusy(true);
    try {
      const blob = kind === "pdf" ? await exportPolicyPdf(id) : await exportPolicyDocx(id);
      downloadBlob(
        blob,
        `politique-qhse-${String(policy?.version ?? "courante").replace(/\s+/g, "-")}.${kind}`,
      );
      toast.success(kind === "pdf" ? "PDF exporté." : "Document Word exporté.");
    } catch (error) {
      toast.error(errorMessage(error, "Export impossible."));
    } finally {
      setDocBusy(false);
    }
  };

  const runGenerate = async (context: GenerationContext): Promise<void> => {
    const id = await ensurePolicyId();
    if (!id) return;
    setDocBusy(true);
    try {
      const info = docCodeOf(
        await generatePolicyDraft(id, {
          document_type_catalog_id: Number(context.document_type_catalog_id),
          process_id: context.process_id.trim() ? Number(context.process_id) : null,
        }),
      );
      if (info) {
        setDoc(info);
        toast.success(`Brouillon généré${info.code ? ` (${info.code})` : ""}.`);
        if (pendingAction === "verify") setShowVerify(true);
      } else toast.success("Brouillon généré.");
    } catch (error) {
      toast.error(errorMessage(error, "Génération impossible."));
    } finally {
      setDocBusy(false);
    }
  };

  const openDocFlow = (action: "draft" | "verify"): void => {
    if (!isFormValid) {
      toast.error(
        "Renseignez le titre, la présentation, la mission et la vision avant de continuer.",
      );
      return;
    }
    if (!genCtx.document_type_catalog_id.trim()) {
      setPendingAction(action);
      setShowConfig(true);
      return;
    }
    void runGenerate(genCtx);
  };

  const confirmVerify = async (): Promise<void> => {
    if (!doc) return;
    setDocBusy(true);
    try {
      await backendApi.request(`documents/${encodeURIComponent(doc.id)}/submit-verification`, {
        method: "POST",
      });
      toast.success("Document soumis pour vérification.");
      setShowVerify(false);
    } catch (error) {
      toast.error(errorMessage(error, "Soumission impossible."));
    } finally {
      setDocBusy(false);
    }
  };

  const ul = (title: string, items: string[], empty: string): string => {
    const list = nonEmpty(items)
      .map((v) => `<li>${para(v)}</li>`)
      .join("");
    return `<h2>${title}</h2>${list ? `<ul>${list}</ul>` : `<p>${empty}</p>`}`;
  };
  const previewHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#1e293b;line-height:1.6}h1{font-size:26px;border-bottom:3px solid #0f766e;padding-bottom:12px}h2{font-size:17px;color:#0f766e;margin-top:24px}ul{padding-left:20px}li{margin:4px 0}.meta{color:#64748b;font-size:13px}</style></head><body><h1>${esc(pageTitle)}</h1><p class="meta">Version ${esc(String(policy?.version ?? "1.0"))}${form.effective_date ? ` · Date d'effet : ${esc(form.effective_date)}` : ""}</p><h2>Présentation de la structure</h2><p>${form.presentation.trim() ? para(form.presentation) : "—"}</p><h2>Mission</h2><p>${form.mission.trim() ? para(form.mission) : "—"}</p><h2>Vision</h2><p>${form.vision.trim() ? para(form.vision) : "—"}</p>${ul("Valeurs", form.values, "Aucune valeur définie")}${ul("Axes stratégiques", form.axes, "Aucun axe défini")}${ul("Engagements", form.commitments, "Aucun engagement défini")}${form.environmental_policy.trim() ? `<h2>Politique environnementale</h2><p>${para(form.environmental_policy)}</p>` : ""}${form.health_safety_policy.trim() ? `<h2>Politique santé-sécurité</h2><p>${para(form.health_safety_policy)}</p>` : ""}${form.ethics_charter.trim() ? `<h2>Charte éthique</h2><p>${para(form.ethics_charter)}</p>` : ""}</body></html>`;

  const checks = [
    { label: "Titre", done: Boolean(form.title.trim()) },
    { label: "Présentation", done: Boolean(form.presentation.trim()) },
    { label: "Mission", done: Boolean(form.mission.trim()) },
    { label: "Vision", done: Boolean(form.vision.trim()) },
    { label: "Axes", done: axes.length > 0 },
    { label: "Engagements", done: commitments.length > 0 },
  ];
  const leadershipAnswered = LEADERSHIP_CHECKLIST_ITEMS.filter((prompt) => {
    const answer = currentLeadershipReview?.items[prompt.id];
    return Boolean(answer?.status && (answer.rationale.trim() || answer.evidence.trim()));
  }).length;
  const customerOrientationAnswered = CUSTOMER_ORIENTATION_ITEMS.filter((control) => {
    const answer = currentCustomerOrientationReview?.items[control.id];
    return Boolean(answer?.status && answer.rationale.trim() && answer.evidence.trim());
  }).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Header
        eyebrow="Leadership"
        title={pageTitle}
        description={
          isQualityOnly
            ? "Définissez votre politique qualité et vos orientations stratégiques."
            : "Définissez votre politique qualité, santé, sécurité et environnement."
        }
        icon={ShieldCheck}
      >
        <button type="button" className={secondary} disabled={pending} onClick={startNewPolicy}>
          <Plus className="h-4 w-4" /> Nouvelle politique
        </button>
        <button
          className={primary}
          disabled={pending || !isFormValid}
          onClick={() => void saveForm()}
        >
          <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </Header>
      {!siteId && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
        >
          Aucun site sélectionné — affichage basé sur le site de votre compte.
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          La politique ne peut pas être chargée depuis le serveur.
        </div>
      )}
      {publication?.policy && (
        <section className={`${card} space-y-4 p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">
                Lecture de la politique publiée · v{publication.policy.version}
              </h2>
              <p className={muted}>
                Validée électroniquement par{" "}
                {publication.policy.validated_by_name ??
                  `l’utilisateur #${String(publication.policy.validated_by_user_id ?? "inconnu")}`}{" "}
                le{" "}
                {formatDateFR(
                  publication.policy.validated_by_direction_at ?? publication.policy.effective_date,
                )}
              </p>
            </div>
            {publication.acknowledgement?.acknowledged_at ? (
              <span className={statusBadge("validated")}>
                Lecture et quiz confirmés le{" "}
                {formatDateFR(publication.acknowledgement.acknowledged_at)}
              </span>
            ) : (
              <span className={statusBadge("draft")}>Lecture à confirmer</span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-background p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Mission
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{publication.policy.mission}</p>
            </div>
            <div className="rounded-xl bg-background p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Politique qualité
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">
                {publication.policy.quality_policy}
              </p>
            </div>
          </div>
          {publication.acknowledgement?.acknowledged_at ? null : publication.quiz.length === 3 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold">
                Répondez aux trois questions à partir de la version publiée pour enregistrer votre
                accusé de lecture.
              </p>
              {publication.quiz.map((question) => (
                <fieldset key={question.id} className="rounded-xl border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">{question.prompt}</legend>
                  <div className="mt-2 space-y-2">
                    {question.options.map((option) => (
                      <label key={option} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`policy-quiz-${question.id}`}
                          value={option}
                          checked={quizAnswers[question.id] === option}
                          onChange={() =>
                            setQuizAnswers((current) => ({ ...current, [question.id]: option }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button
                type="button"
                className={primary}
                disabled={pending || publication.quiz.some((question) => !quizAnswers[question.id])}
                onClick={() => void submitPolicyAcknowledgement()}
              >
                <BadgeCheck className="h-4 w-4" />
                {acknowledge.isPending ? "Enregistrement…" : "Valider ma lecture"}
              </button>
              {publication.acknowledgement?.quiz_score != null && (
                <p role="status" className="text-sm text-muted-foreground">
                  Dernier résultat : {publication.acknowledgement.quiz_score} % —{" "}
                  {publication.acknowledgement.quiz_passed ? "réussi" : "à reprendre"}.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Le quiz ne peut pas être généré : la version publiée doit contenir une mission, une
              politique qualité et un engagement distinct.
            </p>
          )}
          {acknowledgementReport && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-bold">Suivi de diffusion nominatif</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {acknowledgementReport.acknowledged}/{acknowledgementReport.total} lectures
                confirmées · {acknowledgementReport.quiz_passed}/{acknowledgementReport.total} quiz
                réussis
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {acknowledgementReport.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-background p-2 text-sm"
                  >
                    <span>
                      {item.user?.name ?? item.user?.email ?? `Utilisateur #${item.user_id}`}
                    </span>
                    <span className={statusBadge(item.acknowledged_at ? "validated" : "draft")}>
                      {item.acknowledged_at ? "Lu" : "En attente"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <EthicsReportsPanel siteId={siteId} />
      <div className="flex gap-2">
        <button
          type="button"
          className={tab === "form" ? primary : secondary}
          onClick={() => setTab("form")}
        >
          Formulaire
        </button>
        <button
          type="button"
          className={tab === "preview" ? primary : secondary}
          disabled={!isFormValid}
          title={
            !isFormValid
              ? "Renseignez le titre, la présentation, la mission et la vision."
              : undefined
          }
          onClick={() => setTab("preview")}
        >
          <Eye className="h-4 w-4" /> Aperçu
        </button>
      </div>

      {tab === "preview" ? (
        <div className={`${card} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">{pageTitle}</h2>
              <p className={muted}>Document généré automatiquement</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={secondary} onClick={() => setTab("form")}>
                Retour
              </button>
              <button
                className={primary}
                disabled={pending || !isFormValid}
                onClick={() => openDocFlow("draft")}
              >
                <Plus className="h-4 w-4" /> {docBusy ? "Génération…" : "Générer brouillon"}
              </button>
              <button
                className={secondary}
                disabled={pending || !isFormValid}
                onClick={() => void exportFile("pdf")}
              >
                <FileDown className="h-4 w-4" /> Export PDF
              </button>
              <button
                className={secondary}
                disabled={pending || !isFormValid}
                onClick={() => void exportFile("docx")}
              >
                <FileDown className="h-4 w-4" /> Export Word
              </button>
              <button
                className={secondary}
                disabled={pending || !doc}
                title={!doc ? "Générez d'abord un brouillon documentaire." : undefined}
                onClick={() => openDocFlow("verify")}
              >
                <ShieldCheck className="h-4 w-4" /> Vérifier document
              </button>
            </div>
          </div>
          <iframe
            title={`Aperçu ${pageTitle}`}
            srcDoc={previewHtml}
            className="mt-4 h-[640px] w-full rounded-xl border border-border bg-background"
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Fiche de politique</h2>
                <p className={muted}>
                  Version actuelle : {String(policy?.version ?? "nouvelle fiche")}
                </p>
              </div>
              <span className={statusBadge(policy?.status ?? "draft")}>
                {statusKey === "validated"
                  ? "Validée"
                  : statusKey === "en_revision"
                    ? "En révision"
                    : "Brouillon"}
              </span>
            </div>
            {isLoading ? (
              <div aria-busy="true" aria-label="Chargement de la politique" className="py-6">
                <span className="sr-only">Chargement de la politique…</span>
                <div className="space-y-3" aria-hidden="true">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-20 animate-pulse rounded-xl bg-slate-200" />
                  <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-extrabold">
                    <span className="mr-2 text-primary">01</span>Informations principales
                  </h3>
                  <div className="space-y-4">
                    <TextField
                      label={
                        <>
                          Titre <span className="text-destructive">*</span>
                        </>
                      }
                      value={form.title}
                      placeholder="Ex : Politique QHSE 2026"
                      onChange={(v) => touch("title", v)}
                    />
                    <TextAreaField
                      label={
                        <>
                          Présentation de la structure <span className="text-destructive">*</span>
                        </>
                      }
                      value={form.presentation}
                      minHeight="min-h-24"
                      placeholder="Décrivez brièvement la structure…"
                      span
                      onChange={(v) => touch("presentation", v)}
                    />
                    <TextAreaField
                      label={
                        <>
                          Mission <span className="text-destructive">*</span>
                        </>
                      }
                      value={form.mission}
                      placeholder="Votre mission…"
                      span
                      onChange={(v) => touch("mission", v)}
                    />
                    <TextAreaField
                      label={
                        <>
                          Vision <span className="text-destructive">*</span>
                        </>
                      }
                      value={form.vision}
                      placeholder="Votre vision…"
                      span
                      onChange={(v) => touch("vision", v)}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-extrabold">
                    <span className="mr-2 text-primary">02</span>Axes stratégiques
                  </h3>
                  <DynamicList
                    label="Axes stratégiques"
                    items={form.axes}
                    placeholder="Axe"
                    addLabel="Ajouter un axe"
                    refs={axisRefs}
                    onAdd={() => addItem("axes", axisRefs)}
                    onChange={(i, v) => setItem("axes", i, v)}
                    onRemove={(i) => removeItem("axes", i)}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-extrabold">
                    <span className="mr-2 text-primary">03</span>Engagements
                  </h3>
                  <DynamicList
                    label="Engagements"
                    items={form.commitments}
                    placeholder="Engagement"
                    addLabel="Ajouter un engagement"
                    refs={commitmentRefs}
                    onAdd={() => addItem("commitments", commitmentRefs)}
                    onChange={(i, v) => setItem("commitments", i, v)}
                    onRemove={(i) => removeItem("commitments", i)}
                  />
                </div>
                <DynamicList
                  label="Valeurs"
                  items={form.values}
                  placeholder="Valeur"
                  addLabel="Ajouter une valeur"
                  refs={valueRefs}
                  onAdd={() => addItem("values", valueRefs)}
                  onChange={(i, v) => setItem("values", i, v)}
                  onRemove={(i) => removeItem("values", i)}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextAreaField
                    label="Politique environnementale"
                    value={form.environmental_policy}
                    onChange={(v) => touch("environmental_policy", v)}
                  />
                  <TextAreaField
                    label="Politique santé-sécurité"
                    value={form.health_safety_policy}
                    onChange={(v) => touch("health_safety_policy", v)}
                  />
                </div>
                <TextAreaField
                  label="Charte éthique"
                  value={form.ethics_charter}
                  minHeight="min-h-32"
                  placeholder="Décrivez les principes de conduite, de prévention des conflits d’intérêts et de traitement des alertes…"
                  span
                  onChange={(v) => touch("ethics_charter", v)}
                />
                <TextField
                  label="Date d'effet"
                  type="date"
                  value={form.effective_date}
                  onChange={(v) => touch("effective_date", v)}
                />
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className={`${card} p-5`}>
              <h2 className="font-display text-lg font-bold">Complétude</h2>
              <p className={muted}>{filled}/6 champs renseignés</p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((filled / 6) * 100)}%` }}
                />
              </div>
              <ul className="mt-4 space-y-1.5">
                {checks.map((item) => (
                  <li key={item.label} className="flex items-center gap-2 text-sm">
                    {item.done ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={item.done ? "font-semibold" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={`mt-3 text-xs ${muted}`}>
                Dernière sauvegarde : {lastSavedAt ? lastSavedAt.toLocaleString("fr-FR") : "Jamais"}
              </p>
            </div>
            <div className={`${card} p-5`}>
              <h2 className="font-display text-lg font-bold">Workflow de validation</h2>
              <p className={`mt-1 ${muted}`}>
                Version {String(policy?.version ?? "1.0")} · Circuit de validation.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {statusKey === "draft" && (
                  <button
                    className={secondary}
                    disabled={pending}
                    onClick={() => void workflow("submit")}
                  >
                    <PenLine className="h-4 w-4" />{" "}
                    {submit.isPending ? "Soumission…" : "Soumettre à validation"}
                  </button>
                )}
                {statusKey === "en_revision" && (
                  <button
                    className={primary}
                    disabled={pending || !canPublishPolicy}
                    title={
                      !canPublishPolicy
                        ? "Renseignez une date d’effet et trois énoncés distincts : mission, politique qualité et engagement."
                        : undefined
                    }
                    onClick={() => void workflow("validate")}
                  >
                    <BadgeCheck className="h-4 w-4" />{" "}
                    {validate.isPending ? "Validation…" : "Valider la politique"}
                  </button>
                )}
                {statusKey === "validated" && (
                  <span className={statusBadge("validated")}>
                    <Check className="h-3.5 w-3.5" /> Politique validée
                  </span>
                )}
              </div>
              {statusKey === "en_revision" && !canPublishPolicy && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                  La publication exige une date d’effet, une mission, une politique qualité et au
                  moins un engagement distinct pour le quiz de diffusion.
                </p>
              )}
            </div>
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-bold">Historique des versions</h2>
              </div>
              {historyLoading ? (
                <div aria-busy="true" aria-label="Chargement de l'historique" className="py-6">
                  <span className="sr-only">Chargement de l&apos;historique…</span>
                  <div className="space-y-2" aria-hidden="true">
                    <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
                    <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
                  </div>
                </div>
              ) : history.length === 0 ? (
                <p className={`mt-3 ${muted}`}>Aucune version archivée pour ce site.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {history.map((item, index) => (
                    <li
                      key={String(item.id ?? index)}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-background p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          Version {String(item.version ?? "—")}
                        </span>
                        <span className={statusBadge(item.status ?? "draft")}>
                          {String(item.status ?? "Brouillon")}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateFR(item.effective_date ?? item.created_at ?? item.updated_at)}
                      </span>
                      <button
                        type="button"
                        className={`${secondary} h-8 px-3 text-xs`}
                        onClick={() => promoteHistoryToNewVersion(item.version)}
                      >
                        Basculer en nouvelle version
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <section
              className={`${card} p-5 lg:col-span-2`}
              aria-labelledby="leadership-checklist-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="leadership-checklist-title" className="font-display text-lg font-bold">
                    Revue annuelle du leadership (5.1.1)
                  </h2>
                  <p className={`mt-1 ${muted}`}>
                    {leadershipAnswered}/12 points documentés pour {currentYear}. Chaque réponse
                    conserve une justification ou une preuve.
                  </p>
                  {currentLeadershipReview?.reviewed_at && (
                    <p className={`mt-1 text-xs ${muted}`}>
                      Revue signée le {formatDateFR(currentLeadershipReview.reviewed_at)}
                      {currentLeadershipReview.reviewed_by != null
                        ? ` par l’utilisateur #${String(currentLeadershipReview.reviewed_by)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondary}
                    disabled={!isFormValid || save.isPending}
                    onClick={() => void saveForm()}
                  >
                    <Save className="h-4 w-4" /> Enregistrer le brouillon
                  </button>
                  <button
                    type="button"
                    className={primary}
                    disabled={!policyId || !currentLeadershipReview || save.isPending}
                    onClick={() => void completeLeadershipReview()}
                  >
                    <BadgeCheck className="h-4 w-4" />
                    {currentLeadershipReview?.reviewed_at
                      ? "Revue annuelle enregistrée"
                      : "Terminer et enregistrer la revue"}
                  </button>
                </div>
              </div>
              {!policyId && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Enregistrez d’abord la politique pour associer la revue annuelle à sa version.
                </p>
              )}
              <div className="mt-4 space-y-3">
                {LEADERSHIP_CHECKLIST_ITEMS.map((prompt) => {
                  const answer = currentLeadershipReview?.items[prompt.id] ?? {
                    status: "" as const,
                    rationale: "",
                    evidence: "",
                  };
                  return (
                    <div
                      key={prompt.id}
                      className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[minmax(0,1.2fr)_180px_1fr_1fr]"
                    >
                      <p className="text-sm font-semibold">
                        <span className="mr-2 font-bold uppercase text-primary">{prompt.id}.</span>
                        {prompt.text}
                      </p>
                      <select
                        className={input}
                        aria-label={`Évaluation du point ${prompt.id}`}
                        value={answer.status}
                        onChange={(event) =>
                          updateLeadershipAnswer(prompt.id, {
                            status: event.target.value as LeadershipChecklistStatus,
                          })
                        }
                      >
                        <option value="">À évaluer</option>
                        <option value="demontre">Démontré</option>
                        <option value="ecart">Écart à traiter</option>
                        <option value="non_applicable">Non applicable</option>
                      </select>
                      <textarea
                        className={`${input} min-h-20`}
                        aria-label={`Justification du point ${prompt.id}`}
                        placeholder="Justification, décision ou écart…"
                        value={answer.rationale}
                        onChange={(event) =>
                          updateLeadershipAnswer(prompt.id, { rationale: event.target.value })
                        }
                      />
                      <textarea
                        className={`${input} min-h-20`}
                        aria-label={`Preuve du point ${prompt.id}`}
                        placeholder="Preuve vérifiable : compte rendu, KPI, document…"
                        value={answer.evidence}
                        onChange={(event) =>
                          updateLeadershipAnswer(prompt.id, { evidence: event.target.value })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {form.leadership_reviews.some((review) => review.period_year !== currentYear) && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-bold">Revues antérieures</h3>
                  <ul className="mt-2 space-y-2">
                    {form.leadership_reviews
                      .filter((review) => review.period_year !== currentYear)
                      .map((review) => (
                        <li
                          key={review.period_year}
                          className="flex items-center justify-between rounded-lg bg-background p-3 text-sm"
                        >
                          <span>Revue {review.period_year}</span>
                          <span className={statusBadge(review.reviewed_at ? "validated" : "draft")}>
                            {review.reviewed_at
                              ? `Enregistrée${review.reviewed_by != null ? ` · utilisateur #${String(review.reviewed_by)}` : ""}`
                              : "Brouillon"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
            <section
              className={`${card} p-5 lg:col-span-2`}
              aria-labelledby="customer-orientation-review-title"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="customer-orientation-review-title"
                    className="font-display text-lg font-bold"
                  >
                    Orientation client — revue annuelle (5.1.2)
                  </h2>
                  <p className={`mt-1 ${muted}`}>
                    {customerOrientationAnswered}/3 contrôles documentés pour {currentYear}. Chaque
                    contrôle exige une décision, une justification et une preuve vérifiable.
                  </p>
                  {currentCustomerOrientationReview?.reviewed_at && (
                    <p className={`mt-1 text-xs ${muted}`}>
                      Revue enregistrée le{" "}
                      {formatDateFR(currentCustomerOrientationReview.reviewed_at)}
                      {currentCustomerOrientationReview.reviewed_by != null
                        ? ` par l’utilisateur #${String(currentCustomerOrientationReview.reviewed_by)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={secondary}
                    disabled={!isFormValid || save.isPending}
                    onClick={() => void saveForm()}
                  >
                    <Save className="h-4 w-4" /> Enregistrer le brouillon
                  </button>
                  <button
                    type="button"
                    className={primary}
                    disabled={!policyId || !currentCustomerOrientationReview || save.isPending}
                    onClick={() => void completeCustomerOrientationReview()}
                  >
                    <BadgeCheck className="h-4 w-4" />
                    {currentCustomerOrientationReview?.reviewed_at
                      ? "Revue enregistrée"
                      : "Terminer et signer la revue"}
                  </button>
                </div>
              </div>
              {!policyId && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Enregistrez d’abord la politique pour associer la revue à son historique.
                </p>
              )}
              <div className="mt-4 space-y-3">
                {CUSTOMER_ORIENTATION_ITEMS.map((control) => {
                  const answer = currentCustomerOrientationReview?.items[control.id] ?? {
                    status: "" as const,
                    rationale: "",
                    evidence: "",
                  };
                  return (
                    <div
                      key={control.id}
                      className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[minmax(0,1.2fr)_180px_1fr_1fr]"
                    >
                      <p className="text-sm font-semibold">{control.text}</p>
                      <select
                        className={input}
                        aria-label={`Évaluation du contrôle ${control.id}`}
                        value={answer.status}
                        onChange={(event) =>
                          updateCustomerOrientationAnswer(control.id, {
                            status: event.target.value as LeadershipChecklistStatus,
                          })
                        }
                      >
                        <option value="">À évaluer</option>
                        <option value="demontre">Démontré</option>
                        <option value="ecart">Écart à traiter</option>
                        <option value="non_applicable">Non applicable</option>
                      </select>
                      <textarea
                        className={`${input} min-h-20`}
                        aria-label={`Justification du contrôle ${control.id}`}
                        placeholder="Décision, analyse ou écart…"
                        value={answer.rationale}
                        onChange={(event) =>
                          updateCustomerOrientationAnswer(control.id, {
                            rationale: event.target.value,
                          })
                        }
                      />
                      <textarea
                        className={`${input} min-h-20`}
                        aria-label={`Preuve du contrôle ${control.id}`}
                        placeholder="Référence vérifiable : exigence, risque, KPI, réclamation, compte rendu…"
                        value={answer.evidence}
                        onChange={(event) =>
                          updateCustomerOrientationAnswer(control.id, {
                            evidence: event.target.value,
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {form.customer_orientation_reviews.some(
                (review) => review.period_year !== currentYear,
              ) && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-bold">Revues antérieures</h3>
                  <ul className="mt-2 space-y-2">
                    {form.customer_orientation_reviews
                      .filter((review) => review.period_year !== currentYear)
                      .map((review) => (
                        <li
                          key={review.period_year}
                          className="flex items-center justify-between rounded-lg bg-background p-3 text-sm"
                        >
                          <span>Revue {review.period_year}</span>
                          <span className={statusBadge(review.reviewed_at ? "validated" : "draft")}>
                            {review.reviewed_at
                              ? `Enregistrée${review.reviewed_by != null ? ` · utilisateur #${String(review.reviewed_by)}` : ""}`
                              : "Brouillon"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 sm:p-5`}>
            <h2 className="font-display text-lg font-bold">Configuration du document</h2>
            <p className={`mt-1 ${muted}`}>Type de document et processus associés.</p>
            <div className="mt-4 space-y-4">
              <div>
                <Label>Type de document (catalogue) *</Label>
                <input
                  className={input}
                  inputMode="numeric"
                  placeholder="Ex : 12"
                  value={genCtx.document_type_catalog_id}
                  onChange={(e) =>
                    setGenCtx((c) => ({ ...c, document_type_catalog_id: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Processus (id, optionnel)</Label>
                <input
                  className={input}
                  inputMode="numeric"
                  placeholder="Ex : 4"
                  value={genCtx.process_id}
                  onChange={(e) => setGenCtx((c) => ({ ...c, process_id: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={() => setShowConfig(false)}>
                Annuler
              </button>
              <button
                className={primary}
                disabled={pending || !genCtx.document_type_catalog_id.trim()}
                onClick={() => {
                  setShowConfig(false);
                  void runGenerate(genCtx);
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {showVerify && doc && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className={`${card} max-h-[90dvh] w-full max-w-md overflow-y-auto p-4 sm:p-5`}>
            <h2 className="font-display text-lg font-bold">Soumettre pour vérification</h2>
            <p className={`mt-1 ${muted}`}>Code du document</p>
            <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm font-bold text-sky-700">
              {doc.code || "—"}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className={secondary} onClick={() => setShowVerify(false)}>
                Annuler
              </button>
              <button className={primary} disabled={docBusy} onClick={() => void confirmVerify()}>
                <ShieldCheck className="h-4 w-4" /> {docBusy ? "Envoi…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.kind === "restore"
            ? `Créer une nouvelle version à partir de la v${String(confirmState.version ?? "—")} ?`
            : "Créer une nouvelle politique ?"
        }
        description={
          confirmState?.kind === "restore"
            ? "Modifiez le formulaire puis Enregistrez pour créer une nouvelle version majeure."
            : "La version courante sera archivée à la prochaine sauvegarde."
        }
        confirmLabel="Créer"
        onConfirm={() => {
          if (confirmState?.kind === "restore") doPromoteHistoryToNewVersion();
          else doStartNewPolicy();
          setConfirmState(null);
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
