import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuditList, useAuditMutations, useEligibleAuditors, useProcessOptions } from "@/integrations/backend/audits";
import { BackendApiError } from "@/integrations/backend/client";
import { Field, Modal } from "../overlay";
import { PageSkeleton, card, errorMessage, formatDateFR, input, muted, primary, secondary } from "../planning/shared";
import { AuditDrawer } from "./AuditDrawer";

const STATUS: Record<string, string> = {
  planned: "Planifié", in_progress: "En cours", report_draft: "Rapport en rédaction", report_approved: "Rapport approuvé", completed: "Clôturé", cancelled: "Annulé",
};

/** Plans d'audit (M15-02/03) : le choix des auditeurs tient compte de la compétence et de l'indépendance. */
export function PlansTab({ siteId, presetProcessId }: { siteId: string; presetProcessId?: number | undefined }) {
  const { data: audits = [], isLoading } = useAuditList(siteId || undefined, Boolean(siteId));
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { if (presetProcessId) setCreating(true); }, [presetProcessId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={muted}>Un auditeur ne peut pas auditer un processus qu'il pilote ni être audité dans le même audit.</p>
        <button type="button" className={primary} disabled={!siteId} onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Planifier un audit</button>
      </div>
      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : audits.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucun audit planifié.</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Audit</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Auditeur</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {audits.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => setOpenId(a.id)}>{a.title}</button><p className={muted}>{a.ref}</p></td>
                  <td className="px-3 py-3">{formatDateFR(a.planned_date)}</td>
                  <td className="px-3 py-3">{(a.lead_auditor ?? a.leadAuditor)?.name ?? "—"}</td>
                  <td className="px-3 py-3">{STATUS[a.status] ?? a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && <CreateAudit siteId={siteId} presetProcessId={presetProcessId} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
      {openId !== null && <AuditDrawer id={openId} siteId={siteId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CreateAudit({ siteId, presetProcessId, onClose, onCreated }: { siteId: string; presetProcessId?: number | undefined; onClose: () => void; onCreated: (id: number) => void }) {
  const actions = useAuditMutations();
  const { data: processes = [] } = useProcessOptions();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [objectives, setObjectives] = useState("Vérifier la conformité et l'efficacité du système de management environnemental.");
  const [references, setReferences] = useState("ISO 14001:2026 ; obligations de conformité applicables");
  const [processIds, setProcessIds] = useState<number[]>(presetProcessId ? [presetProcessId] : []);
  const [lead, setLead] = useState("");
  const [auditeeIds, setAuditeeIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { data: people = [] } = useEligibleAuditors(siteId || undefined, processIds, auditeeIds, Boolean(siteId));
  const leadPerson = people.find((p) => String(p.id) === lead);

  const toggle = (list: number[], set: (ids: number[]) => void, id: number): void => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (!title.trim() || !lead) { setError("Renseignez l'intitulé et l'auditeur responsable."); return; }
    try {
      const created = await actions.create.mutateAsync({
        site_id: siteId, title: title.trim(), planned_date: date, lead_auditor_id: Number(lead), objectives, reference_documents: references,
        ...(processIds.length ? { process_ids: processIds } : {}), ...(auditeeIds.length ? { auditee_ids: auditeeIds } : {}),
      });
      toast.success("Audit planifié.");
      onCreated(created.id);
    } catch (e) {
      const conflicts = e instanceof BackendApiError ? (e.payload as { conflicts?: { name: string; reason: string }[] } | undefined)?.conflicts : undefined;
      setError(conflicts?.length ? `Conflit d'intérêt : ${conflicts.map((c) => `${c.name} ${c.reason}`).join(" ; ")}.` : errorMessage(e, "Planification impossible."));
    }
  };

  return (
    <Modal title="Planifier un audit interne" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Intitulé *"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Date prévue *"><input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Objectifs"><textarea className={`${input} min-h-16`} value={objectives} onChange={(e) => setObjectives(e.target.value)} /></Field>
        <Field label="Critères d'audit"><input className={input} value={references} onChange={(e) => setReferences(e.target.value)} /></Field>
        <fieldset className="space-y-1"><legend className="text-sm font-semibold">Processus audités</legend>
          <div className="flex flex-wrap gap-2">{processes.map((p) => <label key={p.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={processIds.includes(p.id)} onChange={() => toggle(processIds, setProcessIds, p.id)} /> {p.title}</label>)}</div>
        </fieldset>
        <fieldset className="space-y-1"><legend className="text-sm font-semibold">Audités</legend>
          <div className="flex flex-wrap gap-2">{people.map((p) => <label key={p.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={auditeeIds.includes(p.id)} onChange={() => toggle(auditeeIds, setAuditeeIds, p.id)} /> {p.name}</label>)}</div>
        </fieldset>
        <Field label="Auditeur responsable *">
          <select className={input} value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">— Choisir —</option>
            {people.map((p) => <option key={p.id} value={p.id} disabled={!p.independent}>{p.name}{p.qualified ? " · qualifié" : " · qualification non prouvée"}{p.independent ? "" : " · non indépendant"}</option>)}
          </select>
        </Field>
        {leadPerson && !leadPerson.qualified && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Aucune compétence d'audit valide n'est enregistrée pour cette personne dans la matrice de compétences.</p>}
        {leadPerson && !leadPerson.independent && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{leadPerson.conflicts.join(" ; ")}</p>}
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={onClose}>Annuler</button><button type="button" className={primary} disabled={actions.create.isPending} onClick={() => void submit()}>Planifier</button></div>
      </div>
    </Modal>
  );
}
