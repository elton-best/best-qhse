<?php

/**
 * Exemples préremplis de l'assistant de démarrage (T-01), par secteur d'activité.
 * Ils créent des brouillons à relire et à adapter : rien n'est présenté comme validé.
 */
return [
    'sectors' => [
        'industrie' => [
            'label' => 'Industrie et fabrication',
            'activities' => 'fabrication, transformation et assemblage de produits',
            'aspects' => [
                ['Production', 'Consommation d\'énergie électrique', 'Épuisement des ressources, émissions indirectes de gaz à effet de serre'],
                ['Production', 'Production de déchets industriels dangereux', 'Pollution des sols et des eaux en cas de mauvaise gestion'],
                ['Maintenance', 'Utilisation d\'huiles et de lubrifiants', 'Risque de déversement et de pollution'],
                ['Production', 'Émissions atmosphériques et poussières', 'Dégradation de la qualité de l\'air'],
            ],
            'stakeholders' => [
                ['Clients et donneurs d\'ordre', 'client', 'Produits conformes, respect des exigences environnementales contractuelles'],
                ['Autorités environnementales', 'regulator', 'Respect de la réglementation, déclarations et autorisations à jour'],
                ['Riverains', 'other', 'Limitation des nuisances (bruit, odeurs, circulation)'],
                ['Personnel', 'employee', 'Conditions de travail sûres, information sur les impacts de l\'activité'],
                ['Fournisseurs et prestataires', 'supplier', 'Exigences claires, paiements dans les délais, filières de déchets agréées'],
            ],
        ],
        'agroalimentaire' => [
            'label' => 'Agroalimentaire',
            'activities' => 'transformation, conditionnement et distribution de produits alimentaires',
            'aspects' => [
                ['Transformation', 'Consommation d\'eau', 'Pression sur la ressource en eau'],
                ['Transformation', 'Rejets d\'eaux usées chargées en matière organique', 'Pollution des eaux et du milieu récepteur'],
                ['Conditionnement', 'Production de déchets d\'emballage', 'Saturation des filières de traitement'],
                ['Stockage', 'Fluides frigorigènes', 'Fuites contribuant au réchauffement climatique'],
            ],
            'stakeholders' => [
                ['Consommateurs et clients', 'client', 'Produits sûrs et responsables, emballages réduits'],
                ['Autorités sanitaires et environnementales', 'regulator', 'Conformité sanitaire et environnementale'],
                ['Riverains', 'other', 'Maîtrise des odeurs et des rejets'],
                ['Personnel', 'employee', 'Formation à l\'hygiène et aux bonnes pratiques environnementales'],
                ['Producteurs et fournisseurs', 'supplier', 'Approvisionnement durable, prix équitables'],
            ],
        ],
        'btp' => [
            'label' => 'Bâtiment et travaux publics',
            'activities' => 'construction, rénovation et travaux d\'infrastructure',
            'aspects' => [
                ['Chantier', 'Production de déchets de chantier (gravats, bois, métaux)', 'Dépôts sauvages et saturation des décharges'],
                ['Chantier', 'Poussières et bruit', 'Nuisances pour les riverains'],
                ['Engins', 'Consommation de carburant et émissions', 'Pollution de l\'air et émissions de gaz à effet de serre'],
                ['Chantier', 'Ruissellement et érosion des sols', 'Pollution des eaux et perte de sols'],
            ],
            'stakeholders' => [
                ['Maîtres d\'ouvrage', 'client', 'Respect des prescriptions environnementales du marché'],
                ['Autorités locales et environnementales', 'regulator', 'Autorisations, études d\'impact, gestion des déblais'],
                ['Riverains du chantier', 'other', 'Limitation des nuisances et information'],
                ['Personnel et sous-traitants', 'employee', 'Consignes de chantier, tri des déchets'],
                ['Fournisseurs de matériaux', 'supplier', 'Matériaux conformes et traçables'],
            ],
        ],
        'services' => [
            'label' => 'Services et tertiaire',
            'activities' => 'prestations de services et activités de bureau',
            'aspects' => [
                ['Bureaux', 'Consommation d\'électricité (climatisation, informatique)', 'Émissions indirectes de gaz à effet de serre'],
                ['Bureaux', 'Production de papier et de déchets électroniques', 'Épuisement des ressources et déchets à filière spécifique'],
                ['Déplacements', 'Déplacements professionnels', 'Émissions de gaz à effet de serre'],
                ['Bureaux', 'Consommation d\'eau', 'Pression sur la ressource'],
            ],
            'stakeholders' => [
                ['Clients', 'client', 'Prestations responsables, démarche environnementale démontrée'],
                ['Autorités', 'regulator', 'Conformité réglementaire'],
                ['Personnel', 'employee', 'Cadre de travail durable, sensibilisation'],
                ['Bailleurs et gestionnaires de site', 'partner', 'Respect du règlement du site'],
                ['Prestataires (maintenance, nettoyage)', 'supplier', 'Produits et pratiques à faible impact'],
            ],
        ],
        'commerce_logistique' => [
            'label' => 'Commerce et logistique',
            'activities' => 'stockage, transport et distribution de marchandises',
            'aspects' => [
                ['Transport', 'Consommation de carburant et émissions', 'Pollution de l\'air et émissions de gaz à effet de serre'],
                ['Entrepôt', 'Production de déchets d\'emballage', 'Saturation des filières de traitement'],
                ['Entrepôt', 'Stockage de produits dangereux', 'Risque de déversement et d\'incendie'],
                ['Flotte', 'Entretien des véhicules (huiles, pneus, batteries)', 'Déchets dangereux et pollution'],
            ],
            'stakeholders' => [
                ['Clients et distributeurs', 'client', 'Livraisons fiables, emballages et trajets optimisés'],
                ['Autorités', 'regulator', 'Transport de matières dangereuses, conformité des véhicules'],
                ['Riverains des entrepôts', 'other', 'Circulation et bruit maîtrisés'],
                ['Personnel et chauffeurs', 'employee', 'Éco-conduite, formation aux produits dangereux'],
                ['Transporteurs partenaires', 'partner', 'Pratiques environnementales alignées'],
            ],
        ],
        'sante' => [
            'label' => 'Santé et médico-social',
            'activities' => 'soins, diagnostic et hébergement de patients',
            'aspects' => [
                ['Soins', 'Production de déchets d\'activités de soins à risque infectieux', 'Risque sanitaire et pollution en cas de mauvaise filière'],
                ['Laboratoire', 'Rejets de produits chimiques et de médicaments', 'Pollution des eaux'],
                ['Bâtiment', 'Consommation d\'énergie et d\'eau', 'Épuisement des ressources'],
                ['Imagerie', 'Sources de rayonnements', 'Risque pour l\'environnement et le personnel'],
            ],
            'stakeholders' => [
                ['Patients et familles', 'client', 'Environnement de soins sain et sûr'],
                ['Autorités sanitaires et environnementales', 'regulator', 'Gestion conforme des déchets de soins'],
                ['Riverains', 'other', 'Absence de nuisances et de risques'],
                ['Personnel soignant', 'employee', 'Formation au tri des déchets de soins'],
                ['Prestataires de collecte de déchets', 'supplier', 'Filières agréées et traçabilité'],
            ],
        ],
    ],
    'obligations' => [
        'Réglementation nationale sur la protection de l\'environnement applicable à l\'activité',
        'Réglementation sur la gestion des déchets et des substances dangereuses',
        'Autorisations, permis et déclarations d\'exploitation du site',
    ],
];
