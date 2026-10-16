# Traçabilité ISO 14001:2026 — état du dépôt

**Mise à jour :** 16 octobre 2026  
**Branche auditée :** `main` après fusion locale de `chore/remove-lovable`  
**Référence fonctionnelle :** Cahier des charges « Application SME ISO 14001 2026 » fourni par l’équipe.

## Comment lire cette matrice

- **Base présente** : un écran, une API ou un modèle correspondant existe. Cela ne signifie pas que tous les critères de l’exigence sont satisfaits.
- **Partiel** : le socle existe, mais le cahier demande un flux, une automatisation, un mode terrain ou une preuve supplémentaire.
- **Implémenté et testé** : le parcours demandé a été ajouté avec des tests ciblés ; cela ne valide pas les autres exigences du module.
- **À construire** : aucune fonction équivalente n’a été repérée pendant cette revue.
- **À confirmer** : le lien ou la preuve n’a pas été établi assez précisément ; ne pas compter comme couvert en recette.
- **P0–P3** : ordre de réalisation conseillé, selon la phase prévue dans le cahier et le niveau de couverture observé.
- Les tests cités sont des tests de module. Ils ne prouvent le critère individuel que si une assertion dédiée le couvre. La conformité finale doit être vérifiée avec une recette par ID.

## État résumé

| Domaine | État observé | Tests de module repérés |
|---|---|---|
| M1 · Contexte de l’organisme | Socle présent, exigences détaillées à fermer | `SetupGuideAndReadinessTest.php; ManagementSystemOverviewTest.php; Iso14001FoundationTest.php` |
| M2 · Cartographie des processus | Socle présent, exigences détaillées à fermer | `ManagementSystemOverviewTest.php` |
| M3 · Leadership et politique | Socle présent, exigences détaillées à fermer | `Iso14001FoundationTest.php (M3-04) ; autres validations spécifiques à compléter` |
| M4 · Aspects et impacts environnementaux | Socle présent, exigences détaillées à fermer | `EnvironmentalAspectsTest.php` |
| M5 · Obligations de conformité | Socle présent, exigences détaillées à fermer | `ComplianceRegisterTest.php` |
| M6 · Risques et opportunités | Socle présent, exigences détaillées à fermer | `tests de risques à rattacher précisément à M6` |
| M7 · Objectifs et plans d’actions | Socle présent, exigences détaillées à fermer | `tests objectifs/actions à rattacher précisément à M7` |
| M8 · Gestion des changements | Socle présent, exigences détaillées à fermer | `ManagementChangeTest.php` |
| M9 · Ressources, compétences et sensibilisation | Socle présent, exigences détaillées à fermer | `AwarenessCampaignTest.php; TrainingPlanAndInternalEvaluationTest.php` |
| M10 · Communication | Socle présent, exigences détaillées à fermer | `CommunicationWorkflowTest.php; CommunicationImportFileTest.php` |
| M11 · Gestion documentaire | Socle présent, exigences détaillées à fermer | `tests documentaires existants à relier ID par ID` |
| M12 · Maîtrise opérationnelle | Socle présent, exigences détaillées à fermer | `ProviderPartnerImportFileTest.php; tests de maîtrise opérationnelle à rattacher` |
| M13 · Situations d’urgence | Socle présent, exigences détaillées à fermer | `EmergencyPreparednessTest.php` |
| M14 · Performance environnementale et surveillance | Socle présent, exigences détaillées à fermer | `EnvironmentalPerformanceTest.php` |
| M15 · Audits internes | Socle présent, exigences détaillées à fermer | `InternalAuditIso14001Test.php` |
| M16 · Revue de direction | Socle présent, exigences détaillées à fermer | `ManagementReviewIso14001Test.php` |
| M17 · Non-conformités et amélioration continue | Socle présent, exigences détaillées à fermer | `NonConformityIso14001Test.php; NonConformityE6WorkflowTest.php` |

**120 exigences fonctionnelles inventoriées :** 76 avec une base repérée, 7 implémentées avec tests ciblés, 36 partielles et 1 à confirmer. « Base présente » indique seulement une fonctionnalité repérable ; ce n’est pas une validation de recette.

Les modules M1 à M17 ont un écran, une API ou un modèle repérable. Les ajouts P0 de phase 1 couvrent désormais la publication et la revue du périmètre, les engagements de leadership, le regroupement des aspects, les exemples de risques et la communication des objectifs. La matrice détaille aussi les exigences partielles à fermer. Le score T-03 existant reste un contrôle de préparation par article, pas une matrice complète de traçabilité.

## Priorités proposées

1. **P0 réalisé — à présenter en recette** : M1-05/06, M3-04, M4-06, M6-05 et M7-07 disposent maintenant de parcours et tests dédiés.
2. **P1 — fermer les flux de phase 1** : compléter les critères partiels M1–M7, M11 et M15–M17, en particulier les liens aspects→obligations→risques→objectifs/actions, les preuves et les tests d’acceptation par ID.
3. **P2 — phase terrain** : mode hors connexion et synchronisation de M12/M13/M15, mesures et alertes de M14, automatisations M8–M10, ainsi que T-05/T-12/T-13.
4. **P3 — extension** : enrichir les traductions anglaises des écrans historiques et les options de phase 3. Le socle T-11 est livré : interface française, sélection de langue persistée, catalogue anglais, dates localisées et contenus utilisateur préservés.

## Ajouts livrés pour les sept exigences initialement à construire

