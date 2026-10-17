<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Constats d'audit classés comme en ISO 19011 : conforme, point fort, observation, non-conformité.
 */
return new class extends Migration
{
    private const TYPES = "'nc_major','nc_minor','observation','opportunity','good_practice','conforming'";

    public function up(): void
    {
        DB::statement('ALTER TABLE audit_findings DROP CONSTRAINT IF EXISTS audit_findings_type_check');
        DB::statement('ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_type_check CHECK (type::text IN ('.self::TYPES.'))');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE audit_findings DROP CONSTRAINT IF EXISTS audit_findings_type_check');
        DB::statement("ALTER TABLE audit_findings ADD CONSTRAINT audit_findings_type_check CHECK (type::text IN ('nc_major','nc_minor','observation','opportunity','good_practice'))");
    }
};
