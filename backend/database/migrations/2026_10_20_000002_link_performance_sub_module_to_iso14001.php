<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $subModuleId = DB::table('sub_modules')->where('code', 'performance_environnementale')->value('id');
        $normId = DB::table('norms')->where('code', 'like', 'ISO 14001%')->value('id');
        if ($subModuleId && $normId) {
            DB::table('norm_sub_module')->updateOrInsert(
                ['norm_id' => $normId, 'sub_module_id' => $subModuleId],
                ['created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        $subModuleId = DB::table('sub_modules')->where('code', 'performance_environnementale')->value('id');
        if ($subModuleId) {
            DB::table('norm_sub_module')->where('sub_module_id', $subModuleId)->delete();
        }
    }
};
