<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Garantit que la permission `view_all_tasks` (guard web) existe et
     * qu'elle est assignée aux rôles `admin_entreprise` et `super_admin`.
     * Idempotent : ré-exécutable sans erreur ni doublon.
     */
    public function up(): void
    {
        $permission = Permission::firstOrCreate(
            ['name' => 'view_all_tasks', 'guard_name' => 'web'],
            ['guard_name' => 'web']
        );

        foreach (['admin_entreprise', 'super_admin'] as $roleName) {
            $role = Role::where('name', $roleName)->where('guard_name', 'web')->first();
            if ($role && ! $role->hasPermissionTo($permission)) {
                $role->givePermissionTo($permission);
            }
        }
    }

    /**
     * Reverse the migrations.
     *
     * Retire l'assignation aux deux rôles sans supprimer la permission
     * elle-même si elle est encore utilisée ailleurs.
     */
    public function down(): void
    {
        $permission = Permission::where('name', 'view_all_tasks')
            ->where('guard_name', 'web')
            ->first();

        if (! $permission) {
            return;
        }

        foreach (['admin_entreprise', 'super_admin'] as $roleName) {
            $role = Role::where('name', $roleName)->where('guard_name', 'web')->first();
            if ($role && $role->hasPermissionTo($permission)) {
                $role->revokePermissionTo($permission);
            }
        }
    }
};
