<?php

use App\Modules\Hse\Controllers\AesRegistryVersionController;
use App\Modules\Hse\Controllers\AesSettingsController;
use App\Modules\Hse\Controllers\ApplicableRequirementController;
use App\Modules\Hse\Controllers\AspectEnvironnementalController;
use App\Modules\Hse\Controllers\AwarenessCampaignController;
use App\Modules\Hse\Controllers\AwarenessOverviewController;
use App\Modules\Hse\Controllers\AwarenessParticipationController;
use App\Modules\Hse\Controllers\AwarenessTalkController;
use App\Modules\Hse\Controllers\ComplianceObligationAspectController;
use App\Modules\Hse\Controllers\ComplianceObligationController;
use App\Modules\Hse\Controllers\ComplianceRegisterController;
use App\Modules\Hse\Controllers\ConsommationEnergieController;
use App\Modules\Hse\Controllers\DuerpController;
use App\Modules\Hse\Controllers\EmergencyContactController;
use App\Modules\Hse\Controllers\EmergencyEventController;
use App\Modules\Hse\Controllers\EmergencyExerciseController;
use App\Modules\Hse\Controllers\EmergencyOverviewController;
use App\Modules\Hse\Controllers\EmergencyProcedureController;
use App\Modules\Hse\Controllers\EmergencyResourceController;
use App\Modules\Hse\Controllers\EnergyBaselineController;
use App\Modules\Hse\Controllers\EnergyComplianceEvaluationController;
use App\Modules\Hse\Controllers\EnergyDataCollectionPlanController;
use App\Modules\Hse\Controllers\EnergyDesignReviewController;
use App\Modules\Hse\Controllers\EnergyEquipmentPurchaseController;
use App\Modules\Hse\Controllers\EnergyInternalAuditController;
use App\Modules\Hse\Controllers\EnergyMonitoringRecordController;
use App\Modules\Hse\Controllers\EnergyObjectiveController;
use App\Modules\Hse\Controllers\EnergyPurchaseController;
use App\Modules\Hse\Controllers\EnvironmentalAspectController;
use App\Modules\Hse\Controllers\EnvironmentalIndicatorController;
use App\Modules\Hse\Controllers\EpiController;
use App\Modules\Hse\Controllers\IndicatorReadingController;
use App\Modules\Hse\Controllers\IpeController;
use App\Modules\Hse\Controllers\ManagementChangeController;
use App\Modules\Hse\Controllers\ManagementSystemOverviewController;
use App\Modules\Hse\Controllers\MonitoringInstrumentController;
use App\Modules\Hse\Controllers\ObligationConformiteEnvironnementaleController;
use App\Modules\Hse\Controllers\PerformanceOverviewController;
use App\Modules\Hse\Controllers\ProductServiceRequirementController;
use App\Modules\Hse\Controllers\SetupGuideController;
use App\Modules\Hse\Controllers\VerificationReglementaireController;
use App\Modules\Hse\Controllers\WorkAccidentController;
use App\Modules\Support\Controllers\HabilitationController;
use Illuminate\Support\Facades\Route;

// ============================================================
// MODULE HSE & NORMES ASSOCIÉES (ISO 14001, ISO 45001, ISO 50001)
// ============================================================

// --- 1. ISO 14001 : Environnement & AES ---
// Pilotage du système de management (mono-norme ou intégré)
Route::get('management-system/overview', [ManagementSystemOverviewController::class, 'overview']);

