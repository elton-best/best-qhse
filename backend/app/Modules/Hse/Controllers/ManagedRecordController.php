<?php

namespace App\Modules\Hse\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hse\Controllers\Concerns\ScopesToUserTenant;
use App\Modules\Hse\Models\ManagedRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Socle des registres d'un système de management (énergie ISO 50001, urgences ISO 14001…).
 *
 * Garanties communes :
 * - le périmètre (entreprise, site) est déduit de l'utilisateur authentifié et
 *   jamais du seul identifiant envoyé par le navigateur ;
 * - les clés étrangères (responsable, IPÉ, équipement, prestataire, audit) doivent
 *   appartenir à la même entreprise que l'enregistrement ;
 * - CRUD paginé + modèle, export et import XLSX.
 */
abstract class ManagedRecordController extends Controller
{
    use ScopesToUserTenant;

    /** @var array<string, array{table: string, column: string}> Contrôle d'appartenance des clés étrangères. */
    private const OWNED_REFERENCES = [
        'responsible_id' => ['table' => 'users', 'column' => 'enterprise_id'],
        'validated_by' => ['table' => 'users', 'column' => 'enterprise_id'],
        'ipe_id' => ['table' => 'ipe', 'column' => 'enterprise_id'],
        'equipment_id' => ['table' => 'equipements', 'column' => 'enterprise_id'],
        'provider_partner_id' => ['table' => 'provider_partners', 'column' => 'enterprise_id'],
        'procedure_id' => ['table' => 'emergency_procedures', 'column' => 'enterprise_id'],
    ];

    private const MAX_IMPORT_ROWS = 1000;

    /** @return class-string<ManagedRecord> */
    abstract protected function modelClass(): string;

    /** Libellé singulier affiché dans les messages. */
    abstract protected function label(): string;

    /**
     * Règles de validation de création (champs propres au module, hors `site_id`).
     *
     * @return array<string, string|array<int, mixed>>
     */
    abstract protected function rules(): array;

    /**
     * Colonnes XLSX : `[attribut, en-tête, type]` avec type text|date|number|bool|user.
     *
     * @return array<int, array{0: string, 1: string, 2: string}>
     */
    abstract protected function columns(): array;

    /** @return array<int, string> Colonnes interrogeables par `?search=`. */
    protected function searchable(): array
    {
        return ['ref', 'title'];
    }

    /** @return array<int, string> Colonnes filtrables par égalité (`?status=`). */
    protected function filterable(): array
    {
        return ['status'];
    }

    /** @return array<int, string> */
    protected function relations(): array
    {
        return ['site:id,name', 'responsible:id,name'];
    }

