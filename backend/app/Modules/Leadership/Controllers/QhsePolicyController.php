<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\ResolvesGeneratedDocumentContext;
use App\Http\Resources\DocumentResource;
use App\Modules\Enterprise\Models\Site;
use App\Modules\Enterprise\Models\User;
use App\Modules\Support\Models\Document;
use App\Modules\Leadership\Models\QhsePolicyAcknowledgement;
use App\Modules\Leadership\Models\QhsePolicy;
use Illuminate\Http\Request;
use Barryvdh\DomPDF\Facade\Pdf;
use App\Notifications\PolicyCreatedNotification;
use App\Notifications\QhsePolicyPublishedNotification;
use App\Services\DocumentBrandingService;
use App\Modules\Support\Services\DocumentSyncService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QhsePolicyController extends Controller
{
    use ResolvesGeneratedDocumentContext;

    private const LEADERSHIP_REVIEW_ITEM_IDS = [
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
    ];

    private const CUSTOMER_ORIENTATION_REVIEW_ITEM_IDS = [
        'requirements', 'risk_opportunity', 'satisfaction',
    ];

    public function __construct()
    {
        $read = 'permission:leadership.politique.read'
            . '|leadership.manage'
            . '|leadership.politique.read'
            . '|leadership.politique.manage';

        $create = 'permission:leadership.politique.create'
            . '|leadership.manage'
            . '|leadership.politique.create'
            . '|leadership.politique.manage';

        $update = 'permission:leadership.politique.update'
            . '|leadership.manage'
            . '|leadership.politique.update'
            . '|leadership.politique.manage';

        $delete = 'permission:leadership.politique.delete'
            . '|leadership.manage'
            . '|leadership.politique.delete'
            . '|leadership.politique.manage';

        $manage = 'permission:leadership.politique.validate'
            . '|leadership.politique.manage';

        $this->middleware($read)->only(['index', 'current', 'history', 'acknowledgements', 'exportPdf', 'exportDocx']);
        $this->middleware($create)->only(['store']);
        $this->middleware($update)->only(['update']);
        $this->middleware($delete)->only(['destroy']);
        $this->middleware($manage)->only(['validate', 'submitForReview']);
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $policies = QhsePolicy::where('enterprise_id', $user->enterprise_id)
            ->when($request->filled('site_id'), fn ($query) => $query->where('site_id', (int) $request->integer('site_id')))
            ->orderBy('is_current', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($policies->map(fn (QhsePolicy $policy) => $this->serializePolicy($policy)));
    }

    public function current(Request $request)
    {
        $user = $request->user();

        $query = QhsePolicy::where('enterprise_id', $user->enterprise_id)
            ->when($request->filled('site_id'), fn ($query) => $query->where('site_id', (int) $request->integer('site_id')));
        $current = (clone $query)->where('is_current', true)->first();
        $draft = (clone $query)
            ->whereIn('status', ['draft', 'en_revision'])
            ->orderByDesc('updated_at')
            ->first();
        $policy = $draft && (!$current || $draft->created_at >= $current->updated_at)
            ? $draft
            : ($current ?? $draft);

        return response()->json($this->serializePolicy($policy));
    }

    public function published(Request $request)
    {
        $user = $request->user();
        $siteId = (int) ($request->integer('site_id') ?: $user->site_id);
        if ($siteId <= 0 || (int) $user->site_id !== $siteId) {
            abort(403);
        }

        $policy = QhsePolicy::query()
            ->where('enterprise_id', $user->enterprise_id)
            ->where('site_id', $siteId)
            ->where('is_current', true)
            ->where('status', 'validated')
            ->first();
        if (!$policy) {
            return response()->json([
                'policy' => null,
                'acknowledgement' => null,
                'quiz' => [],
            ]);
        }

        $this->synchronizePolicyRecipients($policy, false);
        $acknowledgement = QhsePolicyAcknowledgement::query()
            ->where('qhse_policy_id', $policy->id)
            ->where('user_id', $user->id)
            ->first();

        return response()->json([
            'policy' => $this->serializePolicy($policy),
            'acknowledgement' => $this->serializeAcknowledgement($acknowledgement),
            'quiz' => array_map(
                fn (array $question) => array_diff_key($question, ['correct_answer' => true]),
                $this->policyQuizQuestions($policy),
            ),
        ]);
    }

    public function acknowledgements(Request $request, QhsePolicy $qhsePolicy)
    {
        if ((int) $qhsePolicy->enterprise_id !== (int) $request->user()->enterprise_id) {
            abort(403);
        }
        if ($qhsePolicy->status !== 'validated' || !$qhsePolicy->is_current) {
            return response()->json([
                'message' => 'Le suivi de diffusion est disponible uniquement pour la politique publiée courante.',
            ], 422);
        }
        $this->synchronizePolicyRecipients($qhsePolicy, false);

        $items = QhsePolicyAcknowledgement::query()
            ->with('user:id,name,email')
            ->where('qhse_policy_id', $qhsePolicy->id)
            ->orderBy('user_id')
            ->get();

        return response()->json([
            'policy_id' => $qhsePolicy->id,
            'total' => $items->count(),
            'acknowledged' => $items->filter(fn (QhsePolicyAcknowledgement $item) => $item->acknowledged_at !== null)->count(),
            'quiz_passed' => $items->where('quiz_passed', true)->count(),
            'items' => $items->map(fn (QhsePolicyAcknowledgement $item) => [
                ...$this->serializeAcknowledgement($item),
                'user' => [
                    'id' => $item->user?->id,
                    'name' => $item->user?->name,
                    'email' => $item->user?->email,
                ],
            ])->values(),
        ]);
    }

    public function acknowledge(Request $request, QhsePolicy $qhsePolicy)
    {
        $user = $request->user();
        $this->ensurePublishedPolicyForUser($qhsePolicy, $user);

        $validated = $request->validate([
            'answers' => 'required|array|size:3',
            'answers.mission' => 'required|string|max:2000',
            'answers.quality_policy' => 'required|string|max:2000',
            'answers.commitment' => 'required|string|max:2000',
        ]);
        $questions = collect($this->policyQuizQuestions($qhsePolicy))->keyBy('id');
        $answers = $validated['answers'];
        $correct = 0;
        foreach (['mission', 'quality_policy', 'commitment'] as $questionId) {
            if (
                isset($questions[$questionId]['correct_answer']) &&
                hash_equals((string) $questions[$questionId]['correct_answer'], (string) $answers[$questionId])
            ) {
                $correct++;
            }
        }
        $score = (int) round(($correct / 3) * 100);
        $passed = $correct === 3;

        $acknowledgement = QhsePolicyAcknowledgement::query()->firstOrCreate(
            ['qhse_policy_id' => $qhsePolicy->id, 'user_id' => $user->id],
            ['notified_at' => now()],
        );
        $acknowledgement->update([
            'quiz_answers' => $answers,
            'quiz_score' => $score,
            'quiz_passed' => $passed,
            'quiz_completed_at' => now(),
            'acknowledged_at' => $passed
                ? ($acknowledgement->acknowledged_at ?? now())
                : null,
        ]);

        return response()->json([
            ...$this->serializeAcknowledgement($acknowledgement->fresh()),
            'message' => $passed
                ? 'Lecture confirmée et quiz réussi.'
                : 'Quiz non réussi. Relisez la politique et réessayez.',
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'site_id' => [
                'nullable',
                Rule::exists('sites', 'id')->where(fn ($query) => $query->where('enterprise_id', $user->enterprise_id)),
            ],
            'mission' => 'required|string',
            'vision' => 'nullable|string',
            'values' => 'nullable|array',
            'values.*' => 'string',
            'axes' => 'nullable|array',
            'axes.*' => 'string',
            'commitments' => 'nullable|array',
            'commitments.*' => 'string',
            'quality_policy' => 'nullable|string',
            'environmental_policy' => 'nullable|string',
            'health_safety_policy' => 'nullable|string',
            'ethics_charter' => 'nullable|string|max:10000',
            'leadership_reviews' => 'nullable|array|max:20',
            'leadership_reviews.*.period_year' => 'required|integer|min:2000|max:2100',
            'leadership_reviews.*.reviewed_at' => 'nullable|date',
            'leadership_reviews.*.items' => 'required|array',
            'leadership_reviews.*.items.*.status' => 'nullable|in:demontre,ecart,non_applicable',
            'leadership_reviews.*.items.*.rationale' => 'nullable|string|max:2000',
            'leadership_reviews.*.items.*.evidence' => 'nullable|string|max:2000',
            'customer_orientation_reviews' => 'nullable|array|max:20',
            'customer_orientation_reviews.*.period_year' => 'required|integer|min:2000|max:2100',
            'customer_orientation_reviews.*.reviewed_at' => 'nullable|date',
            'customer_orientation_reviews.*.items' => 'required|array',
            'customer_orientation_reviews.*.items.*.status' => 'nullable|in:demontre,ecart,non_applicable',
            'customer_orientation_reviews.*.items.*.rationale' => 'nullable|string|max:2000',
            'customer_orientation_reviews.*.items.*.evidence' => 'nullable|string|max:4000',
            'effective_date' => 'nullable|date',
        ]);
        $this->normalizeLeadershipReviews($validated, $request);
        $this->normalizeCustomerOrientationReviews($validated, $request);

        $siteId = (int) ($validated['site_id'] ?? $user->site_id);
        if (
            $siteId <= 0 ||
            !Site::query()
                ->whereKey($siteId)
                ->where('enterprise_id', $user->enterprise_id)
                ->exists()
        ) {
            return response()->json([
                'message' => 'Un site de l’entreprise doit être sélectionné pour créer la politique.',
            ], 422);
        }
        unset($validated['site_id']);
        $axes = $this->normalizeAxes($validated['axes'] ?? []);
        unset($validated['axes']);

        $policy = DB::transaction(function () use ($validated, $user, $siteId, $axes) {
            Site::query()->whereKey($siteId)->lockForUpdate()->firstOrFail();

            $policy = QhsePolicy::create([
                ...$validated,
                'enterprise_id' => $user->enterprise_id,
                'site_id' => $siteId,
                'is_current' => false,
                'status' => 'draft',
                'version' => $this->getNextVersion($user->enterprise_id, $siteId),
                'created_by' => $user->id,
            ]);

            if ($this->hasPolicyAxesTable()) {
                $policy->syncAxes($axes);
                $policy->load('axisEntries');
            }

            return $policy;
        });

        $user->notify(new PolicyCreatedNotification($policy));
        app(DocumentSyncService::class)->syncPolicy($policy, $user->id ?? null);

        return response()->json($this->serializePolicy($policy), 201);
    }

    public function update(Request $request, QhsePolicy $qhsePolicy)
    {
        $user = $request->user();
        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        $validated = $request->validate([
            'site_id' => [
                'nullable',
                Rule::exists('sites', 'id')->where(fn ($query) => $query->where('enterprise_id', $user->enterprise_id)),
            ],
            'mission' => 'sometimes|string',
            'vision' => 'nullable|string',
            'values' => 'nullable|array',
            'values.*' => 'string',
            'axes' => 'nullable|array',
            'axes.*' => 'string',
            'commitments' => 'nullable|array',
            'commitments.*' => 'string',
            'quality_policy' => 'nullable|string',
            'environmental_policy' => 'nullable|string',
            'health_safety_policy' => 'nullable|string',
            'ethics_charter' => 'nullable|string|max:10000',
            'leadership_reviews' => 'sometimes|nullable|array|max:20',
            'leadership_reviews.*.period_year' => 'required|integer|min:2000|max:2100',
            'leadership_reviews.*.reviewed_at' => 'nullable|date',
            'leadership_reviews.*.items' => 'required|array',
            'leadership_reviews.*.items.*.status' => 'nullable|in:demontre,ecart,non_applicable',
            'leadership_reviews.*.items.*.rationale' => 'nullable|string|max:2000',
            'leadership_reviews.*.items.*.evidence' => 'nullable|string|max:2000',
            'customer_orientation_reviews' => 'sometimes|nullable|array|max:20',
            'customer_orientation_reviews.*.period_year' => 'required|integer|min:2000|max:2100',
            'customer_orientation_reviews.*.reviewed_at' => 'nullable|date',
            'customer_orientation_reviews.*.items' => 'required|array',
            'customer_orientation_reviews.*.items.*.status' => 'nullable|in:demontre,ecart,non_applicable',
            'customer_orientation_reviews.*.items.*.rationale' => 'nullable|string|max:2000',
            'customer_orientation_reviews.*.items.*.evidence' => 'nullable|string|max:4000',
            'effective_date' => 'nullable|date',
            'status' => 'sometimes|in:draft,en_revision',
        ]);
        $this->normalizeLeadershipReviews($validated, $request, $qhsePolicy);
        $this->normalizeCustomerOrientationReviews($validated, $request, $qhsePolicy);
        $axes = null;
        if (array_key_exists('axes', $validated)) {
            $axes = $this->normalizeAxes($validated['axes'] ?? []);
            $validated['axes'] = $axes;
        }
        if (
            array_key_exists('site_id', $validated) &&
            (int) $validated['site_id'] !== (int) $qhsePolicy->site_id
        ) {
            abort(422, 'Une politique ne peut pas être déplacée vers un autre site.');
        }
        unset($validated['site_id']);

        $freshPolicy = DB::transaction(function () use ($qhsePolicy, $validated, $axes, $user) {
            $policy = QhsePolicy::query()->whereKey($qhsePolicy->id)->lockForUpdate()->firstOrFail();
            if ((int) $policy->enterprise_id !== (int) $user->enterprise_id) {
                abort(403);
            }

            // Une politique validée est un enregistrement contrôlé : la première
            // modification crée un brouillon enfant, les sauvegardes suivantes
            // retrouvent ce brouillon au lieu de dupliquer les versions.
            if ($policy->status === 'validated' || $policy->is_current) {
                $draft = QhsePolicy::query()
                    ->where('based_on_policy_id', $policy->id)
                    ->lockForUpdate()
                    ->first();
                if (!$draft) {
                    $draft = $policy->replicate([
                        'validated_by_direction_at',
                        'validated_by_user_id',
                        'generated_at',
                        'document_path',
                    ]);
                    $draft->based_on_policy_id = $policy->id;
                    $draft->version = $this->incrementMinorVersion((string) $policy->version);
                    $draft->status = 'draft';
                    $draft->is_current = false;
                    $draft->created_by = $user->id;
                    $draft->updated_by = null;
                    $draft->save();
                    if ($this->hasPolicyAxesTable()) {
                        $draft->syncAxes($this->normalizeAxes($policy->axes ?? []));
                    }
                }
                $policy = $draft;
            }

            if ($policy->status === 'en_revision') {
                // Une modification après soumission annule la revue en cours :
                // le contenu modifié doit être resoumis avant validation.
                $policy->status = 'draft';
            }
            unset($validated['status']);
            $policy->fill($validated);
            $policy->updated_by = $user->id;
            $policy->save();

            if (is_array($axes) && $this->hasPolicyAxesTable()) {
                $policy->syncAxes($axes);
            }

            return $policy->fresh();
        });
        app(DocumentSyncService::class)->syncPolicy($freshPolicy, $user->id ?? null);

        return response()->json($this->serializePolicy($freshPolicy));
    }

    public function validate(Request $request, QhsePolicy $qhsePolicy)
    {
        $user = $request->user();
        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        if ($qhsePolicy->status !== 'en_revision') {
            return response()->json([
                'message' => 'La politique doit être en révision avant validation.',
            ], 422);
        }

        $qhsePolicy = DB::transaction(function () use ($qhsePolicy, $user) {
            $policy = QhsePolicy::query()
                ->whereKey($qhsePolicy->id)
                ->lockForUpdate()
                ->firstOrFail();
            if ((int) $policy->enterprise_id !== (int) $user->enterprise_id) {
                abort(403);
            }
            if ($policy->status !== 'en_revision') {
                abort(422, 'La politique doit être en révision avant validation.');
            }
            if (
                trim((string) $policy->mission) === '' ||
                trim((string) $policy->vision) === '' ||
                trim((string) $policy->quality_policy) === '' ||
                !$policy->effective_date
            ) {
                abort(422, 'La mission, la vision, le contenu qualité et la date d’effet sont obligatoires.');
            }
            if (count($this->policyQuizQuestions($policy)) !== 3) {
                abort(422, 'Mission, politique qualité et au moins un engagement distinct sont nécessaires pour le quiz de diffusion.');
            }

            Site::query()->whereKey($policy->site_id)->lockForUpdate()->firstOrFail();
            if ($policy->based_on_policy_id) {
                $basePolicy = QhsePolicy::query()
                    ->whereKey($policy->based_on_policy_id)
                    ->lockForUpdate()
                    ->first();
                if (
                    !$basePolicy ||
                    (int) $basePolicy->enterprise_id !== (int) $policy->enterprise_id ||
                    (int) $basePolicy->site_id !== (int) $policy->site_id ||
                    $basePolicy->status !== 'validated' ||
                    !$basePolicy->is_current
                ) {
                    abort(409, 'Cette révision est fondée sur une version qui n’est plus publiée. Créez un nouveau brouillon depuis la version courante.');
                }
            }
            QhsePolicy::query()
                ->where('enterprise_id', $policy->enterprise_id)
                ->where('site_id', $policy->site_id)
                ->where('is_current', true)
                ->where('id', '<>', $policy->id)
                ->update(['is_current' => false]);

            $policy->update([
                'status' => 'validated',
                'is_current' => true,
                'validated_by_direction_at' => now(),
                'validated_by_user_id' => $user->id,
                'updated_by' => $user->id,
            ]);

            return $policy->fresh();
        });
        app(DocumentSyncService::class)->syncPolicy($qhsePolicy->fresh(), $user->id ?? null);
        $this->distributePolicy($qhsePolicy);
        if ($this->hasPolicyAxesTable()) {
            $qhsePolicy->load('axisEntries');
        }

        return response()->json($this->serializePolicy($qhsePolicy));
    }

    public function submitForReview(Request $request, QhsePolicy $qhsePolicy)
    {
        $user = $request->user();
        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        if ($qhsePolicy->status === 'validated') {
            return response()->json([
                'message' => 'La politique est déjà validée.',
            ], 422);
        }

        $qhsePolicy = DB::transaction(function () use ($qhsePolicy, $user) {
            $policy = QhsePolicy::query()->whereKey($qhsePolicy->id)->lockForUpdate()->firstOrFail();
            if ((int) $policy->enterprise_id !== (int) $user->enterprise_id) {
                abort(403);
            }
            if ($policy->status === 'validated' || $policy->is_current) {
                abort(422, 'Créez un brouillon avant de soumettre une nouvelle version.');
            }
            if ($policy->status !== 'en_revision') {
                $policy->update([
                    'status' => 'en_revision',
                    'updated_by' => $user->id,
                ]);
            }

            return $policy->fresh();
        });

        app(DocumentSyncService::class)->syncPolicy($qhsePolicy, $user->id ?? null);

        return response()->json($this->serializePolicy($qhsePolicy));
    }

    public function destroy(Request $request, QhsePolicy $qhsePolicy)
    {
        if ((int) $qhsePolicy->enterprise_id !== (int) $request->user()->enterprise_id) {
            abort(403);
        }
        if ($qhsePolicy->is_current || $qhsePolicy->status === 'validated') {
            return response()->json([
                'message' => 'Une politique validée ne peut pas être supprimée.',
            ], 422);
        }

        $qhsePolicy->delete();

        return response()->noContent();
    }

    public function exportPdf(QhsePolicy $qhsePolicy)
    {
        $request = request();
        $user = $request->user();

        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        $enterprise = $qhsePolicy->site?->enterprise ?? $user?->enterprise;
        $branding = $enterprise
            ? app(DocumentBrandingService::class)->getPdfBranding($enterprise, 'qhse_policy', $qhsePolicy->id)
            : null;

        $pdf = Pdf::loadView('pdf.qhse-policy', [
            'policy' => $qhsePolicy,
            'branding' => $branding,
        ]);
        $filename = 'politique_qhse_v'.$qhsePolicy->version.'.pdf';
        $tempPath = Storage::disk('local')->path('exports/' . $filename);
        if (!is_dir(dirname($tempPath))) {
            mkdir(dirname($tempPath), 0775, true);
        }
        $pdf->save($tempPath);

        $siteId = (int) ($qhsePolicy->site_id ?? 0);
        if ($siteId <= 0) {
            $siteId = (int) \App\Models\Site::query()
                ->where('enterprise_id', (int) $qhsePolicy->enterprise_id)
                ->orderBy('id')
                ->value('id');
        }
        if ($siteId <= 0) {
            return response()->json(['message' => 'Aucun site disponible pour générer le document.'], 422);
        }
        $generationContext = $this->resolveGeneratedDocumentContext($request, $siteId);
        $document = null;
        if ($siteId > 0) {
            try {
                $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                    'site_id' => $siteId,
                    'process_id' => $generationContext['process_id'],
                    'process_code' => $generationContext['process_code'],
                    'process_name' => $generationContext['process_name'],
                    'document_kind' => 'qhse_policy_pdf',
                    'source_type' => 'qhse_policy',
                    'source_id' => $qhsePolicy->id,
                    'source_updated_at' => $qhsePolicy->updated_at?->toISOString(),
                    'title' => 'Politique QHSE v' . ($qhsePolicy->version ?? '1.0'),
                    'description' => 'Version PDF de la politique QHSE générée automatiquement.',
                    'file_source_path' => $tempPath,
                    'file_extension' => 'pdf',
                    'created_by' => $user?->id,
                    'type' => $generationContext['type'],
                    'force_new' => true,
                    'metadata' => $generationContext['metadata'],
                ]);
            } catch (\Throwable $syncException) {
                Log::warning('QHSE policy PDF inventory sync skipped', [
                    'qhse_policy_id' => $qhsePolicy->id,
                    'error' => $syncException->getMessage(),
                ]);
            }
        }

        $response = response()->download($tempPath, $filename)->deleteFileAfterSend(true);
        if ($document) {
            $response->headers->set('X-Generated-Document-Id', (string) $document->id);
        }
        return $response;
    }

    public function exportDocx(QhsePolicy $qhsePolicy)
    {
        $request = request();
        $user = $request->user();

        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        $qhsePolicy->loadMissing(['enterprise', 'site.enterprise']);
        $path = app(\App\Services\Docx\QhsePolicyDocxGenerator::class)->generate($qhsePolicy);

        $siteId = (int) ($qhsePolicy->site_id ?? 0);
        if ($siteId <= 0) {
            $siteId = (int) \App\Models\Site::query()
                ->where('enterprise_id', (int) $qhsePolicy->enterprise_id)
                ->orderBy('id')
                ->value('id');
        }
        if ($siteId <= 0) {
            return response()->json(['message' => 'Aucun site disponible pour générer le document.'], 422);
        }
        $generationContext = $this->resolveGeneratedDocumentContext($request, $siteId);
        $document = null;
        if ($siteId > 0) {
            try {
                $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
                    'site_id' => $siteId,
                    'process_id' => $generationContext['process_id'],
                    'process_code' => $generationContext['process_code'],
                    'process_name' => $generationContext['process_name'],
                    'document_kind' => 'qhse_policy_docx',
                    'source_type' => 'qhse_policy',
                    'source_id' => $qhsePolicy->id,
                    'source_updated_at' => $qhsePolicy->updated_at?->toISOString(),
                    'title' => 'Politique QHSE v' . ($qhsePolicy->version ?? '1.0'),
                    'description' => 'Version DOCX de la politique QHSE générée automatiquement.',
                    'file_source_path' => $path,
                    'created_by' => $user?->id,
                    'type' => $generationContext['type'],
                    'force_new' => true,
                    'metadata' => $generationContext['metadata'],
                ]);
            } catch (\Throwable $syncException) {
                Log::warning('QHSE policy DOCX inventory sync skipped', [
                    'qhse_policy_id' => $qhsePolicy->id,
                    'error' => $syncException->getMessage(),
                ]);
            }
        }

        $response = response()
            ->download($path, 'politique_qhse_v'.$qhsePolicy->version.'.docx')
            ->deleteFileAfterSend(true);
        if ($document) {
            $response->headers->set('X-Generated-Document-Id', (string) $document->id);
        }

        return $response;
    }

    public function generateDraftDocx(Request $request, QhsePolicy $qhsePolicy)
    {
        $user = $request->user();

        if ((int) $qhsePolicy->enterprise_id !== (int) $user->enterprise_id) {
            abort(403);
        }

        $qhsePolicy->loadMissing(['enterprise', 'site.enterprise']);
        $path = app(\App\Services\Docx\QhsePolicyDocxGenerator::class)->generate($qhsePolicy);

        $siteId = (int) ($qhsePolicy->site_id ?? 0);
        if ($siteId <= 0) {
            $siteId = (int) \App\Models\Site::query()
                ->where('enterprise_id', (int) $qhsePolicy->enterprise_id)
                ->orderBy('id')
                ->value('id');
        }
        if ($siteId <= 0) {
            return response()->json(['message' => 'Aucun site disponible pour générer le document.'], 422);
        }

        $generationContext = $this->resolveGeneratedDocumentContext($request, $siteId);
        $document = app(\App\Services\DocumentSyncService::class)->syncGeneratedProcessDocument([
            'site_id' => $siteId,
            'process_id' => $generationContext['process_id'],
            'process_code' => $generationContext['process_code'],
            'process_name' => $generationContext['process_name'],
            'document_kind' => 'qhse_policy_docx',
            'source_type' => 'qhse_policy',
            'source_id' => $qhsePolicy->id,
            'source_updated_at' => $qhsePolicy->updated_at?->toISOString(),
            'title' => 'Politique QHSE v' . ($qhsePolicy->version ?? '1.0'),
            'description' => 'Version DOCX de la politique QHSE générée automatiquement.',
            'file_source_path' => $path,
            'created_by' => $user?->id,
            'type' => $generationContext['type'],
            'force_new' => true,
            'store_file' => true,
            'metadata' => $generationContext['metadata'],
        ]);

        return (new DocumentResource($document->load(['site', 'process', 'author'])))->response();
    }

    public function history(Request $request)
    {
        $user = $request->user();

        $policies = QhsePolicy::where('enterprise_id', $user->enterprise_id)
            ->when($request->filled('site_id'), fn ($query) => $query->where('site_id', (int) $request->integer('site_id')))
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($policies->map(fn (QhsePolicy $policy) => $this->serializePolicy($policy)));
    }

    private function ensurePublishedPolicyForUser(QhsePolicy $policy, User $user): void
    {
        if (
            (int) $policy->enterprise_id !== (int) $user->enterprise_id ||
            (int) $policy->site_id !== (int) $user->site_id ||
            !$user->is_active
        ) {
            abort(403);
        }
        if ($policy->status !== 'validated' || !$policy->is_current) {
            abort(422, 'Seule la politique publiée courante peut être confirmée.');
        }
    }

    /**
     * Évalue le repérage des informations réellement publiées. Les réponses
     * attendues ne sont jamais exposées dans le payload destiné au navigateur.
     */
    private function policyQuizQuestions(QhsePolicy $policy): array
    {
        $mission = trim((string) $policy->mission);
        $qualityPolicy = trim((string) $policy->quality_policy);
        $commitment = collect(is_array($policy->commitments) ? $policy->commitments : [])
            ->map(fn ($value) => trim((string) $value))
            ->first(fn ($value) => $value !== '');
        $options = array_values(array_unique(array_filter(
            [$mission, $qualityPolicy, $commitment],
            fn ($value) => is_string($value) && $value !== '',
        )));
        if (count($options) !== 3) {
            return [];
        }

        return [
            [
                'id' => 'mission',
                'prompt' => 'Quel énoncé correspond à la mission publiée ?',
                'options' => $options,
                'correct_answer' => $mission,
            ],
            [
                'id' => 'quality_policy',
                'prompt' => 'Quel énoncé correspond à la politique qualité publiée ?',
                'options' => $options,
                'correct_answer' => $qualityPolicy,
            ],
            [
                'id' => 'commitment',
                'prompt' => 'Quel énoncé est un engagement publié de l’organisme ?',
                'options' => $options,
                'correct_answer' => (string) $commitment,
            ],
        ];
    }

    private function serializeAcknowledgement(?QhsePolicyAcknowledgement $acknowledgement): ?array
    {
        if (!$acknowledgement) {
            return null;
        }

        return [
            'id' => $acknowledgement->id,
            'user_id' => $acknowledgement->user_id,
            'notified_at' => $acknowledgement->notified_at?->toISOString(),
            'acknowledged_at' => $acknowledgement->acknowledged_at?->toISOString(),
            'quiz_score' => $acknowledgement->quiz_score,
            'quiz_passed' => $acknowledgement->quiz_passed,
            'quiz_completed_at' => $acknowledgement->quiz_completed_at?->toISOString(),
        ];
    }

    private function distributePolicy(QhsePolicy $policy): void
    {
        $this->synchronizePolicyRecipients($policy, true);
    }

    private function synchronizePolicyRecipients(QhsePolicy $policy, bool $notify): void
    {
        $recipients = User::query()
            ->where('enterprise_id', $policy->enterprise_id)
            ->where('site_id', $policy->site_id)
            ->where('is_active', true)
            ->get();

        foreach ($recipients as $recipient) {
            $acknowledgement = QhsePolicyAcknowledgement::query()->firstOrCreate(
                ['qhse_policy_id' => $policy->id, 'user_id' => $recipient->id],
                ['notified_at' => $policy->validated_by_direction_at ?? now()],
            );
            if ($notify && $acknowledgement->wasRecentlyCreated) {
                $recipient->notify(new QhsePolicyPublishedNotification($policy));
            }
        }
    }

    private function getNextVersion(int $enterpriseId, ?int $siteId = null): string
    {
        $lastPolicy = QhsePolicy::where('enterprise_id', $enterpriseId)
            ->when($siteId, fn ($query) => $query->where('site_id', $siteId))
            ->orderBy('version', 'desc')
            ->first();

        if (!$lastPolicy) {
            return '1.0';
        }

        $parts = explode('.', $lastPolicy->version);
        $parts[0] = (int)$parts[0] + 1;
        
        return implode('.', $parts);
    }

    private function incrementMinorVersion(string $version): string
    {
        $parts = explode('.', $version);
        $major = isset($parts[0]) ? (int) $parts[0] : 1;
        $minor = isset($parts[1]) ? (int) $parts[1] : 0;

        return "{$major}." . ($minor + 1);
    }

    private function serializePolicy(?QhsePolicy $policy): ?array
    {
        if (!$policy) {
            return null;
        }

        $axes = [];
        $policy->loadMissing('validatedBy');
        if ($this->hasPolicyAxesTable()) {
            $policy->loadMissing('axisEntries');
            $axes = $policy->axisEntries
                ->pluck('axis_name')
                ->map(fn ($axis) => trim((string) $axis))
                ->filter(fn ($axis) => $axis !== '')
                ->values()
                ->all();
        }

        if (empty($axes)) {
            $axes = $this->normalizeAxes($policy->axes ?? []);
        }

        return [
            'id' => $policy->id,
            'enterprise_id' => $policy->enterprise_id,
            'site_id' => $policy->site_id,
            'version' => $policy->version,
            'based_on_policy_id' => $policy->based_on_policy_id,
            'is_current' => (bool) $policy->is_current,
            'effective_date' => $policy->effective_date?->toDateString(),
            'mission' => $policy->mission,
            'vision' => $policy->vision,
            'values' => is_array($policy->values) ? $policy->values : [],
            'axes' => $axes,
            'commitments' => is_array($policy->commitments) ? $policy->commitments : [],
            'quality_policy' => $policy->quality_policy,
            'environmental_policy' => $policy->environmental_policy,
            'health_safety_policy' => $policy->health_safety_policy,
            'ethics_charter' => $policy->ethics_charter,
            'leadership_reviews' => is_array($policy->leadership_reviews) ? $policy->leadership_reviews : [],
            'customer_orientation_reviews' => is_array($policy->customer_orientation_reviews)
                ? $policy->customer_orientation_reviews
                : [],
            'status' => $policy->status,
            'validated_by_direction_at' => $policy->validated_by_direction_at?->toISOString(),
            'validated_by_user_id' => $policy->validated_by_user_id,
            'validated_by_name' => $policy->validatedBy?->name,
            'created_at' => $policy->created_at?->toISOString(),
            'updated_at' => $policy->updated_at?->toISOString(),
        ];
    }

    private function normalizeAxes(mixed $axes): array
    {
        if (!is_array($axes)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($axis) => trim((string) $axis), $axes),
            fn ($axis) => $axis !== ''
        ));
    }

    /**
     * A completed annual leadership review is an auditable record, not a UI flag.
     * Enforce the checklist at the API boundary and attribute the sign-off to the
     * authenticated user so clients cannot submit a fabricated reviewer.
     */
    private function normalizeLeadershipReviews(
        array &$validated,
        Request $request,
        ?QhsePolicy $existing = null,
    ): void {
        if (!array_key_exists('leadership_reviews', $validated) || !is_array($validated['leadership_reviews'])) {
            return;
        }

        $previousReviews = collect($existing?->leadership_reviews ?? [])
            ->filter(fn ($review) => is_array($review) && isset($review['period_year']))
            ->keyBy(fn (array $review) => (int) $review['period_year']);
        $errors = [];

        foreach ($validated['leadership_reviews'] as $index => &$review) {
            if (!is_array($review)) {
                continue;
            }

            unset($review['reviewed_by']);
            if (empty($review['reviewed_at'])) {
                continue;
            }

            $items = is_array($review['items'] ?? null) ? $review['items'] : [];
            foreach (self::LEADERSHIP_REVIEW_ITEM_IDS as $itemId) {
                $answer = is_array($items[$itemId] ?? null) ? $items[$itemId] : [];
                $path = "leadership_reviews.{$index}.items.{$itemId}";
                $status = $answer['status'] ?? null;
                if (!in_array($status, ['demontre', 'ecart', 'non_applicable'], true)) {
                    $errors["{$path}.status"][] = "Le point {$itemId} doit être évalué avant de terminer la revue.";
                }
                if (
                    trim((string) ($answer['rationale'] ?? '')) === '' &&
                    trim((string) ($answer['evidence'] ?? '')) === ''
                ) {
                    $errors["{$path}.rationale"][] = "Le point {$itemId} doit conserver une justification ou une preuve.";
                }
            }

            $periodYear = (int) ($review['period_year'] ?? 0);
            $previous = $previousReviews->get($periodYear);
            if (is_array($previous) && !empty($previous['reviewed_at'])) {
                $sameSignOff = (string) $previous['reviewed_at'] === (string) $review['reviewed_at'];
                $sameItems = ($previous['items'] ?? []) === $items;
                if ($sameSignOff && !$sameItems) {
                    $errors["leadership_reviews.{$index}.reviewed_at"][] =
                        'Toute modification d’une revue enregistrée exige une nouvelle validation.';
                }
                $review['reviewed_by'] = $sameSignOff && $sameItems
                    ? ($previous['reviewed_by'] ?? $request->user()->id)
                    : $request->user()->id;
            } else {
                $review['reviewed_by'] = $request->user()->id;
            }
        }
        unset($review);

        if ($errors !== []) {
            throw \Illuminate\Validation\ValidationException::withMessages($errors);
        }

        $validated['leadership_reviews'] = array_values($validated['leadership_reviews']);
    }

    /**
     * Preserve customer-focus checks as a separately signed, evidence-backed
     * annual record instead of folding them into the leadership checklist.
     */
    private function normalizeCustomerOrientationReviews(
        array &$validated,
        Request $request,
        ?QhsePolicy $existing = null,
    ): void {
        if (
            !array_key_exists('customer_orientation_reviews', $validated) ||
            !is_array($validated['customer_orientation_reviews'])
        ) {
            return;
        }

        $previousReviews = collect($existing?->customer_orientation_reviews ?? [])
            ->filter(fn ($review) => is_array($review) && isset($review['period_year']))
            ->keyBy(fn (array $review) => (int) $review['period_year']);
        $errors = [];

        foreach ($validated['customer_orientation_reviews'] as $index => &$review) {
            if (!is_array($review)) {
                continue;
            }

            unset($review['reviewed_by']);
            if (empty($review['reviewed_at'])) {
                continue;
            }

            $items = is_array($review['items'] ?? null) ? $review['items'] : [];
            foreach (self::CUSTOMER_ORIENTATION_REVIEW_ITEM_IDS as $itemId) {
                $answer = is_array($items[$itemId] ?? null) ? $items[$itemId] : [];
                $path = "customer_orientation_reviews.{$index}.items.{$itemId}";
                if (!in_array($answer['status'] ?? null, ['demontre', 'ecart', 'non_applicable'], true)) {
                    $errors["{$path}.status"][] = "Le contrôle {$itemId} doit être évalué avant de terminer la revue.";
                }
                if (trim((string) ($answer['rationale'] ?? '')) === '') {
                    $errors["{$path}.rationale"][] = "Le contrôle {$itemId} doit conserver une décision ou une justification.";
                }
                if (trim((string) ($answer['evidence'] ?? '')) === '') {
                    $errors["{$path}.evidence"][] = "Le contrôle {$itemId} doit référencer une preuve vérifiable.";
                }
            }

            $periodYear = (int) ($review['period_year'] ?? 0);
            $previous = $previousReviews->get($periodYear);
            if (is_array($previous) && !empty($previous['reviewed_at'])) {
                $sameSignOff = (string) $previous['reviewed_at'] === (string) $review['reviewed_at'];
                $sameItems = ($previous['items'] ?? []) === $items;
                if ($sameSignOff && !$sameItems) {
                    $errors["customer_orientation_reviews.{$index}.reviewed_at"][] =
                        'Toute modification d’une revue enregistrée exige une nouvelle validation.';
                }
                $review['reviewed_by'] = $sameSignOff && $sameItems
                    ? ($previous['reviewed_by'] ?? $request->user()->id)
                    : $request->user()->id;
            } else {
                $review['reviewed_by'] = $request->user()->id;
            }
        }
        unset($review);

        if ($errors !== []) {
            throw \Illuminate\Validation\ValidationException::withMessages($errors);
        }

        $validated['customer_orientation_reviews'] = array_values($validated['customer_orientation_reviews']);
    }

    private function hasPolicyAxesTable(): bool
    {
        static $hasTable = null;
        if ($hasTable !== null) {
            return $hasTable;
        }

        $hasTable = Schema::hasTable('qhse_policy_axes');
        return $hasTable;
    }
}
