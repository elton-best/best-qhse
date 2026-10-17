<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contexts', function (Blueprint $table) {
            if (!Schema::hasColumn('contexts', 'review_frequency_months')) {
                $table->unsignedSmallInteger('review_frequency_months')->nullable();
            }
            if (!Schema::hasColumn('contexts', 'last_reviewed_at')) {
                $table->timestamp('last_reviewed_at')->nullable();
            }
            if (!Schema::hasColumn('contexts', 'next_review_at')) {
                $table->date('next_review_at')->nullable();
            }
            if (!Schema::hasColumn('contexts', 'last_review_reminder_at')) {
                $table->timestamp('last_review_reminder_at')->nullable();
            }
        });

        if (!Schema::hasTable('context_reviews')) {
            Schema::create('context_reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('context_id')->constrained('contexts')->cascadeOnDelete();
                $table->foreignId('reviewer_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at');
                $table->text('summary');
                $table->json('snapshot');
                $table->timestamps();

                $table->index(['context_id', 'reviewed_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('context_reviews');

        Schema::table('contexts', function (Blueprint $table) {
            $columns = array_filter(
                ['review_frequency_months', 'last_reviewed_at', 'next_review_at', 'last_review_reminder_at'],
                fn (string $column): bool => Schema::hasColumn('contexts', $column),
            );
            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
