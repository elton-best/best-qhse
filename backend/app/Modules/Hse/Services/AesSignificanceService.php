<?php

namespace App\Modules\Hse\Services;

use App\Modules\Hse\Models\AesSetting;

/**
 * Cotation et significativité des aspects environnementaux (ISO 14001 §6.1.2, A.6.1.2).
 *
 * Méthode du canevas « BASE AES » : Cr = Gravité × Fréquence × Sensibilité × Maîtrise ;
 * l'aspect est significatif par son impact environnemental si Cr > seuil (343 par défaut).
 * Des critères additionnels (exigence légale, préoccupation d'une partie intéressée) peuvent
 * faire monter un aspect au-dessus du seuil, mais jamais le déclasser.
 */
class AesSignificanceService
{
    public const DEFAULT_SETTINGS = [
        'significance_threshold' => 343,
        'max_gravity' => 7,
        'max_frequency' => 7,
        'max_sensitivity' => 7,
        'max_mastery' => 5,
        'use_legal_criterion' => true,
        'use_stakeholder_criterion' => true,
        'review_frequency_months' => 12,
    ];

    /**
     * @return array<string, int|bool>
     */
    public function settingsFor(?int $enterpriseId): array
    {
        $stored = $enterpriseId ? AesSetting::query()->where('enterprise_id', $enterpriseId)->first() : null;

        return $stored
            ? array_merge(self::DEFAULT_SETTINGS, $stored->only(array_keys(self::DEFAULT_SETTINGS)))
            : self::DEFAULT_SETTINGS;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array{criticality: int, environmental_significant: bool, is_significant: bool, basis: string|null}
     */
    public function evaluate(int $gravity, int $frequency, int $sensitivity, int $mastery, bool $legal, bool $stakeholder, array $settings): array
    {
        $criticality = max(1, $gravity) * max(1, $frequency) * max(1, $sensitivity) * max(1, $mastery);
        $environmental = $criticality > (int) $settings['significance_threshold'];
        $additional = ($legal && $settings['use_legal_criterion']) || ($stakeholder && $settings['use_stakeholder_criterion']);

        return [
            'criticality' => $criticality,
            'environmental_significant' => $environmental,
            'is_significant' => $environmental || $additional,
            'basis' => $environmental ? 'environmental' : ($additional ? 'additional' : null),
        ];
    }

    /**
     * Description de la méthode, figée avec chaque version du registre (M4-04 : méthode documentée).
     *
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    public function method(array $settings): array
    {
        return [
            'formula' => 'Cr = Gravité × Fréquence × Sensibilité × Maîtrise',
            'rule' => "Significatif si Cr > {$settings['significance_threshold']} (critère environnemental). "
                . 'Les critères additionnels peuvent rendre un aspect significatif, jamais le déclasser.',
            'threshold' => $settings['significance_threshold'],
            'scales' => [
                'gravity' => [1, $settings['max_gravity']],
                'frequency' => [1, $settings['max_frequency']],
                'sensitivity' => [1, $settings['max_sensitivity']],
                'mastery' => [1, $settings['max_mastery']],
            ],
            'additional_criteria' => array_values(array_filter([
                $settings['use_legal_criterion'] ? 'exigence légale ou autre exigence' : null,
                $settings['use_stakeholder_criterion'] ? 'préoccupation des parties intéressées' : null,
            ])),
            'maximum_score' => $settings['max_gravity'] * $settings['max_frequency'] * $settings['max_sensitivity'] * $settings['max_mastery'],
        ];
    }
}