| Exigence | Parcours livré | Preuves dans le dépôt |
|---|---|---|
| M1-05 | Publication d'une version enregistrée du périmètre, lien public expirant sous un an au maximum, révocation, jeton haché et instantané limité aux données publiables. | `ScopePublicationController.php`, `ScopePublicationPanel.tsx`, route `perimetre-public.$token.tsx` ; tests publication, expiration et isolation dans `Iso14001FoundationTest.php`. |
| M1-06 | Revue annuelle par défaut, fréquence de 1 à 60 mois, demande manuelle et clôture justifiée. Changement approuvé : revue déclenchée et notification ciblée ; relance périodique sans doublon quotidien. | `ScopeReviewService.php`, commande `scopes:check-reviews` programmée chaque jour à 08:10 ; tests date, événement, relance et visibilité dans la cloche. |
| M3-04 | Écran « Engagements de leadership », revue annuelle des neuf engagements 5.1 a–i, brouillon, réponses et justifications obligatoires avant finalisation ; preuve finalisée conservée. | `LeadershipReviewController.php`, `LeadershipReviewPage.tsx` ; tests de complétude, droits et conservation. Gestion par administrateur ou permission existante `leadership.roles_responsabilites.fiche_responsabilite.update`. |
| M4-06 | Un aspect commun décrit plusieurs activités ou produits, leur libellé et leurs caractéristiques communes. Les informations sont conservées dans le détail, l'export Excel et les versions figées. | `group_label`, `group_members`, `group_characteristics` ; `AesForm.tsx`, `AesDetail.tsx`, `HseExportService.php`, `AesRegistryVersionController.php` ; test d'enregistrement et rejet d'un groupe non justifié. |
| M6-05 | Bibliothèque bilingue d'exemples de risques et opportunités (climat, eau, biodiversité, conformité, circularité, partenariats et technologie). La sélection préremplit le formulaire ; l'utilisateur adapte puis enregistre. | `config/environmental_risk_examples.php`, `RiskExamplePicker.tsx` ; tests absence de création automatique et sélection explicite. |
| M7-07 | Sélection des destinataires actifs, instantané de l'objectif diffusé, notification, boîte de réception et accusé de lecture personnel horodaté. Les diffusions précédentes et leurs preuves sont conservées. | `ObjectiveCommunicationController.php`, `ObjectiveCommunications.tsx` ; tests instantané, accusé idempotent, destinataires et refus d'un accusé par un tiers. |
| T-11 | Interface française et socle prêt pour l'anglais : contexte par rendu, catalogue de libellés, sélecteur persistant, navigation et nouveaux écrans bilingues, formats de date selon la langue. Les contenus saisis ne sont pas traduits automatiquement ; la langue du contenu peut être précisée à la diffusion d'un objectif. | `src/lib/i18n.tsx`, `src/integrations/backend/isoFoundation.ts`, `iso-foundation.test.tsx`. Les écrans historiques restent en français lorsqu'un libellé n'a pas encore de traduction anglaise. |

**Installation :** migration additive `2026_10_16_144002_add_iso14001_foundation_features.php`. Les tests utilisent une base PostgreSQL dédiée. L'application doit appliquer les migrations avec `php artisan migrate` et exécuter le planificateur Laravel pour les rappels périodiques.

**Validation ciblée :** `backend/tests/Feature/Iso14001FoundationTest.php` et `src/test/iso-foundation.test.tsx`. La recette globale des 120 exigences reste distincte de ces tests.

## Détail des exigences M1–M17

### M1 · Contexte de l’organisme — Phase 1 · MVP auditable

- **Écran(s) :** `Contexte, parties intéressées, domaine d’application`
- **Données / API :** `organization_contexts, stakeholders, application_scopes`
- **Preuves attendues :** Registres de contexte et parties intéressées, déclaration de périmètre
- **Test(s) repéré(s) :** `SetupGuideAndReadinessTest.php; ManagementSystemOverviewTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M1-01` | Registre des enjeux internes et externes : intitulé, catégorie (réglementaire, économique, social, technologique, concurrentiel, culturel…), nature (interne, externe), effet attendu (positif, négatif), date de dernière revue. | Base présente | P2 |
| `M1-02` | Rubrique « conditions environnementales » : pollution, disponibilité des ressources naturelles, climat, biodiversité, santé de l'écosystème, avec échelle (locale, régionale, mondiale) et évolution (progressive, brusque). | Base présente | P2 |
| `M1-03` | Registre des parties intéressées : nom, type (client, collectivité, fournisseur, régulateur, ONG, investisseur, employé), besoins et attentes, décision « devient obligation de conformité : oui / non ». Un « oui » crée automatiquement une entrée dans M5. | Base présente | P2 |
| `M1-04` | Définition du domaine d'application : sites, unités, activités, produits et services, limites physiques, motif d'exclusion éventuel. L'application avertit si un site ou une activité ayant un aspect significatif est exclu (A.4.3). | Partiel | P1 |
| `M1-05` | Page de publication du périmètre, accessible par lien à durée contrôlée. | Implémenté et testé | P0 |
| `M1-06` | Rappel de revue périodique (par défaut annuel et à chaque changement majeur). | Implémenté et testé | P0 |

### M2 · Cartographie des processus — Phase 1 · MVP auditable

