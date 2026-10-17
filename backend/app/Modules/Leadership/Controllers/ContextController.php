<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Http\Controllers\Api\Concerns\ResolvesGeneratedDocumentContext;
use App\Http\Resources\ContextResource;
use App\Http\Resources\DocumentResource;
use App\Models\Context;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ContextController extends Controller
{
    use AuthorizesSiteAccess;
    use ResolvesGeneratedDocumentContext;

    public function index(Request $request)
    {
        $query = Context::with('site');
        $this->scopeToUserSites($request, $query);

        // Filter by type (internal, external, swot, pestel, swot_pestel)
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // Filter by year
        if ($request->filled('year')) {
            $query->where('year', $request->year);
        }

        // Filter by site_id
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->site_id);
        }

        // Latest first so list()[0] is the current record (single-record
        // SWOT/PESTEL usage, same as ContextDocxGenerator::latest()).
        $contexts = $query->orderByDesc('updated_at')->orderByDesc('id')->paginate(20);
        return ContextResource::collection($contexts);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'site_id' => 'required|exists:sites,id',
            'type' => 'nullable|string|max:50',
            // Aligné sur la contrainte DB contexts_category_check (sinon 500 SQLSTATE 23514).
            'category' => 'nullable|in:economic,social,technological,environmental,legal,political,organizational,other',
            'description' => 'nullable|string',
            'impact' => 'nullable|in:positive,negative,neutral',
            'analysis' => 'nullable|string',
            'title' => 'nullable|string|max:255',
            'year' => 'nullable|integer',
            // SWOT fields
            'swot_strengths' => 'nullable|string',
            'swot_weaknesses' => 'nullable|string',
            'swot_opportunities' => 'nullable|string',
            'swot_threats' => 'nullable|string',
            // PESTEL fields
            'pestel_political' => 'nullable|string',
            'pestel_economic' => 'nullable|string',
            'pestel_social' => 'nullable|string',
            'pestel_technological' => 'nullable|string',
            'pestel_environmental' => 'nullable|string',
            'pestel_legal' => 'nullable|string',
        ]);

        $validated = array_merge($validated, $request->validate([
            'review_frequency_months' => 'nullable|integer|between:1,60',
        ]));
        $this->assertSiteAccess($request, (int) $validated['site_id']);

        if (($validated['type'] ?? null) === 'swot_pestel') {
            $this->validateClimateAssessments($validated);
        }

        // Ajouter valeurs par défaut pour champs NOT NULL
        if (!isset($validated['category'])) {
            $validated['category'] = 'other';
        }
        if (!isset($validated['description'])) {
            $validated['description'] = $validated['title'] ?? 'Analyse de contexte';
        }
        if (!empty($validated['review_frequency_months'])) {
            $validated['next_review_at'] = now()
                ->addMonths((int) $validated['review_frequency_months'])
                ->toDateString();
        }

        $context = Context::create($validated);
        return new ContextResource($context->load('site'));
    }

    public function show(Context $context)
    {
        $this->assertSiteAccess(request(), (int) $context->site_id);

        return new ContextResource($context->load('site'));
    }

    public function update(Request $request, Context $context)
    {
        $this->assertSiteAccess($request, (int) $context->site_id);

        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'type' => 'nullable|string|max:50',
            // Aligné sur la contrainte DB contexts_category_check (sinon 500 SQLSTATE 23514).
            'category' => 'nullable|in:economic,social,technological,environmental,legal,political,organizational,other',
            'description' => 'nullable|string',
            'impact' => 'nullable|in:positive,negative,neutral',
            'analysis' => 'nullable|string',
            'title' => 'nullable|string|max:255',
            'year' => 'nullable|integer',
            // SWOT fields
            'swot_strengths' => 'nullable|string',
            'swot_weaknesses' => 'nullable|string',
            'swot_opportunities' => 'nullable|string',
            'swot_threats' => 'nullable|string',
            // PESTEL fields
            'pestel_political' => 'nullable|string',
            'pestel_economic' => 'nullable|string',
            'pestel_social' => 'nullable|string',
            'pestel_technological' => 'nullable|string',
            'pestel_environmental' => 'nullable|string',
            'pestel_legal' => 'nullable|string',
        ]);

        $validated = array_merge($validated, $request->validate([
            'review_frequency_months' => 'sometimes|nullable|integer|between:1,60',
        ]));
        if (array_key_exists('site_id', $validated)) {
            $this->assertSiteAccess($request, (int) $validated['site_id']);
        }

        $effectiveType = $validated['type'] ?? $context->type;
        $hasSwotPayload = array_key_exists('swot_weaknesses', $validated)
            || array_key_exists('swot_opportunities', $validated);
        if ($effectiveType === 'swot_pestel' && ($hasSwotPayload || $effectiveType !== $context->type)) {
            $this->validateClimateAssessments(array_merge([
                'swot_weaknesses' => $context->swot_weaknesses,
                'swot_opportunities' => $context->swot_opportunities,
            ], $validated));
        }

        if (
            array_key_exists('review_frequency_months', $validated)
            && (int) ($validated['review_frequency_months'] ?? 0)
                !== (int) ($context->review_frequency_months ?? 0)
        ) {
            $validated['next_review_at'] = $validated['review_frequency_months']
                ? now()->addMonths((int) $validated['review_frequency_months'])->toDateString()
                : null;
        }

        $context->update($validated);
        return new ContextResource($context->load('site'));
    }

    /**
     * Ensure every non-empty SWOT/PESTEL issue has a climate-relevance decision.
     * A negative decision must include its documented rationale.
     */
    private function validateClimateAssessments(array $validated): void
    {
        $errors = [];

        foreach (['swot_weaknesses', 'swot_opportunities'] as $field) {
            if (!isset($validated[$field])) {
                $errors[$field][] = 'Ce champ est requis pour enregistrer l’analyse du contexte.';
                continue;
            }

            $criteria = json_decode($validated[$field]);
            if (!$criteria instanceof \stdClass) {
                $errors[$field][] = 'Le contenu doit être un objet JSON de critères SWOT/PESTEL.';
                continue;
            }

            foreach ($criteria as $criterion => $polarities) {
                if (!$polarities instanceof \stdClass) {
                    $errors["{$field}.{$criterion}"][] = 'Le critère doit contenir ses listes d’enjeux.';
                    continue;
                }

                foreach (['favorable', 'unfavorable'] as $polarity) {
                    $issues = $polarities->{$polarity} ?? null;
                    $listKey = "{$field}.{$criterion}.{$polarity}";
                    if (!is_array($issues)) {
                        $errors[$listKey][] = 'La liste d’enjeux doit être un tableau.';
                        continue;
                    }

                    foreach ($issues as $index => $issue) {
                        $issueKey = "{$listKey}.{$index}";
                        if (!$issue instanceof \stdClass || !is_string($issue->text ?? null)) {
                            $errors[$issueKey][] = 'Chaque enjeu doit être un objet avec un texte.';
                            continue;
                        }

                        if (trim($issue->text) === '') {
                            continue;
                        }

                        if (!is_bool($issue->climate_change_relevant ?? null)) {
                            $errors["{$issueKey}.climate_change_relevant"][] =
                                'Indiquez si le changement climatique est pertinent pour cet enjeu.';
                            continue;
                        }

                        if ($issue->climate_change_relevant === false
                            && trim(is_string($issue->climate_change_rationale ?? null)
                                ? $issue->climate_change_rationale
                                : '') === '') {
                            $errors["{$issueKey}.climate_change_rationale"][] =
                                'Justifiez pourquoi le changement climatique n’est pas pertinent.';
                        }
                    }
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    public function destroy(Context $context)
    {
        $this->assertSiteAccess(request(), (int) $context->site_id);

        $context->delete();
        return response()->json(null, 204);
    }

    /**
     * Export Context as DOCX
     */
    public function exportDocx(Request $request)
    {
        try {
            $siteId = $request->get('site_id');
            if (!$siteId) {
                return response()->json(['message' => 'site_id requis'], 400);
            }
            $siteId = (int) $siteId;
            $this->assertSiteAccess($request, $siteId);
            $generationContext = $this->resolveGeneratedDocumentContext($request, $siteId);

            $generator = new \App\Services\Docx\ContextDocxGenerator();
            $filePath = $generator->generate($siteId);
            
            $site = \App\Models\Site::find($siteId);
            $sourceUpdatedAt = \App\Models\Context::query()
                ->where('site_id', (int) $siteId)
                ->max('updated_at');

            $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                'site_id' => $siteId,
                'process_id' => $generationContext['process_id'],
                'process_code' => $generationContext['process_code'],
                'process_name' => $generationContext['process_name'],
                'document_kind' => 'context',
                'source_type' => 'context',
                'source_id' => (int) $siteId,
                'source_updated_at' => $sourceUpdatedAt,
                'title' => 'Contexte de l’organisme - ' . ($site->name ?? 'Site'),
                'description' => 'Document de contexte généré automatiquement.',
                'file_source_path' => $filePath,
                'created_by' => request()->user()?->id,
                'type' => $generationContext['type'],
                'force_new' => true,
                'metadata' => $generationContext['metadata'],
            ]);

            $filename = 'Contexte_Organisme_' . ($site->name ?? 'Site') . '_' . now()->format('Y-m-d') . '.docx';
            
            return response()
                ->download($filePath, $filename)
                ->header('X-Generated-Document-Id', (string) $document->id)
                ->deleteFileAfterSend(true);
        } catch (
            \Illuminate\Http\Exceptions\HttpResponseException
            |\Illuminate\Validation\ValidationException
            |\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e
        ) {
            throw $e;
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Erreur lors de la génération du document',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Generate Context draft document (no download)
     */
    public function generateDraftDocx(Request $request)
    {
        $siteId = (int) $request->get('site_id');
        if ($siteId <= 0) {
            return response()->json(['message' => 'site_id requis'], 400);
        }
        $this->assertSiteAccess($request, $siteId);
        $generationContext = $this->resolveGeneratedDocumentContext($request, $siteId);

        $generator = new \App\Services\Docx\ContextDocxGenerator();
        $filePath = $generator->generate($siteId);

        $site = \App\Models\Site::find($siteId);
        $sourceUpdatedAt = \App\Models\Context::query()
            ->where('site_id', (int) $siteId)
            ->max('updated_at');

        $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
            'site_id' => $siteId,
            'process_id' => $generationContext['process_id'],
            'process_code' => $generationContext['process_code'],
            'process_name' => $generationContext['process_name'],
            'document_kind' => 'context',
            'source_type' => 'context',
            'source_id' => (int) $siteId,
            'source_updated_at' => $sourceUpdatedAt,
            'title' => 'Contexte de l’organisme - ' . ($site->name ?? 'Site'),
            'description' => 'Document de contexte généré automatiquement.',
            'file_source_path' => $filePath,
            'created_by' => request()->user()?->id,
            'type' => $generationContext['type'],
            'force_new' => true,
            'store_file' => true,
            'metadata' => $generationContext['metadata'],
        ]);

        return (new DocumentResource($document->load(['site', 'process', 'author'])))->response();
    }
}
