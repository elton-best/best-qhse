<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Registre de conformité unifié (ISO 14001:2026 §6.1.3 et §9.1.2).
 *
 * `compliance_obligation_texts` devient le registre unique. Migration additive : les colonnes et
 * données existantes sont conservées, les anciennes structures (`obligations_conformite_environnementales`,
 * `applicable_requirements`, `compliance_requirements`) ne sont ni modifiées ni supprimées ; la commande
 * `compliance:migrate-legacy` en recopie le contenu sans doublon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('compliance_obligation_texts', function (Blueprint $table) {
            $table->foreignId('enterprise_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title')->nullable();
            $table->string('source_type', 30)->default('law');
            $table->string('authority')->nullable();
            $table->string('source_url')->nullable();
            $table->boolean('is_applicable')->nullable();
            $table->text('applicability_justification')->nullable();
            $table->foreignId('applicability_decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('applicability_decided_at')->nullable();
            $table->string('permit_number')->nullable();
            $table->date('expiry_date')->nullable();
            $table->date('last_evaluation_date')->nullable();
            $table->date('next_evaluation_date')->nullable();
            $table->string('analysis_status', 20)->default('analyzed');
            $table->text('analysis_note')->nullable();
            $table->foreignId('analyzed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('analyzed_at')->nullable();
            $table->foreignId('agreement_parent_id')->nullable()->constrained('compliance_obligation_texts')->nullOnDelete();
            $table->string('legacy_table', 60)->nullable();
            $table->unsignedBigInteger('legacy_id')->nullable();
            $table->index(['enterprise_id', 'site_id']);
            $table->index('expiry_date');
            $table->unique(['legacy_table', 'legacy_id'], 'compliance_texts_legacy_unique');
        });

        // Les textes existants prennent le périmètre de leur thème.
        DB::statement('
            UPDATE compliance_obligation_texts t
            SET site_id = a.site_id, enterprise_id = s.enterprise_id
            FROM compliance_obligation_aspects a
            JOIN sites s ON s.id = a.site_id
            WHERE t.aspect_id = a.id
        ');

        // Lien obligation <-> aspects environnementaux (M5-02).
        Schema::create('compliance_obligation_environmental_aspect', function (Blueprint $table) {
            $table->id();
            $table->foreignId('text_id')->constrained('compliance_obligation_texts')->cascadeOnDelete();
            $table->foreignId('environmental_aspect_id')->constrained('environmental_aspects')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['text_id', 'environmental_aspect_id'], 'compliance_text_aspect_unique');
        });

        // Historique des évaluations : preuve, jamais modifié ni supprimé (M5-03).
        Schema::create('compliance_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('text_id')->constrained('compliance_obligation_texts')->cascadeOnDelete();
            $table->date('evaluated_at');
            $table->foreignId('evaluator_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('result', 20);
            $table->string('method')->nullable();
            $table->text('evidence')->nullable();
            $table->string('evidence_path')->nullable();
            $table->boolean('external')->default(false);
            $table->string('external_body')->nullable();
            $table->text('comment')->nullable();
            $table->string('gap_status', 20)->default('none');
            $table->foreignId('nonconformity_id')->nullable()->constrained('non_conformities')->nullOnDelete();
            $table->timestamps();
            $table->index(['text_id', 'evaluated_at']);
        });

        // Sous-module du catalogue : le registre légal sert toutes les normes (commun).
        $moduleId = DB::table('modules')->where('code', 'planification')->value('id');
        if ($moduleId) {
            DB::table('sub_modules')->updateOrInsert(
                ['code' => 'obligations_conformite'],
                [
                    'module_id' => $moduleId,
                    'name' => 'Obligations de conformité',
                    'description' => 'Registre des obligations de conformité et évaluation périodique (ISO 14001 §6.1.3 et §9.1.2).',
                    'icon' => 'scale',
                    'route' => 'obligations',
                    'order' => 40,
                    'is_active' => true,
                    'is_common' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }
    }

    public function down(): void
    {
        DB::table('sub_modules')->where('code', 'obligations_conformite')->delete();
        Schema::dropIfExists('compliance_evaluations');
        Schema::dropIfExists('compliance_obligation_environmental_aspect');

        Schema::table('compliance_obligation_texts', function (Blueprint $table) {
            $table->dropUnique('compliance_texts_legacy_unique');
            $table->dropIndex(['enterprise_id', 'site_id']);
            $table->dropIndex(['expiry_date']);
            $table->dropConstrainedForeignId('agreement_parent_id');
            $table->dropConstrainedForeignId('analyzed_by');
            $table->dropConstrainedForeignId('applicability_decided_by');
            $table->dropConstrainedForeignId('site_id');
            $table->dropConstrainedForeignId('enterprise_id');
            $table->dropColumn([
                'title', 'source_type', 'authority', 'source_url', 'is_applicable', 'applicability_justification',
                'applicability_decided_at', 'permit_number', 'expiry_date', 'last_evaluation_date', 'next_evaluation_date',
                'analysis_status', 'analysis_note', 'analyzed_at', 'legacy_table', 'legacy_id',
            ]);
        });
    }
};
