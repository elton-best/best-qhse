<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Leadership\Models\EthicsReport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Signalements éthiques confidentiels (ISO 9001 §5.1.1 i, §7.3 e — Q3-06).
 *
 * Anonymat possible : l'identité du déclarant n'est jamais exposée par l'API
 * lorsque le signalement est anonyme. Aucun score individuel n'est calculé.
 */
class EthicsReportController extends Controller
{
    public function index(Request $request)
    {
        $query = EthicsReport::with(['site:id,name', 'handler:id,name']);

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $this->normalizeStatus($request->input('status')));
        }
        if ($request->filled('category')) {
            $query->where('category', $this->normalizeCategory($request->input('category')));
        }
        if ($request->filled('channel')) {
            $query->where('channel', $this->normalizeChannel($request->input('channel')));
        }

        $page = $query->latest()->paginate($request->integer('per_page', 20));
        $page->through(fn (EthicsReport $report) => $this->maskReporter($report));

        return response()->json($page);
    }

    public function store(Request $request)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'nullable|exists:sites,id',
            'is_anonymous' => 'nullable|boolean',
            'reporter_name' => 'nullable|string|max:255',
            'reporter_email' => 'nullable|email|max:255',
            'channel' => 'nullable|in:web,boite,telephone,courrier,reunion,autre',
            'category' => 'nullable|in:harcelement,discrimination,corruption,conflit_interets,fraude,securite,environnement,qualite,autre',
            'concerned_area' => 'nullable|string|max:255',
            'description' => 'required|string',
            'status' => 'nullable|in:received,in_progress,resolved,closed,rejected',
            'resolution' => 'nullable|string',
        ]);

        $validated['site_id'] = $validated['site_id'] ?? $request->user()?->site_id;
        $validated['is_anonymous'] = $validated['is_anonymous'] ?? true;
        $validated['channel'] = $validated['channel'] ?? 'web';
        $validated['category'] = $validated['category'] ?? 'autre';
        $validated['status'] = $validated['status'] ?? 'received';
        $validated['received_at'] = $validated['received_at'] ?? now();

        if ($validated['is_anonymous']) {
            $validated['reporter_name'] = null;
            $validated['reporter_email'] = null;
        }

        $report = EthicsReport::create($validated);
        $this->stampWorkflow($report, $validated);

        return response()->json(
            $this->maskReporter($report->fresh()->load(['site:id,name', 'handler:id,name'])),
            201
        );
    }

    public function show(EthicsReport $ethicsReport)
    {
        return response()->json(
            $this->maskReporter($ethicsReport->load(['site:id,name', 'handler:id,name']))
        );
    }

    public function update(Request $request, EthicsReport $ethicsReport)
    {
        $this->normalizeInput($request);
        $validated = $request->validate([
            'site_id' => 'sometimes|exists:sites,id',
            'is_anonymous' => 'nullable|boolean',
            'reporter_name' => 'nullable|string|max:255',
            'reporter_email' => 'nullable|email|max:255',
            'channel' => 'sometimes|in:web,boite,telephone,courrier,reunion,autre',
            'category' => 'sometimes|in:harcelement,discrimination,corruption,conflit_interets,fraude,securite,environnement,qualite,autre',
            'concerned_area' => 'nullable|string|max:255',
            'description' => 'sometimes|string',
            'status' => 'sometimes|in:received,in_progress,resolved,closed,rejected',
            'resolution' => 'nullable|string',
        ]);

        if (array_key_exists('status', $validated) && $validated['status'] === null) {
            unset($validated['status']);
        }

        // Un signalement anonyme ne doit jamais permettre de ré-identifier l'auteur.
        if (($validated['is_anonymous'] ?? $ethicsReport->is_anonymous) === true) {
            $validated['reporter_name'] = null;
            $validated['reporter_email'] = null;
        }

        $ethicsReport->update($validated);
        $this->stampWorkflow($ethicsReport, $validated);

        return response()->json(
            $this->maskReporter($ethicsReport->fresh()->load(['site:id,name', 'handler:id,name']))
        );
    }

    public function destroy(EthicsReport $ethicsReport)
    {
        $ethicsReport->delete();

        return response()->json(['message' => 'Signalement supprimé.']);
    }

    /**
     * Horodatage du traitement : prise en charge, clôture.
     */
    private function stampWorkflow(EthicsReport $report, array $validated): void
    {
        $status = $validated['status'] ?? null;
        if ($status === null) {
            return;
        }

        if (in_array($status, ['in_progress', 'resolved', 'closed'], true) && !$report->acknowledged_at) {
            $report->forceFill([
                'acknowledged_at' => now(),
                'handled_by' => Auth::id(),
            ])->saveQuietly();
        }

        if (in_array($status, ['resolved', 'closed', 'rejected'], true) && !$report->closed_at) {
            $report->forceFill(['closed_at' => now()])->saveQuietly();
        }
    }

    /**
     * Masque l'identité du déclarant pour les signalements anonymes.
     */
    private function maskReporter(EthicsReport $report): EthicsReport
    {
        if ($report->is_anonymous) {
            $report->makeHidden(['reporter_name', 'reporter_email']);
        }

        return $report;
    }

    private function normalizeInput(Request $request): void
    {
        $merge = [];

        if ($request->filled('status')) {
            $merge['status'] = $this->normalizeStatus($request->input('status'));
        }
        if ($request->filled('category')) {
            $merge['category'] = $this->normalizeCategory($request->input('category'));
        }
        if ($request->filled('channel')) {
            $merge['channel'] = $this->normalizeChannel($request->input('channel'));
        }
        if ($request->has('is_anonymous')) {
            $merge['is_anonymous'] = $this->normalizeBoolean($request->input('is_anonymous'));
        }
        // Le formulaire générique impose un titre : il porte la description.
        if (!$request->filled('description') && $request->filled('title')) {
            $merge['description'] = trim((string) $request->input('title'));
        }
        // Alias frontend : pilot_id (responsable générique) -> handled_by.
        if (!$request->filled('handled_by') && $request->filled('pilot_id')) {
            $pilot = $request->input('pilot_id');
            $merge['handled_by'] = is_numeric($pilot) ? (int) $pilot : null;
        }

        if ($merge !== []) {
            $request->merge($merge);
        }
    }

    private function normalizeStatus(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'received' => 'received',
            'recu' => 'received',
            'recue' => 'received',
            'in_progress' => 'in_progress',
            'en traitement' => 'in_progress',
            'traitement' => 'in_progress',
            'resolved' => 'resolved',
            'traite' => 'resolved',
            'traitee' => 'resolved',
            'closed' => 'closed',
            'cloture' => 'closed',
            'cloturee' => 'closed',
            'rejected' => 'rejected',
            'rejete' => 'rejected',
            'rejetee' => 'rejected',
        ];
        $status = $map[$normalized] ?? 'received';

        return in_array($status, EthicsReport::STATUSES, true) ? $status : 'received';
    }

    private function normalizeCategory(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'harcelement' => 'harcelement',
            'discrimination' => 'discrimination',
            'corruption' => 'corruption',
            'conflit interets' => 'conflit_interets',
            'conflit_interets' => 'conflit_interets',
            "conflit d'interets" => 'conflit_interets',
            'fraude' => 'fraude',
            'securite' => 'securite',
            'environnement' => 'environnement',
            'qualite' => 'qualite',
            'autre' => 'autre',
        ];
        $category = $map[$normalized] ?? 'autre';

        return in_array($category, EthicsReport::CATEGORIES, true) ? $category : 'autre';
    }

    private function normalizeChannel(mixed $value): string
    {
        $normalized = $this->unaccent(mb_strtolower(trim((string) ($value ?? ''))));
        $map = [
            'web' => 'web',
            'plateforme' => 'web',
            'boite' => 'boite',
            'boite aux lettres' => 'boite',
            'telephone' => 'telephone',
            'courrier' => 'courrier',
            'reunion' => 'reunion',
            'autre' => 'autre',
        ];
        $channel = $map[$normalized] ?? 'web';

        return in_array($channel, EthicsReport::CHANNELS, true) ? $channel : 'web';
    }

    private function normalizeBoolean(mixed $value): ?bool
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_bool($value)) {
            return $value;
        }

        $normalized = $this->unaccent(mb_strtolower(trim((string) $value)));
        if (in_array($normalized, ['oui', 'yes', 'true', '1', 'vrai'], true)) {
            return true;
        }
        if (in_array($normalized, ['non', 'no', 'false', '0', 'faux'], true)) {
            return false;
        }

        return null;
    }

    private function unaccent(string $value): string
    {
        return str_replace(
            ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç', '’'],
            ['e', 'e', 'e', 'e', 'a', 'a', 'i', 'i', 'o', 'u', 'u', 'c', "'"],
            $value
        );
    }
}
