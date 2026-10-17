import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  FileDown,
  FileText,
  GitBranch,
  Layers3,
  Plus,
  Save,
  ShieldCheck,
  Target,
  Trash2,
  Users,
  Wrench,
  X,
  Zap,
  ArrowRight,
} from "lucide-react";
import { backendApi } from "@/integrations/backend/client";
import { normalizeProcessSequences, useProcess } from "@/integrations/backend/processes";
import { useCartographyData } from "@/integrations/backend/processes";
import { useCurrentSite } from "@/hooks/use-workspace";
import { ProcessSequencesPage } from "@/components/app/ProcessPages";

const card = "rounded-2xl border border-border bg-card";
const input =
  "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary-dark`;
const secondary = `${button} border border-border bg-card hover:border-primary hover:text-primary`;
const muted = "text-sm text-muted-foreground";

type ResourceItem = Record<string, string | number | boolean | undefined> & { name: string };
type ResourceGroups = Record<
  "human" | "technological" | "material" | "documentary",
  ResourceItem[]
>;
type Objective = {
  id?: string | undefined;
  title: string;
  description: string;
  indicator_id?: string | undefined;
  indicator_name: string;
  target_value: string;
  target_date: string;
  status?: string | undefined;
  achievement_percentage?: number | undefined;
};
type Risk = {
  id?: string | undefined;
  type: "risque" | "opportunite";
  title: string;
  description: string;
  normes_iso: string[];
  probabilite: number;
  gravite: number;
  strategie: string;
  actions_prevues: string;
};
type Indicator = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
  category: string;
  unit: string;
  target_value?: number | string;
  description?: string;
  values?: unknown[];
};
type UserOption = { id: string; name: string };
type ProcessSequenceDraft = {
  id?: string | undefined;
  sequence_order: number;
  input_description: string;
  activity_description: string;
  output_description: string;
  sub_activities: string[];
  supplier_processes: string[];
  client_processes: string[];
  responsible_user_id?: string | undefined;
  duration_minutes?: number | undefined;
  documents?: unknown[] | undefined;
};
type IsoCoverage = {
  id?: string | undefined;
  norme: string;
  version: string;
  clause_number: string;
  clause_title: string;
  clause_description: string;
  coverage_level: "none" | "partial" | "full";
  coverage_percentage: string;
  coverage_comment: string;
  evidence: string[];
  conformity_status: string;
  last_audit_date: string;
  next_audit_date: string;
};

