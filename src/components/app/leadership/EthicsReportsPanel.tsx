import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clipboard, LockKeyhole, Send } from "lucide-react";
import { toast } from "sonner";
import { backendApi } from "@/integrations/backend/client";
import {
  type CultureSurveyAnswers,
  type EthicsReport,
  type EthicsReportStatus,
  useCultureSurveyMutations,
  useCultureSurveySummary,
  useEthicsReportMutations,
  useManagedEthicsReports,
  useMyEthicsReports,
} from "@/integrations/backend/leadership";
import { card, input, muted, primary, secondary } from "./shared";

const SURVEY_QUESTIONS: Array<{ key: keyof CultureSurveyAnswers; label: string }> = [
  {
    key: "quality_integration",
    label: "La qualité fait partie du travail quotidien de mon équipe.",
  },
  {
    key: "speak_up_safety",
    label: "Je peux signaler un problème qualité sans crainte de représailles.",
  },
  {
    key: "management_listening",
    label: "La direction prend en compte les préoccupations qualité.",
  },
  {
    key: "role_clarity",
    label: "Je connais mes responsabilités dans le système qualité.",
  },
  {
    key: "change_communication",
    label: "Les changements qui affectent mon travail me sont expliqués.",
  },
];

const CATEGORIES = [
  ["ethique", "Comportement contraire à l’éthique"],
  ["conflit_interets", "Conflit d’intérêts"],
  ["harcelement", "Harcèlement"],
  ["discrimination", "Discrimination"],
  ["fraude", "Fraude ou falsification"],
  ["qualite", "Risque pour la qualité ou le client"],
  ["autre", "Autre"],
] as const;

const STATUSES: Array<[EthicsReportStatus, string]> = [
  ["received", "Reçu"],
  ["investigating", "En cours d’examen"],
  ["action_taken", "Action engagée"],
  ["closed", "Clôturé"],
  ["rejected", "Non retenu"],
];

function statusLabel(status: EthicsReportStatus): string {
  return STATUSES.find(([value]) => value === status)?.[1] ?? status;
}

