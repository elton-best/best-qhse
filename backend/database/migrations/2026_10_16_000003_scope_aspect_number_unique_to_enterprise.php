<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Le numéro d'aspect était unique pour toute la plateforme : deux organismes ne pouvaient
 * pas utiliser la même numérotation. Il devient unique par organisme.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('environmental_aspects', function (Blueprint $table) {
            $table->dropUnique('environmental_aspects_aspect_number_unique');
            $table->unique(['enterprise_id', 'aspect_number'], 'environmental_aspects_enterprise_number_unique');
        });
    }

    public function down(): void
    {
        Schema::table('environmental_aspects', function (Blueprint $table) {
            $table->dropUnique('environmental_aspects_enterprise_number_unique');
            $table->unique('aspect_number');
        });
    }
};
