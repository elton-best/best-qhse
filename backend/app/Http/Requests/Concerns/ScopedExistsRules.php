<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Règles « exists » limitées à l'entreprise de l'utilisateur : un identifiant d'une autre entreprise est refusé.
 */
trait ScopedExistsRules
{
    /**
     * @return array<int, mixed>
     */
    protected function ownedExists(string $table): array
    {
        return [Rule::exists($table, 'id')->where('enterprise_id', $this->user()?->enterprise_id)];
    }

    /**
     * @return array<int, mixed>
     */
    protected function ownedProgramExists(): array
    {
        $enterpriseId = $this->user()?->enterprise_id;

        return [Rule::exists('audit_programs', 'id')->where(fn ($query) => $query->whereIn('site_id', DB::table('sites')->where('enterprise_id', $enterpriseId)->select('id')))];
    }
}
