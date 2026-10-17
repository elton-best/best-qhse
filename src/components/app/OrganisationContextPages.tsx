import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  Compass,
  Edit3,
  FileText,
  GitBranch,
  Globe2,
  Handshake,
  Leaf,
  Mail,
  MapPin,
  Plus,
  Save,
  Scale,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCurrentSite } from "@/hooks/use-workspace";
import { backendApi } from "@/integrations/backend/client";
import { DocumentActions } from "@/components/app/DocumentActions";
import {
  useCartography,
  useContextMutations,
  useContextReviews,
  useContexts,
  useProcesses,
  useScope,
  useScopeMutations,
  useStakeholderMutations,
  useStakeholders,
} from "@/integrations/backend/context";
import {
  buildSwotPestelPayload,
  countIncompleteClimateAssessments,
  emptyIssuesForm,
  EXTERNAL_CRITERIA,
  INTERNAL_CRITERIA,
  issuesFormFromRecord,
  newContextIssue,
  type ContextIssue,
  type IssueCriterionData,
  type SwotPestelIssuesForm,
} from "@/integrations/backend/context";

const card = "rounded-2xl border border-border bg-card";
const input =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-dark`;
const secondary = `${button} border border-border bg-card hover:border-primary hover:text-primary`;
const muted = "text-sm text-muted-foreground";

function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Building2;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <div className="mt-1 shrink-0 rounded-2xl bg-primary-soft p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
          <h1 className="mt-1 min-w-0 break-words font-display text-xl font-extrabold text-foreground sm:text-2xl md:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children && (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap lg:justify-end">
          {children}
        </div>
      )}
    </div>
  );
}

function SiteRequired() {
  return (
    <div className={`${card} mx-auto max-w-3xl p-8 text-center`}>
      <MapPin className="mx-auto h-9 w-9 text-primary" />
      <h2 className="mt-3 font-display text-lg font-bold">Sélectionnez un site</h2>
      <p className={`mt-2 ${muted}`}>
        Les éléments du contexte sont rattachés au site courant. Sélectionnez un site dans la barre
        supérieure pour consulter ou modifier ces données.
      </p>
    </div>
  );
}

const CONTEXT_LINKS = [
  ["contexte", "Compréhension de l'organisme"],
  ["parties-interessees", "Parties intéressées"],
  ["perimetre", "Domaine d'application"],
  ["processus", "Système de management"],
] as const;

function ContextNavigation({ active }: { active: (typeof CONTEXT_LINKS)[number][0] }) {
  void active;
  // La navigation entre les quatre pages appartient à la sidebar globale.
  return null;
}

function EmptyState({
  title,
  description,
  onCreate,
  label = "Commencer",
}: {
  title: string;
  description: string;
  onCreate?: () => void;
  label?: string;
}) {
  return (
    <div className={`${card} border-dashed p-10 text-center`}>
      <Sparkles className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-display text-lg font-bold">{title}</h2>
      <p className={`mx-auto mt-2 max-w-lg ${muted}`}>{description}</p>
      {onCreate && (
        <button className={`${primary} mt-5`} onClick={onCreate}>
          <Plus className="h-4 w-4" /> {label}
        </button>
      )}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}
function Stat({
  value,
  label,
  tone = "text-primary",
}: {
  value: string | number;
  label: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-background p-3">
      <p className={`font-display text-2xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const INTERNAL_LABELS: Record<string, string> = {
  culture: "Culture",
  values: "Valeurs",
  performance: "Performance",
  knowledge: "Connaissance",
  other_internal: "Autres enjeux internes",
};

const EXTERNAL_LABELS: Record<string, string> = {
  political: "Politique",
  economic: "Économique",
  social: "Social",
  technological: "Technologique",
  environmental: "Environnemental",
  legal: "Légal",
};

type IssueTab = "internal" | "external" | "major" | "summary";

function issueTotal(form: SwotPestelIssuesForm, category: "internal" | "external") {
  return Object.values(form[category]).reduce(
    (total, item) =>
      total +
      item.favorable.filter((issue) => issue.text.trim()).length +
      item.unfavorable.filter((issue) => issue.text.trim()).length,
    0,
  );
}

