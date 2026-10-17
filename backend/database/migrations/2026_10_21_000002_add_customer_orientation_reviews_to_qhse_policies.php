<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('qhse_policies', 'customer_orientation_reviews')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->jsonb('customer_orientation_reviews')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('qhse_policies', 'customer_orientation_reviews')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->dropColumn('customer_orientation_reviews');
            });
        }
    }
};
