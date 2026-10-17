<?php

namespace App\Modules\Planning\Controllers;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\Objective;
use App\Models\User;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Notifications\SiteEventNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ObjectiveCommunicationController extends Controller
{
    use ScopesToUserTenant;

    public function index(Request $request, int $id): JsonResponse
    {
        $objective = $this->objective($request, $id);
        $this->authorizeManager($request, $objective);
        $communications = DB::table('objective_communications')->where('objective_id', $id)->orderByDesc('id')->get()->map(function ($record) {
            $record->snapshot = json_decode($record->snapshot, true, 512, JSON_THROW_ON_ERROR);
            $record->receipts = DB::table('objective_communication_receipts as r')->join('users as u', 'u.id', '=', 'r.user_id')
                ->where('r.communication_id', $record->id)->get(['u.id', 'u.name', 'r.acknowledged_at']);

            return $record;
        });
        $recipients = $this->recipientQuery($objective)->get(['id', 'name']);

        return response()->json(['data' => ['communications' => $communications, 'recipients' => $recipients]]);
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $objective = $this->objective($request, $id);
        $this->authorizeManager($request, $objective);
        $data = $request->validate([
            'recipient_ids' => 'required|array|min:1|max:500', 'recipient_ids.*' => 'required|integer|distinct',
            'message' => 'nullable|string|max:5000', 'content_locale' => 'nullable|in:fr,en',
        ]);
        $recipients = $this->recipientQuery($objective)->whereIn('id', $data['recipient_ids'])->get();
        if ($recipients->count() !== count($data['recipient_ids'])) {
            throw ValidationException::withMessages(['recipient_ids' => ['Choisissez des utilisateurs actifs du site ou de son entreprise sans rattachement à un autre site.']]);
        }
        $communicationId = DB::transaction(function () use ($request, $objective, $data, $recipients) {
            $id = DB::table('objective_communications')->insertGetId([
                'enterprise_id' => $objective->site->enterprise_id, 'site_id' => $objective->site_id,
                'objective_id' => $objective->id, 'sent_by' => $request->user()->id,
                'snapshot' => json_encode($objective->only(['ref', 'title', 'description', 'target_value', 'unit', 'deadline', 'updated_at']), JSON_THROW_ON_ERROR),
                'message' => $data['message'] ?? null, 'content_locale' => $data['content_locale'] ?? 'fr',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach ($recipients as $recipient) {
                DB::table('objective_communication_receipts')->insert(['communication_id' => $id, 'user_id' => $recipient->id]);
            }
            DB::afterCommit(function () use ($recipients, $objective, $id) {
                foreach ($recipients as $recipient) {
                    $recipient->notify(new SiteEventNotification('objective_communicated', [
                        'title' => 'Objectif à lire', 'message' => $objective->title,
                        'communication_id' => $id, 'action_url' => '/app/objectifs', 'site_id' => $objective->site_id,
                    ]));
                }
            });

            return $id;
        });

        return response()->json(['data' => ['id' => $communicationId, 'recipients_count' => $recipients->count()]], 201);
    }

    public function inbox(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $query = DB::table('objective_communication_receipts as r')->join('objective_communications as c', 'c.id', '=', 'r.communication_id')
            ->where('r.user_id', $request->user()->id)->where('c.enterprise_id', $request->user()->enterprise_id);
        if ($request->filled('site_id')) {
            $site = $this->resolveSite($request, (int) $request->input('site_id'));
            $query->where('c.site_id', $site->id);
        }
        $items = $query->orderByDesc('c.id')->get(['c.id', 'c.snapshot', 'c.message', 'c.content_locale', 'c.created_at', 'r.acknowledged_at'])->map(function ($record) {
            $record->snapshot = json_decode($record->snapshot, true, 512, JSON_THROW_ON_ERROR);

            return $record;
        });

        return response()->json(['data' => $items]);
    }

    public function acknowledge(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $communication = DB::table('objective_communications')->where('id', $id)->where('enterprise_id', $request->user()->enterprise_id)->first();
        abort_unless($communication, 404);
        $receipt = DB::table('objective_communication_receipts')->where('communication_id', $id)->where('user_id', $request->user()->id);
        abort_unless((clone $receipt)->exists(), 404);
        (clone $receipt)->whereNull('acknowledged_at')->update(['acknowledged_at' => now()]);

        return response()->json(['data' => $receipt->first(['acknowledged_at'])]);
    }

    private function objective(Request $request, int $id): Objective
    {
        $this->assertTenant($request);
        $objective = Objective::query()->findOrFail($id);
        $this->resolveSite($request, (int) $objective->site_id);

        return $objective;
    }

    private function authorizeManager(Request $request, Objective $objective): void
    {
        if (! PermissionHelper::isAdmin($request->user())) {
            $this->authorize('update', $objective);
        }
    }

    private function recipientQuery(Objective $objective): Builder
    {
        return User::query()->where('enterprise_id', $objective->site->enterprise_id)->where('is_active', true)
            ->where(fn ($q) => $q->where('site_id', $objective->site_id)->orWhereNull('site_id'));
    }
}