function IssueListEditor({
  title,
  values,
  tone,
  placeholder,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  values: ContextIssue[];
  tone: "success" | "danger" | "info" | "warning";
  placeholder: string;
  onAdd: () => void;
  onChange: (index: number, patch: Partial<ContextIssue>) => void;
  onRemove: (index: number) => void;
}) {
  const styles =
    tone === "success"
      ? {
          frame: "border-emerald-200 bg-emerald-50/70",
          header: "bg-gradient-to-r from-emerald-700 to-emerald-500",
          add: "bg-white/20 text-white hover:bg-white hover:text-emerald-800",
          chip: "border-emerald-200 focus-within:border-emerald-500 focus-within:ring-emerald-500/20",
          rank: "bg-emerald-600/10 text-emerald-800",
        }
      : tone === "danger"
        ? {
            frame: "border-rose-200 bg-rose-50/70",
            header: "bg-gradient-to-r from-rose-700 to-rose-500",
            add: "bg-white/20 text-white hover:bg-white hover:text-rose-800",
            chip: "border-rose-200 focus-within:border-rose-500 focus-within:ring-rose-500/20",
            rank: "bg-rose-600/10 text-rose-800",
          }
        : tone === "info"
          ? {
              frame: "border-sky-200 bg-sky-50/70",
              header: "bg-gradient-to-r from-sky-700 to-sky-500",
              add: "bg-white/20 text-white hover:bg-white hover:text-sky-800",
              chip: "border-sky-200 focus-within:border-sky-500 focus-within:ring-sky-500/20",
              rank: "bg-sky-600/10 text-sky-800",
            }
          : {
              frame: "border-amber-200 bg-amber-50/70",
              header: "bg-gradient-to-r from-amber-600 to-amber-500",
              add: "bg-white/20 text-white hover:bg-white hover:text-amber-800",
              chip: "border-amber-200 focus-within:border-amber-500 focus-within:ring-amber-500/20",
              rank: "bg-amber-600/10 text-amber-800",
            };
  const filled = values.filter((issue) => issue.text.trim()).length;
  return (
    <div className={`overflow-hidden rounded-xl border ${styles.frame}`}>
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${styles.header}`}>
        <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
          <span className="truncate">{title}</span>
          <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-extrabold text-white">
            {filled}/{values.length}
          </span>
        </p>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition ${styles.add}`}
          onClick={onAdd}
          aria-label={`Ajouter : ${title}`}
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
      <div className="space-y-2 p-3">
        {values.map((item, index) => (
          <div key={item.id || index} className="space-y-2">
            <div
              className={`flex items-start gap-1.5 rounded-xl border bg-card p-1.5 shadow-sm transition focus-within:ring-2 ${styles.chip}`}
            >
              <span
                className={`mt-1.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${styles.rank}`}
              >
                {index + 1}
              </span>
              <textarea
                className="min-h-10 flex-1 resize-y border-0 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70"
                value={item.text}
                onChange={(event) => onChange(index, { text: event.target.value })}
                placeholder={placeholder}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRemove(index)}
                aria-label="Supprimer l'élément"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 pl-8 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Le changement climatique est-il pertinent pour cet enjeu ?
                <select
                  className={`${input} mt-1`}
                  value={
                    item.climate_change_relevant === null
                      ? ""
                      : item.climate_change_relevant
                        ? "yes"
                        : "no"
                  }
                  onChange={(event) =>
                    onChange(index, {
                      climate_change_relevant:
                        event.target.value === "" ? null : event.target.value === "yes",
                      ...(event.target.value === "no" ? {} : { climate_change_rationale: "" }),
                    })
                  }
                >
                  <option value="">À déterminer</option>
                  <option value="yes">Oui</option>
                  <option value="no">Non</option>
                </select>
              </label>
              {item.climate_change_relevant === false && (
                <label className="text-xs font-semibold text-muted-foreground">
                  Justification de la non-pertinence
                  <textarea
                    className={`${input} mt-1 min-h-10`}
                    value={item.climate_change_rationale}
                    onChange={(event) =>
                      onChange(index, { climate_change_rationale: event.target.value })
                    }
                    placeholder="Expliquez la décision…"
                  />
                </label>
              )}
            </div>
          </div>
        ))}
        {values.length === 0 && (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border bg-card/70 px-3 py-5 text-center transition hover:border-primary hover:bg-primary/5"
          >
            <span className="rounded-full bg-primary/10 p-2 text-primary">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold">Aucun élément pour le moment</span>
            <span className="text-xs text-muted-foreground">
              Sélectionnez « Ajouter » pour saisir votre premier facteur.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function CriterionCard({
  title,
  criterion,
  data,
  onChange,
  onAdd,
  onRemove,
}: {
  title: string;
  criterion: string;
  data: IssueCriterionData;
  onChange: (
    criterion: string,
    polarity: "favorable" | "unfavorable",
    index: number,
    patch: Partial<ContextIssue>,
  ) => void;
  onAdd: (criterion: string, polarity: "favorable" | "unfavorable") => void;
  onRemove: (criterion: string, polarity: "favorable" | "unfavorable", index: number) => void;
}) {
  const update = (
    polarity: "favorable" | "unfavorable",
    index: number,
    patch: Partial<ContextIssue>,
  ) => onChange(criterion, polarity, index, patch);
  const add = (polarity: "favorable" | "unfavorable") => onAdd(criterion, polarity);
  const remove = (polarity: "favorable" | "unfavorable", index: number) =>
    onRemove(criterion, polarity, index);
  const total = data.favorable.length + data.unfavorable.length;
  return (
    <article className={`${card} overflow-hidden`}>
      <div className="flex min-w-0 items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-3">
        <span className="shrink-0 rounded-xl bg-primary/10 p-2 text-primary">
          <Globe2 className="h-4 w-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display font-bold">{title}</h3>
        <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {total} élément{total > 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 bg-muted/20 p-3 md:grid-cols-2">
        <IssueListEditor
          title="Favorable"
          values={data.favorable}
          tone="success"
          placeholder="Décrivez un facteur favorable…"
          onAdd={() => add("favorable")}
          onChange={(index, patch) => update("favorable", index, patch)}
          onRemove={(index) => remove("favorable", index)}
        />
        <IssueListEditor
          title="Défavorable"
          values={data.unfavorable}
          tone="danger"
          placeholder="Décrivez un facteur défavorable…"
          onAdd={() => add("unfavorable")}
          onChange={(index, patch) => update("unfavorable", index, patch)}
          onRemove={(index) => remove("unfavorable", index)}
        />
      </div>
    </article>
  );
}

function StructuredContextAnalysis({
  value,
  onChange,
  onSave,
}: {
  value: SwotPestelIssuesForm;
  onChange: (next: SwotPestelIssuesForm) => void;
  onSave: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<IssueTab>("internal");
  const [savedTab, setSavedTab] = useState<IssueTab>();
  const addMajor = () => change({ ...value, majorIssues: [...value.majorIssues, ""] });
  const tabs: [IssueTab, string][] = [
    ["internal", "Enjeux internes"],
    ["external", "Enjeux externes"],
    ["major", "Enjeux majeurs"],
    ["summary", "Synthèse"],
  ];
  const tabIndex = tabs.findIndex(([key]) => key === tab);
  const move = async (target: IssueTab) => {
    const targetIndex = tabs.findIndex(([key]) => key === target);
    if (targetIndex > tabIndex + 1) return;
    if (targetIndex > tabIndex && savedTab !== tab) {
      if (!(await onSave())) return;
      setSavedTab(tab);
    }
    setTab(target);
  };
  const change = (next: SwotPestelIssuesForm) => {
    setSavedTab(undefined);
    onChange(next);
  };
  const setCriterionIssues = (
    category: "internal" | "external",
    criterion: string,
    polarity: "favorable" | "unfavorable",
    issues: ContextIssue[],
  ) => {
    const current = value[category][criterion] ?? { favorable: [], unfavorable: [] };
    change({
      ...value,
      [category]: { ...value[category], [criterion]: { ...current, [polarity]: issues } },
    });
  };
  const updateIssue = (
    category: "internal" | "external",
    criterion: string,
    polarity: "favorable" | "unfavorable",
    index: number,
    patch: Partial<ContextIssue>,
  ) => {
    const issues = [...(value[category][criterion]?.[polarity] ?? [])];
    issues[index] = { ...issues[index]!, ...patch };
    setCriterionIssues(category, criterion, polarity, issues);
  };
  const addIssue = (
    category: "internal" | "external",
    criterion: string,
    polarity: "favorable" | "unfavorable",
  ) =>
    setCriterionIssues(category, criterion, polarity, [
      ...(value[category][criterion]?.[polarity] ?? []),
      newContextIssue(),
    ]);
  const removeIssue = (
    category: "internal" | "external",
    criterion: string,
    polarity: "favorable" | "unfavorable",
    index: number,
  ) =>
    setCriterionIssues(
      category,
      criterion,
      polarity,
      (value[category][criterion]?.[polarity] ?? []).filter((_, itemIndex) => itemIndex !== index),
    );
  return (
    <div className={`${card} p-4`}>
      <div>
        <p className="font-display text-lg font-bold">Analyse SWOT / PESTEL</p>
        <p className={muted}>
          Complétez chaque étape et enregistrez-la avant de passer à la suivante.
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            type="button"
            disabled={index > tabIndex + 1}
            className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${tab === key ? "border-primary bg-primary text-primary-foreground" : index < tabIndex || savedTab === key ? "border-success/40 bg-success/5 text-success" : "border-border text-muted-foreground hover:border-primary"}`}
            onClick={() => void move(key)}
          >
            <span className="block text-[10px] uppercase opacity-70">Étape {index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      {tab === "internal" && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {INTERNAL_CRITERIA.map((criterion) => (
            <CriterionCard
              key={criterion}
              title={INTERNAL_LABELS[criterion] ?? criterion}
              criterion={criterion}
              data={value.internal[criterion] ?? { favorable: [], unfavorable: [] }}
              onChange={(key, polarity, index, patch) =>
                updateIssue("internal", key, polarity, index, patch)
              }
              onAdd={(key, polarity) => addIssue("internal", key, polarity)}
              onRemove={(key, polarity, index) => removeIssue("internal", key, polarity, index)}
            />
          ))}
        </div>
      )}
      {tab === "external" && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {EXTERNAL_CRITERIA.map((criterion) => (
            <CriterionCard
              key={criterion}
              title={EXTERNAL_LABELS[criterion] ?? criterion}
              criterion={criterion}
              data={value.external[criterion] ?? { favorable: [], unfavorable: [] }}
              onChange={(key, polarity, index, patch) =>
                updateIssue("external", key, polarity, index, patch)
              }
              onAdd={(key, polarity) => addIssue("external", key, polarity)}
              onRemove={(key, polarity, index) => removeIssue("external", key, polarity, index)}
            />
          ))}
        </div>
      )}
      {tab === "major" && (
        <div className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-display font-bold">Enjeux majeurs stratégiques</h3>
              <p className={`${muted} break-words`}>
                Retenez les enjeux qui doivent alimenter les risques, objectifs et plans d'action.
              </p>
            </div>
            <button
              type="button"
              className={`${secondary} w-full shrink-0 sm:w-auto`}
              onClick={addMajor}
            >
              <Plus className="h-4 w-4" /> Ajouter un enjeu
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {value.majorIssues.map((item, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="mt-3 text-xs font-bold text-muted-foreground">{index + 1}.</span>
                <textarea
                  className={`${input} min-h-20`}
                  value={item}
                  onChange={(event) =>
                    change({
                      ...value,
                      majorIssues: value.majorIssues.map((current, itemIndex) =>
                        itemIndex === index ? event.target.value : current,
                      ),
                    })
                  }
                  placeholder="Décrivez un enjeu majeur…"
                />
                <button
                  type="button"
                  className="mt-2 rounded-lg p-2 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    change({
                      ...value,
                      majorIssues: value.majorIssues.filter((_, itemIndex) => itemIndex !== index),
                    })
                  }
                  aria-label="Supprimer l'enjeu majeur"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {value.majorIssues.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucun enjeu majeur identifié.
              </p>
            )}
          </div>
        </div>
      )}
      {tab === "summary" && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Synthèse des enjeux internes</Label>
            <textarea
              className={`${input} min-h-32`}
              value={value.synthesisInternal}
              onChange={(event) => change({ ...value, synthesisInternal: event.target.value })}
              placeholder="Résumez les forces, faiblesses et facteurs internes…"
            />
          </div>
          <div>
            <Label>Synthèse des enjeux externes</Label>
            <textarea
              className={`${input} min-h-32`}
              value={value.synthesisExternal}
              onChange={(event) => change({ ...value, synthesisExternal: event.target.value })}
              placeholder="Résumez les opportunités, menaces et facteurs externes…"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:col-span-2">
            <Stat value={issueTotal(value, "internal")} label="Facteurs internes" />
            <Stat
              value={issueTotal(value, "external")}
              label="Facteurs externes"
              tone="text-sky-600"
            />
            <Stat
              value={value.majorIssues.filter(Boolean).length}
              label="Enjeux majeurs"
              tone="text-amber-600"
            />
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className={`${secondary} w-full sm:w-auto`}
          disabled={tabIndex <= 0}
          onClick={() => void move(tabs[tabIndex - 1]![0])}
        >
          Précédent
        </button>
        {tabIndex < tabs.length - 1 ? (
          <button
            type="button"
            className={`${primary} w-full sm:w-auto`}
            onClick={() => void move(tabs[tabIndex + 1]![0])}
          >
            Enregistrer et continuer <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className={`${primary} w-full sm:w-auto`}
            onClick={() => void onSave()}
          >
            <Save className="h-4 w-4" /> Enregistrer la synthèse
          </button>
        )}
      </div>
    </div>
  );
}

export function ContextOrganisationPage() {
  const [siteId] = useCurrentSite();
  const { data = [], isLoading, isError } = useContexts(siteId);
  const { save, review } = useContextMutations(siteId);
  const { data: stakeholders = [] } = useStakeholders(siteId);
  const { data: scopes = [] } = useScope(siteId);
  const { data: cartography = [] } = useCartography(siteId);
  const [issuesForm, setIssuesForm] = useState<SwotPestelIssuesForm>(() => emptyIssuesForm());
  const [legacyPestel, setLegacyPestel] = useState<Record<string, string>>({});
  const existing = data[0] as Record<string, unknown> | undefined;
  const { data: contextReviews = [] } = useContextReviews(
    existing?.["id"] ? String(existing["id"]) : undefined,
  );
  const [reviewFrequencyMonths, setReviewFrequencyMonths] = useState("12");
  const [reviewSummary, setReviewSummary] = useState("");

  // Profil entreprise (lecture seule) : auth/me -> enterprises/{id}.
  // Affiche la vue d'ensemble de l'organisme sans passer par la page Paramètres.
  const entrepriseQuery = useQuery({
    queryKey: ["organisation-entreprise"],
    queryFn: async () => {
      const me = await backendApi.request<Record<string, unknown>>("auth/me");
      const user = (me["user"] ?? me) as Record<string, unknown>;
      const enterpriseId =
        user["enterprise_id"] ??
        (user["enterprise"] as Record<string, unknown> | undefined)?.["id"];
      if (enterpriseId === undefined || enterpriseId === null || enterpriseId === "")
        return {
          user,
          enterprise: null as Record<string, unknown> | null,
          sites: [] as Record<string, unknown>[],
        };
      const raw = await backendApi.request<unknown>(`enterprises/${enterpriseId}`);
      const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const node = (root["data"] ?? root) as Record<string, unknown>;
      const attributes = (node["attributes"] ?? node) as Record<string, unknown>;
      const relationships = (node["relationships"] ?? {}) as Record<string, unknown>;
      const sites = Array.isArray(relationships["sites"])
        ? (relationships["sites"] as Record<string, unknown>[])
        : [];
      return { user, enterprise: { id: node["id"] ?? enterpriseId, ...attributes }, sites };
    },
    staleTime: 60_000,
  });
  const entreprise = entrepriseQuery.data?.enterprise;
  const entrepriseSites = useMemo(
    () =>
      (entrepriseQuery.data?.sites ?? []).map((site) => {
        const node = (site["attributes"] ?? site) as Record<string, unknown>;
        return { id: String(site["id"] ?? node["id"] ?? ""), name: String(node["name"] ?? "Site") };
      }),
    [entrepriseQuery.data],
  );

  const hasText = (value: unknown) => String(value ?? "").trim() !== "";

  const internalCount = issueTotal(issuesForm, "internal");
  const externalCount = issueTotal(issuesForm, "external");
  const majorCount = issuesForm.majorIssues.filter(Boolean).length;
  const incompleteClimateAssessments = countIncompleteClimateAssessments(issuesForm);
  const synthesisDone =
    (hasText(issuesForm.synthesisInternal) ? 1 : 0) +
    (hasText(issuesForm.synthesisExternal) ? 1 : 0);
  const pestelDone = EXTERNAL_CRITERIA.filter((key) => {
    const criterion = issuesForm.external[key];
    return Boolean(
      criterion?.favorable.some((issue) => issue.text.trim()) ||
      criterion?.unfavorable.some((issue) => issue.text.trim()),
    );
  }).length;
  const stakeholderHigh = stakeholders.filter((item) => item["relevance_degree"] === "high").length;
  const scope = scopes[0] as Record<string, unknown> | undefined;
  const nextReviewAt = String(existing?.["next_review_at"] ?? "").slice(0, 10);
  const nextReviewTimestamp = nextReviewAt ? Date.parse(`${nextReviewAt}T00:00:00`) : Number.NaN;
  const todayTimestamp = new Date().setHours(0, 0, 0, 0);
  const reviewIsOverdue =
    Number.isFinite(nextReviewTimestamp) && nextReviewTimestamp < todayTimestamp;
  const scopeExclusions = scope ? hasText(scope["scope_exclusions"] ?? scope["exclusions"]) : false;
  const cartographyCategory = (item: Record<string, unknown>) => {
    const value = String(item["category"] ?? item["type"] ?? "").toLowerCase();
    if (["management", "pilotage"].includes(value)) return "management";
    if (["support", "soutien"].includes(value)) return "support";
    return "realization";
  };
  const managementCount = cartography.filter(
    (item) => cartographyCategory(item) === "management",
  ).length;
  const realizationCount = cartography.filter(
    (item) => cartographyCategory(item) === "realization",
  ).length;
  const supportCount = cartography.filter((item) => cartographyCategory(item) === "support").length;
  const currentSiteName =
    entrepriseSites.find((site) => site.id === String(siteId))?.name ?? `Site ${siteId ?? ""}`;
  const enterpriseName = entreprise
    ? String(entreprise["name"] ?? entreprise["company_name"] ?? "Entreprise")
    : "Contexte de l'organisme";
  const pickEnterprise = (...keys: string[]) => {
    if (!entreprise) return "";
    for (const key of keys) {
      const text = String(entreprise[key] ?? "").trim();
      if (text) return text;
    }
    return "";
  };

  useEffect(() => {
    if (existing) {
      setIssuesForm(issuesFormFromRecord(existing));
      setReviewFrequencyMonths(String(existing["review_frequency_months"] ?? 12));
      setLegacyPestel(
        Object.fromEntries(
          [
            "pestel_economic",
            "pestel_social",
            "pestel_technological",
            "pestel_environmental",
            "pestel_legal",
          ].map((key) => [key, asText(existing[key])] as const),
        ),
      );
    }
  }, [existing]);

  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  const saveForm = async (): Promise<boolean> => {
    if (incompleteClimateAssessments > 0) {
      toast.error(
        `${incompleteClimateAssessments} enjeu(x) doit/doivent avoir une décision climatique documentée.`,
      );
      return false;
    }
    try {
      await save.mutateAsync({
        ...(existing?.["id"] ? { id: String(existing["id"]) } : {}),
        payload: {
          ...buildSwotPestelPayload(siteId, issuesForm),
          ...legacyPestel,
          review_frequency_months: Number(reviewFrequencyMonths),
        },
      });
      toast.success("Analyse du contexte enregistrée.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer l'analyse.");
    }
    return false;
  };
  const recordContextReview = async () => {
    if (!existing?.["id"]) {
      toast.error("Enregistrez d’abord l’analyse du contexte.");
      return;
    }
    const summary = reviewSummary.trim();
    if (summary.length < 10) {
      toast.error("Le compte rendu de revue doit contenir au moins 10 caractères.");
      return;
    }
    if (!(await saveForm())) return;

    try {
      await review.mutateAsync({ id: String(existing["id"]), summary });
      setReviewSummary("");
      toast.success("Revue du contexte enregistrée avec son instantané.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer la revue.");
    }
  };
  if (isLoading)
    return (
      <div className="mx-auto max-w-7xl p-4 text-sm text-muted-foreground md:p-8">
        Chargement du contexte…
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-sky-700 to-emerald-700 p-6 text-white md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 right-32 h-48 w-48 rounded-full bg-white/10"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="mt-1 shrink-0 rounded-2xl bg-white/15 p-3">
              <Compass className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-xs font-bold uppercase tracking-[0.16em] text-white/80">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> Contexte de l'organisme ·{" "}
                {currentSiteName}
              </p>
              <h1 className="mt-1 min-w-0 break-words font-display text-xl font-extrabold sm:text-2xl md:text-3xl">
                {enterpriseName}
              </h1>
              <p className="mt-1 max-w-2xl break-words text-sm text-white/85">
                Profil de l'entreprise, synthèse des enjeux internes et externes, et accès aux
                sous-niveaux du contexte.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  <Check className="h-3.5 w-3.5" />
                  {scope ? `Périmètre v${String(scope["version"] ?? "—")}` : "Périmètre à définir"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> {majorCount} enjeu{majorCount > 1 ? "x" : ""}{" "}
                  majeur{majorCount > 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  <FileText className="h-3.5 w-3.5" /> {synthesisDone}/2 synthèses rédigées
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
                  <GitBranch className="h-3.5 w-3.5" /> {cartography.length} processus
                </span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:max-w-md lg:justify-end">
            <span className="contents [&>button]:w-full sm:[&>button]:w-auto [&>button]:border-white [&>button]:bg-white [&>button]:text-foreground [&>button]:shadow-sm">
              <DocumentActions
                siteId={siteId}
                title="SWOT / PESTEL"
                generatePath="contexts/generate-draft"
                filename={`Contexte_Organisme_${siteId}_${new Date().toISOString().slice(0, 10)}.docx`}
              />
            </span>
            <button
              className={`${primary} w-full border border-white/40 shadow-sm sm:w-auto`}
              onClick={saveForm}
              disabled={save.isPending}
            >
              <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </section>
      <ContextNavigation active="contexte" />
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Les données ne sont pas disponibles. Vérifiez la connexion au serveur.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className={`${card} min-w-0 p-5 lg:col-span-2`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 rounded-xl bg-primary-soft p-2.5 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold">Profil de l'entreprise</h2>
              <p className={`${muted} break-words`}>
                Identité de l'organisme (lecture seule, modifiable dans les paramètres).
              </p>
            </div>
          </div>
          {entrepriseQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chargement du profil…</p>
          ) : entrepriseQuery.isError || !entreprise ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Profil indisponible.{" "}
              <Link
                to="/app/$section"
                params={{ section: "entreprise" }}
                className="font-semibold text-primary"
              >
                Ouvrir les paramètres
              </Link>
            </p>
          ) : (
            <div className="mt-4 min-w-0 space-y-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-display text-xl font-extrabold">{enterpriseName}</p>
                <p className="break-words text-xs font-semibold text-muted-foreground">
                  {[
                    pickEnterprise("sigle"),
                    pickEnterprise(
                      "registration_number",
                      "rccm",
                      "company_rccm",
                      "ifu",
                      "company_ifu",
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <dl className="grid gap-2">
                {(
                  [
                    ["Secteur", pickEnterprise("field", "sector", "activity_sector", "industry")],
                    [
                      "Adresse",
                      pickEnterprise(
                        "address",
                        "company_address",
                        "head_office_address",
                        "city",
                        "location",
                      ),
                    ],
                    [
                      "Effectif",
                      pickEnterprise(
                        "workforce",
                        "effectif",
                        "employees",
                        "employees_count",
                        "staff_count",
                        "headcount",
                      ),
                    ],
                    ["E-mail", pickEnterprise("email", "contact_email")],
                    ["Téléphone", pickEnterprise("phone", "phone_number", "tel", "telephone")],
                    [
                      "Sites",
                      entrepriseSites.length > 0
                        ? entrepriseSites.map((site) => site.name).join(" · ")
                        : "",
                    ],
                    ["Site courant", currentSiteName],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-col gap-0.5 min-[480px]:flex-row min-[480px]:justify-between min-[480px]:gap-3"
                  >
                    <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                      {label === "E-mail" && <Mail className="h-3.5 w-3.5 shrink-0" />}
                      {(label === "Adresse" || label === "Site courant" || label === "Sites") && (
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {label}
                    </dt>
                    <dd
                      className={`min-w-0 font-semibold min-[480px]:text-right ${label === "E-mail" || label === "Adresse" ? "break-all" : "break-words"}`}
                    >
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <Link
                to="/app/$section"
                params={{ section: "entreprise" }}
                className={`${secondary} w-full`}
              >
                Gérer l'organisation <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
          <article className={`${card} flex flex-col p-5`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600">
                  <Leaf className="h-5 w-5" />
                </span>
                <h2 className="font-display text-lg font-bold">Enjeux internes</h2>
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">
                {internalCount} facteur{internalCount > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              Forces et faiblesses — analyse SWOT du site courant.
            </p>
            <p className="mt-3 max-h-40 flex-1 overflow-auto break-words whitespace-pre-line text-sm text-muted-foreground">
              {hasText(issuesForm.synthesisInternal)
                ? issuesForm.synthesisInternal
                : "Aucune synthèse rédigée pour le moment. Rédigez-la dans l'analyse SWOT / PESTEL ci-dessous."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <Stat value={internalCount} label="Facteurs internes" tone="text-emerald-600" />
              <Stat value={majorCount} label="Enjeux majeurs" tone="text-amber-600" />
            </div>
          </article>
          <article className={`${card} flex flex-col p-5`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="rounded-xl bg-sky-500/10 p-2.5 text-sky-600">
                  <Globe2 className="h-5 w-5" />
                </span>
                <h2 className="font-display text-lg font-bold">Enjeux externes</h2>
              </span>
              <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-700">
                {externalCount} facteur{externalCount > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              Opportunités et menaces — analyse PESTEL ({pestelDone}/6 facteurs renseignés).
            </p>
            <p className="mt-3 max-h-40 flex-1 overflow-auto break-words whitespace-pre-line text-sm text-muted-foreground">
              {hasText(issuesForm.synthesisExternal)
                ? issuesForm.synthesisExternal
                : "Aucune synthèse rédigée pour le moment. Rédigez-la dans l'analyse SWOT / PESTEL ci-dessous."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <Stat value={externalCount} label="Facteurs externes" tone="text-sky-600" />
              <Stat value={`${pestelDone}/6`} label="Facteurs PESTEL" tone="text-sky-600" />
            </div>
          </article>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/app/$section"
          params={{ section: "parties-interessees" }}
          className={`${card} group p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg`}
        >
          <span className="flex items-center justify-between">
            <span className="rounded-xl bg-primary-soft p-2.5 text-primary">
              <Users className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground">
              {stakeholders.length} identifiée{stakeholders.length > 1 ? "s" : ""}
            </span>
          </span>
          <span className="mt-3 block font-display text-base font-bold">Parties intéressées</span>
          <span className={`mt-1 block ${muted}`}>
            {stakeholderHigh} prioritaire{stakeholderHigh > 1 ? "s" : ""} · besoins, exigences et
            actions de maîtrise dans le registre.
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
            Ouvrir le registre{" "}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
        <Link
          to="/app/$section"
          params={{ section: "perimetre" }}
          className={`${card} group p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg`}
        >
          <span className="flex items-center justify-between">
            <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600">
              <Scale className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground">
              {scope ? `Version ${String(scope["version"] ?? "—")}` : "À définir"}
            </span>
          </span>
          <span className="mt-3 block font-display text-base font-bold">Domaine d'application</span>
          <span className={`mt-1 block ${muted}`}>
            {scope
              ? scopeExclusions
                ? "Périmètre délimité, exclusions justifiées."
                : "Périmètre délimité, sans exclusion."
              : "Délimitez le périmètre couvert par le système."}{" "}
            Ouvrir la fiche.
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
            Ouvrir la fiche{" "}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
        <Link
          to="/app/$section"
          params={{ section: "processus" }}
          className={`${card} group p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg`}
        >
          <span className="flex items-center justify-between">
            <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600">
              <GitBranch className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-muted-foreground">
              {cartography.length} processus
            </span>
          </span>
          <span className="mt-3 block font-display text-base font-bold">Système de management</span>
          <span className={`mt-1 block ${muted}`}>
            {managementCount} management · {realizationCount} réalisation · {supportCount} support.
            Voir la cartographie.
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary">
            Voir la cartographie{" "}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
      <StructuredContextAnalysis value={issuesForm} onChange={setIssuesForm} onSave={saveForm} />
      <section className={`${card} space-y-4 p-5`}>
        <div>
          <h2 className="font-display text-lg font-bold">Revue périodique du contexte</h2>
          <p className={muted}>
            Définissez la fréquence, consignez chaque revue et conservez l’instantané des enjeux
            évalués.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs font-semibold text-muted-foreground">
            Fréquence de revue
            <select
              className={`${input} mt-1`}
              value={reviewFrequencyMonths}
              onChange={(event) => setReviewFrequencyMonths(event.target.value)}
            >
              <option value="3">Tous les 3 mois</option>
              <option value="6">Tous les 6 mois</option>
              <option value="12">Tous les 12 mois</option>
              <option value="24">Tous les 24 mois</option>
            </select>
          </label>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Prochaine revue
            </p>
            <p className={`mt-1 font-semibold ${reviewIsOverdue ? "text-destructive" : ""}`}>
              {nextReviewAt
                ? new Date(`${nextReviewAt}T00:00:00`).toLocaleDateString("fr-FR")
                : "Enregistrez le contexte pour planifier"}
              {reviewIsOverdue ? " · En retard" : ""}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Dernière revue
            </p>
            <p className="mt-1 font-semibold">
              {existing?.["last_reviewed_at"]
                ? new Date(String(existing["last_reviewed_at"])).toLocaleDateString("fr-FR")
                : "Aucune revue consignée"}
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="text-xs font-semibold text-muted-foreground">
            Compte rendu / changements depuis la dernière revue
            <textarea
              className={`${input} mt-1 min-h-20`}
              value={reviewSummary}
              onChange={(event) => setReviewSummary(event.target.value)}
              placeholder="Résumez les évolutions du contexte, des parties intéressées, du climat et du périmètre…"
            />
          </label>
          <button
            type="button"
            className={primary}
            onClick={() => void recordContextReview()}
            disabled={!existing?.["id"] || review.isPending || save.isPending}
          >
            <Save className="h-4 w-4" />
            {review.isPending ? "Enregistrement…" : "Consigner la revue"}
          </button>
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="font-semibold">Historique des revues ({contextReviews.length})</h3>
          {contextReviews.length === 0 ? (
            <p className={`mt-2 ${muted}`}>Aucune revue enregistrée pour ce contexte.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {contextReviews.slice(0, 5).map((reviewItem) => (
                <li key={String(reviewItem["id"])} className="rounded-xl bg-muted/30 p-3">
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {new Date(String(reviewItem["reviewed_at"])).toLocaleDateString("fr-FR")}
                    </span>
                    <span className="text-muted-foreground">
                      {String(reviewItem["reviewer_name"] ?? "Utilisateur")}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm">
                    {String(reviewItem["summary"] ?? "")}
                  </p>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-semibold">
                      Afficher l’instantané audité
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3">
                      {JSON.stringify(reviewItem["snapshot"] ?? {}, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

const STAKEHOLDER_TYPES = [
  ["client", "Client"],
  ["supplier", "Fournisseur"],
  ["partner", "Partenaire"],
  ["regulator", "Autorité / organisme"],
  ["employee", "Collaborateur"],
  ["shareholder", "Actionnaire"],
  ["other", "Autre"],
] as const;
const RELEVANCE = [
  ["low", "Faible"],
  ["medium", "Moyenne"],
  ["high", "Élevée"],
] as const;
const REQUIREMENT_TYPES = [
  ["legal", "Légale"],
  ["regulatory", "Réglementaire"],
  ["contractual", "Contractuelle"],
  ["other", "Autre"],
] as const;
const REQUIREMENT_TYPE_VALUES: Set<string> = new Set(REQUIREMENT_TYPES.map(([value]) => value));
type StakeholderActionForm = {
  description: string;
  deadline: string;
  responsible_user_id: number | null;
  responsible_name: string;
};
type StakeholderRequirementForm = {
  description: string;
  type: string;
  actions: StakeholderActionForm[];
};
type StakeholderNeedForm = {
  description: string;
  priority: string;
  requirements: StakeholderRequirementForm[];
};
type StakeholderForm = {
  name: string;
  type: string;
  relevance_degree: string;
  contact_person: string;
  contact_email: string;
  needs_expectations: string;
  climate_expectations: string;
  needs: StakeholderNeedForm[];
};
const emptyStakeholder: StakeholderForm = {
  name: "",
  type: "client",
  relevance_degree: "medium",
  contact_person: "",
  contact_email: "",
  needs_expectations: "",
  climate_expectations: "",
  needs: [],
};
const emptyNeed = (): StakeholderNeedForm => ({
  description: "",
  priority: "medium",
  requirements: [],
});
const emptyRequirement = (): StakeholderRequirementForm => ({
  description: "",
  type: "legal",
  actions: [],
});
const emptyAction = (): StakeholderActionForm => ({
  description: "",
  deadline: "",
  responsible_user_id: null,
  responsible_name: "",
});

function normalizeNeeds(value: unknown, legacy = ""): StakeholderNeedForm[] {
  const source = Array.isArray(value) ? value : [];
  const needs = source.map((need) => {
    const raw = need && typeof need === "object" ? (need as Record<string, unknown>) : {};
    const requirements = Array.isArray(raw["requirements"])
      ? raw["requirements"].map((requirement) => {
          const item =
            requirement && typeof requirement === "object"
              ? (requirement as Record<string, unknown>)
              : {};
          const actions = Array.isArray(item["actions"])
            ? item["actions"].map((action) => {
                const row =
                  action && typeof action === "object" ? (action as Record<string, unknown>) : {};
                const responsibleId =
                  typeof row["responsible_user_id"] === "number"
                    ? row["responsible_user_id"]
                    : Number(row["responsible_user_id"]);
                return {
                  description: String(row["description"] ?? ""),
                  deadline: String(row["deadline"] ?? ""),
                  responsible_user_id:
                    Number.isFinite(responsibleId) && responsibleId > 0 ? responsibleId : null,
                  responsible_name: String(row["responsible_name"] ?? row["responsible"] ?? ""),
                };
              })
            : [];
          const rawType = String(item["type"] ?? "legal");
          return {
            description: String(item["description"] ?? ""),
            type: REQUIREMENT_TYPE_VALUES.has(rawType) ? rawType : "legal",
            actions,
          };
        })
      : [];
    return {
      description: String(raw["description"] ?? ""),
      priority: String(raw["priority"] ?? "medium"),
      requirements,
    };
  });
  if (!needs.length && legacy.trim())
    return [{ description: legacy.trim(), priority: "medium", requirements: [] }];
  return needs;
}

function actionResponsibleLabel(
  action: { responsible_user_id?: number | null; responsible_name?: string },
  collaborators: { id: number; label: string }[],
): string {
  if (action.responsible_user_id) {
    const match = collaborators.find((option) => option.id === action.responsible_user_id);
    if (match) return match.label;
  }
  return action.responsible_name?.trim() || "—";
}

function isActionEmpty(action: StakeholderActionForm): boolean {
  return (
    !action.description.trim() &&
    !(action.responsible_user_id ?? 0) &&
    !action.responsible_name.trim() &&
    !action.deadline.trim()
  );
}

export function StakeholdersPage() {
  const [siteId] = useCurrentSite();
  const { data = [], isLoading } = useStakeholders(siteId);
  const { save, remove } = useStakeholderMutations(siteId);
  const [form, setForm] = useState<StakeholderForm>(emptyStakeholder);
  const [editingId, setEditingId] = useState<string>();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [relevanceFilter, setRelevanceFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"grid" | "list" | "actions">("grid");
  const [collaborators, setCollaborators] = useState<{ id: number; label: string }[]>([]);
  useEffect(() => {
    if (!siteId) {
      setCollaborators([]);
      return;
    }
    let cancelled = false;
    backendApi
      .request<unknown>(`users/job-description-collaborators?site_id=${encodeURIComponent(siteId)}`)
      .then((payload) => {
        if (cancelled) return;
        const root = (payload && typeof payload === "object" ? payload : {}) as Record<
          string,
          unknown
        >;
        const list = Array.isArray(root["data"]) ? root["data"] : [];
        setCollaborators(
          list
            .map((user) => {
              const row = (user && typeof user === "object" ? user : {}) as Record<string, unknown>;
              const fullName =
                String(row["full_name"] ?? "").trim() ||
                `${String(row["last_name"] ?? "").trim()} ${String(row["first_name"] ?? "").trim()}`.trim();
              return {
                id: Number(row["id"]),
                label: fullName || String(row["name"] ?? row["email"] ?? "Collaborateur"),
              };
            })
            .filter((option) => Number.isFinite(option.id) && option.id > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setCollaborators([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return data.filter((item) => {
      if (typeFilter && String(item["type"] ?? "") !== typeFilter) return false;
      if (relevanceFilter && String(item["relevance_degree"] ?? "") !== relevanceFilter)
        return false;
      if (!search) return true;
      const haystack = [
        String(item["name"] ?? ""),
        String(item["needs_expectations"] ?? ""),
        String(item["climate_expectations"] ?? ""),
        String(item["contact_person"] ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [data, query, typeFilter, relevanceFilter]);

  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  const change = (key: Exclude<keyof StakeholderForm, "needs">, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const startCreate = () => {
    setEditingId(undefined);
    setForm({ ...emptyStakeholder, needs: [] });
    setShowForm(true);
  };
  const startEdit = (item: Record<string, unknown>) => {
    const legacy = String(item["needs_expectations"] ?? "");
    setEditingId(String(item["id"]));
    setForm({
      name: String(item["name"] ?? ""),
      type: String(item["type"] ?? "other"),
      relevance_degree: String(item["relevance_degree"] ?? "medium"),
      contact_person: String(item["contact_person"] ?? ""),
      contact_email: String(item["contact_email"] ?? ""),
      needs_expectations: legacy,
      climate_expectations: String(item["climate_expectations"] ?? ""),
      needs: normalizeNeeds(item["needs"], legacy),
    });
    setShowForm(true);
  };
  const updateNeed = (needIndex: number, patch: Partial<StakeholderNeedForm>) =>
    setForm((current) => ({
      ...current,
      needs: current.needs.map((need, index) =>
        index === needIndex ? { ...need, ...patch } : need,
      ),
    }));
  const updateRequirement = (
    needIndex: number,
    requirementIndex: number,
    patch: Partial<StakeholderRequirementForm>,
  ) =>
    setForm((current) => ({
      ...current,
      needs: current.needs.map((need, index) =>
        index !== needIndex
          ? need
          : {
              ...need,
              requirements: need.requirements.map((requirement, childIndex) =>
                childIndex === requirementIndex ? { ...requirement, ...patch } : requirement,
              ),
            },
      ),
    }));
  const updateAction = (
    needIndex: number,
    requirementIndex: number,
    actionIndex: number,
    patch: Partial<StakeholderActionForm>,
  ) =>
    setForm((current) => ({
      ...current,
      needs: current.needs.map((need, index) =>
        index !== needIndex
          ? need
          : {
              ...need,
              requirements: need.requirements.map((requirement, childIndex) =>
                childIndex !== requirementIndex
                  ? requirement
                  : {
                      ...requirement,
                      actions: requirement.actions.map((action, rowIndex) =>
                        rowIndex === actionIndex ? { ...action, ...patch } : action,
                      ),
                    },
              ),
            },
      ),
    }));
  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom de la partie intéressée est requis.");
      return;
    }
    const needs = form.needs
      .map((need) => ({
        ...need,
        description: need.description.trim(),
        requirements: need.requirements
          .map((requirement) => ({
            ...requirement,
            description: requirement.description.trim(),
            actions: requirement.actions
              .map((action) => ({
                description: action.description.trim(),
                deadline: action.deadline.trim(),
                responsible_user_id: action.responsible_user_id,
                responsible_name: action.responsible_name.trim(),
              }))
              .filter((action) => !isActionEmpty(action)),
          }))
          .filter((requirement) => requirement.description || requirement.actions.length),
      }))
      .filter((need) => need.description || need.requirements.length);
    try {
      await save.mutateAsync({
        ...(editingId ? { id: editingId } : {}),
        payload: {
          site_id: Number(siteId),
          name: form.name.trim(),
          type: form.type,
          relevance_degree: form.relevance_degree,
          contact_person: form.contact_person,
          contact_email: form.contact_email,
          needs_expectations: form.needs_expectations,
          climate_expectations: form.climate_expectations,
          needs,
        },
      });
      toast.success("Partie intéressée enregistrée.");
      setShowForm(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'enregistrer la partie intéressée.",
      );
    }
  };
  const destroy = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Partie intéressée supprimée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible.");
    }
  };
  const actionRows = visible.flatMap((stakeholder) =>
    normalizeNeeds(stakeholder["needs"], String(stakeholder["needs_expectations"] ?? "")).flatMap(
      (need) =>
        need.requirements.flatMap((requirement) =>
          requirement.actions.map((action) => ({
            stakeholder: String(stakeholder["name"] ?? ""),
            need: need.description,
            requirement: requirement.description,
            responsible: actionResponsibleLabel(action, collaborators),
            ...action,
          })),
        ),
    ),
  );
  const assignActionResponsible = (
    needIndex: number,
    requirementIndex: number,
    actionIndex: number,
    userId: number | null,
  ) => {
    const match = userId ? collaborators.find((option) => option.id === userId) : undefined;
    updateAction(needIndex, requirementIndex, actionIndex, {
      responsible_user_id: userId,
      responsible_name: match ? match.label : "",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        eyebrow="Contexte de l'organisme"
        title="Parties intéressées"
        description="Identifiez les parties pertinentes, leurs besoins, les exigences qui en découlent et les actions de maîtrise."
        icon={Handshake}
      >
        <DocumentActions
          siteId={siteId}
          title="Registre des parties intéressées"
          generatePath="stakeholders/generate-draft"
          filename={`Registre_Parties_Interessees_${siteId}_${new Date().toISOString().slice(0, 10)}.docx`}
        />
        <button className={primary} onClick={startCreate}>
          <Plus className="h-4 w-4" /> Ajouter une partie
        </button>
      </PageHeader>
      <ContextNavigation active="parties-interessees" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={data.length} label="Parties identifiées" />
        <Stat
          value={data.filter((item) => item["relevance_degree"] === "high").length}
          label="Priorité élevée"
          tone="text-rose-600"
        />
        <Stat
          value={data.reduce(
            (count, item) =>
              count +
              normalizeNeeds(item["needs"], String(item["needs_expectations"] ?? "")).length,
            0,
          )}
          label="Besoins"
          tone="text-sky-600"
        />
        <Stat value={actionRows.length} label="Actions" tone="text-emerald-600" />
      </div>

      {showForm && (
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">
                {editingId ? "Modifier la partie intéressée" : "Nouvelle partie intéressée"}
              </h2>
              <p className={muted}>
                Renseignez les informations de la partie intéressée, puis détaillez ses besoins,
                exigences et actions de maîtrise.
              </p>
            </div>
            <button
              className="rounded-lg p-2 hover:bg-background"
              onClick={() => setShowForm(false)}
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label>Nom / désignation</Label>
              <input
                className={input}
                value={form.name}
                onChange={(event) => change("name", event.target.value)}
                placeholder="Ex. Clients grands comptes"
              />
            </div>
            <div>
              <Label>Type</Label>
              <select
                className={input}
                value={form.type}
                onChange={(event) => change("type", event.target.value)}
              >
                {STAKEHOLDER_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Niveau de pertinence</Label>
              <select
                className={input}
                value={form.relevance_degree}
                onChange={(event) => change("relevance_degree", event.target.value)}
              >
                {RELEVANCE.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Contact / responsable</Label>
              <input
                className={input}
                value={form.contact_person}
                onChange={(event) => change("contact_person", event.target.value)}
                placeholder="Nom du contact"
              />
            </div>
            <div>
              <Label>E-mail de contact</Label>
              <input
                className={input}
                type="email"
                value={form.contact_email}
                onChange={(event) => change("contact_email", event.target.value)}
                placeholder="contact@exemple.com"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label>Résumé des besoins et attentes</Label>
              <textarea
                className={`${input} min-h-20`}
                value={form.needs_expectations}
                onChange={(event) => change("needs_expectations", event.target.value)}
                placeholder="Résumé lisible pour le registre…"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label>Attentes de la partie liées au changement climatique</Label>
              <textarea
                className={`${input} min-h-20`}
                value={form.climate_expectations}
                onChange={(event) => change("climate_expectations", event.target.value)}
                placeholder="Décrivez les attentes climatiques pertinentes, ou indiquez qu’aucune n’a été identifiée."
              />
            </div>
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold">Besoins, exigences et actions</h3>
                <p className={muted}>
                  Structure documentaire utilisée pour le registre et son export.
                </p>
              </div>
              <button
                type="button"
                className={secondary}
                onClick={() =>
                  setForm((current) => ({ ...current, needs: [...current.needs, emptyNeed()] }))
                }
              >
                <Plus className="h-4 w-4" /> Ajouter un besoin
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {form.needs.map((need, needIndex) => (
                <div key={needIndex} className={`${card} bg-background p-4`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Label>Besoin / attente {needIndex + 1}</Label>
                      <textarea
                        className={`${input} min-h-20`}
                        value={need.description}
                        onChange={(event) =>
                          updateNeed(needIndex, { description: event.target.value })
                        }
                        placeholder="Exigence ou attente exprimée par la partie intéressée…"
                      />
                    </div>
                    <button
                      type="button"
                      className="mt-6 rounded-xl p-2 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          needs: current.needs.filter((_, index) => index !== needIndex),
                        }))
                      }
                      aria-label="Supprimer le besoin"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 max-w-full sm:max-w-xs">
                    <Label>Priorité</Label>
                    <select
                      className={input}
                      value={need.priority}
                      onChange={(event) => updateNeed(needIndex, { priority: event.target.value })}
                    >
                      <option value="low">Faible</option>
                      <option value="medium">Moyenne</option>
                      <option value="high">Élevée</option>
                    </select>
                  </div>
                  <div className="mt-4 border-l-2 border-primary/30 pl-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Exigences dérivées
                      </p>
                      <button
                        type="button"
                        className={secondary}
                        onClick={() =>
                          updateNeed(needIndex, {
                            requirements: [...need.requirements, emptyRequirement()],
                          })
                        }
                      >
                        <Plus className="h-4 w-4" /> Exigence
                      </button>
                    </div>
                    {need.requirements.map((requirement, requirementIndex) => (
                      <div
                        key={requirementIndex}
                        className="mt-3 rounded-xl border border-border bg-card p-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
                          <input
                            className={input}
                            value={requirement.description}
                            onChange={(event) =>
                              updateRequirement(needIndex, requirementIndex, {
                                description: event.target.value,
                              })
                            }
                            placeholder="Exigence applicable / critère mesurable"
                          />
                          <select
                            className={input}
                            value={requirement.type}
                            onChange={(event) =>
                              updateRequirement(needIndex, requirementIndex, {
                                type: event.target.value,
                              })
                            }
                          >
                            {REQUIREMENT_TYPES.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              updateNeed(needIndex, {
                                requirements: need.requirements.filter(
                                  (_, index) => index !== requirementIndex,
                                ),
                              })
                            }
                            aria-label="Supprimer l'exigence"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-3 border-l-2 border-emerald-500/30 pl-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                              Actions de maîtrise
                            </p>
                            <button
                              type="button"
                              className={secondary}
                              onClick={() =>
                                updateRequirement(needIndex, requirementIndex, {
                                  actions: [...requirement.actions, emptyAction()],
                                })
                              }
                            >
                              <Plus className="h-4 w-4" /> Action
                            </button>
                          </div>
                          {requirement.actions.map((action, actionIndex) => (
                            <div
                              key={actionIndex}
                              className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_200px_170px_auto]"
                            >
                              <input
                                className={input}
                                value={action.description}
                                onChange={(event) =>
                                  updateAction(needIndex, requirementIndex, actionIndex, {
                                    description: event.target.value,
                                  })
                                }
                                placeholder="Action, dispositif ou preuve attendue"
                              />
                              <select
                                className={input}
                                value={action.responsible_user_id ?? ""}
                                onChange={(event) =>
                                  assignActionResponsible(
                                    needIndex,
                                    requirementIndex,
                                    actionIndex,
                                    event.target.value ? Number(event.target.value) : null,
                                  )
                                }
                                title={action.responsible_name || "Responsable de l'action"}
                              >
                                <option value="">Responsable…</option>
                                {collaborators.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className={input}
                                type="date"
                                value={action.deadline}
                                onChange={(event) =>
                                  updateAction(needIndex, requirementIndex, actionIndex, {
                                    deadline: event.target.value,
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  updateRequirement(needIndex, requirementIndex, {
                                    actions: requirement.actions.filter(
                                      (_, index) => index !== actionIndex,
                                    ),
                                  })
                                }
                                aria-label="Supprimer l'action"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className={secondary} onClick={() => setShowForm(false)}>
              Annuler
            </button>
            <button className={primary} onClick={() => void submit()} disabled={save.isPending}>
              <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Registre des parties intéressées</h2>
            <p className={muted}>{visible.length} élément(s) pour le site courant</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={`${input} pl-9`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher…"
              />
            </div>
            <select
              className={`${input} w-full sm:w-44`}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filtrer par type"
            >
              <option value="">Tous types</option>
              {STAKEHOLDER_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className={`${input} w-full sm:w-44`}
              value={relevanceFilter}
              onChange={(event) => setRelevanceFilter(event.target.value)}
              aria-label="Filtrer par pertinence"
            >
              <option value="">Toutes pertinences</option>
              {RELEVANCE.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl bg-background p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "grid" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setView("grid")}
              >
                Grille
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "list" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setView("list")}
              >
                Liste
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "actions" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                onClick={() => setView("actions")}
              >
                Actions
              </button>
            </div>
          </div>
        </div>
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Chargement du registre…</p>
        ) : view === "actions" ? (
          <div className="mt-4 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {actionRows.length === 0 ? (
              <EmptyState
                title="Aucune action structurée"
                description="Ajoutez des besoins, exigences puis actions de maîtrise dans une partie intéressée."
              />
            ) : (
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="p-3">Partie</th>
                    <th className="p-3">Besoin</th>
                    <th className="p-3">Exigence</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Responsable</th>
                    <th className="p-3">Échéance</th>
                  </tr>
                </thead>
                <tbody>
                  {actionRows.map((row, index) => (
                    <tr key={index} className="border-b border-border/70">
                      <td className="p-3 font-semibold">{row.stakeholder}</td>
                      <td className="p-3 text-muted-foreground">{row.need}</td>
                      <td className="p-3 text-muted-foreground">{row.requirement}</td>
                      <td className="p-3">{row.description}</td>
                      <td className="p-3 text-muted-foreground">{row.responsible}</td>
                      <td className="p-3 text-muted-foreground">{row.deadline || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title="Aucune partie intéressée"
            description="Commencez par identifier vos clients, fournisseurs, collaborateurs, autorités et partenaires pertinents."
            onCreate={startCreate}
            label="Ajouter la première"
          />
        ) : (
          <div
            className={
              view === "grid"
                ? "mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                : "mt-4 divide-y divide-border"
            }
          >
            {visible.map((item) => (
              <div
                key={String(item["id"])}
                className={
                  view === "grid"
                    ? `${card} p-4`
                    : "flex flex-wrap items-center justify-between gap-4 py-4"
                }
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-xl bg-primary-soft p-2 text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{String(item["name"] ?? "Sans nom")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {STAKEHOLDER_TYPES.find(([value]) => value === item["type"])?.[1] ??
                        String(item["type"] ?? "")}
                      {item["contact_person"] ? ` · ${String(item["contact_person"])}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-bold ${item["relevance_degree"] === "high" ? "bg-rose-100 text-rose-700" : item["relevance_degree"] === "low" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}
                  >
                    {RELEVANCE.find(([value]) => value === item["relevance_degree"])?.[1] ??
                      "Moyenne"}
                  </span>
                  <span className="rounded-full bg-primary-soft px-2 py-1 text-[11px] font-bold text-primary">
                    {normalizeNeeds(item["needs"], String(item["needs_expectations"] ?? "")).length}{" "}
                    besoin(s)
                  </span>
                </div>
                {view === "grid" && (
                  <div className="mt-4 w-full space-y-2 text-sm">
                    <p className="line-clamp-3 whitespace-pre-line text-muted-foreground">
                      {String(item["needs_expectations"] ?? "Aucune attente décrite.")}
                    </p>
                    {String(item["climate_expectations"] ?? "").trim() && (
                      <p className="line-clamp-3 whitespace-pre-line rounded-lg bg-sky-50 p-2 text-xs text-sky-900">
                        <span className="font-bold">Attentes climatiques : </span>
                        {String(item["climate_expectations"])}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-muted-foreground">
                      {normalizeNeeds(
                        item["needs"],
                        String(item["needs_expectations"] ?? ""),
                      ).reduce((count, need) => count + need.requirements.length, 0)}{" "}
                      exigence(s) structurée(s)
                    </p>
                  </div>
                )}
                <div className="flex justify-end gap-1">
                  <button
                    className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-primary"
                    onClick={() => startEdit(item)}
                    aria-label="Modifier"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-destructive"
                    onClick={() => void destroy(String(item["id"]))}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(String).filter(Boolean)
      : value
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean);
  } catch {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
function joinLines(value: unknown) {
  return lines(value).join("\n");
}

type ScopeForm = {
  version: string;
  objective: string;
  scope: string;
  scope_definition: string;
  products_services: string;
  organizational_units: string;
  locations: string;
  scope_exclusions: string;
  exclusions_justification: string;
};
const emptyScope: ScopeForm = {
  version: "1.0",
  objective: "",
  scope: "",
  scope_definition: "",
  products_services: "",
  organizational_units: "",
  locations: "",
  scope_exclusions: "",
  exclusions_justification: "",
};

export function ApplicationScopePage() {
  const [siteId] = useCurrentSite();
  const { data: scopes = [], isLoading: scopeLoading } = useScope(siteId);
  const { data: processes = [], isLoading: processesLoading } = useProcesses(siteId);
  const { save } = useScopeMutations(siteId);
  const [form, setForm] = useState<ScopeForm>(emptyScope);
  const existing = scopes[0] as Record<string, unknown> | undefined;
  useEffect(() => {
    if (existing)
      setForm({
        version: String(existing["version"] ?? "1.0"),
        objective: String(existing["objective"] ?? existing["document_objective"] ?? ""),
        scope: String(existing["scope"] ?? ""),
        scope_definition: String(existing["scope_definition"] ?? ""),
        products_services: joinLines(existing["products_services"]),
        organizational_units: joinLines(existing["organizational_units"]),
        locations: joinLines(existing["locations"]),
        scope_exclusions: String(existing["scope_exclusions"] ?? existing["exclusions"] ?? ""),
        exclusions_justification: String(
          existing["exclusions_justification"] ?? existing["iso_exclusions_justification"] ?? "",
        ),
      });
  }, [existing]);
  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  const change = (key: keyof ScopeForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const saveForm = async () => {
    try {
      await save.mutateAsync({
        ...(existing?.["id"] ? { id: String(existing["id"]) } : {}),
        payload: {
          site_id: Number(siteId),
          is_current: true,
          version: form.version,
          objective: form.objective,
          document_objective: form.objective,
          scope: form.scope,
          scope_definition: form.scope_definition,
          products_services: lines(form.products_services),
          organizational_units: lines(form.organizational_units),
          locations: lines(form.locations),
          scope_exclusions: form.scope_exclusions,
          exclusions: form.scope_exclusions,
          exclusions_justification: form.exclusions_justification,
          included_processes: processes.map((item) => item["id"]).filter(Boolean),
        },
      });
      toast.success("Domaine d'application enregistré.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer le domaine d'application.",
      );
    }
  };
  const groups = [
    {
      key: "management",
      label: "Management",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: BarChart3,
    },
    {
      key: "realization",
      label: "Réalisation",
      tone: "bg-orange-50 text-orange-700 border-orange-200",
      icon: GitBranch,
    },
    {
      key: "support",
      label: "Support",
      tone: "bg-violet-50 text-violet-700 border-violet-200",
      icon: Settings2,
    },
  ];
  const category = (item: Record<string, unknown>) => {
    const value = String(item["category"] ?? item["type"] ?? "").toLowerCase();
    if (["management", "pilotage"].includes(value)) return "management";
    if (["support", "soutien"].includes(value)) return "support";
    return "realization";
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        eyebrow="Contexte de l'organisme"
        title="Domaine d'application"
        description="Définissez le périmètre du système de management, ses activités, ses implantations et les éventuelles exclusions justifiées."
        icon={Scale}
      >
        <button className={primary} onClick={saveForm} disabled={save.isPending}>
          <Save className="h-4 w-4" /> {save.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </PageHeader>
      <ContextNavigation active="perimetre" />
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className={`${card} p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Fiche de périmètre</h2>
              <p className={muted}>Version et formulation validées pour le site courant.</p>
            </div>
            <div className="w-24">
              <Label>Version</Label>
              <input
                className={input}
                value={form.version}
                onChange={(e) => change("version", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <Label>Objectif du document</Label>
              <textarea
                className={`${input} min-h-24`}
                value={form.objective}
                onChange={(e) => change("objective", e.target.value)}
                placeholder="Finalité du système de management…"
              />
            </div>
            <div>
              <Label>Domaine d'application</Label>
              <textarea
                className={`${input} min-h-28`}
                value={form.scope}
                onChange={(e) => change("scope", e.target.value)}
                placeholder="Activités, produits et services couverts…"
              />
            </div>
            <div>
              <Label>Description détaillée du périmètre</Label>
              <textarea
                className={`${input} min-h-28`}
                value={form.scope_definition}
                onChange={(e) => change("scope_definition", e.target.value)}
                placeholder="Décrivez les limites organisationnelles et opérationnelles…"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>
                  Produits / services{" "}
                  <span className="normal-case font-normal">(une ligne par élément)</span>
                </Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={form.products_services}
                  onChange={(e) => change("products_services", e.target.value)}
                />
              </div>
              <div>
                <Label>Unités organisationnelles</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={form.organizational_units}
                  onChange={(e) => change("organizational_units", e.target.value)}
                />
              </div>
              <div>
                <Label>Implantations / lieux</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={form.locations}
                  onChange={(e) => change("locations", e.target.value)}
                />
              </div>
              <div>
                <Label>Exclusions du périmètre</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={form.scope_exclusions}
                  onChange={(e) => change("scope_exclusions", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Justification des exclusions</Label>
              <textarea
                className={`${input} min-h-24`}
                value={form.exclusions_justification}
                onChange={(e) => change("exclusions_justification", e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold">Repères</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Stat value={processes.length} label="Processus rattachés" />
              <Stat
                value={lines(form.products_services).length}
                label="Produits / services"
                tone="text-emerald-600"
              />
              <Stat
                value={form.scope_exclusions.trim() ? "Oui" : "Non"}
                label="Exclusions déclarées"
                tone="text-amber-600"
              />
            </div>
          </div>
          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-emerald-600" />
              <h2 className="font-display text-lg font-bold">Checklist ISO</h2>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                Activités et services couverts
              </li>
              <li className="flex gap-2">
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                Limites organisationnelles explicites
              </li>
              <li className="flex gap-2">
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                Exclusions documentées et justifiées
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Processus inclus dans le périmètre</h2>
            <p className={muted}>Liste synchronisée avec les processus du site courant.</p>
          </div>
          {!processesLoading && (
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {processes.length} processus
            </span>
          )}
        </div>
        {scopeLoading || processesLoading ? (
          <p className="py-8 text-sm text-muted-foreground">
            Chargement du périmètre et des processus…
          </p>
        ) : processes.length === 0 ? (
          <EmptyState
            title="Aucun processus pour ce site"
            description="Les processus apparaîtront ici dès qu'ils seront créés dans le Système de management."
          />
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ key, label, tone, icon: Icon }) => {
              const items = processes.filter((item) => category(item) === key);
              return (
                <div key={key} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <p className="font-display font-bold">{label}</p>
                    </div>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">
                      {items.length}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {items.length === 0 ? (
                      <p className="text-xs opacity-70">Aucun processus</p>
                    ) : (
                      items.map((item) => (
                        <div
                          key={String(item["id"])}
                          className="rounded-xl bg-white/75 p-3 text-sm font-semibold text-foreground"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span>
                              {String(item["title"] ?? item["name"] ?? "Processus sans nom")}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                          </div>
                          {String(item["purpose"] ?? "") && (
                            <p className="mt-1 line-clamp-2 text-xs font-normal opacity-75">
                              {String(item["purpose"])}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ManagementSystemPage() {
  const [siteId] = useCurrentSite();
  const { data: processes = [], isLoading } = useCartography(siteId);
  const groups = [
    {
      key: "management",
      label: "Processus de management",
      color: "text-emerald-700 bg-emerald-50 border-emerald-200",
      icon: BarChart3,
    },
    {
      key: "realization",
      label: "Processus de réalisation",
      color: "text-orange-700 bg-orange-50 border-orange-200",
      icon: GitBranch,
    },
    {
      key: "support",
      label: "Processus support",
      color: "text-violet-700 bg-violet-50 border-violet-200",
      icon: Settings2,
    },
  ];
  const category = (item: Record<string, unknown>) => {
    const value = String(item["category"] ?? item["type"] ?? "").toLowerCase();
    if (["management", "pilotage"].includes(value)) return "management";
    if (["support", "soutien"].includes(value)) return "support";
    return "realization";
  };
  if (!siteId)
    return (
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <SiteRequired />
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        eyebrow="Contexte de l'organisme"
        title="Système de management"
        description="Visualisez la cartographie du système de management et les interactions entre les processus du site courant."
        icon={GitBranch}
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            Cartographie
          </span>
          <Link
            to="/app/$section"
            params={{ section: "processus" }}
            search={{ new: 1 }}
            className={primary}
          >
            <Plus className="h-4 w-4" /> Nouveau processus
          </Link>
        </div>
      </PageHeader>
      <ContextNavigation active="processus" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat value={processes.length} label="Processus" />
        <Stat
          value={processes.filter((item) => category(item) === "management").length}
          label="Management"
          tone="text-emerald-600"
        />
        <Stat
          value={processes.filter((item) => category(item) === "realization").length}
          label="Réalisation"
          tone="text-orange-600"
        />
      </div>
      {isLoading ? (
        <div className={`${card} p-8 text-center ${muted}`}>Chargement de la cartographie…</div>
      ) : processes.length === 0 ? (
        <EmptyState
          title="Cartographie vide"
          description="Créez vos processus pour construire la cartographie du système de management."
        />
      ) : (
        <div className="space-y-5">
          {groups.map(({ key, label, color, icon: Icon }) => {
            const items = processes.filter((item) => category(item) === key);
            return (
              <section key={key} className={`${card} overflow-hidden`}>
                <div className={`flex items-center gap-3 border-b p-4 ${color}`}>
                  <Icon className="h-5 w-5" />
                  <h2 className="font-display font-bold">{label}</h2>
                  <span className="ml-auto rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold">
                    {items.length}
                  </span>
                </div>
                {items.length > 0 && (
                  <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <article
                        key={String(item["id"])}
                        className="rounded-xl border border-border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-[11px] font-bold uppercase text-primary">
                              {String(item["code"] ?? "PROCESSUS")}
                            </p>
                            <h3 className="mt-1 font-display font-bold">
                              <Link
                                to="/app/$section"
                                params={{ section: "processus" }}
                                search={{ open: String(item["id"]) }}
                                className="hover:text-primary"
                              >
                                {String(item["title"] ?? item["name"] ?? "Processus sans nom")}
                              </Link>
                            </h3>
                          </div>
                          <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        {Boolean(item["purpose"]) && (
                          <p className="mt-3 text-sm text-muted-foreground">
                            {String(item["purpose"])}
                          </p>
                        )}
                        <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                          <div className="rounded-lg bg-card p-2">
                            <span className="font-bold text-foreground">Entrées : </span>
                            {lines(item["sequences"]).length
                              ? lines(item["sequences"]).join(", ")
                              : "À documenter"}
                          </div>
                          <div className="rounded-lg bg-card p-2">
                            <span className="font-bold text-foreground">Statut : </span>
                            {String(item["status"] ?? "draft")}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
