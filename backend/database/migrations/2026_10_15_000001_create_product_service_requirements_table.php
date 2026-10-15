<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Exigences relatives aux produits et services (ISO 9001 §8.2).
     */
    public function up(): void
    {
        Schema::create('product_service_requirements', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->enum('requirement_type', ['client', 'legal', 'regulatory', 'normative', 'contractual', 'internal'])->default('client');
            $table->string('source')->nullable();
            $table->text('description')->nullable();
            $table->text('customer_requirements')->nullable();
            $table->text('delivery_requirements')->nullable();
            $table->enum('compliance_status', ['compliant', 'partial', 'non_compliant', 'not_applicable'])->default('not_applicable');
            $table->enum('review_status', ['pending', 'reviewed', 'approved'])->default('pending');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('deadline')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_comment')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_service_requirements');
    }
};
