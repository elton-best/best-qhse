import { useEffect, useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import {
  REVISION_REASONS, downloadDuerpExport, useDuerp, useDuerpList, useDuerpMutations, useRiskFamilies, useScales,
  type Danger, type Duerp, type Participant, type RevisionReason,
} from "@/integrations/backend/duerp";
import { downloadBlob } from "@/integrations/backend/realisation";
import { Drawer, Field, Modal } from "../overlay";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { ConformityTab } from "./ConformityTab";
import { PlanTab } from "./PlanTab";
import { RegisterTab } from "./RegisterTab";
import { RiskForm } from "./RiskForm";
import { ScalesTab } from "./ScalesTab";
import { UnitsTab } from "./UnitsTab";
import { VersionsTab } from "./VersionsTab";
import { WORKFLOW } from "./duerp-config";

type Tab = "register" | "units" | "plan" | "conformity" | "scales" | "versions";
const TABS: { id: Tab; label: string }[] = [
  { id: "register", label: "Registre des risques" },
  { id: "units", label: "Unités de travail" },
  { id: "plan", label: "Plan d'actions" },
  { id: "conformity", label: "Conformité INRS" },
  { id: "scales", label: "Échelles de cotation" },
  { id: "versions", label: "Versions" },
];

/** DUERP — Code du travail R.4121-1 à R.4121-4, méthode INRS, ISO 45001 §6.1.2. */
export function DuerpPage() {
  const [siteId] = useCurrentSite();
  const { data: list = [], isLoading } = useDuerpList(siteId || undefined, Boolean(siteId));
  const [chosen, setChosen] = useState<number | null>(null);
  const shown = list.find((d) => d.id === chosen) ?? list.find((d) => d.is_current) ?? list[0] ?? null;
  const { data: duerp } = useDuerp(shown?.id ?? null);
  const [tab, setTab] = useState<Tab>("register");

  useEffect(() => setChosen(null), [siteId]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header
        eyebrow="Planification — ISO 45001 §6.1.2 · Code du travail R.4121-1"
        title="Document unique d'évaluation des risques (DUERP)"
        description="Unités de travail, risques évalués selon la méthode INRS, plan d'actions de prévention, validation par la Direction et mise à jour au moins annuelle."
        icon={ShieldAlert}
      />
      {isLoading ? <PageSkeleton rows={4} /> : !shown ? (
        siteId ? <CreateCard siteId={siteId} /> : null
      ) : !duerp ? <PageSkeleton rows={4} /> : (
        <>
          <DocumentBar duerp={duerp} />
          <div role="tablist" aria-label="Sections du DUERP" className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {item.label}
              </button>
            ))}
          </div>
          {tab === "register" && <RegisterTab duerp={duerp} />}
          {tab === "units" && <UnitsTab duerp={duerp} siteId={siteId} />}
          {tab === "plan" && <PlanWithEditor duerp={duerp} />}
          {tab === "conformity" && <ConformityTab duerpId={duerp.id} />}
          {tab === "scales" && <ScalesTab />}
          {tab === "versions" && <VersionsTab duerpId={duerp.id} currentId={duerp.id} onOpen={(id) => { setChosen(id); setTab("register"); }} />}
        </>
      )}
    </div>
  );
}

/** Plan d'actions avec ouverture de la fiche pour saisir le suivi (autorisé même sur un document figé). */
function PlanWithEditor({ duerp }: { duerp: Duerp }) {
  const { data: scalesData } = useScales();
  const { data: families = [] } = useRiskFamilies();
  const actions = useDuerpMutations();
  const [editing, setEditing] = useState<Danger | null>(null);
  const draft = duerp.workflow_status === "draft";

  return (
    <>
      <PlanTab duerp={duerp} onOpen={setEditing} />
      {editing && scalesData && (
        <Drawer title="Fiche de risque" subtitle={duerp.title ?? `DUERP v${duerp.version}`} onClose={() => setEditing(null)} wide>
          <RiskForm danger={editing} units={duerp.work_units ?? []} families={families} scales={scalesData.scales} locked={!draft} busy={actions.saveDanger.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await actions.saveDanger.mutateAsync({ duerpId: duerp.id, id: editing.id, input });
              toast.success("Risque enregistré.");
              setEditing(null);
            }} />
        </Drawer>
      )}
    </>
  );
}

function CreateCard({ siteId }: { siteId: string }) {
  const actions = useDuerpMutations();
  const today = new Date().toISOString().slice(0, 10);
  const [evaluation, setEvaluation] = useState(today);
  const [people, setPeople] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nextYear = (() => { const d = new Date(evaluation); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();

  const create = async (): Promise<void> => {
    setError(null);
    const participants: Participant[] = people.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name = "", role] = line.split(",").map((part) => part.trim());
      return role ? { name, role } : { name };
    });
    try {
      await actions.create.mutateAsync({ site_id: siteId, evaluation_date: evaluation, next_evaluation_date: nextYear, ...(participants.length ? { participants } : {}) });
      toast.success("DUERP créé : définissez vos unités de travail puis évaluez les risques.");
    } catch (e) {
      setError(errorMessage(e, "Création impossible."));
    }
  };

  return (
    <section className={`${card} max-w-2xl space-y-4 p-6`}>
      <h2 className="font-display text-lg font-bold">Créer le DUERP du site</h2>
      <p className={muted}>La date d'évaluation est la date à laquelle vous évaluez les risques ; la prochaine mise à jour est fixée à 12 mois (R.4121-2).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date de l'évaluation *"><input type="date" max={today} className={input} value={evaluation} onChange={(e) => setEvaluation(e.target.value)} /></Field>
        <Field label="Prochaine mise à jour"><input type="date" className={input} value={nextYear} readOnly /></Field>
      </div>
      <Field label="Personnes associées à l'évaluation (une par ligne : nom, fonction)">
        <textarea className={`${input} min-h-20`} value={people} onChange={(e) => setPeople(e.target.value)} placeholder={"Awa Koffi, Déléguée du personnel\nDr Sèna, Médecin du travail"} />
      </Field>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" className={primary} disabled={actions.create.isPending} onClick={() => void create()}>Créer le DUERP</button>
    </section>
  );
}

