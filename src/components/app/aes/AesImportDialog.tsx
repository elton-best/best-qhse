import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, X } from "lucide-react";
import { useAesMutations, type AesImportSummary } from "@/integrations/backend/aes";
import { card, errorMessage, muted, primary, secondary } from "../planning/shared";

/** Import du registre existant : contrôle des erreurs avant intégration (M4-11). */
export function AesImportDialog({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const mutations = useAesMutations();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<AesImportSummary | null>(null);

  const check = async (picked: File): Promise<void> => {
    setFile(picked);
    setSummary(null);
    try {
      setSummary(await mutations.importFile.mutateAsync({ file: picked, siteId, dryRun: true }));
    } catch (error) {
      toast.error(errorMessage(error, "Lecture du fichier impossible."));
    }
  };

  const run = async (skipInvalid: boolean): Promise<void> => {
    if (!file) return;
    try {
      const result = await mutations.importFile.mutateAsync({ file, siteId, dryRun: false, skipInvalid });
      toast.success(`${result.imported ?? 0} aspect(s) importé(s) en brouillon.`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, "Import impossible."));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Importer un registre">
      <div className={`${card} my-8 w-full max-w-2xl p-6 shadow-2xl`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">Importer un registre existant</h2>
            <p className={muted}>Le fichier est d'abord contrôlé : rien n'est créé tant que vous ne confirmez pas.</p>
          </div>
          <button type="button" className="rounded-xl p-2 text-muted-foreground hover:bg-secondary" onClick={onClose} aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          aria-label="Fichier Excel du registre"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void check(picked);
          }}
        />
        <button type="button" className={`${secondary} mt-4`} onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" /> {file ? file.name : "Choisir un fichier Excel"}
        </button>

        {mutations.importFile.isPending && !summary && <p className={`mt-4 ${muted}`}>Contrôle en cours…</p>}

        {summary && (
          <div className="mt-5 space-y-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {summary.valid} ligne(s) valide(s) sur {summary.total}, dont {summary.significant} AES.
            </p>
            {summary.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-red-900" role="alert">
                <p className="font-bold">{summary.errors.length} erreur(s) à corriger :</p>
                <ul className="mt-1 list-disc pl-5">
                  {summary.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.preview && summary.preview.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase text-muted-foreground">
                    <th className="py-1">Ligne</th>
                    <th>Aspect</th>
                    <th>Cr</th>
                    <th>AES</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.preview.slice(0, 8).map((row) => (
                    <tr key={row.line} className="border-t border-border">
                      <td className="py-1">{row.line}</td>
                      <td>{row.aspect}</td>
                      <td>{row.criticality}</td>
                      <td>{row.is_significant ? "oui" : "non"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {summary.errors.length > 0 && summary.valid > 0 && (
                <button type="button" className={secondary} disabled={mutations.importFile.isPending} onClick={() => void run(true)}>
                  Importer seulement les lignes valides
                </button>
              )}
              <button
                type="button"
                className={primary}
                disabled={mutations.importFile.isPending || summary.errors.length > 0 || summary.valid === 0}
                onClick={() => void run(false)}
              >
                Importer {summary.valid} ligne(s)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
