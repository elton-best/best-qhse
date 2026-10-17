<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('qhse_policies', 'ethics_charter')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->text('ethics_charter')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('qhse_policies', 'ethics_charter')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->dropColumn('ethics_charter');
            });
        }
    }
};