- **Écran(s) :** `Système de management / processus`
- **Données / API :** `processes, process_indicators, process_risks_opportunities`
- **Preuves attendues :** Fiches processus et leurs relations
- **Test(s) repéré(s) :** `ManagementSystemOverviewTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M2-01` | Fiches processus : finalité, pilote, entrées, sorties, activités, indicateurs, lien avec les aspects, risques et documents. | Base présente | P2 |
| `M2-02` | Vue graphique de la cartographie (processus de management, de réalisation, de support), cliquable. | Base présente | P2 |
| `M2-03` | Lien de chaque processus avec les articles de la norme qu'il couvre (matrice de couverture). | Partiel | P1 |

### M3 · Leadership et politique — Phase 1 · MVP auditable

- **Écran(s) :** `Politique, organigramme, responsabilités`
- **Données / API :** `qhse_policies, responsibilities, job_descriptions`
- **Preuves attendues :** Politique validée, responsabilités attribuées, versions et signatures disponibles
- **Test(s) repéré(s) :** `Iso14001FoundationTest.php (M3-04) ; autres validations spécifiques à compléter`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M3-01` | Éditeur de politique environnementale guidé : les trois engagements obligatoires (protection de l'environnement incluant la prévention de la pollution, conformité aux obligations, amélioration continue) sont préremplis ; engagements spécifiques au choix (ressources, climat, biodiversité, etc.). | Base présente | P2 |
| `M3-02` | Circuit de validation (rédaction, revue, signature électronique de la direction), versionnage, diffusion interne avec accusé de lecture et publication externe. | Partiel | P1 |
| `M3-03` | Organigramme et matrice des responsabilités du SME, avec les deux attributions obligatoires de 5.3 : conformité du SME à la norme, rapport de performance à la direction. | Base présente | P2 |
| `M3-04` | Suivi des engagements de leadership (5.1 a à i) : liste de contrôle annuelle que la direction renseigne avec justification. | Implémenté et testé | P0 |

### M4 · Aspects et impacts environnementaux — Phase 1 · MVP auditable

- **Écran(s) :** `Aspects environnementaux`
- **Données / API :** `environmental_aspects, aes_registry_versions, AES settings`
- **Preuves attendues :** Registre AES, critères de cotation, versions figées, exports/imports
- **Test(s) repéré(s) :** `EnvironmentalAspectsTest.php; Iso14001FoundationTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M4-01` | Fiche aspect : activité, produit ou service ; phase du cycle de vie (acquisition des matières, conception, production, transport ou livraison, utilisation, fin de vie, élimination finale) ; situation (normale, anormale, démarrage ou arrêt, urgence) ; maîtrisé ou influencé ; site et processus. | Base présente | P2 |
| `M4-02` | Typologie d'aspect proposée par liste : émissions dans l'air, rejets dans l'eau, rejets dans le sol, utilisation de matières et ressources, énergie, énergie émise (chaleur, bruit, vibrations, lumière), déchets et sous-produits, occupation du sol, occupation des zones marines et côtières. | Base présente | P2 |
| `M4-03` | Impact associé : négatif ou bénéfique, échelle (locale, régionale, mondiale), nature (directe, indirecte, cumulative). | Base présente | P2 |
| `M4-04` | Critères de significativité configurables : critères environnementaux (type, ampleur, fréquence de l'aspect ; échelle, gravité, durée, exposition de l'impact) et critères additionnels (exigences légales, préoccupations des parties intéressées). Note calculée, seuil réglable, méthode et critères documentés automatiquement. | Base présente | P2 |
| `M4-05` | Règle de cohérence : un critère additionnel peut faire monter un aspect au-dessus du seuil mais jamais le déclasser s'il est significatif par son impact environnemental (A.6.1.2). L'application bloque ce cas. | Partiel | P1 |
| `M4-06` | Regroupement possible d'activités ou de produits ayant des caractéristiques communes (A.6.1.2), pour éviter une saisie élémentaire. | Implémenté et testé | P0 |
| `M4-07` | Situations d'urgence potentielles : une case « urgence » crée la fiche correspondante dans M13 (nature du danger, ampleur probable, installation voisine). | Partiel | P1 |
| `M4-08` | Réévaluation déclenchée par un événement : nouveau changement validé (M8), incident ou urgence réelle, nouvelle obligation (M5), plainte (M10). | Partiel | P1 |
| `M4-09` | Communication des aspects significatifs : génération d'une fiche synthétique par fonction ou site, diffusée avec accusé de lecture. | Partiel | P1 |
| `M4-10` | Vues : tableau filtrable, matrice gravité × fréquence (carte de chaleur), carte du site, comparaison entre deux versions. | Partiel | P1 |
| `M4-11` | Import Excel du registre existant avec contrôle des erreurs avant intégration. | Base présente | P2 |

### M5 · Obligations de conformité — Phase 1 · MVP auditable

- **Écran(s) :** `Obligations de conformité`
- **Données / API :** `compliance_obligation_texts, compliance_obligation_aspects, compliance_evaluations`
- **Preuves attendues :** Registre légal, décisions d’applicabilité, évaluations et preuves
- **Test(s) repéré(s) :** `ComplianceRegisterTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M5-01` | Fiche obligation : source (loi, décret, arrêté, permis, licence, décision de justice, contrat, accord avec une collectivité ou une ONG, code volontaire, norme sectorielle), référence, date d'entrée en vigueur, texte ou lien, exigences applicables. | Base présente | P2 |
| `M5-02` | Détermination de l'applicabilité : applicable ou non, avec justification obligatoire, lien avec les aspects concernés (M4), responsable et sites. | Base présente | P2 |
| `M5-03` | Évaluation périodique : fréquence propre à chaque obligation, résultat (conforme, partiellement conforme, non conforme, non évalué), preuve jointe, évaluateur, date. Les résultats d'évaluations menées par une partie externe peuvent être importés comme preuve (A.9.1.2). | Base présente | P2 |
| `M5-04` | Un résultat non conforme ouvre automatiquement une fiche de non-conformité (M17) ou, si l'écart est déjà corrigé par le système, une fiche « écart traité ». | Partiel | P1 |
| `M5-05` | Accords avec un organisme de réglementation : un plan d'actions convenu devient lui-même une obligation de conformité suivie (A.9.1.2). | Base présente | P2 |
| `M5-06` | Échéances d'autorisations, permis et licences avec alertes à J-90, J-30 et J-7. | Partiel | P1 |
| `M5-07` | Tableau de bord de conformité par site, par domaine et par échéance, avec taux de conformité et liste des obligations jamais évaluées. | Base présente | P2 |
| `M5-08` | Veille réglementaire : ajout manuel ou import des nouveaux textes, avec tâche d'analyse d'impact au responsable de la conformité. | Partiel | P1 |

### M6 · Risques et opportunités — Phase 1 · MVP auditable

- **Écran(s) :** `Risques et opportunités`
- **Données / API :** `process_risks_opportunities, risks`
- **Preuves attendues :** Cotation, décisions et plan de traitement
- **Test(s) repéré(s) :** `tests de risques à rattacher précisément à M6`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M6-01` | Fiche risque ou opportunité : source (enjeu M1, partie intéressée M1, aspect significatif M4, obligation M5, autre), description, nature (risque : effet négatif ; opportunité : effet bénéfique), y compris les effets des conditions environnementales externes sur l'organisme. | Base présente | P2 |
| `M6-02` | Cotation à méthode choisie par l'organisme : qualitative simple (faible, moyen, élevé) ou quantitative (probabilité × effet), avec grille paramétrable. | Base présente | P2 |
| `M6-03` | Décision « à traiter / non retenu » avec justification, car l'organisme conserve l'autorité de choisir (A.6.1.4). | Base présente | P2 |
| `M6-04` | Liens vers les actions de M7 et vers les objectifs concernés. | Base présente | P2 |
| `M6-05` | Bibliothèque d'exemples proposés pour accélérer la saisie (économie circulaire, impacts du changement climatique, pénurie d'eau, non-respect de conformité, partenariats, nouvelles technologies, etc.), à adapter, jamais appliqués automatiquement. | Implémenté et testé | P0 |
| `M6-06` | Matrice des risques et opportunités, revue périodique et à chaque changement (M8). | Base présente | P2 |

