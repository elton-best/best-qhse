# Réalisation (ISO 9001 Ch. 8) — Convention templates / export / import

> Dossier des modèles : `backend/public/templates/realisation/`
> Aucun PHP modifié par ce lot (création seule : 7 fichiers + ce document). Ne pas committer (consigne de mission).

## 1. Existant vérifié

- `backend/public/templates/` contient avant ce lot : `norme_iso_template.csv`, `norme_iso_template.xlsx`, `README_TEMPLATE.md`. Pas de sous-dossier `realisation/` (créé par ce lot).
- `grep "function template" backend/app` ne retourne que :
  - `backend/app/Modules/Support/Controllers/TrainingPlanController.php:264` (`template()`),
  - `backend/app/Modules/Support/Controllers/MaintenanceController.php:571` (`template()`),
  - `backend/app/Modules/Support/Controllers/CommunicationController.php:666` (`template()`),
  - faux positif `NomenclatureTemplateService.php:325` (`templatePartsToCodeStructureParts`).
- Il n'existe **aucun module `Realisation`** dans `backend/app/Modules/` (seuls : Auth, ClientB, Enterprise, Evaluation, Hse, Improvement, Leadership, Planning, Processes, SuperAdmin, Support). Les 6 contrôleurs ci-dessous sont donc une **cible à créer** (`App\Modules\Realisation\Controllers\...`), pas du code existant.

## 2. Convention fichier (appliquée aux 6 XLSX)

Chaque `*.xlsx` du lot respecte strictement :

| Ligne | Contenu |
|---|---|
| 1 | Titre du registre (fusionné sur toute la largeur, gras bleu `1F4E78`) |
| 2 | Cartouche : `Code : <REF>` (A2) + `Version : XX` (C2) + `Date : 15/10/2026` (E2) |
| 3 | Instructions (italique, fusionnée) : « Une ligne = un enregistrement. Ne pas modifier la ligne 4. Données dès ligne 5. » |
| 4 | **En-têtes** (fond `1F4E78`, texte blanc gras, filtre auto, hauteur 36) |
| 5-6 | **2 lignes d'exemple** remplies (données dès ligne 5) |

Détails techniques : `freezePane = A5`, `auto_filter` sur ligne 4, `wrap_text`, bordures fines, largeurs auto (14-34). L'import doit donc **ignorer les lignes 1-4 et lire dès la ligne 5** (même principe que `ComplianceObligationController::importXlsx()` qui saute `if ($index < 6)` car son template met les en-têtes en ligne 5 — ici en-têtes en ligne 4 donc seuil `< 5`).

## 3. Convention API cible (6 contrôleurs XLSX)

Pattern uniforme à implémenter pour chaque ressource, sur le modèle éprouvé `ComplianceObligationController` (`downloadTemplate` / `exportXlsx` / `importXlsx`) :

```
GET  /<ressource>/template    -> <Controller>::template()      (retourne le fichier statique de §4, Content-Type xlsx)
GET  /<ressource>/export-xlsx -> <Controller>::exportXlsx()   (génère depuis la BDD, même colonnes que ligne 4, DocumentSyncService + download)
POST /<ressource>/import-xlsx -> <Controller>::importXlsx()    (multipart file + site_id, lecture dès ligne 5, upsert, JSON {imported_rows, created_*, updated_*})
```

Validations import : `file: required|file|mimes:xlsx,xls|max:10240`, `site_id: required|exists:sites,id` (cf. `ComplianceObligationController::importXlsx()` ligne 400-405). Dates au format `AAAA-MM-JJ`, listes fermées insensibles à la casse/accents (mapper comme `mapComplianceStatus()` etc.).

| # | Ressource (préfixe suggéré) | Contrôleur cible (à créer) | Fichier modèle | Code |
|---|---|---|---|---|
| 1 | `procedures` | `ProcedureController` | `realisation/procedures-modele.xlsx` | ENR/OPE/010 |
| 2 | `exigences` | `ExigenceController` | `realisation/exigences-modele.xlsx` | ENR/OPE/011 |
| 3 | `prestataire-evaluations` | `PrestataireEvaluationController` | `realisation/prestataires-evaluation.xlsx` | FOR/QAM/003 |
| 4 | `production-suivis` | `ProductionSuiviController` | `realisation/production-suivi.xlsx` | ENR/OPE/012 |
| 5 | `liberations` | `LiberationController` | `realisation/liberation-decision.xlsx` | ENR/OPE/013 |
| 6 | `sorties-nc` | `SortieNcController` | `realisation/sorties-nc-registre.xlsx` | ENR/OPE/014 |

