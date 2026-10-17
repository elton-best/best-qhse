<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('process_risks_opportunities', function (Blueprint $table) {
            if (!Schema::hasColumn('process_risks_opportunities', 'effectiveness_result')) {
                $table->string('effectiveness_result', 30)->nullable();
            }

            if (!Schema::hasColumn('process_risks_opportunities', 'effectiveness_reviewed_by')) {
                $table->foreignId('effectiveness_reviewed_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('process_risks_opportunities', 'effectiveness_reviewed_by')) {
            Schema::table('process_risks_opportunities', function (Blueprint $table) {
                $table->dropConstrainedForeignId('effectiveness_reviewed_by');
            });
        }

        if (Schema::hasColumn('process_risks_opportunities', 'effectiveness_result')) {
            Schema::table('process_risks_opportunities', function (Blueprint $table) {
                $table->dropColumn('effectiveness_result');
            });
        }
    }
};
