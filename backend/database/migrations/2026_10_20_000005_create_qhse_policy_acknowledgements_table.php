<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qhse_policy_acknowledgements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('qhse_policy_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->unsignedTinyInteger('quiz_score')->nullable();
            $table->boolean('quiz_passed')->nullable();
            $table->jsonb('quiz_answers')->nullable();
            $table->timestamp('quiz_completed_at')->nullable();
            $table->timestamps();

            $table->unique(['qhse_policy_id', 'user_id']);
            $table->index(['user_id', 'acknowledged_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qhse_policy_acknowledgements');
    }
};
