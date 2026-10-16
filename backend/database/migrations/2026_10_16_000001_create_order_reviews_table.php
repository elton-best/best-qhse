<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Revue des exigences avant engagement — commandes et contrats (ISO 9001 §8.2.3).
     *
     * Checklist des cinq points de 8.2.3 b) et blocage de l'engagement tant que
     * les écarts avec une demande antérieure ne sont pas résolus.
     */
    public function up(): void
    {
        Schema::create('order_reviews', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->nullable()->constrained('enterprises')->nullOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('customer_name')->nullable();
            $table->string('order_reference')->nullable();
            $table->string('engagement_type', 30)->default('commande');
            $table->date('review_date')->nullable();
            $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();

            // Checklist 8.2.3 b) — cinq points obligatoires.
            $table->boolean('requirements_stated')->nullable();
            $table->boolean('requirements_implied')->nullable();
            $table->boolean('requirements_org')->nullable();
            $table->boolean('requirements_legal')->nullable();
            $table->boolean('differences_previous')->nullable();
            $table->text('checklist_notes')->nullable();

            // Écarts avec une demande antérieure (le cas échéant) et leur résolution.
            $table->text('differences_detail')->nullable();
            $table->boolean('differences_resolved')->default(false);
            $table->text('resolution_notes')->nullable();

            // Q12-05 : cas sans énoncé écrit / vente en ligne.
            $table->boolean('verbal_confirmation')->default(false);
            $table->boolean('catalogue_review')->default(false);

            // Q12-06 : modifications d'exigences (avenants) et notification.
            $table->text('amendments')->nullable();
            $table->boolean('amendment_notified')->default(false);
            $table->string('amendment_notified_to')->nullable();

            $table->string('status', 30)->default('draft');
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->text('validation_comment')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();

            $table->index(['site_id', 'status']);
            $table->index('review_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_reviews');
    }
};
