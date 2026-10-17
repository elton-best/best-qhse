<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('process_risks_opportunities', function (Blueprint $table) {
            $columns = [
                'source_category' => fn () => $table->string('source_category', 40)->nullable(),
                'source_detail' => fn () => $table->text('source_detail')->nullable(),
                'assessment_method' => fn () => $table->string('assessment_method', 20)->nullable(),
                'proportionality_rationale' => fn () => $table->text('proportionality_rationale')->nullable(),
                'decision_rationale' => fn () => $table->text('decision_rationale')->nullable(),
                'desired_effect' => fn () => $table->text('desired_effect')->nullable(),
                'opportunity_decision' => fn () => $table->string('opportunity_decision', 20)->nullable(),
                'continuity_plan' => fn () => $table->text('continuity_plan')->nullable(),
                'continuity_indicator' => fn () => $table->string('continuity_indicator')->nullable(),
                'effectiveness_review' => fn () => $table->text('effectiveness_review')->nullable(),
                'effectiveness_review_date' => fn () => $table->date('effectiveness_review_date')->nullable(),
            ];

            foreach ($columns as $column => $addColumn) {
                if (!Schema::hasColumn('process_risks_opportunities', $column)) {
                    $addColumn();
                }
            }
        });
    }

    public function down(): void
    {
        $columns = [
            'source_category',
            'source_detail',
            'assessment_method',
            'proportionality_rationale',
            'decision_rationale',
            'desired_effect',
            'opportunity_decision',
            'continuity_plan',
            'continuity_indicator',
            'effectiveness_review',
            'effectiveness_review_date',
        ];

        Schema::table('process_risks_opportunities', function (Blueprint $table) use ($columns) {
            $existing = array_values(array_filter(
                $columns,
                fn (string $column) => Schema::hasColumn('process_risks_opportunities', $column),
            ));

            if ($existing !== []) {
                $table->dropColumn($existing);
            }
        });
    }
};
