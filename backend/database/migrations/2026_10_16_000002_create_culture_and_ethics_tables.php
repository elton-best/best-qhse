<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Culture de la qualité et comportement éthique (ISO 9001 §5.1.1 i et §7.3 e — Q3-06).
     *
     * - culture_commitments : charte de valeurs et engagements de la direction.
     * - ethics_reports : canal de signalement confidentiel (anonymat possible),
     *   suivi des signalements et de leur traitement. Aucun score individuel.
     */
    public function up(): void
    {
        Schema::create('culture_commitments', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->nullable()->constrained('enterprises')->nullOnDelete();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('type', 30)->default('engagement');
            $table->text('description')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 30)->default('active');
            $table->unsignedSmallInteger('review_frequency_months')->nullable();
            $table->date('last_reviewed_at')->nullable();
            $table->date('next_review_at')->nullable();
            $table->timestamp('published_at')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();

            $table->index(['enterprise_id', 'status']);
            $table->index('next_review_at');
        });

        Schema::create('ethics_reports', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->nullable()->constrained('enterprises')->nullOnDelete();
            $table->foreignId('site_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_anonymous')->default(true);
            $table->string('reporter_name')->nullable();
            $table->string('reporter_email')->nullable();
            $table->string('channel', 30)->default('web');
            $table->string('category', 50)->default('autre');
            $table->string('concerned_area')->nullable();
            $table->text('description');
            $table->timestamp('received_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->string('status', 30)->default('received');
            $table->text('resolution')->nullable();
            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();

            $table->timestamps();
            $table->foreignId('created_by')->nullable();
            $table->foreignId('updated_by')->nullable();
            $table->foreignId('deleted_by')->nullable();
            $table->softDeletes();

            $table->index(['enterprise_id', 'status']);
            $table->index('received_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ethics_reports');
        Schema::dropIfExists('culture_commitments');
    }
};