// AES — aspects et impacts significatifs (ISO 14001:2026 §6.1.2). Cotation et seuil calculés côté serveur.
$aes = 'planification.aspects_environnementaux';
$aesCan = fn (string $action) => ['module.subscribed:aspects_environnementaux', "permission:{$aes}.{$action}|{$aes}.manage|aspect_environnementaux.{$action}|environnement.aspects.{$action}"];
$aesEvaluate = ['module.subscribed:aspects_environnementaux', "permission:environnement.aspects.evaluate|{$aes}.manage|aspect_environnementaux.manage"];
Route::get('environmental-aspects/statistics', [EnvironmentalAspectController::class, 'statistics'])->middleware($aesCan('read'));
Route::get('environmental-aspects/significant-sheet', [EnvironmentalAspectController::class, 'significantSheet'])->middleware($aesCan('read'));
Route::get('environmental-aspects/export-xlsx', [EnvironmentalAspectController::class, 'exportXlsx'])->middleware($aesCan('read'));
Route::get('environmental-aspects/template', [EnvironmentalAspectController::class, 'downloadTemplate'])->middleware($aesCan('read'));
Route::post('environmental-aspects/import-xlsx', [EnvironmentalAspectController::class, 'importXlsx'])->middleware($aesCan('create'));
Route::post('environmental-aspects/reassessment-trigger', [EnvironmentalAspectController::class, 'triggerReassessment'])->middleware($aesCan('update'));
Route::get('aes-settings', [AesSettingsController::class, 'show'])->middleware($aesCan('read'));
Route::put('aes-settings', [AesSettingsController::class, 'update'])->middleware($aesEvaluate);
Route::get('aes-registry-versions/compare', [AesRegistryVersionController::class, 'compare'])->middleware($aesCan('read'));
Route::get('aes-registry-versions', [AesRegistryVersionController::class, 'index'])->middleware($aesCan('read'));
Route::post('aes-registry-versions', [AesRegistryVersionController::class, 'store'])->middleware($aesEvaluate);
Route::get('aes-registry-versions/{id}', [AesRegistryVersionController::class, 'show'])->whereNumber('id')->middleware($aesCan('read'));
Route::get('environmental-aspects', [EnvironmentalAspectController::class, 'index'])->middleware($aesCan('read'));
Route::post('environmental-aspects', [EnvironmentalAspectController::class, 'store'])->middleware($aesCan('create'));
Route::get('environmental-aspects/{id}', [EnvironmentalAspectController::class, 'show'])->whereNumber('id')->middleware($aesCan('read'));
Route::put('environmental-aspects/{id}', [EnvironmentalAspectController::class, 'update'])->whereNumber('id')->middleware($aesCan('update'));
Route::patch('environmental-aspects/{id}', [EnvironmentalAspectController::class, 'update'])->whereNumber('id')->middleware($aesCan('update'));
Route::delete('environmental-aspects/{id}', [EnvironmentalAspectController::class, 'destroy'])->whereNumber('id')->middleware($aesCan('delete'));
Route::post('environmental-aspects/{id}/flag-reassessment', [EnvironmentalAspectController::class, 'flagReassessment'])->whereNumber('id')->middleware($aesCan('update'));
Route::post('environmental-aspects/{id}/{action}', [EnvironmentalAspectController::class, 'transition'])
    ->whereNumber('id')->whereIn('action', ['validate', 'archive', 'reopen'])->middleware($aesEvaluate);

Route::get('aspects-environnementaux/stats', [AspectEnvironnementalController::class, 'stats']);
Route::get('aspects-environnementaux/matrice', [AspectEnvironnementalController::class, 'matrice']);
Route::apiResource('aspects-environnementaux', AspectEnvironnementalController::class);

Route::get('obligations-conformite-environnementales/alertes', [ObligationConformiteEnvironnementaleController::class, 'alertes']);
Route::get('obligations-conformite-environnementales/stats', [ObligationConformiteEnvironnementaleController::class, 'stats']);
Route::apiResource('obligations-conformite-environnementales', ObligationConformiteEnvironnementaleController::class, [
    'parameters' => ['obligations-conformite-environnementales' => 'obligation'],
]);