Exemple de bloc route (à ajouter dans un futur `backend/routes/modules/realisation.php`, sur le modèle de `hse.php:120-123`) :

```php
Route::get('procedures/template', [ProcedureController::class, 'template']);
Route::get('procedures/export-xlsx', [ProcedureController::class, 'exportXlsx']);
Route::post('procedures/import-xlsx', [ProcedureController::class, 'importXlsx']);
Route::apiResource('procedures', ProcedureController::class);
// ... répéter pour exigences, prestataire-evaluations, production-suivis, liberations, sorties-nc
```

Cas particulier (hors convention XLSX) : `realisation/conception-fiche.docx` (FOR/OPE/030) est une **fiche DOCX**, pas un registre importable. Contrôleur cible suggéré `ConceptionController` avec `GET /conceptions/export-docx` + `POST /conceptions/generate-draft` (même pattern que `StakeholderController::exportDocx` / `generateDraftDocx`, cf. `evaluation.php:66-76`). Pas de `import-xlsx` pour cette ressource.

## 4. Contenu des 7 modèles

### 4.1 `procedures-modele.xlsx` — ENR/OPE/010 (ISO 8.1)
Source : `reference_documents/Fiche de Planification_Suivi_Evaluation_PROCEDURES-1.xlsx` (lisible : feuilles `Cartouche` → `Code : ENR/OPE/010`, `Plan de mise en oeuvre` → colonnes Activités/Coût/Responsables/Acteurs/Livrables/Poids/Indicateurs). Structure reprise en format importable ligne 4.
En-têtes (12) : `N° | Activité / Sous-activité | Responsable | Acteurs internes impliqués | Acteurs externes impliqués | Échéance (AAAA-MM-JJ) | Coût prévisionnel | Extrants / Livrables | Poids | Indicateur | Statut | Observations`.

### 4.2 `exigences-modele.xlsx` — ENR/OPE/011 (ISO 8.2)
En-têtes (10) : `N° | Produit / Service | Exigence client / Partie intéressée | Source (contrat/commande/texte) | Revue réalisée (Oui/Non) | Écart constaté / Action | Responsable revue | Échéance (AAAA-MM-JJ) | Statut | Commentaires`.

### 4.3 `conception-fiche.docx` — FOR/OPE/030 (ISO 8.3)
Fiche Word 9 sections : 1. Identification (objet, affaire, responsable, équipe, dates) — 2. Entrées 8.3.3 — 3. Planification/activités — 4. Revues 8.3.4 — 5. Vérification 8.3.4 — 6. Validation 8.3.4 — 7. Sorties 8.3.5 — 8. Modifications 8.3.6 — 9. Approbations (concepteur/vérificateur/approbateur 8.6). Tableaux pré-remplis d'exemples. Rappel de chaînage en fin de document : exigences (011) → sorties (030) → libération (013) → NC (014).

### 4.4 `prestataires-evaluation.xlsx` — FOR/QAM/003 (ISO 8.4)
En-têtes (15) : `N° | Référence | Désignation | Type de prestataire | Offres de service | Téléphone 1 | Email | IFU | Années expérience | Note qualité (/5) | Note délais (/5) | Note conformité (/5) | Note globale (/5) | Décision (retenu / sous réserve / exclu) | Observation`.
Colonnes 3-9 + 15 compatibles avec `ProviderPartnerController::extractProviderRowsFromFile()` (mapping désignation/type/offres/tél/email/ifu/expérience/observation). Colonnes 10-14 = extension évaluation (à persister dans le futur contrôleur).

### 4.5 `production-suivi.xlsx` — ENR/OPE/012 (ISO 8.5)
En-têtes (11) : `N° | Étape / Opération | Produit / Lot / Affaire | Paramètres maîtrisés | Méthode / Procédure réf | Responsable exécution | Date exécution (AAAA-MM-JJ) | Contrôle réalisé | Résultat (conforme / NC) | Traçabilité (lot/série) | Observations`.

### 4.6 `liberation-decision.xlsx` — ENR/OPE/013 (ISO 8.6)
En-têtes (11) : `N° | Produit / Service | Lot / Affaire | Critères de libération | Preuve / Mesure | Résultat mesure | Décision (libéré / retenu) | Autorité de libération | Date libération (AAAA-MM-JJ) | Traçabilité (personne autorisant) | Observations`. Ne jamais libérer si `sorties-nc` ouverte liée.

