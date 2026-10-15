<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sorties non conformes (ISO 9001 §8.7).
     */
    public function up(): void
    {
        Schema::create('nonconforming_outputs', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('process_id')->nullable()->constrained('processes')->nullOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('detection_source')->nullable();
            $table->date('detection_date')->nullable();
            $table->decimal('quantity', 12, 2)->nullable();
            $table->string('unit', 50)->nullable();
            $table->enum('severity', ['minor', 'major', 'critical'])->default('minor');
            $table->enum('decision', ['correction', 'derogation', 'rebut', 'retour'])->nullable();
            $table->enum('status', ['detected', 'isolated', 'corrected', 'under_derogation', 'scrapped', 'closed'])->default('detected');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('corrective_action')->nullable();
            $table->string('derogation_reference')->nullable();
            $table->string('derogation_granted_by')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->text('closure_comment')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nonconforming_outputs');
    }
};
