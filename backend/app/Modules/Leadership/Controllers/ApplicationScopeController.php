<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Http\Controllers\Api\Concerns\ResolvesGeneratedDocumentContext;
use App\Http\Resources\ApplicationScopeResource;
use App\Http\Resources\DocumentResource;
use App\Models\ApplicationScope;
use App\Models\Process;
use App\Models\Site;
use App\Services\ProcessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ApplicationScopeController extends Controller
{
    use AuthorizesSiteAccess;
    use ResolvesGeneratedDocumentContext;

    public function index(Request $request)
    {
        $query = ApplicationScope::with(['site', 'publishedBy']);
        $this->scopeToUserSites($request, $query);

        if ($request->has('site_id')) {
            $query->where('site_id', $request->site_id);
        }

        if ($request->has('is_current')) {
            $query->where('is_current', filter_var($request->is_current, FILTER_VALIDATE_BOOLEAN));
        }

        $perPage = min(max($request->integer('per_page', 20), 1), 100);
        $scopes = $query
            ->orderByRaw("CASE WHEN status = 'draft' THEN 0 WHEN is_current THEN 1 ELSE 2 END")
            ->orderByDesc('id')
            ->paginate($perPage);
        return ApplicationScopeResource::collection($scopes);
    }

    /**
     * Périmètre courant d'un site (lecture du périmètre d'application actif).
     */
    public function current(Request $request)
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
        ]);
        $this->assertSiteAccess($request, (int) $validated['site_id']);

        $scope = ApplicationScope::with(['site', 'publishedBy'])
            ->where('site_id', $validated['site_id'])
            ->where('is_current', true)
            ->orderByDesc('id')
            ->first();

        if (!$scope) {
            return response()->json(['message' => 'Aucun périmètre courant pour ce site.'], 404);
        }

        return new ApplicationScopeResource($scope);
    }

    /**
     * Publier une nouvelle version contrôlée du périmètre du site.
     */
    public function publish(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);
        $this->assertCanPublish($request);

        $publishedScope = DB::transaction(function () use ($request, $applicationScope) {
            Site::query()->whereKey($applicationScope->site_id)->lockForUpdate()->firstOrFail();
            $scope = ApplicationScope::query()
                ->whereKey($applicationScope->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($scope->status !== 'draft' || $scope->is_current) {
                throw ValidationException::withMessages([
                    'status' => 'Seul un brouillon peut être publié.',
                ]);
            }

            $metadata = is_array($scope->metadata) ? $scope->metadata : [];
            $errors = [];
            if (trim((string) ($scope->objective ?: $scope->document_objective)) === '') {
                $errors['objective'][] = 'L’objectif du périmètre est requis avant publication.';
            }
            if (trim((string) ($scope->scope ?: $scope->scope_definition)) === '') {
                $errors['scope'][] = 'La définition du périmètre est requise avant publication.';
            }
            if (!is_array($scope->products_services) || count(array_filter(
                $scope->products_services,
                fn ($item) => trim((string) $item) !== '',
            )) === 0) {
                $errors['products_services'][] = 'Déclarez au moins un produit ou service couvert avant publication.';
            }
            if (empty($metadata['scope_effective_date'])) {
                $errors['metadata.scope_effective_date'][] = 'La date d’effet est requise avant publication.';
            }
            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }

            $this->validateExclusionJustifications(['is_current' => true], $scope);

            ApplicationScope::query()
                ->where('site_id', $scope->site_id)
                ->where('id', '!=', $scope->id)
                ->where('is_current', true)
                ->lockForUpdate()
                ->update(['is_current' => false, 'status' => 'superseded']);

            $scope->update([
                'is_current' => true,
                'status' => 'published',
                'published_by' => $request->user()->id,
                'published_at' => now(),
            ]);

            return $scope->fresh(['site', 'publishedBy']);
        });

        $this->syncProcessesToGlobal($publishedScope);

        return new ApplicationScopeResource($publishedScope);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'version' => 'nullable|string|max:50',
            'objective' => 'nullable|string',
            'scope' => 'nullable|string',
            'document_objective' => 'nullable|string',
            'scope_definition' => 'nullable|string',
            'referenced_documents' => 'nullable|array',
            'referenced_documents.*' => 'nullable|string|max:500',
            'processes' => 'nullable|array',
            'processes.*.id' => 'nullable|integer|exists:processes,id',
            'processes.*.name' => 'nullable|string|max:255',
            'processes.*.type' => 'nullable|string|max:50',
            'processes.*.abbreviation' => 'nullable|string|max:20',
            'included_processes' => 'nullable|array',
            'included_processes.*' => 'integer|exists:processes,id',
            'products_services' => 'nullable|array',
            'products_services.*' => 'nullable|string|max:500',
            'organizational_units' => 'nullable|array',
            'organizational_units.*' => 'nullable|string|max:500',
            'locations' => 'nullable|array',
            'locations.*' => 'nullable|string|max:500',
            'scope_exclusions' => 'nullable|string',
            'exclusions' => 'nullable|string',
            'exclusions_justification' => 'nullable|string',
            'iso_exclusions' => 'nullable|string',
            'iso_exclusions_justification' => 'nullable|string',
            'norm_exclusions' => 'nullable|array',
            'norm_exclusions_justifications' => 'nullable|array',
            'applicable_norms' => 'nullable|array',
            'applicable_norms.*' => 'nullable|string|max:100',
            'document_generated' => 'nullable|boolean',
            'document_path' => 'nullable|string|max:500',
            'generated_at' => 'nullable|date',
            'metadata' => 'nullable|array',
            'metadata.scope_effective_date' => 'nullable|date',
            'metadata.scope_impact_assessment.reviewed' => 'nullable|boolean',
            'metadata.scope_impact_assessment.rationale' => 'nullable|string|max:5000',
        ]);

        if (empty($validated['enterprise_id']) && !empty($validated['site_id'])) {
            $validated['enterprise_id'] = Site::where('id', $validated['site_id'])->value('enterprise_id');
        }

        $this->assertSiteAccess($request, (int) $validated['site_id']);
        $this->validateExclusionJustifications($validated);
        $validated = $this->normalizeNormExclusionsStorage($validated);
        $validated['is_current'] = false;
        $validated['status'] = 'draft';
        $validated['published_by'] = null;
        $validated['published_at'] = null;
        $scope = ApplicationScope::create($validated);
        
        return new ApplicationScopeResource($scope->load(['site']));
    }

    public function show(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);

        return new ApplicationScopeResource($applicationScope->load(['site', 'publishedBy']));
    }

    public function update(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);

        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'version' => 'nullable|string|max:50',
            'objective' => 'nullable|string',
            'scope' => 'nullable|string',
            'document_objective' => 'nullable|string',
            'scope_definition' => 'nullable|string',
            'referenced_documents' => 'nullable|array',
            'referenced_documents.*' => 'nullable|string|max:500',
            'processes' => 'nullable|array',
            'processes.*.id' => 'nullable|integer|exists:processes,id',
            'processes.*.name' => 'nullable|string|max:255',
            'processes.*.type' => 'nullable|string|max:50',
            'processes.*.abbreviation' => 'nullable|string|max:20',
            'included_processes' => 'nullable|array',
            'included_processes.*' => 'integer|exists:processes,id',
            'products_services' => 'nullable|array',
            'products_services.*' => 'nullable|string|max:500',
            'organizational_units' => 'nullable|array',
            'organizational_units.*' => 'nullable|string|max:500',
            'locations' => 'nullable|array',
            'locations.*' => 'nullable|string|max:500',
            'scope_exclusions' => 'nullable|string',
            'exclusions' => 'nullable|string',
            'exclusions_justification' => 'nullable|string',
            'iso_exclusions' => 'nullable|string',
            'iso_exclusions_justification' => 'nullable|string',
            'norm_exclusions' => 'nullable|array',
            'norm_exclusions_justifications' => 'nullable|array',
            'applicable_norms' => 'nullable|array',
            'applicable_norms.*' => 'nullable|string|max:100',
            'document_generated' => 'nullable|boolean',
            'document_path' => 'nullable|string|max:500',
            'generated_at' => 'nullable|date',
            'metadata' => 'nullable|array',
            'metadata.scope_effective_date' => 'nullable|date',
            'metadata.scope_impact_assessment.reviewed' => 'nullable|boolean',
            'metadata.scope_impact_assessment.rationale' => 'nullable|string|max:5000',
        ]);

        if (empty($validated['enterprise_id']) && !empty($validated['site_id'])) {
            $validated['enterprise_id'] = Site::where('id', $validated['site_id'])->value('enterprise_id');
        }
        if (array_key_exists('site_id', $validated)) {
            $this->assertSiteAccess($request, (int) $validated['site_id']);
            if ((int) $validated['site_id'] !== (int) $applicationScope->site_id) {
                throw ValidationException::withMessages([
                    'site_id' => 'Un périmètre enregistré ne peut pas être déplacé vers un autre site.',
                ]);
            }
        }
        $this->validateExclusionJustifications($validated, $applicationScope);
        $validated = $this->normalizeNormExclusionsStorage($validated, $applicationScope);
        $scope = DB::transaction(function () use ($applicationScope, $validated) {
            Site::query()->whereKey($applicationScope->site_id)->lockForUpdate()->firstOrFail();
            $source = ApplicationScope::query()
                ->whereKey($applicationScope->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($source->is_current || $source->status === 'published') {
                $draft = $source->replicate(['created_at', 'updated_at']);
                $draft->is_current = false;
                $draft->status = 'draft';
                $draft->published_by = null;
                $draft->published_at = null;
                if (!isset($validated['version']) || $validated['version'] === $source->version) {
                    $validated['version'] = $this->incrementVersion((string) $source->version);
                }
                $draft->save();
                $draft->update($validated);

                return $draft;
            }

            if ($source->status !== 'draft') {
                throw ValidationException::withMessages([
                    'status' => 'Seul un brouillon peut être modifié.',
                ]);
            }

            $source->update($validated);

            return $source;
        });

        return new ApplicationScopeResource($scope->load(['site', 'publishedBy']));
    }

    public function destroy(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);

        if ($applicationScope->is_current || $applicationScope->status === 'published') {
            throw ValidationException::withMessages([
                'status' => 'Un périmètre publié est conservé dans l’historique contrôlé.',
            ]);
        }

        $applicationScope->delete();
        return response()->json(null, 204);
    }

    private function assertCanPublish(Request $request): void
    {
        $user = $request->user();
        abort_unless(
            $user && (
                $user->isSuperAdmin() ||
                $user->isEnterpriseAdmin() ||
                $user->isSiteManager()
            ),
            403,
            'Seule la direction ou le responsable du site peut publier le périmètre.',
        );
    }

    private function incrementVersion(string $version): string
    {
        if (preg_match('/^(\d+)\.(\d+)$/', $version, $matches)) {
            return $matches[1] . '.' . ((int) $matches[2] + 1);
        }

        return $version . '.1';
    }

    /**
     * Export Application Scope as PDF
     */
    public function exportDocx(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);

        try {
            $generationContext = $this->resolveGeneratedDocumentContext($request, (int) $applicationScope->site_id);

            // Etape 1: Réserver le code et l'ID du document en base de données
            $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                'site_id' => (int) $applicationScope->site_id,
                'process_id' => $generationContext['process_id'],
                'process_code' => $generationContext['process_code'],
                'process_name' => $generationContext['process_name'],
                'document_kind' => 'application_scope',
                'source_type' => 'application_scope',
                'source_id' => $applicationScope->id,
                'source_updated_at' => $applicationScope->updated_at?->toISOString(),
                'title' => 'Domaine d’application - ' . ($applicationScope->site->name ?? 'Site'),
                'description' => 'Document du domaine d’application généré automatiquement.',
                'created_by' => $request->user()?->id,
                'type' => $generationContext['type'],
                'force_new' => true,
                'metadata' => $generationContext['metadata'],
            ]);

            // Etape 2: Générer le fichier PDF avec le branding et le code calculé
            $enterprise = $applicationScope->site?->enterprise;
            if (!$enterprise) {
                return response()->json(['message' => 'Entreprise introuvable'], 404);
            }

            $htmlContent = view('pdf.application-scope', [
                'scope' => $applicationScope,
                'document' => $document,
            ])->render();

            $pdfContent = app(\App\Services\PdfGeneratorService::class)->generateDocument(
                $enterprise,
                'application_scope',
                [
                    'document_id' => $document->id,
                    'title' => $document->title,
                    'code' => $document->code,
                    'version' => $document->version ?? '1.0',
                    'html' => $htmlContent,
                ],
                ['is_draft' => ($document->workflow_status !== 'approved')]
            );

            $tempDir = storage_path('app/temp');
            if (!is_dir($tempDir)) {
                mkdir($tempDir, 0775, true);
            }
            $filePath = $tempDir . DIRECTORY_SEPARATOR . 'Domaine_Application_' . $applicationScope->id . '_' . time() . '.pdf';
            file_put_contents($filePath, $pdfContent);

            // Etape 3: Mettre à jour le document avec le fichier physique
            $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                'document_id' => $document->id,
                'site_id' => (int) $applicationScope->site_id,
                'process_id' => $generationContext['process_id'],
                'process_code' => $generationContext['process_code'],
                'process_name' => $generationContext['process_name'],
                'document_kind' => 'application_scope',
                'source_type' => 'application_scope',
                'source_id' => $applicationScope->id,
                'source_updated_at' => $applicationScope->updated_at?->toISOString(),
                'title' => $document->title,
                'description' => 'Document du domaine d’application généré automatiquement.',
                'file_source_path' => $filePath,
                'created_by' => $request->user()?->id,
                'type' => $generationContext['type'],
                'force_new' => true,
                'store_file' => true,
                'metadata' => $generationContext['metadata'],
            ]);
            
            $filename = 'Domaine_Application_' . ($applicationScope->site->name ?? 'Site') . '_' . now()->format('Y-m-d') . '.pdf';
            
            return response()
                ->download($filePath, $filename)
                ->header('X-Generated-Document-Id', (string) $document->id)
                ->deleteFileAfterSend(true);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException|\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Erreur lors de la génération du document',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Generate Application Scope draft document as PDF (no download)
     */
    public function generateDraftDocx(Request $request, ApplicationScope $applicationScope)
    {
        $this->assertSiteAccess($request, (int) $applicationScope->site_id);

        $generationContext = $this->resolveGeneratedDocumentContext($request, (int) $applicationScope->site_id);

        // Etape 1: Réserver le code et l'ID du document en base de données
        $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
            'site_id' => (int) $applicationScope->site_id,
            'process_id' => $generationContext['process_id'],
            'process_code' => $generationContext['process_code'],
            'process_name' => $generationContext['process_name'],
            'document_kind' => 'application_scope',
            'source_type' => 'application_scope',
            'source_id' => $applicationScope->id,
            'source_updated_at' => $applicationScope->updated_at?->toISOString(),
            'title' => 'Domaine d’application - ' . ($applicationScope->site->name ?? 'Site'),
            'description' => 'Document du domaine d’application généré automatiquement.',
            'created_by' => $request->user()?->id,
            'type' => $generationContext['type'],
            'force_new' => true,
            'metadata' => $generationContext['metadata'],
        ]);

        // Etape 2: Générer le fichier PDF avec le branding et le code calculé
        $enterprise = $applicationScope->site?->enterprise;
        if (!$enterprise) {
            return response()->json(['message' => 'Entreprise introuvable'], 404);
        }

        $htmlContent = view('pdf.application-scope', [
            'scope' => $applicationScope,
            'document' => $document,
        ])->render();

        $pdfContent = app(\App\Services\PdfGeneratorService::class)->generateDocument(
            $enterprise,
            'application_scope',
            [
                'document_id' => $document->id,
                'title' => $document->title,
                'code' => $document->code,
                'version' => $document->version ?? '1.0',
                'html' => $htmlContent,
            ],
            ['is_draft' => true]
        );

        $tempDir = storage_path('app/temp');
        if (!is_dir($tempDir)) {
            mkdir($tempDir, 0775, true);
        }
        $filePath = $tempDir . DIRECTORY_SEPARATOR . 'Domaine_Application_' . $applicationScope->id . '_' . time() . '.pdf';
        file_put_contents($filePath, $pdfContent);

        // Etape 3: Mettre à jour le document avec le fichier physique
        $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
            'document_id' => $document->id,
            'site_id' => (int) $applicationScope->site_id,
            'process_id' => $generationContext['process_id'],
            'process_code' => $generationContext['process_code'],
            'process_name' => $generationContext['process_name'],
            'document_kind' => 'application_scope',
            'source_type' => 'application_scope',
            'source_id' => $applicationScope->id,
            'source_updated_at' => $applicationScope->updated_at?->toISOString(),
            'title' => $document->title,
            'description' => 'Document du domaine d’application généré automatiquement.',
            'file_source_path' => $filePath,
            'created_by' => $request->user()?->id,
            'type' => $generationContext['type'],
            'force_new' => true,
            'store_file' => true,
            'metadata' => $generationContext['metadata'],
        ]);

        return (new DocumentResource($document->load(['site', 'process', 'author'])))->response();
    }

    private function validateExclusionJustifications(
        array $validated,
        ?ApplicationScope $scope = null,
    ): void {
        $data = array_merge($scope?->attributesToArray() ?? [], $validated);
        $errors = [];

        $scopeExclusions = trim((string) ($data['scope_exclusions'] ?? $data['exclusions'] ?? ''));
        if ($scopeExclusions !== '' && trim((string) ($data['exclusions_justification'] ?? '')) === '') {
            $errors['exclusions_justification'][] =
                'Justifiez les exclusions du périmètre avant de les enregistrer.';
        }

        $isoExclusions = trim((string) ($data['iso_exclusions'] ?? ''));
        if ($isoExclusions !== '' && trim((string) ($data['iso_exclusions_justification'] ?? '')) === '') {
            $errors['iso_exclusions_justification'][] =
                'Justifiez les exclusions normatives avant de les enregistrer.';
        }

        $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $normExclusions = $data['norm_exclusions'] ?? $metadata['norm_exclusions'] ?? [];
        $normJustifications = $data['norm_exclusions_justifications']
            ?? $metadata['norm_exclusions_justifications']
            ?? [];
        if (is_array($normExclusions) && is_array($normJustifications)) {
            foreach ($normExclusions as $norm => $chapters) {
                $hasExclusion = is_array($chapters)
                    ? array_filter($chapters, fn ($chapter) => trim((string) $chapter) !== '') !== []
                    : trim((string) $chapters) !== '';
                if ($hasExclusion && trim((string) ($normJustifications[$norm] ?? '')) === '') {
                    $errors["norm_exclusions_justifications.{$norm}"][] =
                        'Justifiez chaque exclusion de clause par norme.';
                }
            }
        }

        $operationalExclusion = false;
        if (is_array($normExclusions)) {
            foreach ($normExclusions as $chapters) {
                $items = is_array($chapters) ? $chapters : [$chapters];
                foreach ($items as $chapter) {
                    if (preg_match('/^8(?:\.\d+)*$/', trim((string) $chapter))) {
                        $operationalExclusion = true;
                        break 2;
                    }
                }
            }
        }
        if (
            !$operationalExclusion &&
            preg_match('/(?:^|[^0-9])8(?:\.\d+)*(?:$|[^0-9])/', (string) ($data['iso_exclusions'] ?? ''))
        ) {
            $operationalExclusion = true;
        }

        $impactAssessment = is_array($metadata['scope_impact_assessment'] ?? null)
            ? $metadata['scope_impact_assessment']
            : [];
        if (
            $operationalExclusion &&
            (bool) ($data['is_current'] ?? false) &&
            (
                !($impactAssessment['reviewed'] ?? false) ||
                mb_strlen(trim((string) ($impactAssessment['rationale'] ?? ''))) < 20
            )
        ) {
            $errors['metadata.scope_impact_assessment'][] =
                'Évaluez et justifiez l’impact des exclusions de l’article 8 sur la conformité des produits/services et la satisfaction client avant publication.';
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function normalizeNormExclusionsStorage(array $validated, ?ApplicationScope $scope = null): array
    {
        $hasNormExclusionsColumn = Schema::hasColumn('application_scopes', 'norm_exclusions');
        $hasNormExclusionsJustificationsColumn = Schema::hasColumn('application_scopes', 'norm_exclusions_justifications');

        if ($hasNormExclusionsColumn && $hasNormExclusionsJustificationsColumn) {
            return $validated;
        }

        $metadata = $validated['metadata'] ?? ($scope?->metadata ?? []) ?? [];
        if (!is_array($metadata)) {
            $metadata = [];
        }

        if (array_key_exists('norm_exclusions', $validated)) {
            $metadata['norm_exclusions'] = $validated['norm_exclusions'];
            unset($validated['norm_exclusions']);
        }

        if (array_key_exists('norm_exclusions_justifications', $validated)) {
            $metadata['norm_exclusions_justifications'] = $validated['norm_exclusions_justifications'];
            unset($validated['norm_exclusions_justifications']);
        }

        $validated['metadata'] = $metadata;

        return $validated;
    }

    private function syncProcessesToGlobal(ApplicationScope $scope): void
    {
        $processes = $scope->processes ?? [];
        if (!is_array($processes) || empty($processes)) return;

        $processService = app(ProcessService::class);
        $userId = request()->user()?->id;
        if (!$userId) return;

        $existingByName = Process::query()
            ->where('site_id', $scope->site_id)
            ->get()
            ->mapWithKeys(function (Process $process) {
                $key = $this->normalizeProcessName((string) $process->title);
                return $key !== '' ? [$key => $process] : [];
            });

        $syncedProcesses = [];

        foreach ($processes as $proc) {
            $proc = is_array($proc) ? $proc : [];
            $processName = isset($proc['name']) ? trim((string) $proc['name']) : '';
            if ($processName === '') continue;

            // Define mapping from scope type to process category
            $categoryMap = [
                'Support' => 'support',
                'support' => 'support',
                'Réalisation' => 'operationnel',
                'realization' => 'operationnel',
                'realisation' => 'operationnel',
                'operationnel' => 'operationnel',
                'Management' => 'pilotage',
                'management' => 'pilotage',
                'Pilotage' => 'pilotage',
                'pilotage' => 'pilotage',
                'Direction' => 'pilotage',
                'direction' => 'pilotage',
            ];
            $category = $categoryMap[$proc['type'] ?? ''] ?? 'operationnel';

            $existingProcess = $existingByName->get($this->normalizeProcessName($processName));
            $syncedProcess = $existingProcess;

            $computedAbbreviation = $proc['abbreviation'] ?? null;
            if (empty($computedAbbreviation)) {
                $cleanTitle = preg_replace('/[^A-Za-z0-9\s]/', '', \Illuminate\Support\Str::ascii($processName));
                $words = array_values(array_filter(explode(' ', strtoupper($cleanTitle))));

                if (count($words) >= 3) {
                    $computedAbbreviation = substr($words[0], 0, 1) . substr($words[1], 0, 1) . substr($words[2], 0, 1);
                } elseif (count($words) === 2) {
                    $computedAbbreviation = substr($words[0], 0, 2) . substr($words[1], 0, 1);
                } else {
                    $computedAbbreviation = substr(str_replace(' ', '', strtoupper($cleanTitle)), 0, 3);
                }
            }
            if (empty($computedAbbreviation)) {
                $computedAbbreviation = 'OPE';
            }

            if (!$existingProcess) {
                try {
                    $syncedProcess = $processService->createProcess([
                        'enterprise_id' => $scope->enterprise_id ?: Site::where('id', $scope->site_id)->value('enterprise_id'),
                        'site_id' => $scope->site_id,
                        'title' => $processName,
                        'abbreviation' => strtoupper($computedAbbreviation),
                        'category' => $category,
                        'pilot_id' => $userId,
                        'status' => 'draft',
                        'purpose' => 'Processus créé depuis le domaine d\'application',
                    ], $userId);
                } catch (\Exception $e) {
                    Log::error('Failed to sync process from scope', [
                        'process_name' => $processName,
                        'error' => $e->getMessage()
                    ]);
                }
            } else {
                // Update existing process basic info
                $dirty = false;
                if ($existingProcess->category !== $category) {
                    $existingProcess->category = $category;
                    $dirty = true;
                }
                
                $newAbbrev = strtoupper($computedAbbreviation);
                if ($newAbbrev !== null && $existingProcess->abbreviation !== $newAbbrev) {
                    $existingProcess->abbreviation = $newAbbrev;
                    $dirty = true;
                }

                if ($dirty) {
                    try {
                        $existingProcess->save();
                    } catch (\Exception $e) {
                        Log::error('Failed to update synced process from scope', [
                            'process_id' => $existingProcess->id,
                            'error' => $e->getMessage()
                        ]);
                    }
                }
            }

            if ($syncedProcess) {
                $syncedProcesses[] = [
                    ...$proc,
                    'id' => (int) $syncedProcess->id,
                    'code' => $syncedProcess->code,
                    'abbreviation' => $syncedProcess->abbreviation ?? ($proc['abbreviation'] ?? null),
                ];
            } else {
                $syncedProcesses[] = $proc;
            }
        }

        if (!empty($syncedProcesses)) {
            $scope->forceFill(['processes' => $syncedProcesses])->saveQuietly();
        }
    }

    private function normalizeProcessName(string $value): string
    {
        $normalized = preg_replace('/\s+/', ' ', trim(mb_strtolower($value)));
        return is_string($normalized) ? $normalized : '';
    }
}