    /**
     * Calcule les champs dérivés avant enregistrement.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    protected function derive(array $data, ?Model $existing): array
    {
        return $data;
    }

    public function index(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $class = $this->modelClass();
        $query = $class::query()->with($this->relations());

        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }
        foreach ($this->filterable() as $column) {
            if ($request->filled($column)) {
                $query->where($column, $request->input($column));
            }
        }
        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->input('search')).'%';
            $query->where(function ($inner) use ($term) {
                foreach ($this->searchable() as $column) {
                    $inner->orWhere($column, 'ilike', $term);
                }
            });
        }

        return response()->json($query->latest('id')->paginate(min($request->integer('per_page', 20), 200)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $validated = $request->validate(array_merge(['site_id' => 'nullable|integer'], $this->rules()));
        $site = $this->resolveSite($request, isset($validated['site_id']) ? (int) $validated['site_id'] : null);
        unset($validated['site_id']);

        $this->assertOwnedReferences($validated, (int) $site->enterprise_id);

        $class = $this->modelClass();
        $record = $class::create(array_merge($this->derive($validated, null), [
            'site_id' => $site->id,
            'enterprise_id' => $site->enterprise_id,
        ]));

        return response()->json($record->load($this->relations()), 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $class = $this->modelClass();

        return response()->json($class::query()->with($this->relations())->findOrFail($id));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $class = $this->modelClass();
        $record = $class::query()->findOrFail($id);

        $validated = $request->validate($this->updateRules());
        $this->assertOwnedReferences($validated, (int) $record->enterprise_id);

        $record->update($this->derive($validated, $record));

        return response()->json($record->fresh()->load($this->relations()));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->assertTenant($request);
        $class = $this->modelClass();
        $class::query()->findOrFail($id)->delete();

        return response()->json(['message' => $this->label().' supprimé(e).']);
    }

    public function downloadTemplate(): BinaryFileResponse
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modele import');
        $sheet->setCellValue('A1', "MODELE D'IMPORT - ".mb_strtoupper($this->label()));
        $sheet->fromArray(array_map(fn (array $column) => $column[1], $this->columns()), null, 'A3');

        return $this->spreadsheetResponse($spreadsheet, 'modele_import_'.$this->slug().'.xlsx');
    }

    public function exportXlsx(Request $request): BinaryFileResponse
    {
        $this->assertTenant($request);
        $class = $this->modelClass();
        $query = $class::query()->with(['responsible:id,name'])->orderBy('id');
        if ($request->filled('site_id')) {
            $query->where('site_id', $request->integer('site_id'));
        }

        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Export');
        $sheet->fromArray(array_merge(['Ref'], array_map(fn (array $c) => $c[1], $this->columns())), null, 'A1');

        $row = 2;
        foreach ($query->get() as $record) {
            $values = [$record->ref];
            foreach ($this->columns() as [$attribute, , $type]) {
                $values[] = match ($type) {
                    'user' => $record->responsible?->name,
                    'date' => $record->{$attribute}?->format('Y-m-d'),
                    'bool' => $record->{$attribute} ? 'oui' : 'non',
                    default => $record->{$attribute},
                };
            }
            $sheet->fromArray($values, null, 'A'.$row++);
        }

        return $this->spreadsheetResponse($spreadsheet, $this->slug().'_'.now()->format('Ymd_His').'.xlsx');
    }

    public function importXlsx(Request $request): JsonResponse
    {
        $this->assertTenant($request);
        $request->validate([
            'site_id' => 'nullable|integer',
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ]);
        $site = $this->resolveSite($request, $request->filled('site_id') ? $request->integer('site_id') : null);

        $file = $request->file('file');
        $reader = IOFactory::createReaderForFile($file->getRealPath());
        $reader->setReadDataOnly(true);
        $rows = $reader->load($file->getRealPath())->getActiveSheet()->toArray(null, true, true, false);
        $rows = array_slice($rows, 3, self::MAX_IMPORT_ROWS);

        $class = $this->modelClass();
        $imported = 0;
        $errors = [];

        foreach ($rows as $offset => $cells) {
            $line = $offset + 4;
            if (trim((string) ($cells[0] ?? '')) === '') {
                continue;
            }

            $payload = [];
            foreach ($this->columns() as $index => [$attribute, , $type]) {
                $value = $cells[$index] ?? null;
                $value = is_string($value) ? trim($value) : $value;
                if ($value === null || $value === '') {
                    continue;
                }
                if ($type === 'user') {
                    $payload['responsible_id'] = $this->resolveUserId((string) $value, (int) $site->enterprise_id);
                } elseif ($type === 'bool') {
                    $payload[$attribute] = in_array(mb_strtolower((string) $value), ['1', 'oui', 'true', 'yes'], true);
                } else {
                    $payload[$attribute] = $value;
                }
            }

            $validator = Validator::make($payload, $this->rules());
            if ($validator->fails()) {
                $errors[] = "Ligne {$line} : ".$validator->errors()->first();

                continue;
            }

            $class::create(array_merge($this->derive($validator->validated(), null), [
                'site_id' => $site->id,
                'enterprise_id' => $site->enterprise_id,
            ]));
            $imported++;
        }

        return response()->json([
            'success' => true,
            'message' => "{$imported} ligne(s) importée(s).",
            'data' => ['imported' => $imported, 'errors' => $errors],
        ]);
    }

    /**
     * Règles de mise à jour : tous les champs deviennent facultatifs mais restent validés.
     *
     * @return array<string, mixed>
     */
    private function updateRules(): array
    {
        $rules = [];
        foreach ($this->rules() as $field => $rule) {
            $parts = is_string($rule) ? explode('|', $rule) : $rule;
            $rules[$field] = array_merge(['sometimes'], $parts);
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function assertOwnedReferences(array $data, int $enterpriseId): void
    {
        $errors = [];
        foreach (self::OWNED_REFERENCES as $field => $target) {
            if (empty($data[$field])) {
                continue;
            }
            $owned = DB::table($target['table'])
                ->where('id', $data[$field])
                ->where($target['column'], $enterpriseId)
                ->exists();
            if (! $owned) {
                $errors[$field] = ['La valeur sélectionnée est introuvable pour votre entreprise.'];
            }
        }

        if (! empty($data['audit_id'])) {
            $owned = DB::table('audits')
                ->join('sites', 'sites.id', '=', 'audits.site_id')
                ->where('audits.id', $data['audit_id'])
                ->where('sites.enterprise_id', $enterpriseId)
                ->exists();
            if (! $owned) {
                $errors['audit_id'] = ['L\'audit sélectionné est introuvable pour votre entreprise.'];
            }
        }

        if ($errors !== []) {
            abort(response()->json(['message' => 'Référence invalide.', 'errors' => $errors], 422));
        }
    }

    private function resolveUserId(string $name, int $enterpriseId): ?int
    {
        $id = DB::table('users')
            ->where('enterprise_id', $enterpriseId)
            ->whereRaw('lower(name) = ?', [mb_strtolower($name)])
            ->value('id');

        return $id ? (int) $id : null;
    }

    private function slug(): string
    {
        return strtolower((string) preg_replace('/[^A-Za-z0-9]+/', '_', $this->modelClass()::make()->getTable()));
    }

    private function spreadsheetResponse(Spreadsheet $spreadsheet, string $filename): BinaryFileResponse
    {
        foreach ($spreadsheet->getActiveSheet()->getColumnIterator() as $column) {
            $spreadsheet->getActiveSheet()->getColumnDimension($column->getColumnIndex())->setAutoSize(true);
        }
        $path = tempnam(sys_get_temp_dir(), 'enr_').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return response()->download($path, $filename)->deleteFileAfterSend(true);
    }
}
