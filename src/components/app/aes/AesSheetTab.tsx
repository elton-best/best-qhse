import { Printer } from "lucide-react";
import { useAesSheet, type AesSheetGroup } from "@/integrations/backend/aes";
import { PageSkeleton, card, formatDateFR, muted, secondary } from "../planning/shared";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printSheet(groups: AesSheetGroup[], rule: string, generatedAt: string): void {
  const rows = groups
    .map(
      (group) => `<h2>${escapeHtml(group.site)} — ${escapeHtml(group.process)}</h2>
<table><thead><tr><th>N°</th><th>Activité</th><th>Aspect</th><th>Impact</th><th>Cr</th><th>Mesures et actions</th><th>Responsable</th><th>Délai</th></tr></thead><tbody>${group.aspects
        .map(
          (a) => `<tr><td>${escapeHtml(a.aspect_number)}</td><td>${escapeHtml(a.activity)}</td><td>${escapeHtml(a.aspect)}</td><td>${escapeHtml(a.impact)}</td><td>${escapeHtml(a.criticality_score)}</td><td>${escapeHtml([a.existing_controls, a.additional_actions].filter(Boolean).join(" / "))}</td><td>${escapeHtml(a.responsible)}</td><td>${escapeHtml(a.deadline)}</td></tr>`,
        )
        .join("")}</tbody></table>`,
    )
    .join("");
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) return;
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aspects environnementaux significatifs</title>
<style>body{font:13px system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:20px}h2{font-size:15px;margin-top:22px}p{color:#475569}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top}th{background:#166534;color:#fff}</style></head>
<body><h1>Aspects environnementaux significatifs (AES)</h1><p>${escapeHtml(rule)}</p><p>Généré le ${escapeHtml(new Date(generatedAt).toLocaleString("fr-FR"))}</p>${rows || "<p>Aucun AES.</p>"}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

/** Fiche synthétique des AES par site et processus, à diffuser aux personnes concernées (M4-09). */
export function AesSheetTab({ siteId }: { siteId: string }) {
  const { data, isLoading } = useAesSheet(siteId || undefined, true);

  if (isLoading) return <PageSkeleton rows={2} />;
  const groups = data?.groups ?? [];

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-start justify-between gap-3 p-5`}>
        <div>
          <h2 className="font-display text-lg font-bold">Fiche des aspects environnementaux significatifs</h2>
          <p className={muted}>{data?.method.rule}</p>
        </div>
        <button
          type="button"
          className={secondary}
          disabled={!data || groups.length === 0}
          onClick={() => data && printSheet(groups, data.method.rule, data.generated_at)}
        >
          <Printer className="h-4 w-4" /> Imprimer / PDF
        </button>
      </div>

      {groups.length === 0 ? (
        <div className={`${card} p-8 text-center ${muted}`}>Aucun aspect significatif pour ce périmètre.</div>
      ) : (
        groups.map((group) => (
          <div key={`${group.site}-${group.process}`} className={`${card} overflow-hidden`}>
            <div className="border-b border-border bg-secondary/50 px-5 py-3">
              <p className="font-display font-bold">
                {group.process} <span className="font-normal text-muted-foreground">— {group.site}</span>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">Aspect</th>
                    <th className="px-4 py-2">Impact</th>
                    <th className="px-4 py-2">Cr</th>
                    <th className="px-4 py-2">Mesures et actions</th>
                    <th className="px-4 py-2">Responsable</th>
                    <th className="px-4 py-2">Délai</th>
                  </tr>
                </thead>
                <tbody>
                  {group.aspects.map((aspect) => (
                    <tr key={aspect.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-semibold">
                        {aspect.aspect}
                        <p className="text-xs font-normal text-muted-foreground">{aspect.activity}</p>
                      </td>
                      <td className="px-4 py-2">{aspect.impact}</td>
                      <td className="px-4 py-2 font-bold">{aspect.criticality_score}</td>
                      <td className="px-4 py-2">{[aspect.existing_controls, aspect.additional_actions].filter(Boolean).join(" — ") || "—"}</td>
                      <td className="px-4 py-2">{aspect.responsible ?? "—"}</td>
                      <td className="px-4 py-2">{aspect.deadline ? formatDateFR(aspect.deadline) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