### M7 · Objectifs et plans d’actions — Phase 1 · MVP auditable

- **Écran(s) :** `Objectifs, plans d’actions, mes tâches`
- **Données / API :** `objectives, actions, action plans`
- **Preuves attendues :** Objectifs, cibles, échéances, suivis et preuves de clôture
- **Test(s) repéré(s) :** `tests objectifs/actions à rattacher précisément à M7`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M7-01` | Fiche objectif : libellé, niveau (stratégique, tactique, opérationnel), engagement de la politique auquel il se rattache, aspects significatifs, obligations et risques pris en compte, indicateur, valeur de référence, cible, échéance. | Base présente | P2 |
| `M7-02` | Indicateur « mesurable » : oui par défaut ; si non, justification obligatoire car la norme accepte cette exception (6.2.1 b, A.6.2). | Base présente | P2 |
| `M7-03` | Alerte si un aspect significatif n'est couvert par aucun objectif ni action : la norme n'impose pas un objectif par aspect mais impose de les traiter en priorité. | Partiel | P1 |
| `M7-04` | Plan d'actions : les cinq questions de 6.2.2 (ce qui sera fait, ressources, responsable, échéance, évaluation des résultats) sont des champs obligatoires ; en plus, « intégration dans un processus métier » (achats, conception, RH, vente). | Base présente | P2 |
| `M7-05` | Suivi : avancement en %, jalons, pièces jointes, commentaires, relance automatique, évaluation de l'efficacité à la clôture. | Base présente | P2 |
| `M7-06` | Vues liste, tableau Kanban, diagramme de Gantt et « mes actions ». | Base présente | P2 |
| `M7-07` | Communication des objectifs aux personnes concernées avec accusé de lecture. | Implémenté et testé | P0 |

### M8 · Gestion des changements — Phase 2 · terrain/performance

- **Écran(s) :** `Gestion des changements`
- **Données / API :** `management_changes, management_change_tasks`
- **Preuves attendues :** Analyse d’impact, décisions, tâches et revue après mise en œuvre
- **Test(s) repéré(s) :** `ManagementChangeTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M8-01` | Fiche changement : type (nouveau produit, service, process, équipement ou site ; évolution d'obligation ; évolution de connaissances ou de technologie ; modification de spécification matière ; opération de fusion ou cession ; changement de personnel ou de fournisseur ; interruption d'activité), origine interne ou externe, temporaire ou permanent. | Base présente | P2 |
| `M8-02` | Analyse d'impact obligatoire avant approbation : aspects, obligations, risques et opportunités, compétences, documents, urgences, fournisseurs concernés. | Base présente | P2 |
| `M8-03` | Workflow : demande, analyse, approbation, mise en œuvre, revue après mise en œuvre. Un changement non planifié peut être déclaré après coup avec analyse des conséquences et mesures d'atténuation (8.1). | Base présente | P2 |
| `M8-04` | Génération automatique de tâches de mise à jour dans les modules touchés (M4, M5, M6, M9, M11, M13), qui clôturent la fiche quand elles sont terminées. | Partiel | P2 |
| `M8-05` | Les changements de la période alimentent automatiquement la revue de direction (M16) et le programme d'audit (M15). | Partiel | P2 |

### M9 · Ressources, compétences et sensibilisation — Phase 2 · terrain/performance

- **Écran(s) :** `Compétences, sensibilisation, campagnes`
- **Données / API :** `competences_acquises, awareness_campaigns, awareness_participants, awareness_talks`
- **Preuves attendues :** Preuves de compétences, attestations et accusés de lecture
- **Test(s) repéré(s) :** `AwarenessCampaignTest.php; TrainingPlanAndInternalEvaluationTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M9-01` | Ressources : chaque action (M7) et chaque changement (M8) précise les ressources humaines, financières, techniques et d'infrastructure demandées ; la direction les accorde ou les refuse dans l'outil (preuve de 7.1). | Partiel | P2 |
| `M9-02` | Matrice de compétences : postes et rôles, compétences requises, titulaire, niveau, preuve (diplôme, formation, expérience). Les profils concernés par A.7.2 sont repérés par défaut (travail à impact significatif, rôles du SME : évaluation des impacts, audits internes, évaluation de conformité, réponse aux urgences). | Base présente | P2 |
| `M9-03` | Écarts de compétences convertis en besoins de formation, plan de formation annuel, saisie des formations réalisées avec attestation et évaluation de l'efficacité. | Base présente | P2 |
| `M9-04` | Campagnes de sensibilisation couvrant les quatre points de 7.3 : politique, aspects significatifs liés au travail de la personne, contribution à l'efficacité du SME, conséquences d'une non-satisfaction des exigences. | Base présente | P2 |
| `M9-05` | Supports courts (fiches, vidéos, quiz) avec accusé de lecture, « causerie de 10 minutes » avec liste d'émargement par QR code, taux de sensibilisation par site. | Base présente | P2 |
| `M9-06` | Personnes travaillant sous le contrôle de l'organisme mais externes (sous-traitants) : invitation avec accès limité aux contenus de sensibilisation et attestation. | Partiel | P2 |

### M10 · Communication — Phase 2 · terrain/performance

- **Écran(s) :** `Communication`
- **Données / API :** `communication_plans, communications, communication_proofs`
- **Preuves attendues :** Plan, historique de diffusion, pièces jointes et décisions
- **Test(s) repéré(s) :** `CommunicationWorkflowTest.php; CommunicationImportFileTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M10-01` | Plan de communication : sur quoi, quand, avec qui, comment ; distinction interne et externe, obligatoire (légal) et volontaire. | Base présente | P2 |
| `M10-02` | Communications internes : annonce des changements du SME, boîte à idées permettant à chacun de contribuer à l'amélioration continue (7.4.2 b). | Base présente | P2 |
| `M10-03` | Communications externes : modèles, circuit de validation, contrôle de cohérence avec les données de M14, journal de ce qui a été diffusé, à qui, quand. | Partiel | P2 |
| `M10-04` | Registre des communications reçues (demandes, avis, plaintes) : canal, auteur, date, qualification, responsable, délai de réponse, réponse apportée. Une plainte alimente automatiquement la revue de direction et peut ouvrir une non-conformité. | Partiel | P2 |
| `M10-05` | Rappel de réponse rapide et claire aux plaintes (A.7.4) avec suivi des délais. | À confirmer | P2 |

### M11 · Gestion documentaire — Phase 1 · MVP auditable

- **Écran(s) :** `Information documentée`
- **Données / API :** `documents, document_versions, document_approvals, document_signatures`
- **Preuves attendues :** Documents maîtrisés, versions, approbations et historiques
- **Test(s) repéré(s) :** `tests documentaires existants à relier ID par ID`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M11-01` | Types de contenu : document (information « à tenir disponible »), enregistrement (information « conservée comme preuve ») et document d'origine externe (autorisation, notice fabricant, norme). Le type est obligatoire. | Base présente | P2 |
| `M11-02` | Métadonnées imposées par 7.5.2 : titre, date, auteur, numéro de référence, langue, format, support ; circuit de revue et d'approbation paramétrable. | Base présente | P2 |
| `M11-03` | Maîtrise (7.5.3) : droits de consultation ou de modification, historique des versions, stockage, conservation et élimination par type avec durées configurables et alignées sur les obligations de conformité. | Base présente | P2 |
| `M11-04` | Diffusion ciblée avec accusé de lecture, filigrane « copie non maîtrisée » à l'impression, rappel de revue périodique. | Base présente | P2 |
| `M11-05` | Recherche plein texte, filtres par article de la norme, processus, site, statut. | Base présente | P2 |
| `M11-06` | Modèles prêts à l'emploi (politique, procédure, fiche de poste, compte rendu, rapport d'audit) à adapter. Aucun manuel imposé : la norme n'en exige pas (A.7.5). | Base présente | P2 |
| `M11-07` | Génération du « dossier de conformité à la norme » : liste de toutes les informations documentées exigées par article avec leur dernière version et leur état (présent, périmé, manquant). | Partiel | P1 |

