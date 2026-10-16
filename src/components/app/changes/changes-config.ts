import type { ChangeStatus } from "@/integrations/backend/changes";

export const STATUS: Record<ChangeStatus, { label: string; tone: string }> = {
  requested: { label: "Demandé", tone: "bg-slate-200 text-slate-700" },
  in_analysis: { label: "En analyse", tone: "bg-sky-100 text-sky-700" },
  awaiting_approval: { label: "À approuver", tone: "bg-amber-100 text-amber-800" },
  approved: { label: "Approuvé", tone: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Refusé", tone: "bg-red-100 text-red-700" },
  implementing: { label: "En mise en œuvre", tone: "bg-indigo-100 text-indigo-700" },
  implemented: { label: "Mis en œuvre — revue à faire", tone: "bg-violet-100 text-violet-700" },
  closed: { label: "Clôturé", tone: "bg-emerald-100 text-emerald-700" },
};
