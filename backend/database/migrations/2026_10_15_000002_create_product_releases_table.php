<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_releases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->nullable()->constrained('sites')->nullOnDelete();
            $table->foreignId('production_operation_id')->constrained('production_operations')->cascadeOnDelete();
            $table->string('batch_number', 255);
            $table->text('criteria')->nullable();
            $table->date('release_date')->nullable();
            $table->string('status', 50)->default('en_attente');
            $table->string('authorized_by', 255)->nullable();
            $table->text('decision_notes')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('enterprise_id');
            $table->index('site_id');
            $table->index('production_operation_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_releases');
    }
};
