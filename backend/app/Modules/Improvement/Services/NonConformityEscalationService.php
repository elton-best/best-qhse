<?php

namespace App\Modules\Improvement\Services;

use App\Models\User;
use App\Modules\Improvement\Models\NonConformity;
use App\Notifications\SiteEventNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Escalade automatique des retards (ISO 14001 §10.2, M17-05) : responsable dès le lendemain de l'échéance, pilote du processus
 * après 7 jours, direction après 14 jours. Une alerte n'est envoyée que lorsque le niveau augmente.
 */
class NonConformityEscalationService
{
    public const LEVELS = [1 => 1, 2 => 7, 3 => 14];

    /**
     * @return int nombre de notifications créées
     */
    public function run(): int
    {
        $sent = 0;
        $candidates = NonConformity::query()->withoutGlobalScopes()->whereNull('resolution_date')->where(fn ($q) => $q->whereNull('corrective_decision')->orWhere('corrective_decision', '!=', 'not_required'))->get();

        foreach ($candidates as $nc) {
            $late = $this->lateDays($nc);
            $level = 0;
            foreach (self::LEVELS as $candidate => $days) {
                if ($late >= $days) {
                    $level = $candidate;
                }
            }
            if ($level <= (int) $nc->escalation_level) {
                continue;
            }
            foreach ($this->recipients($nc, $level) as $user) {
                $user->notify(new SiteEventNotification('nonconformity_overdue', [
                    'title' => $level === 3 ? 'Non-conformité en retard : escalade à la direction' : 'Non-conformité en retard',
                    'message' => "{$nc->ref} — {$nc->title} : {$late} jour(s) de retard.",
                    'reference' => $nc->ref, 'level' => $level, 'url' => '/app/non-conformites',
                ]));
                $sent++;
            }
            $nc->forceFill(['escalation_level' => $level, 'escalated_at' => now()])->saveQuietly();
        }

        return $sent;
    }

    /** Jours de retard : le pire entre l'échéance de la fiche et celle de ses actions encore ouvertes. */
    private function lateDays(NonConformity $nc): int
    {
        $deadlines = collect([$nc->deadline?->toDateString()])->merge(
            DB::table('actions')->whereNull('deleted_at')->where('non_conformity_id', $nc->id)->whereNotIn('status', ['completed', 'verified', 'cancelled'])->pluck('deadline'),
        )->filter();
        $oldest = $deadlines->min();

        return $oldest === null || now()->startOfDay()->lte($oldest) ? 0 : (int) Carbon::parse($oldest)->diffInDays(now()->startOfDay());
    }

    /**
     * @return Collection<int, User>
     */
    private function recipients(NonConformity $nc, int $level)
    {
        $ids = collect([$nc->responsible_id ?: $nc->detected_by]);
        if ($level >= 2 && $nc->process_id) {
            $process = DB::table('processes')->where('id', $nc->process_id)->first(['pilot_id', 'copilot_id']);
            $ids = $ids->merge([$process?->pilot_id, $process?->copilot_id]);
        }
        $users = User::query()->whereIn('id', $ids->filter()->unique())->get();
        if ($level >= 3) {
            $enterpriseId = DB::table('sites')->where('id', $nc->site_id)->value('enterprise_id');
            $users = $users->merge(User::query()->where('enterprise_id', $enterpriseId)->role('admin_entreprise')->get())->unique('id');
        }

        return $users;
    }
}
