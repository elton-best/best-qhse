<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('objectives', 'parent_objective_id')) {
            Schema::table('objectives', function (Blueprint $table) {
                $table->foreignId('parent_objective_id')
                    ->nullable()
                    ->after('site_id')
                    ->constrained('objectives')
                    ->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('objectives', 'parent_objective_id')) {
            Schema::table('objectives', function (Blueprint $table) {
                $table->dropConstrainedForeignId('parent_objective_id');
            });
        }
    }
};
