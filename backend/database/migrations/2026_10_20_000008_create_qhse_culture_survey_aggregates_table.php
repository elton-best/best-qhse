<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qhse_culture_survey_aggregates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->unsignedSmallInteger('questionnaire_version')->default(1);
            $table->unsignedInteger('response_count')->default(0);
            $table->unsignedInteger('quality_integration_sum')->default(0);
            $table->unsignedInteger('speak_up_safety_sum')->default(0);
            $table->unsignedInteger('management_listening_sum')->default(0);
            $table->unsignedInteger('role_clarity_sum')->default(0);
            $table->unsignedInteger('change_communication_sum')->default(0);
            $table->timestamps();
            $table->unique(['site_id', 'questionnaire_version'], 'qhse_culture_survey_site_version_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qhse_culture_survey_aggregates');
    }
};
