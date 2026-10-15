<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Préparation et réponse aux situations d'urgence (ISO 14001:2026 §8.2).
 *
 * Les scénarios restent dans `emergency_procedures` (étendue, rien n'est supprimé) ; l'annuaire, les moyens
 * d'intervention, les exercices et les événements réels sont de nouveaux registres rattachés aux scénarios.
 */
return new class extends Migration
{
    private function common(Blueprint $table): void
    {
        $table->id();
        $table->string('ref')->unique();
        $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
        $table->foreignId('site_id')->constrained()->cascadeOnDelete();
        $table->string('title');
        $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
    }

    private function audit(Blueprint $table): void
    {
        $table->timestamps();
        $table->foreignId('created_by')->nullable();
        $table->foreignId('updated_by')->nullable();
        $table->foreignId('deleted_by')->nullable();
        $table->softDeletes();
        $table->index(['enterprise_id', 'site_id']);
    }

    public function up(): void
    {
        // M13-02 : plan de réponse par scénario.
        Schema::table('emergency_procedures', function (Blueprint $table) {
            $table->text('prevention_actions')->nullable();
            $table->text('mitigation_actions')->nullable();
            $table->text('internal_communication')->nullable();
            $table->text('external_communication')->nullable();
            $table->text('evacuation_routes')->nullable();
            $table->text('assembly_points')->nullable();
            $table->date('next_review_date')->nullable();
            $table->date('last_reviewed_at')->nullable();
            $table->string('review_reason')->nullable();
        });

        // M13-03 : annuaire d'urgence.
        Schema::create('emergency_contacts', function (Blueprint $table) {
            $this->common($table);
            $table->string('category', 30)->default('staff');
            $table->string('job_role')->nullable();
            $table->string('phone', 50);
            $table->string('phone_alt', 50)->nullable();
            $table->string('email')->nullable();
            $table->boolean('available_24h')->default(false);
            $table->foreignId('procedure_id')->nullable()->constrained('emergency_procedures')->nullOnDelete();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $this->audit($table);
        });

        // M13-04 : inventaire des moyens d'intervention.
        Schema::create('emergency_resources', function (Blueprint $table) {
            $this->common($table);
            $table->string('resource_type', 30)->default('extinguisher');
            $table->string('location')->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->string('specification')->nullable();
            $table->date('last_check_date')->nullable();
            $table->unsignedSmallInteger('check_frequency_days')->default(365);
            $table->date('next_check_date')->nullable();
            $table->string('status', 20)->default('operational');
            $table->foreignId('procedure_id')->nullable()->constrained('emergency_procedures')->nullOnDelete();
            $this->audit($table);
            $table->index('next_check_date');
        });

        // M13-05 : exercices et simulations.
        Schema::create('emergency_exercises', function (Blueprint $table) {
            $this->common($table);
            $table->foreignId('procedure_id')->constrained('emergency_procedures')->cascadeOnDelete();
            $table->string('exercise_type', 20)->default('drill');
            $table->date('planned_date')->nullable();
            $table->date('performed_date')->nullable();
            $table->unsignedSmallInteger('participants_count')->nullable();
            $table->text('participants')->nullable();
            $table->text('description')->nullable();
            $table->text('findings')->nullable();
            $table->text('actions_required')->nullable();
            $table->text('stakeholders_informed')->nullable();
            $table->string('status', 20)->default('planned');
            $this->audit($table);
            $table->index(['procedure_id', 'performed_date']);
        });

        // M13-06 : situations d'urgence réelles et retour d'expérience.
        Schema::create('emergency_events', function (Blueprint $table) {
            $this->common($table);
            $table->foreignId('procedure_id')->nullable()->constrained('emergency_procedures')->nullOnDelete();
            $table->string('event_type', 100)->nullable();
            $table->string('severity', 20)->default('minor');
            $table->timestamp('declared_at');
            $table->foreignId('declared_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('description')->nullable();
            $table->json('timeline');
            $table->timestamp('contained_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->text('debrief')->nullable();
            $table->text('lessons_actions')->nullable();
            $table->boolean('plan_revision_requested')->default(false);
            $table->unsignedSmallInteger('aspects_flagged')->default(0);
            $table->string('status', 20)->default('ongoing');
            $this->audit($table);
            $table->index(['status', 'declared_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emergency_events');
        Schema::dropIfExists('emergency_exercises');
        Schema::dropIfExists('emergency_resources');
        Schema::dropIfExists('emergency_contacts');

        Schema::table('emergency_procedures', function (Blueprint $table) {
            $table->dropColumn([
                'prevention_actions', 'mitigation_actions', 'internal_communication', 'external_communication',
                'evacuation_routes', 'assembly_points', 'next_review_date', 'last_reviewed_at', 'review_reason',
            ]);
        });
    }
};
