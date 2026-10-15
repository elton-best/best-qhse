<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_operations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->foreignId('process_id')->nullable()->constrained('processes')->nullOnDelete();
            $table->foreignId('equipment_id')->nullable()->constrained('equipements')->nullOnDelete();
            $table->string('title', 255);
            $table->string('client_order', 255)->nullable();
            $table->date('planned_date')->nullable();
            $table->text('criteria')->nullable();
            $table->text('control_result')->nullable();
            $table->string('status', 50)->default('planifiee');
            $table->string('released_by', 255)->nullable();
            $table->timestamp('released_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('enterprise_id');
            $table->index('site_id');
            $table->index('process_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_operations');
    }
};