### M12 · Maîtrise opérationnelle — Phase 2 · terrain/performance

- **Écran(s) :** `Procédures, maîtrise opérationnelle, fournisseurs, exigences produit/service`
- **Données / API :** `operational_controls, provider_partners, product_service_requirements, design_developments`
- **Preuves attendues :** Consignes, contrôles, exigences fournisseurs et enregistrements
- **Test(s) repéré(s) :** `ProviderPartnerImportFileTest.php; tests de maîtrise opérationnelle à rattacher`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M12-01` | Procédures et consignes liées aux aspects significatifs, avec critères opérationnels définis et moyens de maîtrise (technique, procédure) classés selon la hiérarchie : élimination, substitution, gestion administrative. | Base présente | P2 |
| `M12-02` | Contrôles opérationnels et inspections de terrain par liste de contrôle mobile : photos, géolocalisation, observations, mode hors connexion, création d'une non-conformité depuis un point non conforme. | Partiel | P2 |
| `M12-03` | Registre des fournisseurs et sous-traitants ayant une influence sur les résultats du SME : exigences environnementales communiquées, évaluation, historique de performance, formation ou briefing préalable. | Base présente | P2 |
| `M12-04` | Exigences environnementales intégrées aux achats : modèle de clauses, exigences par catégorie d'achat, case « communiquées au fournisseur » avec preuve. | Base présente | P2 |
| `M12-05` | Cycle de vie : questionnaire de conception d'un produit ou service (matières, usage, fin de vie), et information à fournir sur transport, utilisation, traitement en fin de vie. | Partiel | P2 |
| `M12-06` | Revue des conséquences d'un changement imprévu et actions d'atténuation, reliées à M8. | Base présente | P2 |

### M13 · Situations d’urgence — Phase 2 · terrain/performance

- **Écran(s) :** `Situations d’urgence`
- **Données / API :** `emergency_procedures, emergency_contacts, emergency_resources, emergency_exercises, emergency_events`
- **Preuves attendues :** Plans, contacts, contrôles, exercices et chronologie d’événement
- **Test(s) repéré(s) :** `EmergencyPreparednessTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M13-01` | Scénarios (incendie, déversement de produits chimiques, inondation, intempéries, accident de transport, etc.) issus de M4-07, avec nature du danger, ampleur probable et risque d'effets d'une installation voisine. | Base présente | P2 |
| `M13-02` | Plan de réponse par scénario : actions de prévention et d'atténuation, responsables, communication interne et externe, itinéraires d'évacuation, points de rassemblement sur plan du site. | Base présente | P2 |
| `M13-03` | Annuaire d'urgence : membres clés du personnel, pompiers, secours, services de dépollution, voisins pour l'assistance mutuelle, joignables en un clic depuis le téléphone, y compris hors connexion. | Partiel | P2 |
| `M13-04` | Inventaire des moyens d'intervention (extincteurs, kits anti-déversement, équipements) avec dates de vérification et alertes. | Base présente | P2 |
| `M13-05` | Planification et compte rendu des exercices (essais) avec constats et actions ; formation et information des parties intéressées concernées. | Base présente | P2 |
| `M13-06` | Déclaration d'une situation d'urgence réelle en quelques gestes, avec conduite à tenir affichée et chronologie ; retour d'expérience obligatoire qui révise le plan et la liste des aspects (M4-08). | Base présente | P2 |

### M14 · Performance environnementale et surveillance — Phase 2 · terrain/performance

- **Écran(s) :** `Performance environnementale`
- **Données / API :** `environmental_indicators, indicator_readings, monitoring_instruments`
- **Preuves attendues :** Indicateurs, relevés, justificatifs, étalonnages et analyses
- **Test(s) repéré(s) :** `EnvironmentalPerformanceTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M14-01` | Définition d'un indicateur : nom, unité, formule, périmètre, méthode de mesure, fréquence, responsable, source de la donnée, seuil et cible, lien avec un aspect (M4), un objectif (M7) ou une obligation (M5). | Base présente | P2 |
| `M14-02` | Bibliothèque d'indicateurs proposés à activer : consommation d'eau, d'électricité et de carburant, déchets par type et filière de traitement, taux de valorisation, émissions estimées, déversements, taux de conformité, taux de réalisation des objectifs et des actions, nombre de non-conformités, délai moyen de clôture. | Base présente | P2 |
| `M14-03` | Saisie des relevés : formulaire mobile de moins de 60 secondes, hors connexion, rappels aux dates prévues, import CSV ou Excel, contrôle de plausibilité (valeur aberrante, doublon, unité). | Partiel | P2 |
| `M14-04` | Traçabilité de chaque valeur : auteur, date, instrument, preuve jointe (facture, photo, bordereau), pour que les résultats soient fiables, reproductibles et traçables (A.9.1.1). | Base présente | P2 |
| `M14-05` | Registre des instruments de surveillance et de mesure avec étalonnage ou vérification, échéances et alertes ; une mesure faite avec un instrument hors validité est signalée. | Base présente | P2 |
| `M14-06` | Analyse : tendances, comparaison entre périodes, normalisation par activité (par unité produite, par employé, par surface), seuils d'alerte avec création d'action en un clic. | Base présente | P2 |
| `M14-07` | Indicateurs d'efficacité du SME : taux d'objectifs atteints, d'actions à l'heure, d'obligations évaluées, de non-conformités récurrentes. | Base présente | P2 |
| `M14-08` | Rapports périodiques pour les responsables autorisés à décider d'actions (A.9.1.1) et alimentation automatique de la revue de direction. | Partiel | P2 |

### M15 · Audits internes — Phase 1 · MVP auditable

- **Écran(s) :** `Audits internes, programmes et auditeurs`
- **Données / API :** `audits, audit_programs, audit_findings, audit_evidence`
- **Preuves attendues :** Programme, constats, preuves et rapport d’audit
- **Test(s) repéré(s) :** `InternalAuditIso14001Test.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M15-01` | Programme d'audit : fréquence, méthodes, responsabilités, exigences de planification et de rapport ; il tient compte de l'importance environnementale des processus, des changements et des résultats d'audits précédents, avec ces éléments proposés par l'application. | Base présente | P2 |
| `M15-02` | Plan d'audit : objectifs, critères, champ, date, équipe d'audit. | Base présente | P2 |
| `M15-03` | Choix des auditeurs depuis la matrice de compétences (M9) ; blocage et avertissement en cas de conflit d'intérêt ou de non-indépendance vis-à-vis de l'activité auditée. | Base présente | P2 |
| `M15-04` | Listes de contrôle générées par article de la norme, par processus ou par site ; modifiables et réutilisables. | Base présente | P2 |
| `M15-05` | Conduite de l'audit sur tablette ou téléphone, hors connexion : constats classés (conforme, point fort, observation, non-conformité), preuves (photo, document, notes d'entretien). | Partiel | P1 |
| `M15-06` | Rapport d'audit généré automatiquement (PDF et Word), diffusé aux responsables concernés ; chaque non-conformité ouvre une fiche dans M17. | Base présente | P2 |
| `M15-07` | Import des résultats d'audits externes et de certification pour alimenter l'historique et le programme suivant. | Partiel | P1 |

### M16 · Revue de direction — Phase 1 · MVP auditable

- **Écran(s) :** `Revue de direction`
- **Données / API :** `management_reviews, management_review_sessions, management_review_records, management_review_decisions`
- **Preuves attendues :** Dossier d’entrée, sessions, décisions, compte rendu signé
- **Test(s) repéré(s) :** `ManagementReviewIso14001Test.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M16-01` | Planification des revues à intervalles définis ; une revue peut s'étaler sur plusieurs réunions (A.9.3). | Base présente | P2 |
| `M16-02` | Dossier d'entrée généré automatiquement avec les éléments de 9.3.2 : état des actions précédentes, changements (enjeux, parties intéressées, aspects significatifs, risques et opportunités), niveau de réalisation des objectifs, tendances (non-conformités, surveillance, conformité, audits), adéquation des ressources, communications des parties intéressées dont les plaintes, opportunités d'amélioration. | Partiel | P1 |
| `M16-03` | Compte rendu structuré avec les six sorties de 9.3.3 : conclusions sur la pertinence, l'adéquation et l'efficacité ; décisions d'amélioration ; changements du SME et ressources ; actions si objectifs non atteints ; intégration avec les autres processus ; implications stratégiques. | Base présente | P2 |
| `M16-04` | Chaque décision devient une action suivie (M7) ou une fiche d'amélioration (M17) avec responsable et échéance. | Base présente | P2 |
| `M16-05` | Signature de la direction et archivage comme enregistrement. | Base présente | P2 |

### M17 · Non-conformités et amélioration continue — Phase 1 · MVP auditable

- **Écran(s) :** `Non-conformités, actions correctives, amélioration`
- **Données / API :** `non_conformities, improvement_suggestions`
- **Preuves attendues :** Déclaration, analyse, correction, efficacité, décision et historique
- **Test(s) repéré(s) :** `NonConformityIso14001Test.php; NonConformityE6WorkflowTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `M17-01` | Déclaration rapide par tout utilisateur : source (audit, inspection, évaluation de conformité, plainte, incident, signalement), description, photos, lieu, date ; moins de 60 secondes, y compris hors connexion. | Partiel | P1 |
| `M17-02` | Traitement immédiat : maîtrise et correction, traitement des conséquences et atténuation des impacts environnementaux négatifs. | Base présente | P2 |
| `M17-03` | Décision de mener ou non une action corrective, proportionnée à l'importance des effets, avec analyse de cause guidée (5 pourquoi, diagramme causes-effets) et suggestion de non-conformités similaires déjà enregistrées pour juger de leur récurrence. | Partiel | P1 |
| `M17-04` | Action corrective : responsable, échéance, ressources, vérification obligatoire de l'efficacité avant clôture ; mise à jour du SME si nécessaire (M4, M6, M11). | Base présente | P2 |
| `M17-05` | Escalade automatique des retards (responsable, pilote, direction). | Partiel | P1 |
| `M17-06` | Registre des opportunités d'amélioration (10.1) alimenté par audits, revue, indicateurs, idées du personnel, avec décision et suivi. | Base présente | P2 |
| `M17-07` | Tableau de bord : nombre ouvert / clos, délais moyens, récurrences, répartition par source, par site et par gravité. | Base présente | P2 |

