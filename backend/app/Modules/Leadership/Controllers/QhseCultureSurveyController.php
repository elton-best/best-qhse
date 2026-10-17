<?php

namespace App\Modules\Leadership\Controllers;

use App\Http\Controllers\Api\Concerns\AuthorizesSiteAccess;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class QhseCultureSurveyController extends Controller
{
    use AuthorizesSiteAccess;

    private const VERSION = 1;
    private const MINIMUM_RESPONSES = 5;

    private const QUESTIONS = [
        'quality_integration' => 'La qualité fait partie du travail quotidien de mon équipe.',
        'speak_up_safety' => 'Je peux signaler un problème qualité sans crainte de représailles.',
        'management_listening' => 'La direction prend en compte les préoccupations qualité.',
        'role_clarity' => 'Je connais mes responsabilités dans le système qualité.',
        'change_communication' => 'Les changements qui affectent mon travail me sont expliqués.',
    ];

    private const SUM_COLUMNS = [
        'quality_integration' => 'quality_integration_sum',
        'speak_up_safety' => 'speak_up_safety_sum',
        'management_listening' => 'management_listening_sum',
        'role_clarity' => 'role_clarity_sum',
        'change_communication' => 'change_communication_sum',
    ];

    public function store(Request $request)
    {
        $validated = $request->validate([
            'site_id' => [
                'required',
                'integer',
                Rule::exists('sites', 'id'),
            ],
            ...collect(array_keys(self::QUESTIONS))
                ->mapWithKeys(fn (string $question) => [$question => 'required|integer|min:1|max:5'])
                ->all(),
        ]);
        $site = $this->assertSiteAccess($request, (int) $validated['site_id']);

        DB::transaction(function () use ($site, $validated): void {
            $now = now();
            DB::table('qhse_culture_survey_aggregates')->insertOrIgnore([
                'site_id' => $site->id,
                'questionnaire_version' => self::VERSION,
                'response_count' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            DB::table('qhse_culture_survey_aggregates')
                ->where('site_id', $site->id)
                ->where('questionnaire_version', self::VERSION)
                ->increment('response_count');
            foreach (self::SUM_COLUMNS as $question => $column) {
                DB::table('qhse_culture_survey_aggregates')
                    ->where('site_id', $site->id)
                    ->where('questionnaire_version', self::VERSION)
                    ->increment($column, (int) $validated[$question]);
            }
        });

        return response()->json([
            'message' => 'Votre réponse a été ajoutée aux résultats agrégés.',
            'recorded_with_user_identity' => false,
        ], 201);
    }

    public function summary(Request $request)
    {
        abort_unless($request->user()?->can('leadership.ethics_reports.manage'), 403);
        $validated = $request->validate([
            'site_id' => ['required', 'integer', Rule::exists('sites', 'id')],
        ]);
        $site = $this->assertSiteAccess($request, (int) $validated['site_id']);
        $aggregate = DB::table('qhse_culture_survey_aggregates')
            ->where('site_id', $site->id)
            ->where('questionnaire_version', self::VERSION)
            ->first();

        if (!$aggregate || $aggregate->response_count < self::MINIMUM_RESPONSES) {
            return response()->json([
                'available' => false,
                'minimum_responses' => self::MINIMUM_RESPONSES,
            ]);
        }

        $averages = [];
        foreach (self::SUM_COLUMNS as $question => $column) {
            $averages[$question] = round($aggregate->{$column} / $aggregate->response_count, 1);
        }

        return response()->json([
            'available' => true,
            'response_count' => (int) $aggregate->response_count,
            'scale' => ['min' => 1, 'max' => 5],
            'questions' => self::QUESTIONS,
            'averages' => $averages,
        ]);
    }
}
