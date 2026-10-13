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
  usePolicyHistory,
  usePolicyMutations,
} from "@/integrations/backend/leadership";
import { useEnterpriseNorms } from "@/integrations/backend/norms";
import { ConfirmDialog } from "../ConfirmDialog";
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
  effective_date: string;
};
type ListKey = "values" | "axes" | "commitments";
type GenerationContext = { document_type_catalog_id: string; process_id: string };

const asArray = (value: unknown, fallback: string[] = []): string[] =>
  Array.isArray(value) && value.length > 0 ? value.map((item) => String(item)) : fallback;
const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const para = (value: string): string => esc(value).replace(/\n/g, "<br>");
const nonEmpty = (items: string[]): string[] => items.map((v) => v.trim()).filter(Boolean);

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
  const { data: catalog } = useEnterpriseNorms({ site_id: siteId });
  const { save, submit, validate } = usePolicyMutations(siteId);

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
    effective_date: "",
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
  const [confirmState, setConfirmState] = useState<
    { kind: "new" } | { kind: "restore"; version: unknown } | null
  >(null);

  const valueRefs = useRef<Array<HTMLInputElement | null>>([]);
  const axisRefs = useRef<Array<HTMLInputElement | null>>([]);
  const commitmentRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hydratedKey = useRef<string | null>(null);
  const policyId = policy?.id != null ? String(policy.id) : null;

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
  const filled =
    required.filter(Boolean).length + (axes.length > 0 ? 1 : 0) + (commitments.length > 0 ? 1 : 0);

  const rawStatus = String(policy?.status ?? "draft").toLowerCase();
  const statusKey =
    rawStatus.includes("valid") && !rawStatus.includes("revision")
      ? "validated"
      : rawStatus.includes("revision") || rawStatus.includes("validation")
        ? "en_revision"
        : "draft";
  const pending = save.isPending || submit.isPending || validate.isPending || docBusy;

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
      effective_date: String(policy.effective_date ?? "").slice(0, 10),
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
    effective_date: form.effective_date || null,
  });

  useEffect(() => {
    if (isHydrating || !isDirty || forceNew || !policyId || !form.mission.trim()) return;
    const payload = buildPayload();
    const timer = setTimeout(() => {
      void backendApi
        .request(`qhse-policies/${encodeURIComponent(policyId)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
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
      effective_date: "",
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
  const previewHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#1e293b;line-height:1.6}h1{font-size:26px;border-bottom:3px solid #0f766e;padding-bottom:12px}h2{font-size:17px;color:#0f766e;margin-top:24px}ul{padding-left:20px}li{margin:4px 0}.meta{color:#64748b;font-size:13px}</style></head><body><h1>${esc(pageTitle)}</h1><p class="meta">Version ${esc(String(policy?.version ?? "1.0"))}${form.effective_date ? ` · Date d'effet : ${esc(form.effective_date)}` : ""}</p><h2>Présentation de la structure</h2><p>${form.presentation.trim() ? para(form.presentation) : "—"}</p><h2>Mission</h2><p>${form.mission.trim() ? para(form.mission) : "—"}</p><h2>Vision</h2><p>${form.vision.trim() ? para(form.vision) : "—"}</p>${ul("Valeurs", form.values, "Aucune valeur définie")}${ul("Axes stratégiques", form.axes, "Aucun axe défini")}${ul("Engagements", form.commitments, "Aucun engagement défini")}${form.environmental_policy.trim() ? `<h2>Politique environnementale</h2><p>${para(form.environmental_policy)}</p>` : ""}${form.health_safety_policy.trim() ? `<h2>Politique santé-sécurité</h2><p>${para(form.health_safety_policy)}</p>` : ""}</body></html>`;

  const checks = [
    { label: "Titre", done: Boolean(form.title.trim()) },
    { label: "Présentation", done: Boolean(form.presentation.trim()) },
    { label: "Mission", done: Boolean(form.mission.trim()) },
    { label: "Vision", done: Boolean(form.vision.trim()) },
    { label: "Axes", done: axes.length > 0 },
    { label: "Engagements", done: commitments.length > 0 },
  ];

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
                    disabled={pending}
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
