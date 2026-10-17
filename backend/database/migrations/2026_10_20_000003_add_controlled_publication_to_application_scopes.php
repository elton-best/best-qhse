<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('application_scopes', function (Blueprint $table) {
            $table->string('status', 30)->default('draft')->index();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
        });

        DB::table('application_scopes')
            ->where('is_current', true)
            ->update(['status' => 'published']);
        DB::table('application_scopes')
            ->where('is_current', false)
            ->update(['status' => 'superseded']);
    }

    public function down(): void
    {
        Schema::table('application_scopes', function (Blueprint $table) {
            $table->dropForeign(['published_by']);
            $table->dropColumn(['status', 'published_by', 'published_at']);
        });
    }
};
