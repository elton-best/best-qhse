import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import { useSaMutations, useSaSessions, useSaSettings, type SaSettings } from "@/integrations/backend/superadmin";
import { Badge, ErrorNote, Field, SaHeader, Skeleton, btnGhost, btnPrimary, field, formatDate, muted, panel } from "./sa-ui";

/** Paramètres de la plateforme et sessions actives du compte administrateur. */
export function SettingsPage() {
  const { data, isLoading, error } = useSaSettings();
  const { data: sessions = [] } = useSaSessions();
  const mutations = useSaMutations();
  const [form, setForm] = useState<SaSettings | null>(null);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) return error ? <ErrorNote error={error} fallback="Impossible de charger les paramètres." /> : <Skeleton rows={3} />;

  const set = <S extends keyof SaSettings>(section: S, patch: Partial<SaSettings[S]>): void =>
    setForm((current) => (current ? { ...current, [section]: { ...(current[section] as object), ...patch } } : current));

  const save = async (): Promise<void> => {
    try {
      await mutations.saveSettings.mutateAsync(form);
      toast.success("Paramètres enregistrés.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  };

  const check = (label: string, value: boolean, onChange: (value: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
  );

  return (
    <>
      <SaHeader title="Paramètres et sessions" description="Identité de la plateforme, messagerie, règles de sécurité et maintenance ; sessions ouvertes de votre compte." icon={Settings}>
        <button type="button" className={btnPrimary} disabled={mutations.saveSettings.isPending} onClick={() => void save()}>Enregistrer les paramètres</button>
      </SaHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${panel} space-y-3 p-5`}>
          <h2 className="font-display font-bold">Général</h2>
          <Field label="Nom de la plateforme"><input className={field} value={form.general.platformName} onChange={(e) => set("general", { platformName: e.target.value })} /></Field>
          <Field label="Description"><textarea className={`${field} min-h-16`} value={form.general.platformDescription} onChange={(e) => set("general", { platformDescription: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail du support"><input type="email" className={field} value={form.general.supportEmail} onChange={(e) => set("general", { supportEmail: e.target.value })} /></Field>
            <Field label="Téléphone du support"><input className={field} value={form.general.supportPhone} onChange={(e) => set("general", { supportPhone: e.target.value })} /></Field>
            <Field label="Langue par défaut"><input className={field} value={form.general.defaultLanguage} onChange={(e) => set("general", { defaultLanguage: e.target.value })} /></Field>
            <Field label="Devise par défaut"><input className={field} value={form.general.defaultCurrency} onChange={(e) => set("general", { defaultCurrency: e.target.value })} /></Field>
          </div>
          <Field label="Fuseau horaire"><input className={field} value={form.general.timezone} onChange={(e) => set("general", { timezone: e.target.value })} /></Field>
        </section>

        <section className={`${panel} space-y-3 p-5`}>
          <h2 className="font-display font-bold">Sécurité</h2>
          {check("Exiger des mots de passe robustes", form.security.enforceStrongPassword, (v) => set("security", { enforceStrongPassword: v }))}
          {check("Double authentification activée", form.security.enable2FA, (v) => set("security", { enable2FA: v }))}
          {check("Expiration des sessions inactives", form.security.sessionTimeout, (v) => set("security", { sessionTimeout: v }))}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Durée d'inactivité (min)"><input type="number" min={1} className={field} value={form.security.sessionTimeoutMinutes} onChange={(e) => set("security", { sessionTimeoutMinutes: Number(e.target.value) })} /></Field>
            <Field label="Tentatives de connexion max."><input type="number" min={1} className={field} value={form.security.maxLoginAttempts} onChange={(e) => set("security", { maxLoginAttempts: Number(e.target.value) })} /></Field>
          </div>
          <h2 className="pt-2 font-display font-bold">Maintenance</h2>
          {check("Mode maintenance", form.system.maintenanceMode, (v) => set("system", { maintenanceMode: v }))}
          <Field label="Message affiché"><input className={field} value={form.system.maintenanceMessage} onChange={(e) => set("system", { maintenanceMessage: e.target.value })} /></Field>
        </section>

        <section className={`${panel} space-y-3 p-5`}>
          <h2 className="font-display font-bold">Messagerie (SMTP)</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serveur"><input className={field} value={form.email.smtpHost} onChange={(e) => set("email", { smtpHost: e.target.value })} /></Field>
            <Field label="Port"><input type="number" className={field} value={form.email.smtpPort} onChange={(e) => set("email", { smtpPort: Number(e.target.value) })} /></Field>
            <Field label="Utilisateur"><input className={field} value={form.email.smtpUser} onChange={(e) => set("email", { smtpUser: e.target.value })} /></Field>
            <Field label="Mot de passe (inchangé si vide)"><input type="password" autoComplete="new-password" className={field} value={form.email.smtpPassword ?? ""} onChange={(e) => set("email", { smtpPassword: e.target.value })} /></Field>
          </div>
          <div className="flex gap-2">
            <input type="email" className={field} placeholder="Adresse de test" aria-label="Adresse de test" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            <button type="button" className={btnGhost} disabled={!testEmail || mutations.testEmail.isPending} onClick={() => mutations.testEmail.mutateAsync({ email: testEmail }).then(() => toast.success("E-mail de test envoyé."), (e: Error) => toast.error(e.message))}>Tester</button>
          </div>
          {form.system_info && <p className={muted}>Version {form.system_info.version} · {form.system_info.database} · {form.system_info.server}</p>}
        </section>

        <section className={`${panel} space-y-3 p-5`}>
          <h2 className="font-display font-bold">Sessions ouvertes</h2>
          {sessions.length === 0 ? <p className={muted}>Aucune session.</p> : (
            <ul className="divide-y divide-border">
              {sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-semibold">{session.name} {session.is_current && <Badge tone="green">Session actuelle</Badge>}</p>
                    <p className={muted}>Ouverte le {formatDate(session.created_at, true)} · dernière activité {formatDate(session.last_used_at, true)}</p>
                  </div>
                  {!session.is_current && (
                    <button type="button" className={btnGhost} onClick={() => mutations.revokeSession.mutateAsync(session.id).then(() => toast.success("Session révoquée."), (e: Error) => toast.error(e.message))}>Révoquer</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
