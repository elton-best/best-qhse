<?php

namespace App\Modules\Hse\Services;

use App\Models\User;
use App\Modules\Hse\Models\ComplianceObligationText;
use App\Notifications\SiteEventNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Veille et alertes du registre de conformité (ISO 14001 §6.1.3) : analyses d'impact à mener
 * sur les textes nouveaux ou modifiés, et échéances des permis et licences (J-90, J-30, J-7).
 */
class ComplianceWatchService
{
    /** Jalons d'alerte avant l'échéance d'un permis ou d'une licence. */
    public const EXPIRY_MILESTONES = [90, 30, 7];

    /**
     * Le responsable désigné, à défaut les administrateurs de l'entreprise.
     *
     * @return Collection<int, User>
     */
    public function recipientsFor(ComplianceObligationText $text): Collection
    {
        if ($text->responsible_id && ($responsible = User::query()->find($text->responsible_id))) {
            return collect([$responsible]);
        }

        return User::query()->where('enterprise_id', $text->enterprise_id)->role('admin_entreprise')->get();
    }

    public function notifyAnalysisRequired(ComplianceObligationText $text): void
    {
        $label = $text->title ?: $text->regulatory_reference;
        foreach ($this->recipientsFor($text) as $user) {
            $user->notify(new SiteEventNotification('compliance_analysis_required', [
                'title' => 'Analyse d\'impact réglementaire à mener',
                'message' => "Le texte « {$label} » est nouveau ou modifié : analysez son impact sur vos aspects et votre système.",
                'obligation_id' => $text->id,
                'reference' => $text->ref,
                'url' => '/app/obligations',
            ]));
        }
    }

    public function notifyExpiry(ComplianceObligationText $text, int $daysLeft): void
    {
        $label = $text->title ?: $text->regulatory_reference;
        foreach ($this->recipientsFor($text) as $user) {
            $user->notify(new SiteEventNotification('compliance_expiry', [
                'title' => $daysLeft <= 0 ? 'Autorisation expirée' : "Autorisation à renouveler dans {$daysLeft} jour(s)",
                'message' => "« {$label} » arrive à échéance le {$text->expiry_date?->format('d/m/Y')}.",
                'obligation_id' => $text->id,
                'reference' => $text->ref,
                'days_left' => $daysLeft,
                'url' => '/app/obligations',
            ]));
        }
    }

    /**
     * Alertes du jour : une notification exactement aux jalons J-90, J-30 et J-7.
     *
     * @return int nombre de notifications créées
     */
    public function alertDueMilestones(?\DateTimeInterface $today = null): int
    {
        $today = Carbon::instance($today ?? now())->startOfDay();
        $sent = 0;

        foreach (self::EXPIRY_MILESTONES as $days) {
            $texts = ComplianceObligationText::query()->withoutGlobalScopes()
                ->whereIn('source_type', ComplianceObligationText::EXPIRING_TYPES)
                ->whereDate('expiry_date', $today->copy()->addDays($days)->toDateString())
                ->where(fn ($query) => $query->whereNull('is_applicable')->orWhere('is_applicable', true))
                ->get();

            foreach ($texts as $text) {
                $this->notifyExpiry($text, $days);
                $sent++;
            }
        }

        return $sent;
    }

    /**
     * Palier d'urgence d'une échéance, pour les tableaux de bord.
     */
    public static function expiryBucket(?\DateTimeInterface $expiry, ?\DateTimeInterface $today = null): ?string
    {
        if (! $expiry) {
            return null;
        }
        $days = (int) Carbon::instance($today ?? now())->startOfDay()
            ->diffInDays(Carbon::instance($expiry)->startOfDay(), false);

        return match (true) {
            $days < 0 => 'expired',
            $days <= 7 => 'd7',
            $days <= 30 => 'd30',
            $days <= 90 => 'd90',
            default => 'later',
        };
    }
}