// --- 2. ISO 45001 : Santé & Sécurité au Travail (DUERP, Habilitations, EPI, VGP) ---
// DUERP & Dangers (Canevas INRS & Dynamique)
$duerp = fn (string $action) => ['module.subscribed:duerp,identification_dangers_sst', "permission:sst.duerp.{$action}|sst.identification_dangers.{$action}"];
Route::get('duerp/inrs-families', [DuerpController::class, 'riskFamilies'])->middleware($duerp('read'));
Route::get('duerp/export-xlsx', [DuerpController::class, 'exportXlsx'])->middleware($duerp('export'));
Route::get('duerp', [DuerpController::class, 'index'])->middleware($duerp('read'));
Route::post('duerp', [DuerpController::class, 'store'])->middleware($duerp('create'));
Route::get('duerp/{id}', [DuerpController::class, 'show'])->whereNumber('id')->middleware($duerp('read'));
Route::put('duerp/{id}', [DuerpController::class, 'update'])->whereNumber('id')->middleware($duerp('update'));
Route::patch('duerp/{id}', [DuerpController::class, 'update'])->whereNumber('id')->middleware($duerp('update'));
Route::delete('duerp/{id}', [DuerpController::class, 'destroy'])->whereNumber('id')->middleware($duerp('delete'));
Route::get('duerp/{id}/tree', [DuerpController::class, 'tree'])->whereNumber('id')->middleware($duerp('read'));
Route::get('duerp/{id}/conformity', [DuerpController::class, 'conformity'])->whereNumber('id')->middleware($duerp('read'));
Route::get('duerp/{id}/versions', [DuerpController::class, 'versions'])->whereNumber('id')->middleware($duerp('read'));
Route::post('duerp/{id}/revise', [DuerpController::class, 'revise'])->whereNumber('id')->middleware($duerp('create'));
Route::post('duerp/{id}/submit', [DuerpController::class, 'submitForVerification'])->whereNumber('id')->middleware($duerp('update'));
Route::post('duerp/{id}/submit-verification', [DuerpController::class, 'submitForVerification'])->whereNumber('id')->middleware($duerp('update'));
Route::post('duerp/{id}/approve', [DuerpController::class, 'approveByCeo'])->whereNumber('id')->middleware($duerp('approve'));
Route::post('duerp/{id}/reject', [DuerpController::class, 'reject'])->whereNumber('id')->middleware($duerp('approve'));
Route::post('duerp/{id}/dangers', [DuerpController::class, 'storeDanger'])->whereNumber('id')->middleware($duerp('update'));
Route::put('duerp/{id}/dangers/{dangerId}', [DuerpController::class, 'updateDanger'])->whereNumber(['id', 'dangerId'])->middleware($duerp('update'));
Route::delete('duerp/{id}/dangers/{dangerId}', [DuerpController::class, 'destroyDanger'])->whereNumber(['id', 'dangerId'])->middleware($duerp('update'));

// Familles de risques, échelles de cotation et unités de travail
Route::get('duerp-risk-families', [DuerpController::class, 'riskFamilies'])->middleware($duerp('read'));
Route::post('duerp-risk-families', [DuerpController::class, 'storeRiskFamily'])->middleware($duerp('update'));
Route::put('duerp-risk-families/{id}', [DuerpController::class, 'updateRiskFamily'])->whereNumber('id')->middleware($duerp('update'));
Route::delete('duerp-risk-families/{id}', [DuerpController::class, 'destroyRiskFamily'])->whereNumber('id')->middleware($duerp('update'));
Route::get('duerp-scoring-scales', [DuerpController::class, 'scoringScales'])->middleware($duerp('read'));
Route::post('duerp-scoring-scales', [DuerpController::class, 'updateScoringScales'])->middleware($duerp('update'));
Route::put('duerp-scoring-scales', [DuerpController::class, 'updateScoringScales'])->middleware($duerp('update'));
Route::get('duerp-work-units', [DuerpController::class, 'workUnits'])->middleware($duerp('read'));
Route::post('duerp-work-units', [DuerpController::class, 'storeWorkUnit'])->middleware($duerp('update'));
Route::put('duerp-work-units/{id}', [DuerpController::class, 'updateWorkUnit'])->whereNumber('id')->middleware($duerp('update'));
Route::delete('duerp-work-units/{id}', [DuerpController::class, 'destroyWorkUnit'])->whereNumber('id')->middleware($duerp('update'));

// Accidents & Incidents SST (ISO 45001 - REQ-6.1-D08 / REQ-6.1-D09)
Route::get('work-accidents/statistics', [WorkAccidentController::class, 'statistics']);
Route::post('work-accidents/{id}/close', [WorkAccidentController::class, 'close']);
Route::apiResource('work-accidents', WorkAccidentController::class);