const tabs = [
  ["general", "Général"],
  ["sequences", "Séquences"],
  ["objectives", "Objectifs"],
  ["resources", "Ressources"],
  ["risks", "Risques & opportunités"],
  ["indicators", "KPI"],
  ["coverage", "Couverture ISO"],
  ["versions", "Versions"],
  ["interactions", "Interactions"],
  ["workflow", "Workflow"],
  ["summary", "Récapitulatif"],
] as const;
const creationTabs = tabs.filter(([value]) =>
  ["general", "sequences", "objectives", "resources", "risks", "indicators", "summary"].includes(
    value,
  ),
);

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const root = asRecord(value);
  if (Array.isArray(root["data"])) return root["data"];
  return [];
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .map((item) =>
        item && typeof item === "object"
          ? String(
              asRecord(item)["name"] ?? asRecord(item)["title"] ?? asRecord(item)["label"] ?? "",
            )
          : String(item ?? ""),
      )
      .map((item) => item.trim())
      .filter(Boolean);
  if (typeof value === "string") {
    try {
      return stringList(JSON.parse(value));
    } catch {
      return value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function currentIndicatorValue(indicator: Indicator): string {
  const values = asArray(indicator.values);
  const latest =
    values[0] && typeof values[0] === "object" ? asRecord(values[0])["value"] : undefined;
  return String(indicator["current_value"] ?? latest ?? "N/A");
}

function resourceGroups(value: unknown): ResourceGroups {
  const root = asRecord(value);
  const make = (candidate: unknown): ResourceItem[] =>
    stringList(candidate).map((name) => ({ name }));
  return {
    human: Array.isArray(root["human"]) ? root["human"].map(resourceItem) : make(root["human"]),
    technological: Array.isArray(root["technological"])
      ? root["technological"].map(resourceItem)
      : make(root["technological"]),
    material: Array.isArray(root["material"])
      ? root["material"].map(resourceItem)
      : make(root["material"]),
    documentary: Array.isArray(root["documentary"])
      ? root["documentary"].map(resourceItem)
      : make(root["documentary"]),
  };
}

function resourceItem(value: unknown): ResourceItem {
  if (value && typeof value === "object") {
    const row = asRecord(value);
    return { ...row, name: String(row["name"] ?? row["title"] ?? "").trim() } as ResourceItem;
  }
  return { name: String(value ?? "").trim() };
}

function emptyObjective(): Objective {
  return { title: "", description: "", indicator_name: "", target_value: "", target_date: "" };
}
function emptyRisk(type: Risk["type"]): Risk {
  return {
    type,
    title: "",
    description: "",
    normes_iso: [],
    probabilite: 3,
    gravite: 3,
    strategie: type === "risque" ? "reduire" : "exploiter",
    actions_prevues: "",
  };
}
function emptySequence(sequence_order = 1): ProcessSequenceDraft {
  return {
    sequence_order,
    input_description: "",
    activity_description: "",
    output_description: "",
    sub_activities: [],
    supplier_processes: [],
    client_processes: [],
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function TabNavigation({
  processId,
  active,
  items = tabs,
  onSelect,
}: {
  processId?: string;
  active: string;
  items?: readonly (readonly [string, string])[];
  onSelect?: (value: string) => void;
}) {
  return (
    <div className={`${card} flex flex-wrap gap-1.5 p-1.5`}>
      {items.map(([value, label]) =>
        processId ? (
          <Link
            key={value}
            to="/app/$section"
            params={{ section: "processus" }}
            search={{ open: processId, tab: value }}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${active === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-primary"}`}
          >
            {label}
          </Link>
        ) : (
          <button
            key={value}
            type="button"
            onClick={() => onSelect?.(value)}
            className={`rounded-xl px-3 py-2 text-xs font-bold ${active === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-primary"}`}
          >
            {label}
          </button>
        ),
      )}
    </div>
  );
}

function ProcessResourceEditor({
  resources,
  setResources,
}: {
  resources: ResourceGroups;
  setResources: React.Dispatch<React.SetStateAction<ResourceGroups>>;
}) {
  const labels: Array<[keyof ResourceGroups, string, string]> = [
    ["human", "Ressources humaines", "Rôle, compétences, disponibilité"],
    ["technological", "Ressources technologiques", "Type, version, description"],
    ["material", "Ressources matérielles", "Catégorie, quantité, localisation"],
    ["documentary", "Ressources documentaires", "Référence, type de document"],
  ];
  const fields: Record<keyof ResourceGroups, Array<[string, string, string?]>> = {
    human: [
      ["role", "Rôle / fonction"],
      ["competences", "Compétences"],
      ["availability", "Disponibilité"],
    ],
    technological: [
      ["type", "Type"],
      ["version", "Version"],
      ["description", "Description"],
    ],
    material: [
      ["category", "Catégorie"],
      ["quantity", "Quantité", "number"],
      ["location", "Localisation"],
    ],
    documentary: [
      ["reference", "Référence"],
      ["type", "Type de document"],
    ],
  };
  const add = (key: keyof ResourceGroups) =>
    setResources((current) => ({ ...current, [key]: [...current[key], { name: "" }] }));
  const update = (key: keyof ResourceGroups, index: number, field: string, value: string) =>
    setResources((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  const remove = (key: keyof ResourceGroups, index: number) =>
    setResources((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  return (
    <div className="space-y-4">
      {labels.map(([key, label, hint]) => (
        <section key={key} className={`${card} bg-background p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold">{label}</h3>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <button className={secondary} type="button" onClick={() => add(key)}>
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {resources[key].map((item, index) => (
              <div key={`${key}-${index}`} className="rounded-xl border border-border bg-card p-3">
                <div className="flex gap-2">
                  <input
                    className={input}
                    value={String(item.name ?? "")}
                    onChange={(event) => update(key, index, "name", event.target.value)}
                    placeholder="Nom de la ressource *"
                  />
                  <button
                    type="button"
                    className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(key, index)}
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {fields[key].map(([field, placeholder, type]) => (
                    <input
                      key={field}
                      className={input}
                      type={type ?? "text"}
                      value={String(item[field] ?? "")}
                      onChange={(event) => update(key, index, field, event.target.value)}
                      placeholder={placeholder}
                    />
                  ))}
                </div>
              </div>
            ))}
            {resources[key].length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Aucune ressource définie.
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function SequenceDraftField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
}) {
  const choices = [...new Set([...options, ...value])];
  return (
    <div>
      <Label>{label}</Label>
      <select
        multiple
        className={`${input} min-h-24`}
        value={value}
        onChange={(event) =>
          onChange(Array.from(event.target.selectedOptions).map((option) => option.value))
        }
      >
        {choices.length === 0 ? (
          <option disabled>Aucun processus disponible</option>
        ) : (
          choices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))
        )}
      </select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Sélectionnez un ou plusieurs processus existants.
      </p>
    </div>
  );
}

function NewProcessSequencesEditor({
  sequences,
  setSequences,
  processOptions,
  users,
  documents,
  documentsLoading,
}: {
  sequences: ProcessSequenceDraft[];
  setSequences: React.Dispatch<React.SetStateAction<ProcessSequenceDraft[]>>;
  processOptions: string[];
  users: UserOption[];
  documents: { id: string; title: string; code: string }[];
  documentsLoading: boolean;
}) {
  const update = (index: number, key: keyof ProcessSequenceDraft, value: unknown) =>
    setSequences((current) =>
      current.map((sequence, sequenceIndex) =>
        sequenceIndex === index
          ? ({ ...sequence, [key]: value } as ProcessSequenceDraft)
          : sequence,
      ),
    );
  const add = () => setSequences((current) => [...current, emptySequence(current.length + 1)]);
  const remove = (index: number) =>
    setSequences((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sequence_order: itemIndex + 1 })),
    );
  const move = (index: number, direction: -1 | 1) =>
    setSequences((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const selected = next[index];
      const destination = next[target];
      if (!selected || !destination) return current;
      next[index] = destination;
      next[target] = selected;
      return next.map((item, itemIndex) => ({ ...item, sequence_order: itemIndex + 1 }));
    });
  return (
    <section className={`${card} p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Séquences opérationnelles</h2>
          <p className={muted}>
            Décrivez les entrées, activités, sorties, sous-activités et le chaînage
            fournisseurs/clients.
          </p>
        </div>
        <button type="button" className={secondary} onClick={add}>
          <Plus className="h-4 w-4" /> Ajouter une séquence
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {sequences.map((sequence, index) => (
          <div
            key={`draft-sequence-${index}`}
            className="rounded-2xl border border-border bg-background p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                  {index + 1}
                </span>
                <p className="font-display font-bold">Séquence {index + 1}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  className="rounded-lg p-2 text-muted-foreground disabled:opacity-30"
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={index === sequences.length - 1}
                  className="rounded-lg p-2 text-muted-foreground disabled:opacity-30"
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <Label>Entrées</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={sequence.input_description}
                  onChange={(event) => update(index, "input_description", event.target.value)}
                />
              </div>
              <div>
                <Label>Activité *</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={sequence.activity_description}
                  onChange={(event) => update(index, "activity_description", event.target.value)}
                />
              </div>
              <div>
                <Label>Sorties</Label>
                <textarea
                  className={`${input} min-h-24`}
                  value={sequence.output_description}
                  onChange={(event) => update(index, "output_description", event.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Sous-activités</Label>
                <textarea
                  className={`${input} min-h-20`}
                  value={sequence.sub_activities.join("\n")}
                  onChange={(event) =>
                    update(
                      index,
                      "sub_activities",
                      event.target.value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Une sous-activité par ligne"
                />
              </div>
              <SequenceDraftField
                label="Processus fournisseurs en amont"
                value={sequence.supplier_processes}
                options={processOptions}
                onChange={(value) => update(index, "supplier_processes", value)}
              />
              <SequenceDraftField
                label="Processus clients en aval"
                value={sequence.client_processes}
                options={processOptions}
                onChange={(value) => update(index, "client_processes", value)}
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <Label>Responsable de la séquence</Label>
                <select
                  className={input}
                  value={sequence.responsible_user_id ?? ""}
                  onChange={(event) => update(index, "responsible_user_id", event.target.value)}
                >
                  <option value="">Non assigné</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Durée (minutes)</Label>
                <input
                  className={input}
                  type="number"
                  min="1"
                  value={sequence.duration_minutes ?? ""}
                  onChange={(event) =>
                    update(
                      index,
                      "duration_minutes",
                      event.target.value ? Number(event.target.value) : undefined,
                    )
                  }
                />
              </div>
            </div>
            <div className="mt-4">
              <Label>Informations documentées d’appui et preuves liées</Label>
              <select
                multiple
                className={`${input} min-h-24`}
                value={(sequence.documents ?? []).map((document) =>
                  String(asRecord(document)["id"] ?? document),
                )}
                onChange={(event) => {
                  const selectedIds = Array.from(event.target.selectedOptions).map(
                    (option) => option.value,
                  );
                  update(
                    index,
                    "documents",
                    selectedIds.map(
                      (id) => documents.find((document) => document.id === id) ?? { id },
                    ),
                  );
                }}
              >
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.code ? `${document.code} — ` : ""}
                    {document.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {documentsLoading
                  ? "Chargement des documents du site…"
                  : "Sélection facultative ; les références sont conservées avec cette séquence."}
              </p>
            </div>
          </div>
        ))}
        {sequences.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Ajoutez au moins une séquence.
          </p>
        )}
      </div>
    </section>
  );
}

export function ProcessFullPage({
  processId,
  tab: initialTab = "general",
}: {
  processId?: string;
  tab?: string;
}) {
  const [siteId] = useCurrentSite();
  const navigate = useNavigate();
  const { data: existing, isLoading, isError, error, refetch } = useProcess(processId);
  const cartography = useCartographyData(siteId);
  const usersQuery = useQuery({
    queryKey: ["process-full-users", siteId],
    queryFn: async () =>
      asArray(
        await backendApi.request<unknown>(
          `users/job-description-collaborators?site_id=${encodeURIComponent(siteId)}`,
        ),
      ).map((item) => {
        const row = asRecord(item);
        const attrs = asRecord(row["attributes"] ?? row);
        return {
          id: String(row["id"] ?? attrs["id"]),
          name: String(attrs["full_name"] ?? attrs["name"] ?? attrs["email"] ?? "Collaborateur"),
        };
      }),
    enabled: Boolean(siteId),
    staleTime: 30_000,
  });
  const documentsQuery = useQuery({
    queryKey: ["process-full-documents", siteId],
    queryFn: async () =>
      asArray(
        await backendApi.request<unknown>(
          `documents?site_id=${encodeURIComponent(siteId)}&per_page=100`,
        ),
      )
        .map((item) => {
          const row = asRecord(item);
          const attributes = asRecord(row["attributes"] ?? row);
          return {
            id: String(row["id"] ?? attributes["id"] ?? ""),
            title: String(attributes["title"] ?? attributes["name"] ?? ""),
            code: String(attributes["code"] ?? attributes["ref"] ?? ""),
          };
        })
        .filter((document) => document.id && document.title),
    enabled: Boolean(siteId),
    staleTime: 60_000,
  });
  const normsQuery = useQuery({
    queryKey: ["process-full-norms"],
    queryFn: async () => {
      const root = asRecord(await backendApi.request<unknown>("access/catalog"));
      return asArray(root["norms"] ?? asRecord(root["data"])["norms"])
        .map((item) => {
          const row = asRecord(item);
          return String(row["code"] ?? row["name"] ?? "");
        })
        .filter(Boolean);
    },
    staleTime: 60_000,
  });
  const [form, setForm] = useState({
    title: "",
    category: "pilotage",
    purpose: "",
    observation: "",
    methodes: [] as string[],
    interfaces: [] as string[],
    pilot_id: "",
    copilot_ids: [] as string[],
    aspect_qualite: false,
    aspect_environnement: false,
    aspect_sante_securite: false,
    normes_iso: [] as string[],
  });
  const [sequences, setSequences] = useState<ProcessSequenceDraft[]>([emptySequence()]);
  const [resources, setResources] = useState<ResourceGroups>({
    human: [],
    technological: [],
    material: [],
    documentary: [],
  });
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [isoCoverages, setIsoCoverages] = useState<IsoCoverage[]>([]);
  const [indicatorDraft, setIndicatorDraft] = useState({
    name: "",
    type: "performance",
    category: "global",
    unit: "%",
    target_value: "",
    description: "",
  });
  const [editingIndicatorId, setEditingIndicatorId] = useState<string>();
  const [indicatorValueDrafts, setIndicatorValueDrafts] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);
  const [versionDescription, setVersionDescription] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(processId ? initialTab : "general");
  const tab = activeTab;

  useEffect(() => {
    setActiveTab(processId ? initialTab : "general");
  }, [processId, initialTab]);

  useEffect(() => {
    if (!existing) return;
    setForm({
      title: String(existing["title"] ?? existing["name"] ?? ""),
      category: String(existing["category"] ?? existing["type"] ?? "pilotage"),
      purpose: String(existing["purpose"] ?? existing["finalite"] ?? ""),
      observation: String(existing["observation"] ?? ""),
      methodes: stringList(existing["methodes"]),
      interfaces: stringList(existing["interfaces"]),
      pilot_id: existing["pilot_id"] ? String(existing["pilot_id"]) : "",
      copilot_ids: Array.isArray(existing["copilot_ids"])
        ? existing["copilot_ids"].map(String)
        : existing["copilot_id"]
          ? [String(existing["copilot_id"])]
          : [],
      aspect_qualite: Boolean(existing["aspect_qualite"]),
      aspect_environnement: Boolean(existing["aspect_environnement"]),
      aspect_sante_securite: Boolean(existing["aspect_sante_securite"]),
      normes_iso: Array.isArray(existing["normes_iso"]) ? existing["normes_iso"].map(String) : [],
    });
    const loadedSequences = normalizeProcessSequences(existing["sequences"]);
    setSequences(loadedSequences.length > 0 ? loadedSequences : [emptySequence()]);
    setResources(resourceGroups(existing["ressources"] ?? existing["resources"]));
    setObjectives(
      asArray(existing["objectives"]).map((item) => {
        const row = asRecord(item);
        const indicator = asRecord(row["indicator"]);
        return {
          id: row["id"] == null ? undefined : String(row["id"]),
          title: String(row["title"] ?? ""),
          description: String(row["description"] ?? ""),
          indicator_id: row["indicator_id"] == null ? undefined : String(row["indicator_id"]),
          indicator_name: String(row["indicator_name"] ?? indicator["name"] ?? ""),
          target_value: String(row["target_value"] ?? ""),
          target_date: String(row["target_date"] ?? ""),
          status: String(row["status"] ?? "not_started"),
          achievement_percentage: Number(row["achievement_percentage"] ?? 0),
        };
      }),
    );
    setRisks(
      asArray(existing["risks_opportunities"] ?? existing["risks"]).map((item) => {
        const row = asRecord(item);
        const type = String(row["type"] ?? "risque")
          .toLowerCase()
          .includes("opportun")
          ? "opportunite"
          : "risque";
        return {
          id: row["id"] == null ? undefined : String(row["id"]),
          type,
          title: String(row["title"] ?? ""),
          description: String(row["description"] ?? row["title"] ?? ""),
          normes_iso: stringList(row["normes_iso"] ?? row["norms"]),
          probabilite: Number(row["probabilite"] ?? 3),
          gravite: Number(row["gravite"] ?? 3),
          strategie: String(row["strategie"] ?? (type === "risque" ? "reduire" : "exploiter")),
          actions_prevues: String(row["actions_prevues"] ?? ""),
        };
      }),
    );
    setIndicators(
      asArray(existing["indicators"]).map((item) => {
        const row = asRecord(item);
        return {
          ...row,
          id: String(row["id"]),
          name: String(row["name"] ?? ""),
          type: String(row["type"] ?? "performance"),
          category: String(row["category"] ?? "global"),
          unit: String(row["unit"] ?? "%"),
          target_value: row["target_value"] as number | string,
          description: String(row["description"] ?? ""),
        };
      }),
    );
    setIsoCoverages(
      asArray(existing["iso_coverages"]).map((item) => {
        const row = asRecord(item);
        return {
          id: row["id"] == null ? undefined : String(row["id"]),
          norme: String(row["norme"] ?? "9001"),
          version: String(row["version"] ?? "2015"),
          clause_number: String(row["clause_number"] ?? ""),
          clause_title: String(row["clause_title"] ?? ""),
          clause_description: String(row["clause_description"] ?? ""),
          coverage_level: ["none", "partial", "full"].includes(String(row["coverage_level"]))
            ? (String(row["coverage_level"]) as IsoCoverage["coverage_level"])
            : "none",
          coverage_percentage:
            row["coverage_percentage"] == null ? "" : String(row["coverage_percentage"]),
          coverage_comment: String(row["coverage_comment"] ?? ""),
          evidence: stringList(row["evidence"]),
          conformity_status: String(row["conformity_status"] ?? "amelioration"),
          last_audit_date: String(row["last_audit_date"] ?? "").slice(0, 10),
          next_audit_date: String(row["next_audit_date"] ?? "").slice(0, 10),
        };
      }),
    );
  }, [existing]);

  useEffect(() => {
    if (!processId || activeTab !== "versions") return;
    void backendApi
      .request<unknown>(`processes/${processId}/versions`)
      .then((payload) => setVersions(asArray(payload).map(asRecord)))
      .catch(() => toast.error("Impossible de charger l'historique des versions."));
  }, [processId, activeTab]);

  const processOptions = useMemo(
    () =>
      (cartography.data?.processes ?? [])
        .map((process) => String(process.title ?? process.name ?? process.code ?? "").trim())
        .filter(Boolean),
    [cartography.data],
  );
  const updateForm = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateSequence = (index: number, key: string, value: unknown) =>
    setSequences((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  const updateObjective = (index: number, key: keyof Objective, value: unknown) =>
    setObjectives((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  const updateRisk = (index: number, key: keyof Risk, value: unknown) =>
    setRisks((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  const updateIsoCoverage = (index: number, key: keyof IsoCoverage, value: unknown) =>
    setIsoCoverages((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    );
  const saveIsoCoverage = async (index: number) => {
    const coverage = isoCoverages[index];
    if (!coverage || !processId) return;
    if (!coverage.clause_number.trim() || !coverage.clause_title.trim()) {
      toast.error("Le numéro et le titre de la clause sont obligatoires.");
      return;
    }
    const payload = {
      norme: coverage.norme.trim(),
      version: coverage.version.trim() || null,
      clause_number: coverage.clause_number.trim(),
      clause_title: coverage.clause_title.trim(),
      clause_description: coverage.clause_description.trim() || null,
      coverage_level: coverage.coverage_level,
      coverage_percentage:
        coverage.coverage_percentage.trim() === "" ? null : Number(coverage.coverage_percentage),
      coverage_comment: coverage.coverage_comment.trim() || null,
      evidence: coverage.evidence,
      conformity_status: coverage.conformity_status,
      last_audit_date: coverage.last_audit_date || null,
      next_audit_date: coverage.next_audit_date || null,
    };
    try {
      await backendApi.request(
        coverage.id
          ? `processes/${processId}/iso-coverage/${coverage.id}`
          : `processes/${processId}/iso-coverage`,
        {
          method: coverage.id ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      await refetch();
      toast.success("Couverture ISO enregistrée.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d’enregistrer la couverture.",
      );
    }
  };
  const deleteIsoCoverage = async (coverage: IsoCoverage) => {
    if (!processId || !coverage.id) return;
    try {
      await backendApi.request(`processes/${processId}/iso-coverage/${coverage.id}`, {
        method: "DELETE",
      });
      await refetch();
      toast.success("Couverture ISO supprimée.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible de supprimer la couverture.",
      );
    }
  };

  const persistChildren = async (id: string, isUpdate: boolean) => {
    const originalObjectiveIds = new Set(
      asArray(existing?.["objectives"])
        .map((item) => String(asRecord(item)["id"]))
        .filter(Boolean),
    );
    for (const objectiveId of originalObjectiveIds)
      if (!objectives.some((item) => item.id === objectiveId))
        await backendApi.request(`processes/${id}/objectives/${objectiveId}`, { method: "DELETE" });
    for (const objective of objectives.filter((item) => item.title.trim())) {
      const payload = {
        title: objective.title.trim(),
        description: objective.description.trim(),
        indicator_id: objective.indicator_id ? Number(objective.indicator_id) : null,
        indicator_name: objective.indicator_name.trim() || objective.title.trim(),
        target_value: objective.target_value === "" ? null : Number(objective.target_value),
        target_date: objective.target_date || null,
        status: objective.status ?? "not_started",
        achievement_percentage: objective.achievement_percentage ?? 0,
      };
      if (objective.id)
        await backendApi.request(`processes/${id}/objectives/${objective.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      else
        await backendApi.request(`processes/${id}/objectives`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
    }
    const originalRiskIds = new Set(
      asArray(existing?.["risks_opportunities"] ?? existing?.["risks"])
        .map((item) => String(asRecord(item)["id"]))
        .filter(Boolean),
    );
    for (const riskId of originalRiskIds)
      if (!risks.some((item) => item.id === riskId))
        await backendApi.request(`risks-opportunities/${riskId}`, { method: "DELETE" });
    for (const risk of risks.filter((item) => item.description.trim() || item.title.trim())) {
      const payload = {
        type: risk.type,
        title: (risk.title.trim() || risk.description.trim()).slice(0, 255),
        description: risk.description.trim() || risk.title.trim(),
        normes_iso: risk.normes_iso,
        probabilite: risk.probabilite,
        gravite: risk.gravite,
        strategie: risk.strategie,
        actions_prevues: risk.actions_prevues,
      };
      if (risk.id)
        await backendApi.request(`risks-opportunities/${risk.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      else
        await backendApi.request(`processes/${id}/risks-opportunities`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
    }
    void isUpdate;
  };

  const persistIndicators = async (id: string, onlyDrafts: boolean) => {
    const pending = indicators.filter(
      (indicator) => indicator.name.trim() && (!onlyDrafts || indicator.id.startsWith("draft-")),
    );
    for (const indicator of pending) {
      await backendApi.request(`processes/${id}/indicators`, {
        method: "POST",
        body: JSON.stringify({
          name: indicator.name.trim(),
          type: indicator.type,
          category: indicator.category,
          unit: indicator.unit.trim() || "%",
          target_value:
            indicator.target_value == null || indicator.target_value === ""
              ? null
              : Number(indicator.target_value),
          description: String(indicator.description ?? "").trim(),
        }),
      });
    }
  };

  const saveAll = async (nextTab?: string): Promise<boolean> => {
    if (!siteId || !form.title.trim() || !form.purpose.trim()) {
      toast.error("Le nom et la finalité du processus sont obligatoires.");
      return false;
    }
    if (sequences.some((sequence) => !String(sequence.activity_description ?? "").trim())) {
      toast.error("Chaque séquence doit avoir une activité.");
      return false;
    }
    if (form.pilot_id && !/^\d+$/.test(form.pilot_id)) {
      toast.error("Le pilote sélectionné est invalide.");
      return false;
    }
    if (form.copilot_ids.some((id) => !/^\d+$/.test(id))) {
      toast.error("Un des copilotes sélectionnés est invalide.");
      return false;
    }
    if (
      sequences.some(
        (sequence) =>
          sequence.responsible_user_id && !/^\d+$/.test(String(sequence.responsible_user_id)),
      )
    ) {
      toast.error("Le responsable d'une séquence doit être choisi dans la liste.");
      return false;
    }
    setSaving(true);
    try {
      const copilotIds = form.copilot_ids
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
      const payload = {
        site_id: Number(siteId),
        title: form.title.trim(),
        name: form.title.trim(),
        category: form.category,
        type: form.category,
        purpose: form.purpose.trim(),
        finalite: form.purpose.trim(),
        observation: form.observation.trim() || null,
        methodes: form.methodes,
        interfaces: form.interfaces,
        pilot_id: form.pilot_id ? Number(form.pilot_id) : null,
        copilot_ids: copilotIds,
        copilot_id: copilotIds[0] ?? null,
        aspect_qualite: form.aspect_qualite,
        aspect_environnement: form.aspect_environnement,
        aspect_sante_securite: form.aspect_sante_securite,
        normes_iso: form.normes_iso,
        ressources: resources,
        sequences: sequences.map((sequence, index) => ({
          ...sequence,
          sequence_order: index + 1,
          responsible_user_id: sequence.responsible_user_id
            ? Number(sequence.responsible_user_id)
            : null,
          sub_activities: stringList(sequence.sub_activities),
          supplier_processes: stringList(sequence.supplier_processes),
          client_processes: stringList(sequence.client_processes),
          document_ids: (sequence.documents ?? [])
            .map((document) => Number(asRecord(document)["id"]))
            .filter(Boolean),
        })),
      };
      const response = await backendApi.request<unknown>(
        processId ? `processes/${processId}` : "processes",
        { method: processId ? "PUT" : "POST", body: JSON.stringify(payload) },
      );
      const root = asRecord(response);
      const data = asRecord(root["data"]);
      const id = String(
        data["id"] ?? asRecord(data["attributes"])["id"] ?? root["id"] ?? processId ?? "",
      );
      if (!id) throw new Error("Le processus n'a pas retourné d'identifiant.");
      await persistChildren(id, Boolean(processId));
      await persistIndicators(id, !processId);
      await refetch();
      toast.success("Processus et sous-sections enregistrés.");
      if (!processId)
        navigate({
          to: "/app/$section",
          params: { section: "processus" },
          search: { open: id, tab: nextTab ?? "general" },
        });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'enregistrer le processus.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveIndicator = async () => {
    if (!indicatorDraft.name.trim()) {
      toast.error("Le nom du KPI est obligatoire.");
      return;
    }
    if (!processId) {
      const draft = {
        id: editingIndicatorId ?? `draft-${Date.now()}`,
        name: indicatorDraft.name.trim(),
        type: indicatorDraft.type,
        category: indicatorDraft.category,
        unit: indicatorDraft.unit.trim() || "%",
        target_value:
          indicatorDraft.target_value === "" ? null : Number(indicatorDraft.target_value),
        description: indicatorDraft.description.trim(),
        values: [],
      } as Indicator;
      setIndicators((current) =>
        editingIndicatorId
          ? current.map((item) => (item.id === editingIndicatorId ? { ...item, ...draft } : item))
          : [...current, draft],
      );
      setIndicatorDraft({
        name: "",
        type: "performance",
        category: "global",
        unit: "%",
        target_value: "",
        description: "",
      });
      setEditingIndicatorId(undefined);
      toast.success(
        editingIndicatorId ? "KPI modifié dans le brouillon." : "KPI ajouté au brouillon.",
      );
      return;
    }
    try {
      const response = await backendApi.request<unknown>(
        `processes/${processId}/indicators${editingIndicatorId ? `/${editingIndicatorId}` : ""}`,
        {
          method: editingIndicatorId ? "PUT" : "POST",
          body: JSON.stringify({
            ...indicatorDraft,
            target_value:
              indicatorDraft.target_value === "" ? null : Number(indicatorDraft.target_value),
          }),
        },
      );
      const row = asRecord(asRecord(response)["data"]);
      const normalized = {
        ...row,
        id: String(row["id"]),
        name: String(row["name"]),
        type: String(row["type"]),
        category: String(row["category"]),
        unit: String(row["unit"]),
      } as Indicator;
      setIndicators((current) =>
        editingIndicatorId
          ? current.map((item) =>
              item.id === editingIndicatorId ? { ...item, ...normalized } : item,
            )
          : [...current, normalized],
      );
      setIndicatorDraft({
        name: "",
        type: "performance",
        category: "global",
        unit: "%",
        target_value: "",
        description: "",
      });
      setEditingIndicatorId(undefined);
      toast.success(editingIndicatorId ? "KPI modifié." : "KPI ajouté.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer le KPI.");
    }
  };
  const deleteIndicator = async (id: string) => {
    if (!processId) {
      setIndicators((current) => current.filter((item) => item.id !== id));
      return;
    }
    try {
      await backendApi.request(`processes/${processId}/indicators/${id}`, { method: "DELETE" });
      setIndicators((current) => current.filter((item) => item.id !== id));
      toast.success("KPI supprimé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer le KPI.");
    }
  };
  const editIndicator = (indicator: Indicator) => {
    setEditingIndicatorId(indicator.id);
    setIndicatorDraft({
      name: indicator.name,
      type: indicator.type,
      category: indicator.category,
      unit: indicator.unit,
      target_value: indicator.target_value == null ? "" : String(indicator.target_value),
      description: String(indicator.description ?? ""),
    });
  };
  const addIndicatorValue = async (indicator: Indicator) => {
    if (!processId) {
      toast.error("Enregistrez le processus avant d'enregistrer une mesure.");
      return;
    }
    if (!indicatorValueDrafts[indicator.id]) return;
    try {
      await backendApi.request(`indicators/${indicator.id}/values`, {
        method: "POST",
        body: JSON.stringify({
          measurement_date: new Date().toISOString().slice(0, 10),
          value: Number(indicatorValueDrafts[indicator.id]),
        }),
      });
      setIndicatorValueDrafts((current) => ({ ...current, [indicator.id]: "" }));
      await refetch();
      toast.success("Valeur KPI enregistrée.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d'enregistrer la valeur KPI.",
      );
    }
  };
  const createVersion = async () => {
    if (!processId || !versionDescription.trim()) return;
    try {
      await backendApi.request(`processes/${processId}/versions`, {
        method: "POST",
        body: JSON.stringify({ changes_description: versionDescription.trim() }),
      });
      setVersionDescription("");
      const response = await backendApi.request<unknown>(`processes/${processId}/versions`);
      setVersions(asArray(response).map(asRecord));
      toast.success("Version créée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer la version.");
    }
  };
  const versionAction = async (versionId: string, action: "verify" | "approve") => {
    if (!processId) return;
    try {
      await backendApi.request(`processes/${processId}/versions/${versionId}/${action}`, {
        method: "POST",
      });
      const response = await backendApi.request<unknown>(`processes/${processId}/versions`);
      setVersions(asArray(response).map(asRecord));
      toast.success(action === "verify" ? "Version vérifiée." : "Version approuvée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action sur la version impossible.");
    }
  };
  const workflow = async (action: "verify" | "validate" | "reject") => {
    if (!processId) return;
    if (action === "reject" && !comment.trim()) {
      toast.error("Le motif du rejet est obligatoire.");
      return;
    }
    try {
      await backendApi.request(
        `processes/${processId}/${action === "validate" ? "validate" : action}`,
        {
          method: "POST",
          body: JSON.stringify(
            action === "reject" ? { reason: comment.trim() } : { comment: comment.trim() },
          ),
        },
      );
      setComment("");
      await refetch();
      toast.success("Workflow mis à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action de workflow impossible.");
    }
  };
  const exportProcess = async (format: "pdf" | "docx") => {
    if (!processId) return;
    try {
      const blob = await backendApi.blob(
        `processes/${processId}/export-${format}${format === "pdf" ? "?preview=1" : ""}`,
      );
      downloadBlob(blob, `Fiche_Processus_${processId}.${format}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export impossible.");
    }
  };
  const generateDraft = async () => {
    if (!processId) return;
    try {
      await backendApi.request(`processes/${processId}/generate-draft`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Brouillon documentaire généré.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de générer le brouillon.");
    }
  };

  if (!siteId)
    return (
      <div className={`${card} mx-auto max-w-5xl p-10 text-center`}>
        Sélectionnez un site pour gérer le processus.
      </div>
    );
  if (isLoading)
    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className={`${card} p-10 text-center ${muted}`}>Chargement de la fiche processus…</div>
      </div>
    );
  if (processId && isError)
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <div className={`${card} p-8 text-center`}>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Fiche processus</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">Fiche introuvable</h1>
          <p className={`mx-auto mt-3 max-w-xl ${muted}`}>
            Cette fiche processus n&rsquo;existe pas ou n&rsquo;est plus accessible. Elle a
            peut-&ecirc;tre &eacute;t&eacute; supprim&eacute;e, ou l&rsquo;identifiant dans
            l&rsquo;adresse est invalide.
          </p>
          <p className="mx-auto mt-4 max-w-xl break-words rounded-xl bg-background p-3 text-xs text-muted-foreground">
            {String(error?.message ?? "Processus introuvable.")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => navigate({ to: "/app/$section", params: { section: "processus" } })}
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <button type="button" className={primary} onClick={() => void refetch()}>
              R&eacute;essayer
            </button>
          </div>
        </div>
      </div>
    );
  if (processId && tab === "sequences") return <ProcessSequencesPage processId={processId} />;
  const status = String(existing?.["status"] ?? "draft");
  const processNames = (usersQuery.data ?? []).map((user) => user.name);
  const tabLabel = tabs.find(([value]) => value === tab)?.[1] ?? "Général";
  const creationIndex = creationTabs.findIndex(([value]) => value === tab);
  const processIndex = tabs.findIndex(([value]) => value === tab);
  const moveProcessStep = async (direction: -1 | 1) => {
    const target = tabs[processIndex + direction]?.[0];
    if (!target) return;
    if (await saveAll()) setActiveTab(target);
  };
  const goNext = async () => {
    if (tab === "general" && (!form.title.trim() || !form.purpose.trim())) {
      toast.error("Le nom et la finalité du processus sont obligatoires.");
      return;
    }
    if (
      tab === "sequences" &&
      (sequences.length === 0 ||
        sequences.some((sequence) => !String(sequence.activity_description ?? "").trim()))
    ) {
      toast.error("Ajoutez au moins une séquence avec une activité renseignée.");
      return;
    }
    if (creationIndex >= creationTabs.length - 1) {
      await saveAll();
      return;
    }
    const nextTab = creationTabs[creationIndex + 1]![0];
    if (!processId) {
      await saveAll(nextTab);
      return;
    }
    setActiveTab(nextTab);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary-soft p-3 text-primary">
            <GitBranch className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              Système de management
            </p>
            <h1 className="font-display text-2xl font-extrabold">
              {processId ? form.title || "Processus" : "Nouveau processus"}
            </h1>
            <p className={muted}>{tabLabel} — fiche complète de référence.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondary}
            onClick={() => navigate({ to: "/app/$section", params: { section: "processus" } })}
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </button>
          {processId && (
            <>
              <button className={secondary} onClick={() => void generateDraft()}>
                <FileText className="h-4 w-4" /> Brouillon
              </button>
              <button className={secondary} onClick={() => void exportProcess("pdf")}>
                <FileDown className="h-4 w-4" /> PDF
              </button>
              <button className={secondary} onClick={() => void exportProcess("docx")}>
                <FileText className="h-4 w-4" /> DOCX
              </button>
            </>
          )}
          <button className={primary} disabled={saving} onClick={() => void saveAll()}>
            <Save className="h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
      {processId && (
        <div className={`${card} flex items-center justify-between gap-3 p-4`}>
          <button
            type="button"
            className={secondary}
            disabled={processIndex <= 0 || saving}
            onClick={() => void moveProcessStep(-1)}
          >
            <ArrowLeft className="h-4 w-4" /> Précédent
          </button>
          <p className="text-sm font-semibold text-muted-foreground">
            Étape {processIndex + 1} sur {tabs.length} — {tabLabel}
            <br />
            <span className="text-xs font-normal">
              Enregistrez avant de passer à l’étape suivante.
            </span>
          </p>
          <button
            type="button"
            className={primary}
            disabled={processIndex >= tabs.length - 1 || saving}
            onClick={() => void moveProcessStep(1)}
          >
            Enregistrer et continuer <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
      {!processId && (
        <div className={`${card} flex items-center justify-between gap-3 p-4`}>
          <button
            type="button"
            className={secondary}
            disabled={creationIndex <= 0 || saving}
            onClick={() => setActiveTab(creationTabs[creationIndex - 1]![0])}
          >
            Précédent
          </button>
          <p className="text-sm font-semibold text-muted-foreground">
            Étape {creationIndex + 1} sur {creationTabs.length} — {tabLabel}
          </p>
          <button type="button" className={primary} disabled={saving} onClick={goNext}>
            {creationIndex >= creationTabs.length - 1 ? "Créer le processus" : "Suivant"}
          </button>
        </div>
      )}
      {tab === "general" && (
        <section className={`${card} p-6`}>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Nom du processus *</Label>
              <input
                className={input}
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Ex. Gestion des commandes"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Finalité *</Label>
              <textarea
                className={`${input} min-h-28`}
                value={form.purpose}
                onChange={(event) => updateForm("purpose", event.target.value)}
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <select
                className={input}
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
              >
                <option value="pilotage">Management</option>
                <option value="operationnel">Réalisation</option>
                <option value="support">Support</option>
              </select>
            </div>
            <div>
              <Label>Pilote</Label>
              <select
                className={input}
                value={form.pilot_id}
                onChange={(event) => updateForm("pilot_id", event.target.value)}
              >
                <option value="">Non assigné</option>
                {usersQuery.data?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Copilotes</Label>
              <select
                multiple
                className={`${input} min-h-24`}
                value={form.copilot_ids}
                onChange={(event) =>
                  updateForm(
                    "copilot_ids",
                    Array.from(event.target.selectedOptions).map((option) => option.value),
                  )
                }
              >
                {usersQuery.data?.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Observation</Label>
              <textarea
                className={`${input} min-h-24`}
                value={form.observation}
                onChange={(event) => updateForm("observation", event.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Critères et méthodes de maîtrise</Label>
              <textarea
                className={`${input} min-h-24`}
                value={form.methodes.join("\n")}
                onChange={(event) =>
                  updateForm(
                    "methodes",
                    event.target.value
                      .split("\n")
                      .map((method) => method.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="Décrivez les critères d’acceptation, la surveillance, les mesures et leur fréquence — une méthode par ligne."
              />
            </div>
            <div className="md:col-span-2">
              <Label>Interfaces avec les autres processus</Label>
              <textarea
                className={`${input} min-h-20`}
                value={form.interfaces.join("\n")}
                onChange={(event) =>
                  updateForm(
                    "interfaces",
                    event.target.value
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="Une interface par ligne : fournisseur, client ou processus lié"
              />
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(
              [
                ["aspect_qualite", "Qualité"],
                ["aspect_environnement", "Environnement"],
                ["aspect_sante_securite", "Santé & sécurité"],
              ] as [string, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-semibold"
              >
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof typeof form])}
                  onChange={(event) => updateForm(key, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-6">
            <Label>Normes ISO applicables</Label>
            <div className="flex flex-wrap gap-2">
              {(normsQuery.data ?? []).map((norm) => (
                <button
                  type="button"
                  key={norm}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${form.normes_iso.includes(norm) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  onClick={() =>
                    updateForm(
                      "normes_iso",
                      form.normes_iso.includes(norm)
                        ? form.normes_iso.filter((item) => item !== norm)
                        : [...form.normes_iso, norm],
                    )
                  }
                >
                  {norm}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      {tab === "sequences" &&
        (processId ? (
          <ProcessSequencesPage processId={processId} />
        ) : (
          <NewProcessSequencesEditor
            sequences={sequences}
            setSequences={setSequences}
            processOptions={processOptions}
            users={usersQuery.data ?? []}
            documents={documentsQuery.data ?? []}
            documentsLoading={documentsQuery.isLoading}
          />
        ))}
      {tab === "objectives" && (
        <section className={`${card} p-6`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Objectifs et indicateurs associés</h2>
              <p className={muted}>
                Même cycle de création, édition, progression et suppression que
                `ProcessObjectivesManager.vue`.
              </p>
            </div>
            <button
              className={secondary}
              onClick={() => setObjectives((current) => [...current, emptyObjective()])}
            >
              <Plus className="h-4 w-4" /> Ajouter un objectif
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {objectives.map((objective, index) => (
              <div
                key={objective.id ?? `new-${index}`}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className={input}
                    value={objective.title}
                    onChange={(event) => updateObjective(index, "title", event.target.value)}
                    placeholder="Titre de l'objectif *"
                  />
                  <select
                    className={input}
                    value={objective.indicator_id ?? ""}
                    onChange={(event) => {
                      const indicator = indicators.find((item) => item.id === event.target.value);
                      updateObjective(index, "indicator_id", event.target.value || undefined);
                      updateObjective(index, "indicator_name", indicator?.name ?? "");
                    }}
                  >
                    <option value="">Indicateur associé (optionnel)</option>
                    {indicators
                      .filter(
                        (indicator) =>
                          !objectives.some(
                            (other, otherIndex) =>
                              otherIndex !== index && other.indicator_id === indicator.id,
                          ),
                      )
                      .map((indicator) => (
                        <option key={indicator.id} value={indicator.id}>
                          {indicator.name}
                        </option>
                      ))}
                  </select>
                  <input
                    className={input}
                    value={objective.indicator_name}
                    onChange={(event) =>
                      updateObjective(index, "indicator_name", event.target.value)
                    }
                    placeholder="Nom libre de l'indicateur"
                  />
                  <textarea
                    className={`${input} min-h-20 md:col-span-2`}
                    value={objective.description}
                    onChange={(event) => updateObjective(index, "description", event.target.value)}
                    placeholder="Description"
                  />
                  <input
                    className={input}
                    type="number"
                    value={objective.target_value}
                    onChange={(event) => updateObjective(index, "target_value", event.target.value)}
                    placeholder="Valeur cible"
                  />
                  <input
                    className={input}
                    type="date"
                    value={objective.target_date}
                    onChange={(event) => updateObjective(index, "target_date", event.target.value)}
                  />
                  <div className="flex items-center gap-3">
                    <input
                      className={input}
                      type="range"
                      min="0"
                      max="100"
                      value={objective.achievement_percentage ?? 0}
                      onChange={(event) =>
                        updateObjective(index, "achievement_percentage", Number(event.target.value))
                      }
                    />
                    <span className="text-sm font-bold">
                      {objective.achievement_percentage ?? 0}%
                    </span>
                  </div>
                  <select
                    className={input}
                    value={objective.status ?? "not_started"}
                    onChange={(event) => updateObjective(index, "status", event.target.value)}
                  >
                    <option value="not_started">Non démarré</option>
                    <option value="in_progress">En cours</option>
                    <option value="achieved">Atteint</option>
                    <option value="failed">Échoué</option>
                  </select>
                  <button
                    className="justify-self-end rounded-xl p-2 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setObjectives((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {objectives.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucun objectif défini.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "resources" && (
        <section className="space-y-4">
          <div className={`${card} p-6`}>
            <h2 className="font-display text-xl font-bold">Ressources nécessaires</h2>
            <p className={muted}>
              Ressources humaines, technologiques, matérielles et documentaires.
            </p>
          </div>
          <ProcessResourceEditor resources={resources} setResources={setResources} />
        </section>
      )}
      {tab === "risks" && (
        <section className={`${card} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Risques et opportunités</h2>
              <p className={muted}>Évaluation et actions de maîtrise enregistrées.</p>
            </div>
            <div className="flex gap-2">
              <button
                className={secondary}
                onClick={() => setRisks((current) => [...current, emptyRisk("risque")])}
              >
                <Plus className="h-4 w-4" /> Risque
              </button>
              <button
                className={secondary}
                onClick={() => setRisks((current) => [...current, emptyRisk("opportunite")])}
              >
                <Plus className="h-4 w-4" /> Opportunité
              </button>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {risks.map((risk, index) => (
              <div
                key={risk.id ?? `risk-${index}`}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${risk.type === "risque" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}
                  >
                    {risk.type === "risque" ? "Risque" : "Opportunité"}
                  </span>
                  <button
                    className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setRisks((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className={input}
                    value={risk.title}
                    onChange={(event) => updateRisk(index, "title", event.target.value)}
                    placeholder="Titre"
                  />
                  <input
                    className={input}
                    value={risk.normes_iso.join(", ")}
                    onChange={(event) =>
                      updateRisk(
                        index,
                        "normes_iso",
                        event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="Normes ISO"
                  />
                  <textarea
                    className={`${input} min-h-24 md:col-span-2`}
                    value={risk.description}
                    onChange={(event) => updateRisk(index, "description", event.target.value)}
                    placeholder="Description"
                  />
                  <div>
                    <Label>Probabilité (1-4)</Label>
                    <input
                      className={input}
                      type="number"
                      min="1"
                      max="4"
                      value={risk.probabilite}
                      onChange={(event) =>
                        updateRisk(index, "probabilite", Number(event.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label>Gravité (1-4)</Label>
                    <input
                      className={input}
                      type="number"
                      min="1"
                      max="4"
                      value={risk.gravite}
                      onChange={(event) => updateRisk(index, "gravite", Number(event.target.value))}
                    />
                  </div>
                  <input
                    className={input}
                    value={risk.strategie}
                    onChange={(event) => updateRisk(index, "strategie", event.target.value)}
                    placeholder="Stratégie"
                  />
                  <input
                    className={input}
                    value={risk.actions_prevues}
                    onChange={(event) => updateRisk(index, "actions_prevues", event.target.value)}
                    placeholder="Actions prévues"
                  />
                </div>
              </div>
            ))}
            {risks.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucun risque ou opportunité défini.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "indicators" && (
        <section className={`${card} p-6`}>
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold">Indicateurs de performance (KPI)</h2>
              <p className={muted}>Création, édition, valeurs mesurées et suppression suivies.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 rounded-xl border border-border bg-background p-4 md:grid-cols-6">
            <input
              className={`${input} md:col-span-2`}
              value={indicatorDraft.name}
              onChange={(event) =>
                setIndicatorDraft({ ...indicatorDraft, name: event.target.value })
              }
              placeholder="Nom du KPI"
            />
            <select
              className={input}
              value={indicatorDraft.type}
              onChange={(event) =>
                setIndicatorDraft({ ...indicatorDraft, type: event.target.value })
              }
            >
              <option value="performance">Performance</option>
              <option value="efficacite">Efficacité</option>
              <option value="efficience">Efficience</option>
              <option value="conformite">Conformité</option>
            </select>
            <select
              className={input}
              value={indicatorDraft.category}
              onChange={(event) =>
                setIndicatorDraft({ ...indicatorDraft, category: event.target.value })
              }
            >
              <option value="global">Global</option>
              <option value="qualite">Qualité</option>
              <option value="environnement">Environnement</option>
              <option value="sante_securite">Santé & sécurité</option>
            </select>
            <input
              className={input}
              value={indicatorDraft.unit}
              onChange={(event) =>
                setIndicatorDraft({ ...indicatorDraft, unit: event.target.value })
              }
              placeholder="Unité"
            />
            <input
              className={input}
              type="number"
              value={indicatorDraft.target_value}
              onChange={(event) =>
                setIndicatorDraft({ ...indicatorDraft, target_value: event.target.value })
              }
              placeholder="Cible"
            />
            <button className={`${primary} md:col-span-6`} onClick={() => void saveIndicator()}>
              <Plus className="h-4 w-4" />{" "}
              {editingIndicatorId ? "Modifier le KPI" : "Ajouter le KPI"}
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {indicators.map((indicator) => {
              const current = Number(currentIndicatorValue(indicator));
              const target = Number(indicator.target_value);
              const progress =
                Number.isFinite(current) && Number.isFinite(target) && target > 0
                  ? Math.min(100, Math.max(0, (current / target) * 100))
                  : 0;
              return (
                <div
                  key={indicator.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-primary">
                        {indicator.type} · {indicator.category}
                      </p>
                      <h3 className="font-display font-bold">{indicator.name}</h3>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="rounded-xl p-2 text-muted-foreground hover:text-primary"
                        onClick={() => editIndicator(indicator)}
                      >
                        <Wrench className="h-4 w-4" />
                      </button>
                      <button
                        className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                        onClick={() => void deleteIndicator(indicator.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Valeur actuelle</p>
                      <p className="text-xl font-bold">
                        {currentIndicatorValue(indicator)} {indicator.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Objectif</p>
                      <p className="text-xl font-bold">
                        {String(indicator.target_value ?? "N/A")} {indicator.unit}
                      </p>
                    </div>
                  </div>
                  {target > 0 && (
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Progression : {Math.round(progress)}%
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <input
                      className={input}
                      type="number"
                      value={indicatorValueDrafts[indicator.id] ?? ""}
                      onChange={(event) =>
                        setIndicatorValueDrafts((current) => ({
                          ...current,
                          [indicator.id]: event.target.value,
                        }))
                      }
                      placeholder="Valeur actuelle"
                    />
                    <button className={secondary} onClick={() => void addIndicatorValue(indicator)}>
                      Mesurer
                    </button>
                  </div>
                </div>
              );
            })}
            {indicators.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground md:col-span-2">
                Aucun KPI défini.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "coverage" && (
        <section className={`${card} p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Couverture des exigences ISO</h2>
              <p className={muted}>
                Reliez une clause applicable à ce processus et consignez le niveau, la conformité et
                les preuves vérifiables. Cette liste n’est pas une bibliothèque exhaustive des
                clauses normatives.
              </p>
            </div>
            <button
              type="button"
              className={secondary}
              disabled={!processId}
              onClick={() =>
                setIsoCoverages((current) => [
                  ...current,
                  {
                    norme: "9001",
                    version: "2026",
                    clause_number: "",
                    clause_title: "",
                    clause_description: "",
                    coverage_level: "none",
                    coverage_percentage: "",
                    coverage_comment: "",
                    evidence: [],
                    conformity_status: "amelioration",
                    last_audit_date: "",
                    next_audit_date: "",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Ajouter une clause
            </button>
          </div>
          {!processId && (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Créez d’abord le processus pour enregistrer sa couverture ISO.
            </p>
          )}
          <div className="mt-5 space-y-4">
            {isoCoverages.map((coverage, index) => (
              <article
                key={coverage.id ?? `new-${index}`}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Norme</Label>
                    <select
                      className={input}
                      value={coverage.norme}
                      onChange={(event) => updateIsoCoverage(index, "norme", event.target.value)}
                    >
                      {Array.from(
                        new Set([
                          "9001",
                          ...["14001", "45001", "27001", "22000"].filter((code) =>
                            ["9001", ...stringList(normsQuery.data)].some(
                              (candidate) => candidate.replace(/^ISO\s*/i, "") === code,
                            ),
                          ),
                        ]),
                      ).map((norm) => (
                        <option key={norm} value={norm.replace(/^ISO\s*/i, "")}>
                          {norm.startsWith("ISO ") ? norm : `ISO ${norm}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Édition</Label>
                    <input
                      className={input}
                      value={coverage.version}
                      onChange={(event) => updateIsoCoverage(index, "version", event.target.value)}
                      placeholder="2026"
                    />
                  </div>
                  <div>
                    <Label>Numéro de clause *</Label>
                    <input
                      className={input}
                      value={coverage.clause_number}
                      onChange={(event) =>
                        updateIsoCoverage(index, "clause_number", event.target.value)
                      }
                      placeholder="Ex. 4.1"
                    />
                  </div>
                  <div>
                    <Label>Titre de clause *</Label>
                    <input
                      className={input}
                      value={coverage.clause_title}
                      onChange={(event) =>
                        updateIsoCoverage(index, "clause_title", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>Niveau de couverture</Label>
                    <select
                      className={input}
                      value={coverage.coverage_level}
                      onChange={(event) =>
                        updateIsoCoverage(
                          index,
                          "coverage_level",
                          event.target.value as IsoCoverage["coverage_level"],
                        )
                      }
                    >
                      <option value="none">Aucune</option>
                      <option value="partial">Partielle</option>
                      <option value="full">Complète</option>
                    </select>
                  </div>
                  <div>
                    <Label>Estimation de couverture (%)</Label>
                    <input
                      className={input}
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={coverage.coverage_percentage}
                      onChange={(event) =>
                        updateIsoCoverage(index, "coverage_percentage", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>État de conformité</Label>
                    <select
                      className={input}
                      value={coverage.conformity_status}
                      onChange={(event) =>
                        updateIsoCoverage(index, "conformity_status", event.target.value)
                      }
                    >
                      <option value="conforme">Conforme</option>
                      <option value="amelioration">À améliorer</option>
                      <option value="non_conforme">Non conforme</option>
                      <option value="non_applicable">Non applicable</option>
                    </select>
                  </div>
                  <div>
                    <Label>Dernier audit</Label>
                    <input
                      className={input}
                      type="date"
                      value={coverage.last_audit_date}
                      onChange={(event) =>
                        updateIsoCoverage(index, "last_audit_date", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>Prochain audit</Label>
                    <input
                      className={input}
                      type="date"
                      value={coverage.next_audit_date}
                      onChange={(event) =>
                        updateIsoCoverage(index, "next_audit_date", event.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description / applicabilité au processus</Label>
                    <textarea
                      className={`${input} min-h-20`}
                      value={coverage.clause_description}
                      onChange={(event) =>
                        updateIsoCoverage(index, "clause_description", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>Commentaire et décision</Label>
                    <textarea
                      className={`${input} min-h-20`}
                      value={coverage.coverage_comment}
                      onChange={(event) =>
                        updateIsoCoverage(index, "coverage_comment", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label>Références des preuves (une par ligne)</Label>
                    <textarea
                      className={`${input} min-h-20`}
                      value={coverage.evidence.join("\n")}
                      onChange={(event) =>
                        updateIsoCoverage(
                          index,
                          "evidence",
                          event.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="Code documentaire, URL ou identifiant d’enregistrement"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={secondary}
                    onClick={() =>
                      coverage.id
                        ? void deleteIsoCoverage(coverage)
                        : setIsoCoverages((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                    }
                  >
                    <Trash2 className="h-4 w-4" /> Supprimer
                  </button>
                  <button
                    type="button"
                    className={primary}
                    onClick={() => void saveIsoCoverage(index)}
                  >
                    <Save className="h-4 w-4" /> Enregistrer la couverture
                  </button>
                </div>
              </article>
            ))}
            {isoCoverages.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucune clause enregistrée pour ce processus.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "versions" && (
        <section className={`${card} p-6`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <Label>Description des changements</Label>
              <input
                className={input}
                value={versionDescription}
                onChange={(event) => setVersionDescription(event.target.value)}
                placeholder="Ex. Révision des objectifs et des séquences"
              />
            </div>
            <button className={primary} disabled={!processId} onClick={() => void createVersion()}>
              <Plus className="h-4 w-4" /> Créer une version
            </button>
          </div>
          <div className="mt-5 space-y-2">
            {versions.map((version, index) => (
              <div
                key={String(version["id"] ?? index)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"
              >
                <div>
                  <p className="font-bold">Version {String(version["version_number"] ?? "—")}</p>
                  <p className="text-sm text-muted-foreground">
                    {String(version["changes_description"] ?? "")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                    {String(version["status"] ?? "draft")}
                  </span>
                  {String(version["status"]) === "draft" && (
                    <button
                      className={secondary}
                      onClick={() => void versionAction(String(version["id"]), "verify")}
                    >
                      Vérifier
                    </button>
                  )}
                  {String(version["status"]) === "verified" && (
                    <button
                      className={primary}
                      onClick={() => void versionAction(String(version["id"]), "approve")}
                    >
                      Approuver
                    </button>
                  )}
                </div>
              </div>
            ))}
            {versions.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucune version historique.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "interactions" && (
        <section className={`${card} p-6`}>
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold">Cartographie & interactions</h2>
              <p className={muted}>
                Processus fournisseurs en amont, processus clients en aval et matrice des
                interactions du site.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {["upstream", "downstream"].map((direction) => {
              const links = (cartography.data?.interactions ?? []).filter((link) =>
                direction === "upstream"
                  ? String(link.target_id) === String(processId)
                  : String(link.source_id) === String(processId),
              );
              return (
                <div key={direction} className="rounded-xl border border-border bg-background p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {direction === "upstream" ? "Fournisseurs en amont" : "Clients en aval"} (
                    {links.length})
                  </p>
                  {links.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Aucune interaction déclarée.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {links.map((link) => {
                        const id = direction === "upstream" ? link.source_id : link.target_id;
                        const process = (cartography.data?.processes ?? []).find(
                          (item) => String(item.id) === String(id),
                        );
                        return (
                          <li
                            key={String(link.id ?? `${link.source_id}-${link.target_id}`)}
                            className="rounded-lg border border-border p-3 text-sm"
                          >
                            <p className="font-bold">
                              {String(
                                process?.title ??
                                  process?.name ??
                                  (direction === "upstream"
                                    ? link.source_title
                                    : link.target_title) ??
                                  id,
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {String(link.label ?? link.nature ?? "Interaction de processus")}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Cible</th>
                  <th className="px-3 py-2">Nature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(cartography.data?.interactions ?? [])
                  .filter(
                    (link) =>
                      String(link.source_id) === String(processId) ||
                      String(link.target_id) === String(processId),
                  )
                  .map((link) => (
                    <tr key={String(link.id ?? `${link.source_id}-${link.target_id}`)}>
                      <td className="px-3 py-2">
                        {String(link.source_title ?? link.source_code ?? link.source_id)}
                      </td>
                      <td className="px-3 py-2">
                        {String(link.target_title ?? link.target_code ?? link.target_id)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {String(link.label ?? link.nature ?? "—")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "workflow" && (
        <section className={`${card} p-6`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold">Workflow de validation</h2>
              <p className={muted}>
                Statut actuel : <strong>{status}</strong>
              </p>
            </div>
          </div>
          <textarea
            className={`${input} mt-5 min-h-24`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Commentaire de vérification ou motif de rejet"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "draft" && (
              <button className={primary} onClick={() => void workflow("verify")}>
                <ShieldCheck className="h-4 w-4" /> Vérifier
              </button>
            )}
            {status === "in_review" && (
              <button className={primary} onClick={() => void workflow("validate")}>
                <CheckCircle2 className="h-4 w-4" /> Valider
              </button>
            )}
            {(status === "in_review" || status === "validated") && (
              <button className={secondary} onClick={() => void workflow("reject")}>
                <X className="h-4 w-4" /> Rejeter
              </button>
            )}
            {!processId && (
              <p className="text-sm text-muted-foreground">
                Enregistrez d'abord le processus pour lancer son workflow.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "summary" && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className={`${card} p-5`}>
            <h2 className="font-display text-lg font-bold">Informations</h2>
            <p className="mt-2 font-semibold">{form.title || "—"}</p>
            <p className={`mt-1 ${muted}`}>{form.purpose || "Finalité non renseignée"}</p>
            <p className="mt-3 text-sm">
              Statut : <strong>{status}</strong>
            </p>
          </div>
          <div className={`${card} p-5`}>
            <h2 className="font-display text-lg font-bold">Couverture</h2>
            <p className="mt-2 text-sm">
              {sequences.length} séquence(s), {objectives.length} objectif(s), {risks.length}{" "}
              risque(s), {indicators.length} KPI.
            </p>
            <p className={`mt-2 ${muted}`}>
              {processNames.length} collaborateur(s) disponible(s) pour le site.
            </p>
          </div>
          <div className={`${card} p-5 md:col-span-2`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold">Fiche tortue — vue imprimable</h2>
              <button type="button" className={secondary} onClick={() => window.print()}>
                <FileText className="h-4 w-4" /> Imprimer
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                [
                  "Entrées",
                  sequences
                    .map((sequence) => String(sequence.input_description ?? "").trim())
                    .filter(Boolean),
                ],
                [
                  "Sorties",
                  sequences
                    .map((sequence) => String(sequence.output_description ?? "").trim())
                    .filter(Boolean),
                ],
                [
                  "Ressources",
                  Object.values(resources)
                    .flat()
                    .map((resource) => resource.name)
                    .filter(Boolean),
                ],
                [
                  "Compétences / responsables",
                  Array.from(
                    new Set(
                      sequences
                        .map(
                          (sequence) =>
                            usersQuery.data?.find(
                              (user) => user.id === String(sequence.responsible_user_id ?? ""),
                            )?.name,
                        )
                        .filter((name): name is string => Boolean(name)),
                    ),
                  ),
                ],
                ["Méthodes et critères", form.methodes],
                [
                  "Indicateurs",
                  indicators.map(
                    (indicator) =>
                      `${indicator.name}${indicator.unit ? ` (${indicator.unit})` : ""}`,
                  ),
                ],
              ].map(([label, items]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {String(label)}
                  </p>
                  {Array.isArray(items) && items.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                      {items.map((item, index) => (
                        <li key={`${String(label)}-${index}`}>{String(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Non renseigné</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={`${card} p-5 md:col-span-2`}>
            <h2 className="font-display text-lg font-bold">Séquence et interactions</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {sequences.map((sequence, index) => (
                <div key={index} className="rounded-xl bg-background p-3 text-sm">
                  <p className="font-bold">
                    {index + 1}.{" "}
                    {String(sequence.activity_description || "Activité non renseignée")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stringList(sequence.supplier_processes).join(", ") || "Aucun fournisseur"} →{" "}
                    {stringList(sequence.client_processes).join(", ") || "Aucun client"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
