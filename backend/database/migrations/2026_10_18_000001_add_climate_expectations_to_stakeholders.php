<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stakeholders', function (Blueprint $table) {
            if (!Schema::hasColumn('stakeholders', 'climate_expectations')) {
                $table->text('climate_expectations')->nullable()->after('needs_expectations');
            }
        });
    }

    public function down(): void
    {
        Schema::table('stakeholders', function (Blueprint $table) {
            if (Schema::hasColumn('stakeholders', 'climate_expectations')) {
                $table->dropColumn('climate_expectations');
            }
        });
    }
};
