import { useState } from "react";
import { Presentation } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSite } from "@/hooks/use-workspace";
import { useReviewMutations, useReviews, useSchedule } from "@/integrations/backend/reviews";
import { Modal } from "../overlay";
import { Header, PageSkeleton, SiteNotice, card, errorMessage, formatDateFR, muted, primary } from "../planning/shared";
import { FieldsForm, type FieldSpec } from "../emergency/FieldsForm";
import { ReviewDrawer } from "./ReviewDrawer";

const STATE = {
  never_done: ["Aucune revue enregistrée : planifiez la première.", "bg-amber-50 text-amber-900"],
  overdue: ["La revue de direction est en retard (intervalle de 12 mois dépassé).", "bg-red-50 text-red-800"],
  due_soon: ["La prochaine revue est à planifier dans les 30 jours.", "bg-amber-50 text-amber-900"],
  planned: ["Une revue est planifiée ou en cours.", "bg-sky-50 text-sky-900"],
  ok: ["La revue de direction est à jour.", "bg-emerald-50 text-emerald-900"],
} as const;
const STATUS: Record<string, string> = { planned: "Planifiée", in_progress: "En cours", completed: "Signée et archivée", reported: "Rapportée" };

const FIELDS: FieldSpec[] = [
  { key: "title", label: "Intitulé", type: "text", required: true },
  { key: "scheduled_date", label: "Date prévue", type: "date", required: true },
];

/** Revue de direction — ISO 14001:2026 §9.3. */
export function ReviewPage() {
  const [siteId] = useCurrentSite();
  const { data: schedule } = useSchedule(siteId || undefined, Boolean(siteId));
  const { data: reviews = [], isLoading } = useReviews(siteId || undefined, Boolean(siteId));
  const actions = useReviewMutations();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {!siteId && <SiteNotice />}
      <Header eyebrow="Évaluation des performances — ISO 14001:2026 §9.3" title="Revue de direction"
        description="Un dossier d'entrée généré à partir de vos données, des conclusions, des décisions suivies comme actions, puis la signature de la direction."
        icon={Presentation}>
        <button type="button" className={primary} disabled={!siteId} onClick={() => { setError(null); setCreating(true); }}>Planifier une revue</button>
      </Header>

      {schedule && (
        <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${STATE[schedule.state][1]}`}>
          {STATE[schedule.state][0]}{schedule.next_due ? ` Échéance : ${formatDateFR(schedule.next_due)}.` : ""}
        </p>
      )}

      <div className={`${card} overflow-x-auto p-4`}>
        {isLoading ? <PageSkeleton rows={3} /> : reviews.length === 0 ? <p className={`py-8 text-center ${muted}`}>Aucune revue de direction.</p> : (
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Revue</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-3"><button type="button" className="text-left font-semibold hover:underline" onClick={() => setOpenId(r.id)}>{r.title ?? r.ref}</button><p className={muted}>{r.ref}</p></td>
                  <td className="px-3 py-3">{formatDateFR(r.actual_date ?? r.scheduled_date)}</td>
                  <td className="px-3 py-3">{STATUS[r.status] ?? r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <Modal title="Planifier une revue de direction" onClose={() => setCreating(false)}>
          <FieldsForm fields={FIELDS} busy={actions.create.isPending} error={error} initial={{ title: `Revue de direction ${new Date().getFullYear()}` }} onCancel={() => setCreating(false)}
            onSubmit={async (v) => {
              setError(null);
              try {
                const created = await actions.create.mutateAsync({ site_id: siteId, title: String(v["title"]), scheduled_date: String(v["scheduled_date"]), year: new Date().getFullYear() });
                toast.success("Revue planifiée.");
                setCreating(false);
                setOpenId(created.data.id);
              } catch (e) {
                setError(errorMessage(e, "Planification impossible."));
              }
            }} />
        </Modal>
      )}
      {openId !== null && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
