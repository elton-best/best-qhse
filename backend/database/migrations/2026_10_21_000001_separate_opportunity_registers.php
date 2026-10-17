<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('opportunities')) {
            return;
        }

        Schema::table('opportunities', function (Blueprint $table) {
            $columns = [
                'source_category' => fn () => $table->string('source_category', 40)->nullable(),
                'source_detail' => fn () => $table->text('source_detail')->nullable(),
                'assessment_method' => fn () => $table->string('assessment_method', 20)->nullable(),
                'desired_effect' => fn () => $table->text('desired_effect')->nullable(),
                'opportunity_decision' => fn () => $table->string('opportunity_decision', 20)->nullable(),
                'decision_rationale' => fn () => $table->text('decision_rationale')->nullable(),
                'quality_status' => fn () => $table->string('quality_status', 30)->nullable(),
                'probabilite' => fn () => $table->unsignedTinyInteger('probabilite')->nullable(),
                'gravite' => fn () => $table->unsignedTinyInteger('gravite')->nullable(),
                'criticite' => fn () => $table->unsignedTinyInteger('criticite')->nullable(),
                'niveau' => fn () => $table->string('niveau', 20)->nullable(),
                'probabilite_residuelle' => fn () => $table->unsignedTinyInteger('probabilite_residuelle')->nullable(),
                'gravite_residuelle' => fn () => $table->unsignedTinyInteger('gravite_residuelle')->nullable(),
                'criticite_residuelle' => fn () => $table->unsignedTinyInteger('criticite_residuelle')->nullable(),
                'planned_actions' => fn () => $table->jsonb('planned_actions')->nullable(),
                'normes_iso' => fn () => $table->jsonb('normes_iso')->nullable(),
                'effectiveness_result' => fn () => $table->string('effectiveness_result', 30)->nullable(),
                'effectiveness_review' => fn () => $table->text('effectiveness_review')->nullable(),
                'effectiveness_review_date' => fn () => $table->date('effectiveness_review_date')->nullable(),
                'effectiveness_reviewed_by' => fn () => $table->foreignId('effectiveness_reviewed_by')
                    ->nullable()->constrained('users')->nullOnDelete(),
                'legacy_process_risk_opportunity_id' => fn () => $table->unsignedBigInteger('legacy_process_risk_opportunity_id')
                    ->nullable()->unique(),
            ];

            foreach ($columns as $column => $addColumn) {
                if (!Schema::hasColumn('opportunities', $column)) {
                    $addColumn();
                }
            }

            if (Schema::hasColumn('opportunities', 'responsible_id')) {
                $table->foreignId('responsible_id')->nullable()->change();
            }
        });

        $this->copyLegacyOpportunities();
    }

    public function down(): void
    {
        if (!Schema::hasTable('opportunities')) {
            return;
        }

        $foreignKeys = ['effectiveness_reviewed_by'];
        foreach ($foreignKeys as $column) {
            if (Schema::hasColumn('opportunities', $column)) {
                Schema::table('opportunities', function (Blueprint $table) use ($column) {
                    $table->dropForeign([$column]);
                });
            }
        }

        $columns = [
            'source_category',
            'source_detail',
            'assessment_method',
            'desired_effect',
            'opportunity_decision',
            'decision_rationale',
            'quality_status',
            'probabilite',
            'gravite',
            'criticite',
            'niveau',
            'probabilite_residuelle',
            'gravite_residuelle',
            'criticite_residuelle',
            'planned_actions',
            'normes_iso',
            'effectiveness_result',
            'effectiveness_review',
            'effectiveness_review_date',
            'effectiveness_reviewed_by',
            'legacy_process_risk_opportunity_id',
        ];

        $existing = array_values(array_filter(
            $columns,
            fn (string $column) => Schema::hasColumn('opportunities', $column),
        ));

        if ($existing !== []) {
            Schema::table('opportunities', function (Blueprint $table) use ($existing) {
                $table->dropColumn($existing);
            });
        }
    }

    private function copyLegacyOpportunities(): void
    {
        if (
            !Schema::hasTable('process_risks_opportunities')
            || !Schema::hasTable('processes')
            || !Schema::hasTable('sites')
        ) {
            return;
        }

        DB::table('process_risks_opportunities')
            ->where('type', 'opportunite')
            ->orderBy('id')
            ->chunkById(100, function ($rows): void {
                foreach ($rows as $row) {
                    $legacyReference = 'LEGACY-OPP-' . str_pad((string) $row->id, 8, '0', STR_PAD_LEFT);
                    if (DB::table('opportunities')
                        ->where(function ($query) use ($row, $legacyReference) {
                            $query->where('legacy_process_risk_opportunity_id', $row->id)
                                ->orWhere('ref', $legacyReference);
                        })
                        ->exists()) {
                        continue;
                    }

                    $process = DB::table('processes')->where('id', $row->process_id)->first();
                    if (!$process || !$process->site_id) {
                        continue;
                    }

                    $site = DB::table('sites')->where('id', $process->site_id)->first();
                    if (!$site) {
                        continue;
                    }

                    $qualityStatus = match ($row->status ?? 'identifie') {
                        'en_cours' => 'en_cours',
                        'traite' => 'traite',
                        'surveille' => 'surveille',
                        'cloture' => 'cloture',
                        default => 'identifie',
                    };
                    $legacyStatus = match ($qualityStatus) {
                        'en_cours' => 'evaluated',
                        'traite' => 'exploited',
                        'surveille', 'cloture' => 'monitored',
                        default => 'identified',
                    };

                    DB::table('opportunities')->insert([
                        'ref' => $legacyReference,
                        'enterprise_id' => $site->enterprise_id ?? null,
                        'process_id' => $row->process_id,
                        'site_id' => $process->site_id,
                        'title' => $row->title ?: $row->description,
                        'description' => $row->description ?: $row->title,
                        'exploitation_actions' => $row->actions_prevues ?? null,
                        'responsible_id' => $row->responsible_user_id ?? null,
                        'responsible_user_id' => $row->responsible_user_id ?? null,
                        'deadline' => $row->target_date ?? null,
                        'status' => $legacyStatus,
                        'source_category' => $row->source_category ?? 'autre',
                        'source_detail' => $row->source_detail ?? $row->description,
                        'assessment_method' => $row->assessment_method ?? 'qualitative',
                        'desired_effect' => $row->desired_effect ?? null,
                        'opportunity_decision' => $row->opportunity_decision ?? null,
                        'decision_rationale' => $row->decision_rationale ?? null,
                        'quality_status' => $qualityStatus,
                        'probabilite' => $row->probabilite ?? 2,
                        'gravite' => $row->gravite ?? 2,
                        'criticite' => $row->criticite ?? 4,
                        'niveau' => $row->niveau ?? 'moyen',
                        'probabilite_residuelle' => $row->probabilite_residuelle ?? null,
                        'gravite_residuelle' => $row->gravite_residuelle ?? null,
                        'criticite_residuelle' => $row->criticite_residuelle ?? null,
                        'planned_actions' => $row->planned_actions ?? null,
                        'normes_iso' => $row->normes_iso ?? null,
                        'effectiveness_result' => $row->effectiveness_result ?? null,
                        'effectiveness_review' => $row->effectiveness_review ?? null,
                        'effectiveness_review_date' => $row->effectiveness_review_date ?? null,
                        'effectiveness_reviewed_by' => $row->effectiveness_reviewed_by ?? null,
                        'legacy_process_risk_opportunity_id' => $row->id,
                        'created_by' => $row->created_by ?? null,
                        'created_at' => $row->created_at,
                        'updated_at' => $row->updated_at,
                        'deleted_at' => $row->deleted_at ?? null,
                    ]);
                }
            });
    }
};