function DocumentBar({ duerp }: { duerp: Duerp }) {
  const actions = useDuerpMutations();
  const [dialog, setDialog] = useState<"reject" | "revise" | "approve" | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState<RevisionReason>("annual");
  const [error, setError] = useState<string | null>(null);
  const status = WORKFLOW[duerp.workflow_status];

  const run = async (job: Promise<unknown>, success: string, close = false): Promise<void> => {
    setError(null);
    try {
      await job;
      toast.success(success);
      if (close) setDialog(null);
      setText("");
    } catch (e) {
      const message = errorMessage(e, "Action impossible.");
      setError(message);
      toast.error(message);
    }
  };
  const late = duerp.next_evaluation_date !== null && duerp.next_evaluation_date.slice(0, 10) < new Date().toISOString().slice(0, 10);

  return (
    <section className={`${card} space-y-3 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">{duerp.title ?? `DUERP — ${duerp.site?.name ?? ""}`} <span className={muted}>v{duerp.version}</span></p>
          <p className={muted}>Évaluation du {formatDateFR(duerp.evaluation_date)} · prochaine mise à jour {formatDateFR(duerp.next_evaluation_date)}{duerp.approved_at ? ` · approuvé le ${formatDateFR(duerp.approved_at)}${duerp.approver ? ` par ${duerp.approver.name}` : ""}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}{duerp.is_current ? " · en vigueur" : ""}</span>
          <button type="button" className={secondary} onClick={() => downloadDuerpExport(duerp.id).then((blob) => downloadBlob(blob, `duerp-v${duerp.version}.xlsx`), (e: unknown) => toast.error(errorMessage(e, "Export impossible.")))}><Download className="h-4 w-4" /> Exporter</button>
          {duerp.workflow_status === "draft" && <button type="button" className={primary} disabled={actions.submit.isPending} onClick={() => void run(actions.submit.mutateAsync(duerp.id), "DUERP soumis à la Direction.")}>Soumettre à la Direction</button>}
          {duerp.workflow_status === "submitted_by_rq" && (
            <>
              <button type="button" className={secondary} onClick={() => { setError(null); setDialog("reject"); }}>Retourner</button>
              <button type="button" className={primary} onClick={() => { setError(null); setDialog("approve"); }}>Approuver</button>
            </>
          )}
          {duerp.workflow_status === "approved_by_ceo" && <button type="button" className={primary} onClick={() => { setError(null); setDialog("revise"); }}>Nouvelle version</button>}
        </div>
      </div>
      {duerp.update_required && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">Mise à jour requise : {duerp.update_reason}. Créez une nouvelle version.</p>}
      {late && !duerp.update_required && duerp.is_current && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">La date de mise à jour est dépassée : le DUERP doit être réévalué (au moins une fois par an).</p>}
      {duerp.rejection_reason && duerp.workflow_status === "draft" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Retourné par la Direction : {duerp.rejection_reason}</p>}
      {error && !dialog && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {dialog === "reject" && (
        <Modal title="Retourner le DUERP" onClose={() => setDialog(null)}>
          <Field label="Motif du retour *"><textarea className={`${input} min-h-20`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex justify-end"><button type="button" className={primary} onClick={() => void run(actions.reject.mutateAsync({ id: duerp.id, reason: text }), "DUERP retourné pour corrections.", true)}>Retourner</button></div>
        </Modal>
      )}
      {dialog === "approve" && (
        <Modal title="Approuver le DUERP" description="Le document devient la version en vigueur du site et n'est plus modifiable." onClose={() => setDialog(null)}>
          <Field label="Commentaire"><textarea className={`${input} min-h-16`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex justify-end"><button type="button" className={primary} onClick={() => void run(actions.approve.mutateAsync({ id: duerp.id, ...(text ? { notes: text } : {}) }), "DUERP approuvé.", true)}>Approuver</button></div>
        </Modal>
      )}
      {dialog === "revise" && (
        <Modal title="Nouvelle version du DUERP" description="Les unités et les risques sont copiés ; la version actuelle reste conservée." onClose={() => setDialog(null)}>
          <Field label="Motif de la mise à jour *">
            <select className={input} value={reason} onChange={(e) => setReason(e.target.value as RevisionReason)}>
              {REVISION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex justify-end"><button type="button" className={primary} onClick={() => void run(actions.revise.mutateAsync({ id: duerp.id, revision_reason: reason }), "Nouvelle version créée.", true)}>Créer la version</button></div>
        </Modal>
      )}
    </section>
  );
}
