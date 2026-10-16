<?php

namespace App\Modules\Hse\Controllers;

use App\Modules\Hse\Models\AwarenessAttendance;
use App\Modules\Hse\Models\AwarenessCampaign;
use App\Modules\Hse\Models\AwarenessTalk;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use SimpleSoftwareIO\QrCode\Facades\QrCode;

/**
 * Causeries de 10 minutes (M9-05) : liste d'émargement signée en scannant un QR code.
 */
class AwarenessTalkController extends ManagedRecordController
{
    protected function modelClass(): string
    {
        return AwarenessTalk::class;
    }

    protected function label(): string
    {
        return 'Causerie';
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'topic' => ['nullable', Rule::in(array_keys(AwarenessCampaign::TOPICS))],
            'held_on' => 'required|date',
            'duration_minutes' => 'nullable|integer|min:1|max:240',
            'notes' => 'nullable|string',
            'campaign_id' => 'nullable|integer',
            'responsible_id' => 'nullable|integer',
        ];
    }

    protected function columns(): array
    {
        return [['title', 'Causerie', 'text'], ['held_on', 'Date', 'date'], ['duration_minutes', 'Durée (min)', 'number'], ['status', 'Statut', 'text']];
    }

    protected function derive(array $data, ?Model $existing): array
    {
        if ($existing === null) {
            $data['qr_token'] = Str::random(40);
            $data['status'] = 'open';
        }

        return $data;
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $this->assertOwnedByEnterprise(['campaign_id' => ['table' => 'awareness_campaigns', 'column' => 'enterprise_id']], $request->all(), (int) $request->user()->enterprise_id);

        return parent::store($request);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);

        return response()->json(AwarenessTalk::query()->with([...$this->relations(), 'attendances'])->findOrFail($id));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        abort_if(AwarenessTalk::query()->findOrFail($id)->status === 'closed', 422, 'Une causerie clôturée est la preuve de son émargement : elle ne se modifie plus.');

        return parent::update($request, $id);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        abort_if(AwarenessAttendance::query()->where('talk_id', $id)->exists(), 422, 'Cette causerie a déjà des signatures : elle est conservée.');

        return parent::destroy($request, $id);
    }

    /**
     * QR code (SVG) à afficher ou imprimer : il pointe vers l'émargement de cette causerie.
     */
    public function qr(Request $request, int $id): Response
    {
        $this->assertTenant($request);
        $talk = AwarenessTalk::query()->findOrFail($id);
        $url = rtrim((string) config('app.frontend_url'), '/').'/app/campagnes-sensibilisation?emargement='.$talk->qr_token;

        return response(QrCode::format('svg')->size(280)->margin(1)->generate($url), 200, ['Content-Type' => 'image/svg+xml']);
    }

    /**
     * Émargement par un salarié qui a scanné le QR code : une seule signature, causerie ouverte uniquement.
     */
    public function sign(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $data = $request->validate(['token' => 'required|string|max:64']);
        $talk = AwarenessTalk::query()->where('qr_token', $data['token'])->first();
        abort_unless($talk, 404, 'Causerie introuvable.');
        abort_unless($talk->status === 'open', 422, 'Cette causerie est clôturée : l\'émargement est fermé.');
        abort_if($talk->held_on->isFuture(), 422, 'Cette causerie n\'a pas encore eu lieu.');

        $user = $request->user();
        $attendance = AwarenessAttendance::query()->firstOrCreate(
            ['talk_id' => $talk->id, 'user_id' => $user->id],
            ['enterprise_id' => $talk->enterprise_id, 'name' => $user->name, 'method' => 'qr', 'signed_at' => now()],
        );

        return response()->json(['data' => ['talk' => $talk->title, 'signed_at' => $attendance->signed_at->toIso8601String(), 'already_signed' => ! $attendance->wasRecentlyCreated]], $attendance->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Ajout manuel d'une personne présente (extérieur sans compte, ou salarié sans téléphone).
     */
    public function addAttendee(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $talk = AwarenessTalk::query()->findOrFail($id);
        abort_unless($talk->status === 'open', 422, 'Cette causerie est clôturée.');
        $data = $request->validate(['name' => 'required|string|max:255', 'organization' => 'nullable|string|max:255', 'user_id' => 'nullable|integer']);
        $this->assertOwnedByEnterprise(['user_id' => ['table' => 'users', 'column' => 'enterprise_id']], $data, (int) $talk->enterprise_id);
        if (! empty($data['user_id'])) {
            abort_if(AwarenessAttendance::query()->where('talk_id', $talk->id)->where('user_id', $data['user_id'])->exists(), 422, 'Cette personne a déjà signé.');
        }

        $attendance = AwarenessAttendance::create($data + ['enterprise_id' => $talk->enterprise_id, 'talk_id' => $talk->id, 'method' => 'manual', 'signed_at' => now()]);

        return response()->json(['data' => $attendance], 201);
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $talk = AwarenessTalk::query()->findOrFail($id);
        abort_unless($talk->status === 'open', 422, 'Cette causerie est déjà clôturée.');
        $talk->update(['status' => 'closed', 'closed_at' => now()]);

        return response()->json($talk->fresh([...$this->relations(), 'attendances']));
    }
}
