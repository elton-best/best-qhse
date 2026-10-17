<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('objectives', function (Blueprint $table) {
            if (!Schema::hasColumn('objectives', 'level')) {
                $table->string('level', 20)->nullable();
            }

            if (!Schema::hasColumn('objectives', 'evaluation_method')) {
                $table->text('evaluation_method')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('objectives', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('objectives', 'level') ? 'level' : null,
                Schema::hasColumn('objectives', 'evaluation_method') ? 'evaluation_method' : null,
            ]);

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