function ReportReviewCard({
  report,
  busy,
  onSave,
}: {
  report: EthicsReport;
  busy: boolean;
  onSave: (
    id: string,
    status: EthicsReportStatus,
    handlingNotes: string,
    publicUpdate: string,
  ) => void;
}) {
  const [status, setStatus] = useState(report.status);
  const [handlingNotes, setHandlingNotes] = useState(report.handling_notes ?? "");
  const [publicUpdate, setPublicUpdate] = useState(report.public_update ?? "");

  return (
    <article className="space-y-3 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{report.subject}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {CATEGORIES.find(([value]) => value === report.category)?.[1] ?? report.category}
            {" · "}
            {report.site ?? "Site"}
            {" · "}
            {report.is_anonymous
              ? "Sans identité associée"
              : (report.reporter?.name ?? report.reporter?.email ?? "Identité non disponible")}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {statusLabel(report.status)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{report.description}</p>
      {report.incident_date && (
        <p className="text-xs text-muted-foreground">
          Date de l’événement : {new Date(report.incident_date).toLocaleDateString("fr-FR")}
        </p>
      )}
      {report.handled_at && (
        <p className="text-xs text-muted-foreground">
          Dernier traitement : {new Date(report.handled_at).toLocaleString("fr-FR")}
          {report.handled_by ? ` par ${report.handled_by}` : ""}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Statut
          <select
            className={`${input} mt-1 normal-case`}
            value={status}
            onChange={(event) => setStatus(event.target.value as EthicsReportStatus)}
          >
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Information visible au déclarant
          <textarea
            className={`${input} mt-1 min-h-20 normal-case`}
            value={publicUpdate}
            maxLength={2000}
            onChange={(event) => setPublicUpdate(event.target.value)}
          />
        </label>
      </div>
      <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Note interne de traitement (confidentielle)
        <textarea
          className={`${input} mt-1 min-h-20 normal-case`}
          value={handlingNotes}
          maxLength={5000}
          onChange={(event) => setHandlingNotes(event.target.value)}
        />
      </label>
      <button
        type="button"
        className={secondary}
        disabled={busy || handlingNotes.trim().length < 10}
        onClick={() => onSave(report.id, status, handlingNotes, publicUpdate)}
      >
        Enregistrer le traitement
      </button>
    </article>
  );
}

export function EthicsReportsPanel({ siteId }: { siteId: string }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("ethique");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [latestCode, setLatestCode] = useState<string | null>(null);
  const [trackedReport, setTrackedReport] = useState<EthicsReport | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Partial<CultureSurveyAnswers>>({});
  const profile = useQuery({
    queryKey: ["ethics-report-current-user"],
    queryFn: () => backendApi.auth.me(),
    staleTime: 60_000,
  });
  const canManage = profile.data?.permissions.includes("leadership.ethics_reports.manage") ?? false;
  const ownReports = useMyEthicsReports();
  const managedReports = useManagedEthicsReports(siteId, canManage);
  const mutations = useEthicsReportMutations(siteId);
  const cultureSurvey = useCultureSurveyMutations(siteId);
  const cultureSummary = useCultureSurveySummary(siteId, canManage);

  const submit = async (): Promise<void> => {
    if (subject.trim().length < 5 || description.trim().length < 20) {
      toast.error("Renseignez un titre et un récit d’au moins 20 caractères.");
      return;
    }
    try {
      const result = await mutations.submit.mutateAsync({
        category,
        subject: subject.trim(),
        description: description.trim(),
        incident_date: incidentDate || null,
        is_anonymous: anonymous,
      });
      setLatestCode(result.tracking_code ?? null);
      setSubject("");
      setDescription("");
      setIncidentDate("");
      setAnonymous(false);
      toast.success("Signalement transmis de façon confidentielle.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d’enregistrer le signalement.",
      );
    }
  };

  const track = async (): Promise<void> => {
    try {
      setTrackedReport(await mutations.track.mutateAsync(trackingCode.trim()));
    } catch (error) {
      setTrackedReport(null);
      toast.error(error instanceof Error ? error.message : "Code de suivi invalide.");
    }
  };

  const saveTreatment = async (
    id: string,
    status: EthicsReportStatus,
    handlingNotes: string,
    publicUpdate: string,
  ): Promise<void> => {
    try {
      await mutations.update.mutateAsync({
        id,
        status,
        handling_notes: handlingNotes.trim(),
        public_update: publicUpdate.trim(),
      });
      toast.success("Traitement confidentiel enregistré.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Impossible d’enregistrer le traitement.",
      );
    }
  };

  const submitSurvey = async (): Promise<void> => {
    if (SURVEY_QUESTIONS.some(({ key }) => !surveyAnswers[key])) {
      toast.error("Répondez aux cinq affirmations avant d’envoyer le questionnaire.");
      return;
    }

    try {
      await cultureSurvey.submit.mutateAsync(surveyAnswers as CultureSurveyAnswers);
      setSurveyAnswers({});
      toast.success("Votre avis a été enregistré dans les résultats agrégés du site.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer votre avis.");
    }
  };

  return (
    <section className={`${card} space-y-5 p-5`} aria-labelledby="ethics-reporting-title">
      <div>
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <h2 id="ethics-reporting-title" className="font-display text-lg font-bold">
            Culture qualité et signalements confidentiels
          </h2>
        </div>
        <p className={`mt-1 ${muted}`}>
          Les dossiers sont isolés des réclamations clients. Seuls les référents habilités peuvent
          lire le récit et les notes internes ; aucun score individuel n’est calculé.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background p-4">
        <h3 className="font-semibold">Enquête anonyme sur la culture qualité</h3>
        <p className={`mt-1 ${muted}`}>
          Répondez de 1 (pas du tout d’accord) à 5 (tout à fait d’accord). Aucun identifiant ni
          commentaire libre n’est enregistré ; les résultats ne sont visibles aux référents qu’à
          partir de cinq réponses pour le site.
        </p>
        <div className="mt-3 space-y-3">
          {SURVEY_QUESTIONS.map(({ key, label }) => (
            <label key={key} className="grid gap-2 text-sm sm:grid-cols-[1fr_9rem] sm:items-center">
              <span>{label}</span>
              <select
                className={input}
                value={surveyAnswers[key] ?? ""}
                onChange={(event) =>
                  setSurveyAnswers((current) => ({
                    ...current,
                    [key]: event.target.value ? Number(event.target.value) : undefined,
                  }))
                }
              >
                <option value="">Choisir…</option>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          type="button"
          className={`${primary} mt-4`}
          disabled={!siteId || cultureSurvey.submit.isPending}
          onClick={() => void submitSurvey()}
        >
          {cultureSurvey.submit.isPending ? "Enregistrement…" : "Envoyer mon avis"}
        </button>

        {canManage && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-sm font-semibold">Résultats agrégés</h4>
            {cultureSummary.isLoading ? (
              <p className={`mt-2 ${muted}`}>Chargement des résultats…</p>
            ) : cultureSummary.isError ? (
              <p className="mt-2 text-sm text-destructive">
                Impossible de charger les résultats de l’enquête.
              </p>
            ) : cultureSummary.data?.available ? (
              <>
                <p className={`mt-1 ${muted}`}>
                  {cultureSummary.data.response_count} réponses — moyenne de site sur 5 ; aucune
                  réponse individuelle n’est accessible.
                </p>
                <ul className="mt-2 space-y-2">
                  {SURVEY_QUESTIONS.map(({ key, label }) => (
                    <li key={key} className="grid gap-1 text-sm sm:grid-cols-[1fr_auto]">
                      <span>{label}</span>
                      <span className="font-semibold">
                        {cultureSummary.data.averages?.[key]?.toFixed(1) ?? "—"} / 5
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={`mt-1 ${muted}`}>
                Les résultats restent masqués jusqu’à l’obtention d’au moins cinq réponses.
              </p>
            )}
          </div>
        )}
      </div>

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Type de signalement
          <select
            className={`${input} mt-1 normal-case`}
            value={category}
            onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number][0])}
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Date de l’événement (facultative)
          <input
            className={`${input} mt-1 normal-case`}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={incidentDate}
            onChange={(event) => setIncidentDate(event.target.value)}
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground md:col-span-2">
          Objet
          <input
            className={`${input} mt-1 normal-case`}
            value={subject}
            maxLength={180}
            onChange={(event) => setSubject(event.target.value)}
            required
            minLength={5}
          />
        </label>
        <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground md:col-span-2">
          Décrivez les faits (20 caractères minimum)
          <textarea
            className={`${input} mt-1 min-h-32 normal-case`}
            value={description}
            maxLength={10000}
            onChange={(event) => setDescription(event.target.value)}
            required
            minLength={20}
          />
        </label>
        <label className="flex items-start gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          <span>
            Ne pas associer mon identité au dossier. Un code de suivi sera affiché une seule fois ;
            conservez-le et évitez d’inscrire votre nom dans le récit.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <button className={primary} type="submit" disabled={mutations.submit.isPending}>
            <Send className="h-4 w-4" />
            {mutations.submit.isPending ? "Envoi…" : "Envoyer le signalement"}
          </button>
          {anonymous && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Le formulaire requiert une session, mais aucun identifiant utilisateur ne sera lié au
              dossier.
            </span>
          )}
        </div>
      </form>

      {latestCode && (
        <div
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"
        >
          <p className="font-semibold">Code de suivi — à conserver</p>
          <code className="mt-2 block break-all rounded bg-white p-2">{latestCode}</code>
          <button
            type="button"
            className={`${secondary} mt-2`}
            onClick={() => {
              void navigator.clipboard.writeText(latestCode);
              toast.success("Code copié.");
            }}
          >
            <Clipboard className="h-4 w-4" /> Copier le code
          </button>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <h3 className="font-semibold">Suivre un signalement</h3>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            className={input}
            value={trackingCode}
            onChange={(event) => setTrackingCode(event.target.value)}
            placeholder="Code reçu lors du dépôt"
          />
          <button
            type="button"
            className={secondary}
            disabled={mutations.track.isPending || !trackingCode.trim()}
            onClick={() => void track()}
          >
            Consulter
          </button>
        </div>
        {trackedReport && (
          <div className="mt-3 rounded-lg bg-background p-3 text-sm" role="status">
            <p className="font-semibold">
              {trackedReport.subject} — {statusLabel(trackedReport.status)}
            </p>
            {trackedReport.public_update && (
              <p className="mt-1 whitespace-pre-wrap">{trackedReport.public_update}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Dernière mise à jour :{" "}
              {trackedReport.updated_at
                ? new Date(trackedReport.updated_at).toLocaleString("fr-FR")
                : "—"}
            </p>
          </div>
        )}
      </div>

      {ownReports.data && ownReports.data.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="font-semibold">Mes signalements identifiés</h3>
          <ul className="mt-2 space-y-2">
            {ownReports.data.map((report) => (
              <li key={report.id} className="rounded-lg bg-background p-3 text-sm">
                <span className="font-semibold">{report.subject}</span>
                <span className="ml-2 text-muted-foreground">{statusLabel(report.status)}</span>
                {report.public_update && (
                  <p className="mt-1 whitespace-pre-wrap">{report.public_update}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && (
        <div className="border-t border-border pt-4">
          <h3 className="font-semibold">Traitement confidentiel des signalements</h3>
          {managedReports.isLoading ? (
            <p className={`mt-2 ${muted}`}>Chargement des dossiers…</p>
          ) : managedReports.isError ? (
            <p className="mt-2 text-sm text-destructive">
              Impossible de charger le registre confidentiel.
            </p>
          ) : managedReports.data?.length ? (
            <div className="mt-3 space-y-3">
              {managedReports.data.map((report) => (
                <ReportReviewCard
                  key={report.id}
                  report={report}
                  busy={mutations.update.isPending}
                  onSave={(id, status, notes, update) => {
                    void saveTreatment(id, status, notes, update);
                  }}
                />
              ))}
            </div>
          ) : (
            <p className={`mt-2 ${muted}`}>Aucun signalement à traiter pour ce périmètre.</p>
          )}
        </div>
      )}
    </section>
  );
}
