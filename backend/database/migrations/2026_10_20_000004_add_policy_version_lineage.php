<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('qhse_policies', 'based_on_policy_id')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->foreignId('based_on_policy_id')
                    ->nullable()
                    ->unique()
                    ->constrained('qhse_policies')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('qhse_policies', 'based_on_policy_id')) {
            Schema::table('qhse_policies', function (Blueprint $table) {
                $table->dropConstrainedForeignId('based_on_policy_id');
            });
        }
    }
};
