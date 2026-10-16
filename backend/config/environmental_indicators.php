<?php

/**
 * Bibliothèque d'indicateurs de performance environnementale proposés à l'activation (ISO 14001 §9.1.1, M14-02).
 * direction : « max » = alerte au-dessus du seuil, « min » = alerte en dessous.
 */
return [
    'library' => [
        ['code' => 'water_consumption', 'title' => "Consommation d'eau", 'category' => 'water', 'unit' => 'm³', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'per_employee', 'data_source' => 'Factures et compteurs'],
        ['code' => 'electricity_consumption', 'title' => "Consommation d'électricité", 'category' => 'energy', 'unit' => 'kWh', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'per_unit_produced', 'data_source' => 'Factures et compteurs'],
        ['code' => 'fuel_consumption', 'title' => 'Consommation de carburant', 'category' => 'energy', 'unit' => 'L', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'per_unit_produced', 'data_source' => 'Bons de livraison et carnets de bord'],
        ['code' => 'waste_hazardous', 'title' => 'Déchets dangereux', 'category' => 'waste', 'unit' => 'kg', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'per_unit_produced', 'data_source' => 'Bordereaux de suivi de déchets'],
        ['code' => 'waste_non_hazardous', 'title' => 'Déchets non dangereux', 'category' => 'waste', 'unit' => 'kg', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'per_unit_produced', 'data_source' => 'Bordereaux de suivi de déchets'],
        ['code' => 'waste_recovery_rate', 'title' => 'Taux de valorisation des déchets', 'category' => 'waste', 'unit' => '%', 'frequency' => 'quarterly', 'direction' => 'min', 'normalization' => 'none', 'data_source' => 'Bordereaux de suivi de déchets'],
        ['code' => 'ghg_emissions', 'title' => 'Émissions de gaz à effet de serre estimées', 'category' => 'emissions', 'unit' => 'tCO2e', 'frequency' => 'quarterly', 'direction' => 'max', 'normalization' => 'per_unit_produced', 'data_source' => 'Calcul à partir des consommations'],
        ['code' => 'spills', 'title' => 'Déversements accidentels', 'category' => 'incidents', 'unit' => 'nombre', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'none', 'data_source' => 'Registre des situations d\'urgence'],
        ['code' => 'compliance_rate', 'title' => 'Taux de conformité réglementaire', 'category' => 'compliance', 'unit' => '%', 'frequency' => 'quarterly', 'direction' => 'min', 'normalization' => 'none', 'data_source' => 'Registre des obligations de conformité'],
        ['code' => 'objectives_rate', 'title' => 'Taux de réalisation des objectifs environnementaux', 'category' => 'management', 'unit' => '%', 'frequency' => 'quarterly', 'direction' => 'min', 'normalization' => 'none', 'data_source' => 'Objectifs environnementaux'],
        ['code' => 'actions_rate', 'title' => 'Taux de réalisation des actions', 'category' => 'management', 'unit' => '%', 'frequency' => 'quarterly', 'direction' => 'min', 'normalization' => 'none', 'data_source' => "Plan d'actions"],
        ['code' => 'nonconformities_count', 'title' => 'Nombre de non-conformités', 'category' => 'management', 'unit' => 'nombre', 'frequency' => 'monthly', 'direction' => 'max', 'normalization' => 'none', 'data_source' => 'Registre des non-conformités'],
        ['code' => 'closure_delay', 'title' => 'Délai moyen de clôture des non-conformités', 'category' => 'management', 'unit' => 'jours', 'frequency' => 'quarterly', 'direction' => 'max', 'normalization' => 'none', 'data_source' => 'Registre des non-conformités'],
    ],
];
