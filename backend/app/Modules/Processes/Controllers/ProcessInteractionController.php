<?php

namespace App\Modules\Processes\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Http\Resources\ProcessInteractionResource;
use App\Models\Process;
use App\Models\ProcessInteraction;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProcessInteractionController extends Controller
{
    use AuthorizesSiteAccess;

    public function index(Request $request)
    {
        $query = ProcessInteraction::with(['supplierProcess', 'selfProcess', 'clientProcess']);
        $user = $request->user();
        abort_unless($user, 401);

        if ($request->filled('site_id')) {
            $siteId = (int) $request->input('site_id');
            $this->assertSiteAccess($request, $siteId);
            $query->whereHas('selfProcess', fn ($processes) => $processes->where('site_id', $siteId));
        } elseif ($user->isSuperAdmin()) {
            // Super administrators may inspect the complete interaction map.
        } elseif ($user->isEnterpriseAdmin()) {
            $query->whereHas(
                'selfProcess.site',
                fn ($sites) => $sites->where('enterprise_id', $user->enterprise_id),
            );
        } else {
            $query->whereHas(
                'selfProcess',
                fn ($processes) => $processes->where('site_id', $user->site_id),
            );
        }

        $interactions = $query->paginate(20);
        return ProcessInteractionResource::collection($interactions);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'supplier_process_id' => 'required|exists:processes,id',
            'self_process_id' => 'required|exists:processes,id',
            'client_process_id' => 'required|exists:processes,id',
            'description' => 'nullable|string',
        ]);
        $this->assertRelatedProcesses($request, $validated);

        $interaction = ProcessInteraction::create($validated);
        return new ProcessInteractionResource($interaction->load(['supplierProcess', 'selfProcess', 'clientProcess']));
    }

    public function show(Request $request, ProcessInteraction $processInteraction)
    {
        $this->assertRelatedProcesses($request, [
            'supplier_process_id' => $processInteraction->supplier_process_id,
            'self_process_id' => $processInteraction->self_process_id,
            'client_process_id' => $processInteraction->client_process_id,
        ]);

        return new ProcessInteractionResource($processInteraction->load(['supplierProcess', 'selfProcess', 'clientProcess']));
    }

    public function update(Request $request, ProcessInteraction $processInteraction)
    {
        $this->assertRelatedProcesses($request, [
            'supplier_process_id' => $processInteraction->supplier_process_id,
            'self_process_id' => $processInteraction->self_process_id,
            'client_process_id' => $processInteraction->client_process_id,
        ]);

        $validated = $request->validate([
            'supplier_process_id' => 'sometimes|exists:processes,id',
            'self_process_id' => 'sometimes|exists:processes,id',
            'client_process_id' => 'sometimes|exists:processes,id',
            'description' => 'nullable|string',
        ]);
        $this->assertRelatedProcesses($request, array_merge([
            'supplier_process_id' => $processInteraction->supplier_process_id,
            'self_process_id' => $processInteraction->self_process_id,
            'client_process_id' => $processInteraction->client_process_id,
        ], $validated));

        $processInteraction->update($validated);
        return new ProcessInteractionResource($processInteraction->load(['supplierProcess', 'selfProcess', 'clientProcess']));
    }

    public function destroy(Request $request, ProcessInteraction $processInteraction)
    {
        $this->assertRelatedProcesses($request, [
            'supplier_process_id' => $processInteraction->supplier_process_id,
            'self_process_id' => $processInteraction->self_process_id,
            'client_process_id' => $processInteraction->client_process_id,
        ]);

        $processInteraction->delete();
        return response()->json(null, 204);
    }

    private function assertRelatedProcesses(Request $request, array $processIds): void
    {
        $ids = array_map('intval', array_values($processIds));
        if (count(array_unique($ids)) !== count($ids)) {
            throw ValidationException::withMessages([
                'processes' => 'Une interaction doit relier trois processus distincts.',
            ]);
        }

        $processes = Process::query()->whereIn('id', $ids)->get(['id', 'site_id']);
        if ($processes->count() !== count($ids) || $processes->pluck('site_id')->unique()->count() !== 1) {
            throw ValidationException::withMessages([
                'processes' => 'Tous les processus reliés doivent exister sur le même site.',
            ]);
        }

        $this->assertSiteAccess($request, (int) $processes->first()->site_id);
    }
}
