<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Non-conformités et amélioration continue (ISO 14001:2026 §10) : déclaration rapide, traitement immédiat, décision
 * proportionnée, analyse des causes guidée, récurrence, mise à jour du SME, escalade, registre des opportunités.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('non_conformities', function (Blueprint $table) {
            $table->string('report_source', 25)->nullable();
            $table->string('location')->nullable();
            $table->json('photos')->nullable();
            $table->string('client_uuid', 64)->nullable()->unique();
            $table->boolean('environmental_impact')->default(false);
            $table->text('immediate_action')->nullable();
            $table->timestamp('immediate_action_at')->nullable();
            $table->foreignId('immediate_action_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('consequences_treatment')->nullable();
            $table->text('impact_mitigation')->nullable();
            $table->string('corrective_decision', 15)->nullable();
            $table->text('decision_justification')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('root_cause_method', 15)->nullable();
            $table->json('five_whys')->nullable();
            $table->json('cause_effect')->nullable();
            $table->boolean('is_recurrent')->default(false);
            $table->json('similar_ids')->nullable();
            $table->text('resources_needed')->nullable();
            $table->boolean('sme_update_required')->default(false);
            $table->text('sme_update_note')->nullable();
            $table->boolean('sme_update_done')->default(false);
            $table->unsignedSmallInteger('escalation_level')->default(0);
            $table->timestamp('escalated_at')->nullable();
        });

        Schema::table('improvement_suggestions', function (Blueprint $table) {
            $table->string('source_type', 20)->default('staff');
            $table->string('source_ref')->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->text('decision_note')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('action_id')->nullable()->constrained('actions')->nullOnDelete();
            $table->unique(['source_type', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::table('improvement_suggestions', function (Blueprint $table) {
            $table->dropUnique(['source_type', 'source_id']);
            $table->dropConstrainedForeignId('action_id');
            $table->dropConstrainedForeignId('decided_by');
            $table->dropColumn(['source_type', 'source_ref', 'source_id', 'decision_note', 'decided_at']);
        });
        Schema::table('non_conformities', function (Blueprint $table) {
            $table->dropConstrainedForeignId('immediate_action_by');
            $table->dropConstrainedForeignId('decided_by');
            $table->dropColumn([
                'report_source', 'location', 'photos', 'client_uuid', 'environmental_impact', 'immediate_action', 'immediate_action_at', 'consequences_treatment',
                'impact_mitigation', 'corrective_decision', 'decision_justification', 'decided_at', 'root_cause_method', 'five_whys', 'cause_effect', 'is_recurrent',
                'similar_ids', 'resources_needed', 'sme_update_required', 'sme_update_note', 'sme_update_done', 'escalation_level', 'escalated_at',
            ]);
        });
    }
};