## Fonctions transverses

### T-01 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Assistant de démarrage`
- **Données / API :** `setup-guide, setup-guide steps`
- **Test(s) repéré(s) :** `SetupGuideAndReadinessTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-01` | Assistant de démarrage. Parcours guidé en huit étapes (organisme et sites, périmètre, enjeux, parties intéressées, politique, aspects, obligations, premier plan d'actions) avec exemples préremplis par secteur d'activité ; chaque étape peut être reprise plus tard. | Base présente | P2 |

### T-02 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Mes tâches`
- **Données / API :** `my-tasks, actions, notifications and approvals`
- **Test(s) repéré(s) :** `tests tâche à rattacher précisément à T-02`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-02` | « Mes tâches ». Une seule liste regroupant tout ce qui attend la personne (actions, revues, relevés, validations, accusés de lecture), triée par échéance, avec action en un clic. | Base présente | P2 |

### T-03 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Préparation certification`
- **Données / API :** `certification-readiness; CertificationReadinessService`
- **Test(s) repéré(s) :** `SetupGuideAndReadinessTest.php; guide.test.tsx`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-03` | Score de préparation à l'audit de certification. Par article de la norme, un état (conforme, à compléter, manquant) calculé à partir des informations documentées présentes, à jour et validées ; liste des manques avec lien direct pour les corriger. | Partiel | P1 |

### T-04 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Tableaux de bord`
- **Données / API :** `dashboard endpoints and profile-scoped aggregates`
- **Test(s) repéré(s) :** `tests de tableaux de bord à rattacher précisément à T-04`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-04` | Tableaux de bord par profil. La direction voit six indicateurs de tête (taux de conformité, objectifs atteints, actions en retard, non-conformités ouvertes, aspects significatifs, échéances à 30 jours) ; le pilote voit son périmètre ; le contributeur voit ses tâches. | Base présente | P2 |

### T-05 — Phase 2 · terrain/performance

- **Écran(s) / service :** `Notifications et rappels`
- **Données / API :** `Laravel notifications, scheduled commands, queues`
- **Test(s) repéré(s) :** `tests de rappels à rattacher par canal et délai`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-05` | Notifications. Dans l'application, par e-mail et par notification mobile ; canal SMS ou messagerie instantanée en option. Rappels avant échéance, relance des retards, résumé hebdomadaire, réglables par utilisateur. | Partiel | P2 |

### T-06 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Workflows génériques`
- **Données / API :** `workflow tables, approvals, comments and history`
- **Test(s) repéré(s) :** `tests workflows/documents à relier selon le module`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-06` | Workflow générique. Statuts communs (brouillon, en revue, validé, archivé), validation par un ou plusieurs approbateurs, commentaires et mentions, historique horodaté. | Base présente | P2 |

### T-07 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Journal d’audit`
- **Données / API :** `security_audit_logs`
- **Test(s) repéré(s) :** `SecurityAuditLogControllerTest.php`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-07` | Journal d'audit du système. Qui a fait quoi et quand, non modifiable, consultable par l'administrateur et l'auditeur externe. | Base présente | P2 |

### T-08 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Recherche globale`
- **Données / API :** `SearchController and indexed records`
- **Test(s) repéré(s) :** `tests recherche à rattacher précisément à T-08`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-08` | Recherche globale. Une barre unique (raccourci clavier ou icône) cherche dans tous les modules et renvoie des résultats groupés par type. | Partiel | P1 |

### T-09 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Rapports et exports`
- **Données / API :** `PDF/DOCX/XLSX generators per module`
- **Test(s) repéré(s) :** `tests export par module`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-09` | Rapports et exports. PDF, Word et Excel pour chaque registre et pour les dossiers (dossier d'audit, dossier de revue de direction, registre légal) ; modèles avec logo et identité de l'organisme. | Partiel | P1 |

### T-10 — Phase 1 · MVP auditable

- **Écran(s) / service :** `Multi-sites et multi-organismes`
- **Données / API :** `enterprise_id/site_id scopes, tenant middleware`
- **Test(s) repéré(s) :** `SetupGuideAndReadinessTest.php; tests isolation par module`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-10` | Multi-sites et multi-organismes. Données cloisonnées par organisme ; au sein d'un organisme, filtre par site et consolidation au niveau du groupe. | Base présente | P2 |

### T-11 — Phase 3 · extensions

- **Écran(s) / service :** `Multilingue`
- **Données / API :** `frontend labels and translation strategy`
- **Test(s) repéré(s) :** `tests de langue à créer`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-11` | Multilingue. Interface en français, prête pour l'anglais ; contenus saisis dans la langue de l'utilisateur. | Implémenté et testé | P3 |

### T-12 — Phase 2 · terrain/performance

- **Écran(s) / service :** `Import et export de données`
- **Données / API :** `XLSX/CSV importers and exporters`
- **Test(s) repéré(s) :** `tests import/export par module`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-12` | Import et export de données. Modèles Excel téléchargeables pour chaque registre, contrôle des erreurs avant import, export intégral à tout moment (réversibilité). | Partiel | P2 |

### T-13 — Phase 2 · terrain/performance

- **Écran(s) / service :** `Calendrier unique`
- **Données / API :** `calendar and deadline aggregation`
- **Test(s) repéré(s) :** `tests calendrier unifié à créer`

| ID | Exigence du cahier (résumé) | État | Priorité |
|---|---|---|---|
| `T-13` | Calendrier unique. Échéances de conformité, audits, revues, exercices, étalonnages et formations sur un même calendrier, abonnable depuis un agenda externe. | Partiel | P2 |

## Limites de cette revue

- Cette matrice décrit le code observé, pas une certification de conformité à la norme.
- Les tests backend de préparation/audit n’ont pas pu être exécutés pendant la revue précédente : PostgreSQL local refusait le rôle `logiquali_user`. Le build et les tests frontend étaient, eux, passés.
- Les exigences non fonctionnelles du chapitre 9 (performance, disponibilité, sauvegarde/restauration, WCAG 2.2 AA, 70 % de couverture, réversibilité et reprise) restent à suivre dans une matrice de recette distincte.
- Les lignes **Base présente** et **Partiel** doivent être confirmées par des assertions de recette ciblant leur ID avant de passer en « couvert ».
