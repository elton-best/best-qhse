<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('qhse_policies', 'leadership_reviews')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->jsonb('leadership_reviews')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('qhse_policies', 'leadership_reviews')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->dropColumn('leadership_reviews');
            });
        }
    }
};
