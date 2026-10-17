<?php

namespace App\Modules\Evaluation\Services;

use App\Models\User;
use App\Modules\Processes\Models\Process;

/**
 * Indépendance des auditeurs (ISO 19011 §5.4, ISO 14001 §9.2.2) : un auditeur n'audite pas son propre travail.
 * Sont bloquants : être audité dans le même audit, ou piloter un processus audité.
 */
class AuditIndependenceService
{
    /**
     * @param  array<int, int|string>  $auditorIds
     * @param  array<int, int|string>  $auditeeIds
     * @param  array<int, int|string>  $processIds
     * @return array<int, array{user_id: int, name: string, reason: string}>
     */
    public function conflicts(int|string $leadId, array $auditorIds, array $auditeeIds, array $processIds): array
    {
        $auditors = collect([$leadId, ...$auditorIds])->map(fn ($id) => (int) $id)->unique()->values();
        $auditees = collect($auditeeIds)->map(fn ($id) => (int) $id);
        $processes = $processIds === [] ? collect() : Process::query()->whereIn('id', $processIds)->get(['id', 'title', 'pilot_id', 'copilot_id', 'process_owner_id']);
        $names = User::query()->whereIn('id', $auditors)->pluck('name', 'id');

        $conflicts = [];
        foreach ($auditors as $userId) {
            if ($auditees->contains($userId)) {
                $conflicts[] = ['user_id' => $userId, 'name' => (string) ($names[$userId] ?? ''), 'reason' => 'est à la fois auditeur et audité'];
            }
            foreach ($processes as $process) {
                if (in_array($userId, array_filter([(int) $process->pilot_id, (int) $process->copilot_id, (int) $process->process_owner_id]), true)) {
                    $conflicts[] = ['user_id' => $userId, 'name' => (string) ($names[$userId] ?? ''), 'reason' => "pilote ou responsable du processus audité « {$process->title} »"];
                }
            }
        }

        return $conflicts;
    }

    /**
     * @param  array<int, int|string>  $auditorIds
     * @param  array<int, int|string>  $auditeeIds
     * @param  array<int, int|string>  $processIds
     */
    public function assertIndependent(int|string $leadId, array $auditorIds, array $auditeeIds, array $processIds): void
    {
        $conflicts = $this->conflicts($leadId, $auditorIds, $auditeeIds, $processIds);
        if ($conflicts !== []) {
            abort(response()->json([
                'message' => 'Conflit d\'intérêt : un auditeur ne peut pas auditer ce qu\'il pilote ou à quoi il participe.',
                'code' => 'AUDITOR_NOT_INDEPENDENT',
                'conflicts' => $conflicts,
                'errors' => ['lead_auditor_id' => collect($conflicts)->map(fn ($c) => "{$c['name']} {$c['reason']}.")->all()],
            ], 422));
        }
    }
}
