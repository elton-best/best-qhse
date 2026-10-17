<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('application_scopes', function (Blueprint $table) {
            $table->unsignedSmallInteger('review_frequency_months')->default(12);
            $table->date('last_reviewed_at')->nullable();
            $table->date('next_review_date')->nullable()->index();
            $table->timestamp('review_required_at')->nullable();
            $table->text('review_reason')->nullable();
            $table->timestamp('review_notified_at')->nullable();
        });
        DB::table('application_scopes')->orderBy('id')->chunkById(200, function ($scopes) {
            foreach ($scopes as $scope) {
                DB::table('application_scopes')->where('id', $scope->id)->update([
                    'next_review_date' => Carbon::parse($scope->updated_at ?? $scope->created_at)->addYearNoOverflow()->toDateString(),
                ]);
            }
        });
        Schema::create('scope_publications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_scope_id')->constrained('application_scopes')->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->string('token_hash', 64)->unique();
            $table->json('snapshot');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
        Schema::create('leadership_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained('enterprises');
            $table->foreignId('site_id')->constrained('sites');
            $table->unsignedSmallInteger('year');
            $table->string('status')->default('draft');
            $table->json('answers');
            $table->foreignId('reviewed_by')->nullable()->constrained('users');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['site_id', 'year']);
        });
        Schema::table('environmental_aspects', function (Blueprint $table) {
            $table->json('group_members')->nullable();
            $table->text('group_characteristics')->nullable();
        });
        Schema::create('objective_communications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained('enterprises');
            $table->foreignId('site_id')->constrained('sites');
            $table->foreignId('objective_id')->constrained('objectives');
            $table->foreignId('sent_by')->constrained('users');
            $table->json('snapshot');
            $table->string('content_locale', 5)->default('fr');
            $table->text('message')->nullable();
            $table->timestamps();
        });
        Schema::create('objective_communication_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('communication_id')->constrained('objective_communications')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->timestamp('acknowledged_at')->nullable();
            $table->unique(['communication_id', 'user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('objective_communication_receipts');
        Schema::dropIfExists('objective_communications');
        Schema::table('environmental_aspects', fn (Blueprint $table) => $table->dropColumn(['group_members', 'group_characteristics']));
        Schema::dropIfExists('leadership_reviews');
        Schema::dropIfExists('scope_publications');
        Schema::table('application_scopes', fn (Blueprint $table) => $table->dropColumn([
            'review_frequency_months', 'last_reviewed_at', 'next_review_date', 'review_required_at', 'review_reason', 'review_notified_at',
        ]));
    }
};
