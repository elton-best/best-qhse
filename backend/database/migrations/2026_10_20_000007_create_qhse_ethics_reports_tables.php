<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qhse_ethics_reports', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained('sites')->restrictOnDelete();
            $table->foreignId('reporter_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('tracking_token_hash', 64)->unique();
            $table->string('category', 40);
            $table->string('subject', 180);
            $table->longText('description');
            $table->date('incident_date')->nullable();
            $table->boolean('is_anonymous')->default(false);
            $table->string('status', 32)->default('received');
            $table->longText('public_update')->nullable();
            $table->longText('handling_notes')->nullable();
            $table->foreignId('handled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('handled_at')->nullable();
            $table->timestamps();
            $table->index(['enterprise_id', 'site_id', 'status']);
            $table->index(['reporter_user_id', 'created_at']);
        });

        Schema::create('qhse_ethics_report_events', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('report_id')->constrained('qhse_ethics_reports')->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event_type', 32);
            $table->string('from_status', 32)->nullable();
            $table->string('to_status', 32);
            $table->longText('notes')->nullable();
            $table->timestamps();
            $table->index(['report_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qhse_ethics_report_events');
        Schema::dropIfExists('qhse_ethics_reports');
    }
};
