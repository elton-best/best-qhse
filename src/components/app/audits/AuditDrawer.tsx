import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  FINDING_TYPES, downloadAuditReport, useAudit, useAuditMutations, useClauses, useFindings, type FindingType,
} from "@/integrations/backend/audits";
import { downloadBlob } from "@/integrations/backend/realisation";
import { Drawer, Field } from "../overlay";
import { PageSkeleton, errorMessage, input, muted, primary, secondary } from "../planning/shared";

/** Conduite de l'audit : liste de contrôle par article, constats classés avec preuves, rapport. */
export function AuditDrawer({ id, onClose }: { id: number; siteId: string; onClose: () => void }) {
  const { data: audit } = useAudit(id);
  const { data: findings = [] } = useFindings(id);
  const { data: clauses = [] } = useClauses();
  const actions = useAuditMutations();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!audit) return <Drawer title="Audit" onClose={onClose}><PageSkeleton rows={3} /></Drawer>;
  const running = audit.status === "in_progress";
  const attempt = async (job: Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try { await job; toast.success(success); } catch (e) { setError(errorMessage(e, "Action impossible.")); }
  };
  const checklist = audit.checklist ?? [];

  return (
    <Drawer title={audit.title} subtitle={`${audit.ref} · ${audit.status}`} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {audit.status === "planned" && <button type="button" className={primary} onClick={() => void attempt(actions.start.mutateAsync(id), "Audit démarré.")}>Démarrer l'audit</button>}
          {running && <button type="button" className={secondary} onClick={() => void attempt(actions.setStatus.mutateAsync({ id, status: "report_draft" }), "Rapport en rédaction.")}>Passer au rapport</button>}
          {audit.status === "report_draft" && <button type="button" className={secondary} onClick={() => void attempt(actions.approve.mutateAsync(id), "Rapport approuvé.")}>Approuver le rapport</button>}
          {audit.status === "report_approved" && <button type="button" className={primary} onClick={() => void attempt(actions.complete.mutateAsync(id), "Audit clôturé.")}>Clôturer l'audit</button>}
          {["report_draft", "report_approved", "completed"].includes(audit.status) && (["pdf", "docx"] as const).map((format) => (
            <button key={format} type="button" className={secondary} onClick={() => downloadAuditReport(id, format).then((blob) => downloadBlob(blob, `rapport-${audit.ref}.${format}`), (e: unknown) => toast.error(errorMessage(e, "Rapport indisponible : générez-le d'abord.")))}>Rapport {format.toUpperCase()}</button>
          ))}
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <section className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Liste de contrôle par article de la norme</h3>
          <div className="flex flex-wrap gap-2">
            {clauses.map((c) => <label key={c.clause} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs"><input type="checkbox" checked={picked.includes(c.clause)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.clause] : picked.filter((x) => x !== c.clause))} /> {c.clause}</label>)}
          </div>
          <button type="button" className={secondary} disabled={actions.generateChecklist.isPending || audit.status === "completed"} onClick={() => void attempt(actions.generateChecklist.mutateAsync({ id, clauses: picked }), "Liste de contrôle générée.")}>
            Générer pour {picked.length ? `${picked.length} article(s)` : "tous les articles"}
          </button>
          {checklist.length > 0 && <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">{checklist.map((item, i) => <li key={i}><span className="font-mono text-xs font-bold text-primary">{item.clause_iso}</span> {item.question}</li>)}</ul>}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Constats ({findings.length})</h3>
          {findings.map((f) => {
            const type = FINDING_TYPES.find((t) => t.value === f.type);
            return (
              <div key={f.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${type?.tone}`}>{type?.label}</span><strong>{f.title}</strong>{f.clause_iso && <span className={muted}>art. {f.clause_iso}</span>}{f.nc_created && <span className="text-xs font-bold text-red-700">Fiche de non-conformité ouverte</span>}</div>
                <p className="mt-1">{f.description}</p>
                {(f.attachments ?? []).map((a, i) => <p key={i} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" /> {a.label ?? a.name}</p>)}
                {running && <EvidenceUpload onUpload={(file, label) => attempt(actions.addEvidence.mutateAsync({ id, findingId: f.id, file, ...(label ? { label } : {}) }), "Preuve jointe.")} />}
              </div>
            );
          })}
          {running && <FindingForm busy={actions.addFinding.isPending} onSubmit={(payload) => attempt(actions.addFinding.mutateAsync({ id, input: payload }), "Constat enregistré.")} />}
        </section>
      </div>
    </Drawer>
  );
}

function EvidenceUpload({ onUpload }: { onUpload: (file: File, label: string) => Promise<void> }) {
  return (
    <label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-primary">
      <Paperclip className="h-3 w-3" /> Joindre une preuve (photo, document)
      <input type="file" className="sr-only" accept="image/*,.pdf,.docx,.txt" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onUpload(file, file.name); e.target.value = ""; }} />
    </label>
  );
}

function FindingForm({ busy, onSubmit }: { busy: boolean; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [type, setType] = useState<FindingType>("conforming");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clause, setClause] = useState("");
  const [severity, setSeverity] = useState("medium");
  const isNc = type === "nc_minor" || type === "nc_major";

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
      <p className="text-sm font-semibold">Nouveau constat</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Classement"><select className={input} value={type} onChange={(e) => setType(e.target.value as FindingType)}>{FINDING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
        <Field label="Article de la norme"><input className={input} value={clause} onChange={(e) => setClause(e.target.value)} placeholder="ex. 6.1.2" /></Field>
      </div>
      <Field label="Titre *"><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Constat et preuve objective * (10 caractères minimum)"><textarea className={`${input} min-h-16`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {isNc && <Field label="Gravité"><select className={input} value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="low">Faible</option><option value="medium">Moyenne</option><option value="high">Élevée</option><option value="critical">Critique</option></select></Field>}
      <button type="button" className={primary} disabled={busy || !title.trim() || description.trim().length < 10}
        onClick={() => void onSubmit({ type, title: title.trim(), description: description.trim(), ...(clause.trim() ? { clause_iso: clause.trim() } : {}), ...(isNc ? { severity, priority: type === "nc_major" ? 1 : 3 } : {}) }).then(() => { setTitle(""); setDescription(""); })}>
        Enregistrer le constat
      </button>
      {isNc && <p className={muted}>Une non-conformité ouvre automatiquement une fiche dans le module d'amélioration.</p>}
    </div>
  );
}
