<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gestion des changements (ISO 14001:2026 §6.3 et §8.1) : fiche, analyse d'impact, approbation, tâches de mise à jour.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('management_changes', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('change_type', 40);
            $table->string('origin', 10)->default('internal');
            $table->string('duration', 10)->default('permanent');
            $table->boolean('is_planned')->default(true);
            $table->text('description')->nullable();
            $table->date('planned_start_date')->nullable();
            $table->date('planned_end_date')->nullable();
            $table->json('impact_analysis')->nullable();
            $table->json('affected_aspect_ids')->nullable();
            $table->json('resources_requested')->nullable();
            $table->string('resources_decision', 10)->nullable();
            $table->text('resources_decision_note')->nullable();
            $table->text('unplanned_consequences')->nullable();
            $table->text('mitigation_measures')->nullable();
            $table->string('status', 20)->default('requested');
            $table->timestamp('analysis_submitted_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->text('decision_note')->nullable();
            $table->timestamp('implemented_at')->nullable();
            $table->string('review_result', 20)->nullable();
            $table->text('review_note')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();
            $table->index(['enterprise_id', 'site_id', 'status']);
        });

        Schema::create('management_change_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('change_id')->constrained('management_changes')->cascadeOnDelete();
            $table->string('dimension', 20);
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->nullable();
            $table->string('status', 10)->default('todo');
            $table->timestamp('done_at')->nullable();
            $table->foreignId('done_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('done_note')->nullable();
            $table->timestamps();
            $table->index(['change_id', 'status']);
        });

        $moduleId = DB::table('modules')->where('code', 'planification')->value('id');
        if ($moduleId) {
            DB::table('sub_modules')->updateOrInsert(['code' => 'gestion_changements'], [
                'module_id' => $moduleId, 'name' => 'Gestion des changements', 'description' => 'Changements planifiés ou subis et analyse d\'impact (ISO 14001 §6.3).',
                'icon' => 'git-branch', 'route' => 'changements', 'order' => 45, 'is_active' => true, 'is_common' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('management_change_tasks');
        Schema::dropIfExists('management_changes');
        DB::table('sub_modules')->where('code', 'gestion_changements')->delete();
    }
};
