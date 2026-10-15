<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Conception et développement des produits et services (ISO 9001 §8.3).
     */
    public function up(): void
    {
        Schema::create('design_developments', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('project_code')->nullable();
            $table->enum('stage', ['planning', 'inputs', 'controls', 'outputs', 'changes'])->default('planning');
            $table->enum('status', ['draft', 'in_progress', 'in_review', 'validated', 'closed'])->default('draft');
            $table->text('description')->nullable();
            $table->text('inputs')->nullable();
            $table->text('outputs')->nullable();
            $table->text('controls')->nullable();
            $table->text('changes')->nullable();
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('planned_date')->nullable();
            $table->date('actual_date')->nullable();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->text('validation_comment')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('design_developments');
    }
};
