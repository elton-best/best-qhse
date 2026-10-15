<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ISO 14001:2026 §6.1.2 — Aspects environnementaux significatifs (AES).
 *
 * Migration additive : aucune colonne ni donnée existante n'est modifiée ou supprimée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('environmental_aspects', function (Blueprint $table) {
            $table->string('status', 20)->default('draft');
            $table->string('lifecycle_phase', 30)->nullable();
            $table->string('situation', 20)->default('normal');
            $table->string('control_level', 20)->default('controlled');
            $table->string('aspect_type', 40)->nullable();
            $table->string('impact_nature', 20)->default('negative');
            $table->string('impact_scale', 20)->nullable();
            $table->string('impact_kind', 20)->nullable();
            $table->string('group_label')->nullable();
            $table->boolean('legal_criterion')->default(false);
            $table->boolean('stakeholder_criterion')->default(false);
            $table->string('significance_basis', 20)->nullable();
            $table->boolean('is_emergency_potential')->default(false);
            $table->foreignId('emergency_procedure_id')->nullable()->constrained('emergency_procedures')->nullOnDelete();
            $table->boolean('needs_reassessment')->default(false);
            $table->text('reassessment_reason')->nullable();
            $table->timestamp('reassessment_flagged_at')->nullable();
            $table->date('last_reviewed_at')->nullable();
            $table->date('next_review_date')->nullable();
            $table->json('method_snapshot')->nullable();
            $table->index(['enterprise_id', 'site_id', 'is_significant']);
        });

        Schema::table('emergency_procedures', function (Blueprint $table) {
            $table->foreignId('aspect_id')->nullable()->constrained('environmental_aspects')->nullOnDelete();
            $table->string('hazard_nature')->nullable();
            $table->string('probable_scale')->nullable();
            $table->text('neighbour_risk')->nullable();
        });

        // Paramètres de cotation et de significativité, par organisme (M4-04).
        Schema::create('aes_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('significance_threshold')->default(343);
            $table->unsignedTinyInteger('max_gravity')->default(7);
            $table->unsignedTinyInteger('max_frequency')->default(7);
            $table->unsignedTinyInteger('max_sensitivity')->default(7);
            $table->unsignedTinyInteger('max_mastery')->default(5);
            $table->boolean('use_legal_criterion')->default(true);
            $table->boolean('use_stakeholder_criterion')->default(true);
            $table->unsignedTinyInteger('review_frequency_months')->default(12);
            $table->foreignId('updated_by')->nullable();
            $table->timestamps();
        });

        // Versions figées du registre des aspects (données de preuve : jamais modifiées ni supprimées).
        Schema::create('aes_registry_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('version_number');
            $table->string('label')->nullable();
            $table->json('snapshot');
            $table->json('method');
            $table->unsignedInteger('aspects_count');
            $table->unsignedInteger('significant_count');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['enterprise_id', 'site_id', 'version_number'], 'aes_versions_scope_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('aes_registry_versions');
        Schema::dropIfExists('aes_settings');

        Schema::table('emergency_procedures', function (Blueprint $table) {
            $table->dropConstrainedForeignId('aspect_id');
            $table->dropColumn(['hazard_nature', 'probable_scale', 'neighbour_risk']);
        });

        Schema::table('environmental_aspects', function (Blueprint $table) {
            $table->dropIndex(['enterprise_id', 'site_id', 'is_significant']);
            $table->dropConstrainedForeignId('emergency_procedure_id');
            $table->dropColumn([
                'status', 'lifecycle_phase', 'situation', 'control_level', 'aspect_type', 'impact_nature',
                'impact_scale', 'impact_kind', 'group_label', 'legal_criterion', 'stakeholder_criterion',
                'significance_basis', 'is_emergency_potential', 'needs_reassessment', 'reassessment_reason',
                'reassessment_flagged_at', 'last_reviewed_at', 'next_review_date', 'method_snapshot',
            ]);
        });
    }
};
