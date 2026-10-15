import { useState } from "react";
import { toast } from "sonner";
import { Plus, UserCog } from "lucide-react";
import { useSaMutations, useSaRoles, useSaUsers, type SaPlatformUser } from "@/integrations/backend/superadmin";
import { Badge, Drawer, Empty, ErrorNote, Field, Pager, SaHeader, Skeleton, btnGhost, btnPrimary, field, muted, panel } from "./sa-ui";

type Form = { first_name: string; last_name: string; username: string; email: string; password: string; role_name: string; is_active: boolean };
const EMPTY: Form = { first_name: "", last_name: "", username: "", email: "", password: "", role_name: "", is_active: true };

/** Équipe d'administration de la plateforme (comptes super administrateurs et rôles dédiés). */
export function TeamPage() {
  const [search, setSearch] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const { data, isLoading, error } = useSaUsers({ search: search.trim(), page: pageNumber });
  const { data: roles = [] } = useSaRoles();
  const mutations = useSaMutations();
  const [editing, setEditing] = useState<SaPlatformUser | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formError, setFormError] = useState("");

  const open = (user: SaPlatformUser | "new"): void => {
    setEditing(user);
    setFormError("");
    setForm(
      user === "new"
        ? { ...EMPTY, role_name: roles[0]?.name ?? "" }
        : { ...EMPTY, first_name: user.name.split(" ")[0] ?? "", last_name: user.name.split(" ").slice(1).join(" "), username: user.username ?? "", email: user.email, role_name: user.role ?? roles[0]?.name ?? "", is_active: user.is_active },
    );
  };

  const save = async (): Promise<void> => {
    const creating = editing === "new";
    if (!form.email.trim() || !form.role_name || (creating && (!form.first_name.trim() || !form.last_name.trim() || !form.username.trim() || !form.password))) {
      setFormError("Renseignez tous les champs obligatoires.");
      return;
    }
    setFormError("");
    try {
      await mutations.saveUser.mutateAsync({
        ...(editing && editing !== "new" ? { id: editing.id } : {}),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        role_name: form.role_name,
        is_active: form.is_active,
        ...(form.password ? { password: form.password } : {}),
      });
      toast.success("Compte enregistré.");
      setEditing(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  };

  return (
    <>
      <SaHeader title="Équipe plateforme" description="Gérez les comptes qui administrent la plateforme et leurs rôles. Les comptes des entreprises se gèrent depuis leur espace." icon={UserCog}>
        <button type="button" className={btnPrimary} onClick={() => open("new")}><Plus className="h-4 w-4" /> Nouveau compte</button>
      </SaHeader>

      <input className={`${field} max-w-xs`} placeholder="Rechercher (nom, e-mail)" aria-label="Rechercher" value={search} onChange={(e) => { setSearch(e.target.value); setPageNumber(1); }} />

      <div className={`${panel} p-4`}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <ErrorNote error={error} fallback="Impossible de charger les comptes." />
        ) : !data || data.items.length === 0 ? (
          <Empty>Aucun compte.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Compte</th>
                  <th className="px-3 py-2">Rôle</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <td className="px-3 py-3"><p className="font-semibold">{user.name}</p><p className={muted}>{user.email}</p></td>
                    <td className="px-3 py-3">{roles.find((r) => r.name === user.role)?.label ?? user.role ?? "—"}</td>
                    <td className="px-3 py-3"><Badge tone={user.is_active ? "green" : "slate"}>{user.is_active ? "Actif" : "Désactivé"}</Badge></td>
                    <td className="px-3 py-3 text-right"><button type="button" className={btnGhost} onClick={() => open(user)}>Modifier</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPageNumber} />
      </div>

      {editing && (
        <Drawer title={editing === "new" ? "Nouveau compte" : "Modifier le compte"} subtitle="Équipe plateforme" onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom *"><input className={field} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Nom *"><input className={field} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
          </div>
          <Field label="Identifiant *"><input className={field} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
          <Field label="E-mail *"><input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={editing === "new" ? "Mot de passe initial *" : "Nouveau mot de passe (laisser vide pour conserver)"}>
            <input type="password" autoComplete="new-password" className={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Rôle *">
            <select className={field} value={form.role_name} onChange={(e) => setForm({ ...form, role_name: e.target.value })}>
              {roles.map((role) => <option key={role.id} value={role.name}>{role.label} ({role.permissions_count} droits)</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Compte actif</label>
          {formError && <p className="text-sm text-red-700" role="alert">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Annuler</button>
            <button type="button" className={btnPrimary} disabled={mutations.saveUser.isPending} onClick={() => void save()}>Enregistrer</button>
          </div>
        </Drawer>
      )}
    </>
  );
}
