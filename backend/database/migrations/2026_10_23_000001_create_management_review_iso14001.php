<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revue de direction ISO 14001:2026 §9.3 : réunions multiples, décisions rattachées aux six sorties de 9.3.3
 * (chacune devient une action suivie) et enregistrement signé et scellé.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('management_review_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('review_id')->constrained('management_reviews')->cascadeOnDelete();
            $table->date('held_on');
            $table->json('attendees')->nullable();
            $table->text('notes');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['review_id', 'held_on']);
        });

        Schema::create('management_review_decisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('review_id')->constrained('management_reviews')->cascadeOnDelete();
            $table->string('output_type', 30);
            $table->text('text');
            $table->boolean('not_applicable')->default(false);
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->nullable();
            $table->foreignId('action_id')->nullable()->constrained('actions')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['review_id', 'output_type']);
        });

        Schema::create('management_review_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('review_id')->unique()->constrained('management_reviews')->cascadeOnDelete();
            $table->json('snapshot');
            $table->char('sha256', 64);
            $table->foreignId('signed_by')->constrained('users');
            $table->timestamp('signed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('management_review_records');
        Schema::dropIfExists('management_review_decisions');
        Schema::dropIfExists('management_review_sessions');
    }
};