### 4.7 `sorties-nc-registre.xlsx` — ENR/OPE/014 (ISO 8.7)
En-têtes (11) : `N° | Date détection (AAAA-MM-JJ) | Produit / Service NC | Description de la non-conformité | Étape de détection | Traitement (correction / tri / rebut / concession) | Responsable traitement | Délai (AAAA-MM-JJ) | Vérification après traitement | Statut (ouverte / soldée) | Observations`.

## 5. Endpoints existants de référence (ne pas dupliquer, s'aligner)

### 5.1 Conformité — `ComplianceObligationController`
Fichier : `backend/app/Modules/Hse/Controllers/ComplianceObligationController.php` (`exportXlsx:197`, `downloadTemplate:348`, `importXlsx:400`).
Routes (`backend/routes/modules/hse.php:120-123` et alias produit `hse.php:128-133`) :

```
GET  compliance-obligations/template    -> downloadTemplate
GET  compliance-obligations/export-xlsx -> exportXlsx
POST compliance-obligations/import-xlsx -> importXlsx
GET  prod-req-obligations/template      -> downloadTemplate (même contrôleur)
GET  prod-req-obligations/export-xlsx   -> exportXlsx
POST prod-req-obligations/import-xlsx   -> importXlsx
```

C'est la **référence de convention** : template avec instructions ligne 2 + en-têtes ligne 5 + 2 exemples lignes 6-7, export avec cartouche + regroupement, import avec `site_id` requis et mapping insensible casse/accents.

### 5.2 Prestataires — `ProviderPartnerController`
Fichier : `backend/app/Modules/Support/Controllers/ProviderPartnerController.php` (`importRows:170`, `importFile:196`, `exportXlsx:227`).
Routes (`backend/routes/modules/evaluation.php:100-104`) :

```
GET  provider-partners/export-xlsx     -> exportXlsx
POST provider-partners/import          -> importRows (JSON rows)
POST provider-partners/import-file     -> importFile (xlsx/xls/csv/txt, détection d'en-tête ligne ≤ 20, fallback legacy)
```

Le futur `PrestataireEvaluationController` doit réutiliser le mapping `buildHeaderMap()` / `normalizeHeader()` de ce contrôleur pour les colonnes de base et y ajouter les 5 colonnes d'évaluation (§4.4).

### 5.3 Documents — `DocumentController` + `DocumentImportController`
Fichiers : `backend/app/Modules/Support/Controllers/DocumentController.php` (`downloadInventoryTemplate:1258`, `importInventory:1294`, `exportInventory:1338`) ; `DocumentImportController.php` (`downloadTemplate:505`).
Routes (`backend/routes/modules/support.php:41-42`, `support.php:125-134`) :

```
GET  documents/export-inventory        -> exportInventory (filtres site_id + type + process obligatoires)
GET  document-imports/template         -> downloadTemplate (colonnes dynamiques selon nomenclature, JSON {filename})
GET  document-imports                  -> index
POST document-imports/upload           -> upload (throttle 10,1)
POST document-imports/upload-files     -> uploadFiles
POST document-imports/{importId}/validate|execute|rollback
```

`DocumentController::downloadInventoryTemplate()` (en-têtes ligne 1 + 2 exemples ligne 2-3) est le modèle le plus simple ; les futurs contrôleurs Réalisation suivent plutôt le modèle enrichi `ComplianceObligationController` (cartouche + instructions + ligne 4/5).

## 6. Règles d'implémentation pour les futurs contrôleurs

1. `template()` : servir le fichier statique `backend/public/templates/realisation/<fichier>` (ou le régénérer via PhpSpreadsheet à structure identique) avec `response()->download($path, $filename)->deleteFileAfterSend(true)` si copie temp ; `DocumentSyncService::syncGeneratedProcessDocument()` avec `type` ENR/FOR selon nomenclature (cf. `TrainingPlanController::template:334-347`).
2. `exportXlsx()` : mêmes colonnes que ligne 4, triées (id/aspect), `wrap_text` + `autoSize`, `DocumentSyncService` avec `document_kind` dédié (`procedure_export_xlsx`, etc.) et `process_code GEN` en attendant le rattachement processus (cf. `ComplianceObligationController::exportXlsx:330-343`).
3. `importXlsx()` : `site_id` requis, sauter lignes 1-4, clé d'upsert = (aspect/site + référence métier : activité, exigence+produit, désignation+ifu, lot+étape, lot+produit, NC+date), transaction DB, réponse `{success, message, data:{imported_rows, created_*, updated_*}}` (cf. `ComplianceObligationController::importXlsx:522-530`).
4. Placer les routes dans un nouveau `backend/routes/modules/realisation.php` et l'enregistrer comme les autres modules (vérifier `backend/routes/api.php` / `bootstrap` chargeant `routes/modules/*`).
