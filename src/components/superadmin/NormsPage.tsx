import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, FileUp, Plus } from "lucide-react";
import { useSaMutations, useSaNorm, useSaNorms, type SaNorm } from "@/integrations/backend/superadmin";
import { ConfirmDialog } from "../app/ConfirmDialog";
import { Badge, Drawer, Empty, ErrorNote, Field, SaHeader, Skeleton, btnGhost, btnPrimary, field, muted, panel } from "./sa-ui";

const DOMAINS = [
  { value: "quality", label: "Qualité" },
  { value: "environment", label: "Environnement" },
  { value: "security", label: "Sécurité" },
  { value: "food_safety", label: "Sécurité des aliments" },
  { value: "integrated", label: "Intégré" },
  { value: "other", label: "Autre" },
];

function statusBadge(status: string) {
  if (status === "published") return <Badge tone="green">Publiée</Badge>;
  if (status === "archived") return <Badge tone="slate">Archivée</Badge>;
  return <Badge tone="amber">Brouillon</Badge>;
}

type Form = { code: string; name: string; description: string; domain: string; version_code: string; publish: boolean };
const EMPTY: Form = { code: "", name: "", description: "", domain: "quality", version_code: "", publish: false };

/** Bibliothèque des normes : création, import d'une structure Excel, publication et archivage. */
export function NormsPage() {
  const { data: norms, isLoading, error } = useSaNorms();
  const mutations = useSaMutations();
  const [mode, setMode] = useState<"create" | "import" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [formError, setFormError] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<SaNorm | null>(null);
  const { data: detail } = useSaNorm(detailId);

  const toast$ = (promise: Promise<unknown>, success: string): void => {
    promise.then(() => toast.success(success), (e: Error) => toast.error(e.message));
  };

  const submit = async (): Promise<void> => {
    if (!form.code.trim() || !form.name.trim() || !form.version_code.trim()) {
      setFormError("Le code, le nom et la version sont obligatoires.");
      return;
    }
    if (mode === "import" && !file) {
      setFormError("Choisissez le fichier Excel de la structure de la norme.");
      return;
    }
    setFormError("");
    try {
      if (mode === "import" && file) {
        await mutations.importNorm.mutateAsync({ file, code: form.code.trim(), name: form.name.trim(), domain: form.domain, version_code: form.version_code.trim(), description: form.description.trim() });
      } else {
        await mutations.createNorm.mutateAsync({ ...form, code: form.code.trim(), name: form.name.trim(), version_code: form.version_code.trim() });
      }
      toast.success("Norme enregistrée.");
      setMode(null);
      setForm(EMPTY);
      setFile(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  };

  return (
    <>
      <SaHeader title="Normes" description="Publiez les normes proposées aux entreprises. Une norme publiée peut être ajoutée aux offres ; une norme archivée disparaît des bibliothèques." icon={BookOpen}>
        <button type="button" className={btnGhost} onClick={() => { setForm(EMPTY); setMode("import"); }}>
          <FileUp className="h-4 w-4" /> Importer (Excel)
        </button>
        <button type="button" className={btnPrimary} onClick={() => { setForm(EMPTY); setMode("create"); }}>
          <Plus className="h-4 w-4" /> Nouvelle norme
        </button>
      </SaHeader>

      {isLoading ? (
        <Skeleton />
      ) : error ? (
        <ErrorNote error={error} fallback="Impossible de charger les normes." />
      ) : !norms || norms.length === 0 ? (
        <Empty>Aucune norme.</Empty>
      ) : (
        <div className={`${panel} overflow-x-auto p-4`}>
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Norme</th>
                <th className="px-3 py-2">Domaine</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Entreprises</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {norms.map((norm) => (
                <tr key={norm.id} className="border-t border-border">
                  <td className="px-3 py-3">
                    <button type="button" className="text-left font-semibold hover:text-primary" onClick={() => setDetailId(norm.id)}>{norm.code}</button>
                    <p className={muted}>{norm.name}</p>
                  </td>
                  <td className="px-3 py-3">{DOMAINS.find((d) => d.value === norm.domain)?.label ?? norm.domain}</td>
                  <td className="px-3 py-3">{statusBadge(norm.status)}</td>
                  <td className="px-3 py-3">{norm.enterprises_count ?? 0}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      {norm.status !== "published" && norm.status !== "archived" && (
                        <button type="button" className={btnPrimary} onClick={() => toast$(mutations.normTransition.mutateAsync({ id: norm.id, action: "publish" }), "Norme publiée.")}>Publier</button>
                      )}
                      {norm.status === "published" && (
                        <button type="button" className={btnGhost} onClick={() => toast$(mutations.normTransition.mutateAsync({ id: norm.id, action: "archive" }), "Norme archivée.")}>Archiver</button>
                      )}
                      {norm.status === "archived" && (
                        <button type="button" className={btnGhost} onClick={() => toast$(mutations.normTransition.mutateAsync({ id: norm.id, action: "unarchive" }), "Norme restaurée.")}>Restaurer</button>
                      )}
                      <button type="button" className={`${btnGhost} text-destructive`} onClick={() => setToDelete(norm)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode && (
        <Drawer title={mode === "import" ? "Importer une norme" : "Nouvelle norme"} subtitle="Bibliothèque des normes" onClose={() => setMode(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code *"><input className={field} placeholder="ISO 14001:2026" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Version *"><input className={field} placeholder="2026" value={form.version_code} onChange={(e) => setForm({ ...form, version_code: e.target.value })} /></Field>
          </div>
          <Field label="Nom *"><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Domaine *">
            <select className={field} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
              {DOMAINS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Description"><textarea className={`${field} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          {mode === "import" ? (
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" aria-label="Fichier Excel de la norme" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> {file ? file.name : "Choisir le fichier Excel"}</button>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} /> Publier immédiatement</label>
          )}
          {formError && <p className="text-sm text-red-700" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className={btnGhost} onClick={() => setMode(null)}>Annuler</button>
            <button type="button" className={btnPrimary} disabled={mutations.createNorm.isPending || mutations.importNorm.isPending} onClick={() => void submit()}>Enregistrer</button>
          </div>
        </Drawer>
      )}

      {detailId !== null && (
        <Drawer title={detail?.code ?? "Norme"} subtitle={detail ? DOMAINS.find((d) => d.value === detail.domain)?.label : undefined} onClose={() => setDetailId(null)}>
          {!detail ? <Skeleton rows={2} /> : (
            <>
              <p className="text-sm">{detail.name}</p>
              <p className={muted}>{detail.description || "Aucune description."}</p>
              <div>{statusBadge(detail.status)}</div>
              <h3 className="font-display font-bold">Versions</h3>
              <ul className="space-y-1 text-sm">
                {(detail.versions ?? []).map((version) => (
                  <li key={version.id}>{version.version_code}{version.is_current ? " — version courante" : ""}</li>
                ))}
              </ul>
              {detail.pdf_file_url && <a className="text-sm font-semibold text-primary hover:underline" href={detail.pdf_file_url} target="_blank" rel="noreferrer">Ouvrir le PDF de la norme</a>}
            </>
          )}
        </Drawer>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette norme ?"
        description="Une norme utilisée par des offres ou des entreprises ne devrait pas être supprimée : archivez-la plutôt."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => { const target = toDelete; setToDelete(null); if (target) toast$(mutations.deleteNorm.mutateAsync(target.id), "Norme supprimée."); }}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
