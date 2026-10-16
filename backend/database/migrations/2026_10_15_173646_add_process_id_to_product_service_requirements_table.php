<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_service_requirements', function (Blueprint $table) {
            $table->foreignId('process_id')->nullable()->constrained('processes')->nullOnDelete()->after('site_id');
        });
    }

    public function down(): void
    {
        Schema::table('product_service_requirements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('process_id');
        });
    }
};