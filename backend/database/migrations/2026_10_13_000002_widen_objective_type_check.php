<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE objectives DROP CONSTRAINT IF EXISTS objectives_type_check');
        DB::statement("ALTER TABLE objectives ADD CONSTRAINT objectives_type_check CHECK (type::text = ANY (ARRAY['strategic'::character varying, 'operational'::character varying, 'improvement'::character varying, 'compliance'::character varying, 'quality'::character varying, 'safety'::character varying, 'environmental'::character varying]::text[]))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE objectives DROP CONSTRAINT IF EXISTS objectives_type_check');
        DB::statement("ALTER TABLE objectives ADD CONSTRAINT objectives_type_check CHECK (type::text = ANY (ARRAY['strategic'::character varying, 'operational'::character varying, 'improvement'::character varying, 'compliance'::character varying]::text[]))");
    }
};
