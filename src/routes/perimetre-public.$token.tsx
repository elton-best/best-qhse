import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isoFoundationApi } from "@/integrations/backend/isoFoundation";
import { LanguageSelect, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/perimetre-public/$token")({
  head: () => ({
    meta: [{ title: "Périmètre — BESTQHSE" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: PublicScopePage,
});

function PublicScopePage() {
  const { token } = Route.useParams();
  const { t, date } = useI18n();
  const query = useQuery({
    queryKey: ["public-scope", token],
    queryFn: () => isoFoundationApi.publicScope(token),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const scope = query.data?.data;
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 px-5 py-10">
      <div className="flex justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">{t("Périmètre publié")}</h1>
        <LanguageSelect />
      </div>
      {query.isPending ? (
        <p>{t("Chargement…")}</p>
      ) : query.isError || !scope ? (
        <p role="alert">{t("Ce lien est indisponible, expiré ou révoqué.")}</p>
      ) : (
        <article className="space-y-5 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold">
            {scope.enterprise_name} — {scope.site_name}
          </h2>
          <p>
            {t("Version")} {scope.version} · {date(scope.published_at)}
          </p>
          <p className="whitespace-pre-wrap">{scope.scope_definition || scope.scope}</p>
          {!!scope.processes?.length && (
            <section>
              <h3 className="font-bold">{t("Processus", "Processes")}</h3>
              <ul className="list-inside list-disc">
                {scope.processes.map((process, index) => (
                  <li key={index}>{process.name}</li>
                ))}
              </ul>
            </section>
          )}
          {(
            [
              ["Produits et services", scope.products_services],
              ["Unités organisationnelles", scope.organizational_units],
              ["Lieux", scope.locations],
            ] as const
          ).map(([label, values]) =>
            values?.length ? (
              <section key={label}>
                <h3 className="font-bold">{t(label)}</h3>
                <ul className="list-inside list-disc">
                  {values.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {(scope.scope_exclusions || scope.exclusions) && (
            <section>
              <h3 className="font-bold">{t("Exclusions")}</h3>
              <p className="whitespace-pre-wrap">{scope.scope_exclusions || scope.exclusions}</p>
              <p className="whitespace-pre-wrap">{scope.exclusions_justification}</p>
            </section>
          )}
          <p className="text-sm text-muted-foreground">
            {t("Expiration du lien")} : {date(scope.expires_at)}
          </p>
        </article>
      )}
    </main>
  );
}
