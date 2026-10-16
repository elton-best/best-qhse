<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Conformité INRS du DUERP (Code du travail R.4121-1 à R.4121-4, INRS ED 840) :
 * motif et traçabilité des mises à jour, consultation des travailleurs, effectifs exposés,
 * hiérarchie des mesures de prévention et risque évalué avec la maîtrise existante.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('duerp', function (Blueprint $table) {
            $table->string('revision_reason', 30)->nullable();
            $table->foreignId('previous_version_id')->nullable()->constrained('duerp')->nullOnDelete();
            $table->json('participants')->nullable();
            $table->text('consultation_notes')->nullable();
            $table->text('methodology_notes')->nullable();
            $table->boolean('update_required')->default(false);
            $table->string('update_reason')->nullable();
            $table->timestamp('update_flagged_at')->nullable();
        });

        Schema::table('duerp_dangers', function (Blueprint $table) {
            $table->unsignedInteger('exposed_workers_count')->nullable();
            $table->string('prevention_type', 20)->nullable();
            $table->date('action_done_at')->nullable();
            $table->unsignedInteger('assessed_risk_score')->nullable();
            $table->string('assessed_risk_level', 20)->nullable();
            $table->decimal('residual_mitigation_coef', 4, 2)->nullable();
            $table->boolean('needs_review')->default(false);
            $table->string('review_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('duerp_dangers', function (Blueprint $table) {
            $table->dropColumn([
                'exposed_workers_count', 'prevention_type', 'action_done_at', 'assessed_risk_score',
                'assessed_risk_level', 'residual_mitigation_coef', 'needs_review', 'review_reason',
            ]);
        });
        Schema::table('duerp', function (Blueprint $table) {
            $table->dropConstrainedForeignId('previous_version_id');
            $table->dropColumn(['revision_reason', 'participants', 'consultation_notes', 'methodology_notes', 'update_required', 'update_reason', 'update_flagged_at']);
        });
    }
};