// Situations d'urgence & simulations (ISO 45001 / ISO 14001 - REQ-8.2-01 / REQ-8.2-02)
// Préparation et réponse aux situations d'urgence (§8.2) : offre (ISO 14001 ou SST), puis droits de l'utilisateur.
$urg = fn (string $action) => ['module.subscribed:urgences_environnementales,preparation_reponse_urgences_sst', "permission:environnement.urgences.{$action}|emergency_procedures.{$action}|emergency_procedures.manage|realisation.urgences_environnementales.{$action}|realisation.urgences_environnementales.manage"];
Route::get('emergency/overview', [EmergencyOverviewController::class, 'overview'])->middleware($urg('read'));
Route::get('emergency-procedures', [EmergencyProcedureController::class, 'index'])->middleware($urg('read'));
Route::post('emergency-procedures', [EmergencyProcedureController::class, 'store'])->middleware($urg('create'));
Route::get('emergency-procedures/{id}', [EmergencyProcedureController::class, 'show'])->whereNumber('id')->middleware($urg('read'));
Route::put('emergency-procedures/{id}', [EmergencyProcedureController::class, 'update'])->whereNumber('id')->middleware($urg('update'));
Route::patch('emergency-procedures/{id}', [EmergencyProcedureController::class, 'update'])->whereNumber('id')->middleware($urg('update'));
Route::delete('emergency-procedures/{id}', [EmergencyProcedureController::class, 'destroy'])->whereNumber('id')->middleware($urg('delete'));
Route::post('emergency-procedures/{id}/record-drill', [EmergencyProcedureController::class, 'recordDrill'])->whereNumber('id')->middleware($urg('update'));
foreach ([
    'emergency-contacts' => EmergencyContactController::class,
    'emergency-resources' => EmergencyResourceController::class,
    'emergency-exercises' => EmergencyExerciseController::class,
    'emergency-events' => EmergencyEventController::class,
] as $uri => $controller) {
    Route::get("{$uri}/template", [$controller, 'downloadTemplate'])->middleware($urg('read'));
    Route::get("{$uri}/export-xlsx", [$controller, 'exportXlsx'])->middleware($urg('read'));
    Route::post("{$uri}/import-xlsx", [$controller, 'importXlsx'])->middleware($urg('create'));
    Route::get($uri, [$controller, 'index'])->middleware($urg('read'));
    Route::post($uri, [$controller, 'store'])->middleware($urg('create'));
    Route::get("{$uri}/{id}", [$controller, 'show'])->whereNumber('id')->middleware($urg('read'));
    Route::put("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($urg('update'));
    Route::patch("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($urg('update'));
    Route::delete("{$uri}/{id}", [$controller, 'destroy'])->whereNumber('id')->middleware($urg('delete'));
}
Route::post('emergency-exercises/{id}/complete', [EmergencyExerciseController::class, 'complete'])->whereNumber('id')->middleware($urg('update'));
Route::post('emergency-exercises/{id}/cancel', [EmergencyExerciseController::class, 'cancel'])->whereNumber('id')->middleware($urg('update'));
Route::post('emergency-events/{id}/timeline', [EmergencyEventController::class, 'addTimeline'])->whereNumber('id')->middleware($urg('update'));
Route::post('emergency-events/{id}/contain', [EmergencyEventController::class, 'contain'])->whereNumber('id')->middleware($urg('update'));
Route::post('emergency-events/{id}/close', [EmergencyEventController::class, 'close'])->whereNumber('id')->middleware($urg('update'));

// Gestion des changements (ISO 14001 §6.3)
$chg = fn (string $action) => ['module.subscribed:gestion_changements', "permission:planification.changements.{$action}"];
Route::get('management-changes/period-summary', [ManagementChangeController::class, 'periodSummary'])->middleware($chg('read'));
Route::get('management-changes/template', [ManagementChangeController::class, 'downloadTemplate'])->middleware($chg('read'));
Route::get('management-changes/export-xlsx', [ManagementChangeController::class, 'exportXlsx'])->middleware($chg('read'));
Route::get('management-change-tasks', [ManagementChangeController::class, 'myTasks'])->middleware($chg('read'));
Route::post('management-change-tasks/{taskId}/complete', [ManagementChangeController::class, 'completeTask'])->whereNumber('taskId')->middleware($chg('update'));
Route::get('management-changes', [ManagementChangeController::class, 'index'])->middleware($chg('read'));
Route::post('management-changes', [ManagementChangeController::class, 'store'])->middleware($chg('create'));
Route::get('management-changes/{id}', [ManagementChangeController::class, 'show'])->whereNumber('id')->middleware($chg('read'));
Route::put('management-changes/{id}', [ManagementChangeController::class, 'update'])->whereNumber('id')->middleware($chg('update'));
Route::patch('management-changes/{id}', [ManagementChangeController::class, 'update'])->whereNumber('id')->middleware($chg('update'));
Route::delete('management-changes/{id}', [ManagementChangeController::class, 'destroy'])->whereNumber('id')->middleware($chg('delete'));
Route::put('management-changes/{id}/analysis', [ManagementChangeController::class, 'saveAnalysis'])->whereNumber('id')->middleware($chg('update'));
Route::post('management-changes/{id}/submit', [ManagementChangeController::class, 'submit'])->whereNumber('id')->middleware($chg('update'));
Route::post('management-changes/{id}/decision', [ManagementChangeController::class, 'decide'])->whereNumber('id')->middleware($chg('approve'));
Route::post('management-changes/{id}/review', [ManagementChangeController::class, 'review'])->whereNumber('id')->middleware($chg('update'));

// Performance environnementale et surveillance (ISO 14001 §9.1.1)
$perf = fn (string $action) => ['module.subscribed:performance_environnementale', "permission:evaluation.performance_environnementale.{$action}"];
Route::get('performance/overview', [PerformanceOverviewController::class, 'overview'])->middleware($perf('read'));
Route::get('performance/report', [PerformanceOverviewController::class, 'report'])->middleware($perf('read'));
Route::get('environmental-indicator-library', [EnvironmentalIndicatorController::class, 'library'])->middleware($perf('read'));
Route::post('environmental-indicator-library/activate', [EnvironmentalIndicatorController::class, 'activateLibrary'])->middleware($perf('create'));
Route::get('environmental-indicators/{id}/analysis', [EnvironmentalIndicatorController::class, 'analysis'])->whereNumber('id')->middleware($perf('read'));
Route::post('environmental-indicators/{id}/actions', [EnvironmentalIndicatorController::class, 'createAction'])->whereNumber('id')->middleware($perf('create'));
Route::post('monitoring-instruments/{id}/calibrations', [MonitoringInstrumentController::class, 'calibrate'])->whereNumber('id')->middleware($perf('update'));
foreach (['environmental-indicators' => EnvironmentalIndicatorController::class, 'monitoring-instruments' => MonitoringInstrumentController::class] as $uri => $controller) {
    Route::get("{$uri}/template", [$controller, 'downloadTemplate'])->middleware($perf('read'));
    Route::get("{$uri}/export-xlsx", [$controller, 'exportXlsx'])->middleware($perf('read'));
    Route::post("{$uri}/import-xlsx", [$controller, 'importXlsx'])->middleware($perf('create'));
    Route::get($uri, [$controller, 'index'])->middleware($perf('read'));
    Route::post($uri, [$controller, 'store'])->middleware($perf('create'));
    Route::get("{$uri}/{id}", [$controller, 'show'])->whereNumber('id')->middleware($perf('read'));
    Route::put("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($perf('update'));
    Route::patch("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($perf('update'));
    Route::delete("{$uri}/{id}", [$controller, 'destroy'])->whereNumber('id')->middleware($perf('delete'));
}
Route::get('indicator-readings', [IndicatorReadingController::class, 'index'])->middleware($perf('read'));
Route::post('indicator-readings', [IndicatorReadingController::class, 'store'])->middleware($perf('create'));
Route::post('indicator-readings/batch', [IndicatorReadingController::class, 'batch'])->middleware($perf('create'));
Route::post('indicator-readings/import-xlsx', [IndicatorReadingController::class, 'importXlsx'])->middleware($perf('create'));
Route::post('indicator-readings/{id}/correct', [IndicatorReadingController::class, 'correct'])->whereNumber('id')->middleware($perf('update'));
Route::get('indicator-readings/{id}/evidence', [IndicatorReadingController::class, 'evidence'])->whereNumber('id')->middleware($perf('read'));

// Campagnes de sensibilisation (ISO 14001 §7.3)
$awareManage = fn (string $action) => ['module.subscribed:campagnes_sensibilisation', "permission:support.campagnes_sensibilisation.{$action}"];
$awareMember = ['module.subscribed:campagnes_sensibilisation'];
Route::get('awareness/my', [AwarenessParticipationController::class, 'index'])->middleware($awareMember);
Route::get('awareness/my/{campaignId}', [AwarenessParticipationController::class, 'show'])->whereNumber('campaignId')->middleware($awareMember);
Route::post('awareness/my/{campaignId}/materials/{materialId}/read', [AwarenessParticipationController::class, 'read'])->whereNumber(['campaignId', 'materialId'])->middleware($awareMember);
Route::post('awareness/my/{campaignId}/materials/{materialId}/quiz', [AwarenessParticipationController::class, 'quiz'])->whereNumber(['campaignId', 'materialId'])->middleware($awareMember);
Route::get('awareness/my/{campaignId}/attestation', [AwarenessParticipationController::class, 'attestation'])->whereNumber('campaignId')->middleware($awareMember);
Route::post('awareness-talks/sign', [AwarenessTalkController::class, 'sign'])->middleware($awareMember);
Route::get('awareness/overview', [AwarenessOverviewController::class, 'overview'])->middleware($awareManage('read'));
Route::get('awareness-campaigns/{id}/participants', [AwarenessCampaignController::class, 'participants'])->whereNumber('id')->middleware($awareManage('read'));
Route::get('awareness-campaigns/{id}/suggested-aspects', [AwarenessCampaignController::class, 'suggestedAspects'])->whereNumber('id')->middleware($awareManage('read'));
Route::post('awareness-campaigns/{id}/materials', [AwarenessCampaignController::class, 'storeMaterial'])->whereNumber('id')->middleware($awareManage('update'));
Route::put('awareness-materials/{materialId}', [AwarenessCampaignController::class, 'updateMaterial'])->whereNumber('materialId')->middleware($awareManage('update'));
Route::delete('awareness-materials/{materialId}', [AwarenessCampaignController::class, 'destroyMaterial'])->whereNumber('materialId')->middleware($awareManage('update'));
Route::post('awareness-campaigns/{id}/activate', [AwarenessCampaignController::class, 'activate'])->whereNumber('id')->middleware($awareManage('update'));
Route::post('awareness-campaigns/{id}/close', [AwarenessCampaignController::class, 'close'])->whereNumber('id')->middleware($awareManage('update'));
Route::post('awareness-campaigns/{id}/invitations', [AwarenessCampaignController::class, 'invite'])->whereNumber('id')->middleware($awareManage('update'));
Route::get('awareness-talks/{id}/qr', [AwarenessTalkController::class, 'qr'])->whereNumber('id')->middleware($awareManage('read'));
Route::post('awareness-talks/{id}/attendees', [AwarenessTalkController::class, 'addAttendee'])->whereNumber('id')->middleware($awareManage('update'));
Route::post('awareness-talks/{id}/close', [AwarenessTalkController::class, 'close'])->whereNumber('id')->middleware($awareManage('update'));
foreach (['awareness-campaigns' => AwarenessCampaignController::class, 'awareness-talks' => AwarenessTalkController::class] as $uri => $controller) {
    Route::get("{$uri}/template", [$controller, 'downloadTemplate'])->middleware($awareManage('read'));
    Route::get("{$uri}/export-xlsx", [$controller, 'exportXlsx'])->middleware($awareManage('read'));
    Route::get($uri, [$controller, 'index'])->middleware($awareManage('read'));
    Route::post($uri, [$controller, 'store'])->middleware($awareManage('create'));
    Route::get("{$uri}/{id}", [$controller, 'show'])->whereNumber('id')->middleware($awareManage('read'));
    Route::put("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($awareManage('update'));
    Route::patch("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($awareManage('update'));
    Route::delete("{$uri}/{id}", [$controller, 'destroy'])->whereNumber('id')->middleware($awareManage('delete'));
}

// Assistant de démarrage (T-01) et préparation à la certification (T-03)
Route::get('setup-guide', [SetupGuideController::class, 'status']);
Route::post('setup-guide/{step}/apply', [SetupGuideController::class, 'apply']);
Route::post('setup-guide/{step}/skip', [SetupGuideController::class, 'skip']);
Route::get('certification-readiness', [SetupGuideController::class, 'readiness']);

// Habilitations
Route::get('habilitations/expires-soon', [HabilitationController::class, 'expiresSoon']);
Route::get('habilitations/export', [HabilitationController::class, 'export']);
Route::get('habilitations/stats', [HabilitationController::class, 'stats']);
Route::post('habilitations/{habilitation}/renew', [HabilitationController::class, 'renew']);
Route::apiResource('habilitations', HabilitationController::class);
Route::get('habilitations/alertes', [HabilitationController::class, 'expiresSoon'])
    ->middleware('legacy.deprecated:habilitations/expires-soon,2026-12-31');

// EPI (Équipements de Protection Individuelle)
Route::get('epi/catalogue', [EpiController::class, 'catalogue']);
Route::post('epi/catalogue', [EpiController::class, 'storeCatalogue']);
Route::get('epi/stocks', [EpiController::class, 'stocks']);
Route::post('epi/stocks', [EpiController::class, 'storeStock']);
Route::put('epi/stocks/{id}', [EpiController::class, 'updateStock']);
Route::get('epi/stocks/{stockId}/mouvements', [EpiController::class, 'mouvements']);
Route::post('epi/mouvements', [EpiController::class, 'storeMouvement']);
Route::get('epi/attributions', [EpiController::class, 'attributions']);
Route::post('epi/attributions', [EpiController::class, 'storeAttribution']);
Route::get('epi/stats', [EpiController::class, 'stats']);

// VGP (Vérifications Générales Périodiques)
Route::get('verifications-reglementaires/alertes', [VerificationReglementaireController::class, 'alertes']);
Route::get('verifications-reglementaires/stats', [VerificationReglementaireController::class, 'stats']);
Route::apiResource('verifications-reglementaires', VerificationReglementaireController::class);

// --- 3. ISO 50001 : Énergie ---
Route::middleware('module.subscribed:revue_energetique')->group(function () {
    Route::get('consommations-energie/stats', [ConsommationEnergieController::class, 'stats']);
    Route::post('consommations-energie/import-file', [ConsommationEnergieController::class, 'importCsv']);
    Route::post('consommations-energie/import-csv', [ConsommationEnergieController::class, 'importCsv']);
    Route::apiResource('consommations-energie', ConsommationEnergieController::class);
});

Route::middleware('module.subscribed:ipe')->group(function () {

    Route::get('ipe/stats', [IpeController::class, 'stats']);
    Route::post('ipe/{id}/valeurs', [IpeController::class, 'addValeur']);
    Route::get('ipe/{id}/valeurs', [IpeController::class, 'valeurs']);
    Route::get('ipe/{id}/tendance', [IpeController::class, 'tendance']);
    Route::apiResource('ipe', IpeController::class);
});

// --- 3 bis. ISO 50001 : sections du SMÉ (références : permissions du catalogue RBAC) ---
// Chaque ressource expose CRUD + modèle / export / import XLSX, protégés par
// `{permission}.read|manage` (lecture), `.create|manage`, `.update|manage`, `.delete|manage`.
$energyResources = [
    'energy-baselines' => [EnergyBaselineController::class, 'planification.situation_energetique_reference', 'situation_energetique_reference'],
    'energy-data-collection-plans' => [EnergyDataCollectionPlanController::class, 'planification.collecte_donnees_energetiques', 'collecte_donnees_energetiques'],
    'energy-objectives' => [EnergyObjectiveController::class, 'planification.objectifs_cibles_energetiques', 'objectifs_cibles_energetiques'],
    'energy-design-reviews' => [EnergyDesignReviewController::class, 'realisation.conception_energetique', 'conception_energetique'],
    'energy-purchases' => [EnergyPurchaseController::class, 'realisation.achats_energie', 'achats_energie'],
    'energy-equipment-purchases' => [EnergyEquipmentPurchaseController::class, 'realisation.achats_equipements_energetiques', 'achats_equipements_energetiques'],
    'energy-monitoring-records' => [EnergyMonitoringRecordController::class, 'evaluation.surveillance_performance_energetique', 'surveillance_performance_energetique'],
    'energy-compliance-evaluations' => [EnergyComplianceEvaluationController::class, 'evaluation.conformite_energetique', 'conformite_energetique'],
    'energy-internal-audits' => [EnergyInternalAuditController::class, 'evaluation.audit_energetique', 'audit_energetique'],
];
foreach ($energyResources as $uri => [$controller, $permission, $subModule]) {
    // Offre et normes choisies (module.subscribed) puis droits de l'utilisateur (permission).
    $can = fn (string $action) => ["module.subscribed:{$subModule}", "permission:{$permission}.{$action}|{$permission}.manage"];
    Route::get("{$uri}/template", [$controller, 'downloadTemplate'])->middleware($can('read'));
    Route::get("{$uri}/export-xlsx", [$controller, 'exportXlsx'])->middleware($can('read'));
    Route::post("{$uri}/import-xlsx", [$controller, 'importXlsx'])->middleware($can('create'));
    Route::get($uri, [$controller, 'index'])->middleware($can('read'));
    Route::post($uri, [$controller, 'store'])->middleware($can('create'));
    Route::get("{$uri}/{id}", [$controller, 'show'])->whereNumber('id')->middleware($can('read'));
    Route::put("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($can('update'));
    Route::patch("{$uri}/{id}", [$controller, 'update'])->whereNumber('id')->middleware($can('update'));
    Route::delete("{$uri}/{id}", [$controller, 'destroy'])->whereNumber('id')->middleware($can('delete'));
}

// --- 4. Exigences et Obligations de Conformité Légale (§6.1.3) ---
// Registre de conformité unifié (§6.1.3 / §9.1.2) : offre et normes choisies, puis droits de l'utilisateur.
$obl = fn (string $action) => ['module.subscribed:obligations_conformite', "permission:environnement.obligations.{$action}|obligation_conformite_environnementales.{$action}|obligation_conformite_environnementales.manage"];
Route::get('compliance-obligation-aspects', [ComplianceObligationAspectController::class, 'index'])->middleware($obl('read'));
Route::post('compliance-obligation-aspects', [ComplianceObligationAspectController::class, 'store'])->middleware($obl('create'));
Route::put('compliance-obligation-aspects/{id}', [ComplianceObligationAspectController::class, 'update'])->whereNumber('id')->middleware($obl('update'));
Route::get('compliance-obligations/template', [ComplianceObligationController::class, 'downloadTemplate'])->middleware($obl('read'));
Route::get('compliance-obligations/export-xlsx', [ComplianceObligationController::class, 'exportXlsx'])->middleware($obl('read'));
Route::post('compliance-obligations/import-xlsx', [ComplianceObligationController::class, 'importXlsx'])->middleware($obl('create'));
Route::get('compliance-obligations/dashboard', [ComplianceRegisterController::class, 'dashboard'])->middleware($obl('read'));
Route::get('compliance-obligations/expirations', [ComplianceRegisterController::class, 'expirations'])->middleware($obl('read'));
Route::get('compliance-evaluations/{evaluationId}/evidence', [ComplianceRegisterController::class, 'downloadEvidence'])->whereNumber('evaluationId')->middleware($obl('read'));
Route::get('compliance-obligations/{id}/evaluations', [ComplianceRegisterController::class, 'evaluations'])->whereNumber('id')->middleware($obl('read'));
Route::post('compliance-obligations/{id}/evaluations', [ComplianceRegisterController::class, 'evaluate'])->whereNumber('id')->middleware($obl('update'));
Route::post('compliance-obligations/{id}/applicability', [ComplianceRegisterController::class, 'applicability'])->whereNumber('id')->middleware($obl('update'));
Route::post('compliance-obligations/{id}/analysis', [ComplianceRegisterController::class, 'analysis'])->whereNumber('id')->middleware($obl('update'));
Route::post('compliance-obligations/{id}/agreement-plan', [ComplianceRegisterController::class, 'agreementPlan'])->whereNumber('id')->middleware($obl('create'));
Route::get('compliance-obligations', [ComplianceObligationController::class, 'index'])->middleware($obl('read'));
Route::post('compliance-obligations', [ComplianceObligationController::class, 'store'])->middleware($obl('create'));
Route::put('compliance-obligations/{id}', [ComplianceObligationController::class, 'update'])->whereNumber('id')->middleware($obl('update'));
Route::patch('compliance-obligations/{id}', [ComplianceObligationController::class, 'update'])->whereNumber('id')->middleware($obl('update'));
Route::delete('compliance-obligations/{id}', [ComplianceObligationController::class, 'destroy'])->whereNumber('id')->middleware($obl('delete'));

Route::get('product-service-requirements-obligation-aspects', [ComplianceObligationAspectController::class, 'index']);
Route::post('product-service-requirements-obligation-aspects', [ComplianceObligationAspectController::class, 'store']);
Route::put('product-service-requirements-obligation-aspects/{id}', [ComplianceObligationAspectController::class, 'update']);
Route::get('prod-req-obligations/template', [ComplianceObligationController::class, 'downloadTemplate']);
Route::get('prod-req-obligations/export-xlsx', [ComplianceObligationController::class, 'exportXlsx']);
Route::post('prod-req-obligations/import-xlsx', [ComplianceObligationController::class, 'importXlsx']);
Route::apiResource('prod-req-obligations', ComplianceObligationController::class, [
    'parameters' => ['prod-req-obligations' => 'obligation'],
])->except(['show']);

Route::apiResource('applicable-requirements', ApplicableRequirementController::class);

// --- 5. Exigences relatives aux Produits & Services (ISO 9001 §8.2) ---
Route::get('product-service-requirements/template', [ProductServiceRequirementController::class, 'downloadTemplate']);
Route::get('product-service-requirements/export-xlsx', [ProductServiceRequirementController::class, 'exportXlsx']);
Route::post('product-service-requirements/import-xlsx', [ProductServiceRequirementController::class, 'importXlsx']);
Route::post('product-service-requirements/{productServiceRequirement}/review', [ProductServiceRequirementController::class, 'review']);
Route::apiResource('product-service-requirements', ProductServiceRequirementController::class)->parameters([
    'product-service-requirements' => 'productServiceRequirement',
]);
