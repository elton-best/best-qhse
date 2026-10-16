<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Q8 — Ressources et connaissances (ISO 9001 §7.1.5 / §7.1.6).
     *
     * - calibration_plans : rattachement au registre réel `equipements` (et non
     *   plus à la table legacy `equipment`), adéquation à l'usage, étalon de
     *   référence et protection contre les réglages intempestifs (§7.1.5.1).
     * - calibration_records : analyse d'impact en cas d'étalonnage non conforme
     *   (§7.1.5.2).
     * - organizational_knowledges : base de connaissances organisationnelles
     *   (sources, détenteur, criticité, transmission, revue périodique §7.1.6).
     */
    public function up(): void
    {
        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->text('usage_fitness')->nullable()->after('service_provider_accreditation');
            $table->string('reference_standard')->nullable()->after('usage_fitness');
            $table->boolean('reference_standard_documented')->default(false)->after('reference_standard');
            $table->boolean('protected_against_adjustment')->default(true)->after('reference_standard_documented');
        });

        Schema::table('calibration_records', function (Blueprint $table) {
            $table->text('impact_analysis')->nullable()->after('conformity_status');
            $table->boolean('impact_assessed')->default(false)->after('impact_analysis');
            // Le certificat peut être fourni a posteriori.
            $table->string('certificate_path', 500)->nullable()->change();
        });

        // L'échéance est recalculée à partir de la fréquence lors de l'étalonnage.
        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->date('next_calibration_date')->nullable()->change();
        });

        // Réorienter la FK vers le registre d'équipements utilisé par l'application.
        DB::table('calibration_plans')
            ->whereNotIn('equipment_id', DB::table('equipements')->select('id'))
            ->update(['equipment_id' => null]);

        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->dropForeign(['equipment_id']);
        });

        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->foreignId('equipment_id')->nullable()->change();
            $table->foreign('equipment_id')->references('id')->on('equipements')->nullOnDelete();
        });

        Schema::create('organizational_knowledges', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->nullable()->constrained('enterprises')->nullOnDelete();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('category', 30)->default('experience');
            $table->text('description')->nullable();
            $table->foreignId('holder_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_critical')->default(false);
            $table->boolean('single_holder')->default(false);
            $table->foreignId('successor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('transfer_plan')->nullable();
            $table->text('sharing_evidence')->nullable();
            $table->unsignedSmallInteger('review_frequency_months')->nullable();
            $table->date('last_reviewed_at')->nullable();
            $table->date('next_review_at')->nullable();
            $table->string('status', 30)->default('active');

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();

            $table->index(['enterprise_id', 'status']);
            $table->index('next_review_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizational_knowledges');

        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->dropForeign(['equipment_id']);
        });

        DB::table('calibration_plans')->whereNull('equipment_id')->delete();

        Schema::table('calibration_plans', function (Blueprint $table) {
            $table->foreignId('equipment_id')->nullable(false)->change();
            $table->foreign('equipment_id')->references('id')->on('equipment')->cascadeOnDelete();
            $table->dropColumn(['usage_fitness', 'reference_standard', 'reference_standard_documented', 'protected_against_adjustment']);
        });

        Schema::table('calibration_records', function (Blueprint $table) {
            $table->dropColumn(['impact_analysis', 'impact_assessed']);
        });
    }
};
