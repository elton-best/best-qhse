<?php

namespace App\Modules\Hse\Controllers;

use App\Models\User;
use App\Modules\Hse\Models\AwarenessCampaign;
use App\Modules\Hse\Models\AwarenessMaterial;
use App\Modules\Hse\Models\AwarenessParticipant;
use App\Modules\Hse\Models\EnvironmentalAspect;
use App\Notifications\SiteEventNotification;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Campagnes de sensibilisation (ISO 14001:2026 §7.3, M9-04 à M9-06).
 */
class AwarenessCampaignController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return AwarenessCampaign::class;
    }

    protected function label(): string
    {
        return 'Campagne de sensibilisation';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'objective' => 'nullable|string',
            'audience' => 'nullable|in:all_site,selected',
            'selected_user_ids' => 'nullable|array',
            'selected_user_ids.*' => 'integer',
            'aspect_ids' => 'nullable|array',
            'aspect_ids.*' => 'integer',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [['title', 'Campagne', 'text'], ['objective', 'Objectif', 'text'], ['start_date', 'Début', 'date'], ['end_date', 'Fin', 'date'], ['status', 'Statut', 'text']];
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertLinks($request);

        return parent::store($request);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = AwarenessCampaign::query()->findOrFail($id);
        abort_if($campaign->status === 'closed', 422, 'Une campagne clôturée est conservée telle quelle.');
        if ($campaign->status === 'active') {
            $forbidden = array_diff(array_keys($request->all()), ['end_date', 'responsible_id', 'objective']);
            abort_if($forbidden !== [], 422, 'Campagne en cours : seules la date de fin, le responsable et l\'objectif peuvent changer.');
        }
        $this->assertLinks($request);

        return parent::update($request, $id);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        abort_unless(AwarenessCampaign::query()->findOrFail($id)->status === 'draft', 422, 'Une campagne lancée est conservée comme preuve : elle ne peut pas être supprimée.');

        return parent::destroy($request, $id);
    }

    private function assertLinks(Request $request): void
    {
        $this->assertTenant($request);
        $enterpriseId = (int) $request->user()->enterprise_id;
        foreach (['selected_user_ids' => ['users', 'enterprise_id'], 'aspect_ids' => ['environmental_aspects', 'enterprise_id']] as $field => [$table, $column]) {
            $ids = array_values(array_unique((array) $request->input($field, [])));
            if ($ids !== [] && DB::table($table)->whereIn('id', $ids)->where($column, $enterpriseId)->count() !== count($ids)) {
                abort(response()->json(['message' => 'Référence invalide.', 'errors' => [$field => ['Une valeur sélectionnée est introuvable pour votre entreprise.']]], 422));
            }
        }
        $this->assertOwnedByEnterprise(['responsible_id' => ['table' => 'users', 'column' => 'enterprise_id']], $request->all(), $enterpriseId);
    }

    protected function derive(array $data, ?Model $existing): array
    {
        if ($existing === null) {
            $data['status'] = 'draft';
        }
        if (($data['audience'] ?? $existing?->audience) === 'selected') {
            $selected = array_key_exists('selected_user_ids', $data) ? $data['selected_user_ids'] : $existing?->selected_user_ids;
            if (empty($selected)) {
                abort(response()->json(['message' => 'Public à préciser.', 'errors' => ['selected_user_ids' => ['Sélectionnez au moins une personne.']]], 422));
            }
        }

        return $data;
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->with([...$this->relations(), 'materials'])->withCount(['participants', 'participants as completed_count' => fn ($q) => $q->whereNotNull('completed_at')])->findOrFail($id);

        return response()->json($campaign);
    }

    /**
     * Aspects significatifs du site, proposés pour illustrer le travail des participants.
     */
    public function suggestedAspects(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->findOrFail($id);

        return response()->json(['data' => EnvironmentalAspect::query()->where('site_id', $campaign->site_id)->where('is_significant', true)->get(['id', 'aspect_number', 'aspect', 'impact'])]);
    }

    // ------------------------------------------------------------------ supports (M9-05)

    public function storeMaterial(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->findOrFail($id);
        abort_unless($campaign->status === 'draft', 422, 'Les supports ne se modifient plus une fois la campagne lancée.');
        $data = $this->validateMaterial($request);

        $material = $campaign->materials()->create($data + ['enterprise_id' => $campaign->enterprise_id, 'position' => ($campaign->materials()->max('position') ?? 0) + 1]);

        return response()->json($material, 201);
    }

    public function updateMaterial(Request $request, int $materialId): JsonResponse
    {
        $this->assertTenant($request);
        $material = AwarenessMaterial::query()->with('campaign')->findOrFail($materialId);
        abort_unless($material->campaign->status === 'draft', 422, 'Les supports ne se modifient plus une fois la campagne lancée.');
        $material->update($this->validateMaterial($request));

        return response()->json($material->fresh());
    }

    public function destroyMaterial(Request $request, int $materialId): JsonResponse
    {
        $this->assertTenant($request);
        $material = AwarenessMaterial::query()->with('campaign')->findOrFail($materialId);
        abort_unless($material->campaign->status === 'draft', 422, 'Les supports ne se modifient plus une fois la campagne lancée.');
        $material->delete();

        return response()->json(['message' => 'Support supprimé.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateMaterial(Request $request): array
    {
        $data = $request->validate([
            'topic' => ['required', Rule::in(array_keys(AwarenessCampaign::TOPICS))],
            'type' => ['required', Rule::in(AwarenessMaterial::TYPES)],
            'title' => 'required|string|max:255',
            'body' => 'nullable|string',
            'url' => ['nullable', 'url:https', 'max:500'],
            'pass_mark' => 'nullable|integer|min:50|max:100',
            'questions' => 'nullable|array|max:20',
            'questions.*.question' => 'required_with:questions|string|max:500',
            'questions.*.options' => 'required_with:questions|array|min:2|max:6',
            'questions.*.options.*' => 'required|string|max:255',
            'questions.*.correct' => 'required_with:questions|integer|min:0',
        ]);

        $errors = [];
        match ($data['type']) {
            'sheet' => blank($data['body'] ?? null) ? $errors['body'] = ['Rédigez le contenu de la fiche.'] : null,
            'video' => blank($data['url'] ?? null) ? $errors['url'] = ['Indiquez le lien (https) de la vidéo.'] : null,
            'quiz' => empty($data['questions']) ? $errors['questions'] = ['Ajoutez au moins une question.'] : null,
        };
        foreach ($data['questions'] ?? [] as $index => $question) {
            if ($question['correct'] >= count($question['options'])) {
                $errors["questions.{$index}.correct"] = ['La bonne réponse doit être l\'une des propositions.'];
            }
        }
        if ($errors !== []) {
            abort(response()->json(['message' => 'Support invalide.', 'errors' => $errors], 422));
        }
        if ($data['type'] !== 'quiz') {
            $data['questions'] = null;
        }

        return $data;
    }

    // ------------------------------------------------------------------ cycle de vie (M9-04)

    /**
     * Lancement : les quatre points de 7.3 doivent être couverts par au moins un support ; le public est constitué
     * et prévenu.
     */
    public function activate(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->with('materials')->findOrFail($id);
        abort_unless($campaign->status === 'draft', 422, 'Cette campagne est déjà lancée.');

        $missing = collect(AwarenessCampaign::TOPICS)->except($campaign->materials->pluck('topic')->unique()->all());
        if ($missing->isNotEmpty()) {
            abort(response()->json([
                'message' => 'La sensibilisation doit couvrir les quatre points de 7.3 : ajoutez un support pour chacun.',
                'errors' => ['materials' => $missing->values()->map(fn ($label) => "Aucun support : {$label}")],
            ], 422));
        }

        $users = $campaign->audience === 'selected'
            ? User::query()->where('enterprise_id', $campaign->enterprise_id)->whereIn('id', $campaign->selected_user_ids ?? [])->where('is_active', true)->get()
            : User::query()->where('enterprise_id', $campaign->enterprise_id)->where('site_id', $campaign->site_id)->where('is_active', true)->get();
        abort_if($users->isEmpty(), 422, 'Aucun participant actif dans le public visé.');

        DB::transaction(function () use ($campaign, $users) {
            foreach ($users as $user) {
                AwarenessParticipant::query()->firstOrCreate(
                    ['campaign_id' => $campaign->id, 'user_id' => $user->id],
                    ['enterprise_id' => $campaign->enterprise_id, 'kind' => 'internal'],
                );
            }
            $campaign->update(['status' => 'active', 'activated_at' => now(), 'start_date' => $campaign->start_date ?? today()]);
        });

        foreach ($users as $user) {
            $user->notify(new SiteEventNotification('awareness_campaign_started', [
                'title' => 'Nouvelle sensibilisation à suivre',
                'message' => "{$campaign->title}".($campaign->end_date ? ' — à terminer avant le '.$campaign->end_date->format('d/m/Y') : ''),
                'reference' => $campaign->ref,
                'url' => '/app/campagnes-sensibilisation',
            ]));
        }

        return response()->json($campaign->fresh($this->relations()));
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->findOrFail($id);
        abort_unless($campaign->status === 'active', 422, 'Seule une campagne en cours peut être clôturée.');
        $campaign->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json($campaign->fresh($this->relations()));
    }

    // ------------------------------------------------------------------ personnes extérieures (M9-06)

    /**
     * Invite une personne extérieure (sous-traitant…) : lien personnel à accès limité aux contenus de la campagne.
     * Le lien n'est montré qu'une fois ; seule son empreinte est conservée.
     */
    public function invite(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->findOrFail($id);
        abort_unless($campaign->status === 'active', 422, 'On n\'invite que sur une campagne en cours.');
        $data = $request->validate(['name' => 'required|string|max:255', 'email' => 'nullable|email|max:255', 'organization' => 'nullable|string|max:255']);

        $token = Str::random(48);
        $participant = AwarenessParticipant::create([
            'enterprise_id' => $campaign->enterprise_id, 'campaign_id' => $campaign->id, 'kind' => 'external',
            'external_name' => $data['name'], 'external_email' => $data['email'] ?? null, 'organization' => $data['organization'] ?? null,
            'token_hash' => AwarenessParticipant::hashToken($token), 'invited_at' => now(),
        ]);
        $link = rtrim((string) config('app.frontend_url'), '/').'/sensibilisation/'.$token;

        if (! empty($data['email'])) {
            Mail::raw("Bonjour {$data['name']},\n\nVous êtes invité(e) à suivre la sensibilisation « {$campaign->title} » avant d'intervenir sur notre site.\nLien personnel : {$link}\n", fn ($message) => $message->to($data['email'])->subject("Sensibilisation : {$campaign->title}"));
        }

        return response()->json(['data' => ['participant_id' => $participant->id, 'link' => $link]], 201);
    }

    public function participants(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $campaign = AwarenessCampaign::query()->findOrFail($id);
        $total = $campaign->materials()->count();
        $rows = $campaign->participants()->with('user:id,name,email')->withCount(['receipts as done_count' => fn ($q) => $q->where('passed', true)->select(DB::raw('count(distinct material_id)'))])->orderBy('id')->get()
            ->map(fn (AwarenessParticipant $p) => [
                'id' => $p->id, 'kind' => $p->kind, 'name' => $p->displayName(), 'organization' => $p->organization, 'email' => $p->kind === 'external' ? $p->external_email : $p->user?->email,
                'done' => (int) $p->done_count, 'total' => $total, 'completed_at' => $p->completed_at?->toIso8601String(), 'attestation_number' => $p->attestation_number,
            ]);

        return response()->json(['data' => $rows]);
    }
}
