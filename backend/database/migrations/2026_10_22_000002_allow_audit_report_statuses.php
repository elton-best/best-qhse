<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Le circuit du rapport d'audit utilise « report_draft » et « report_approved » : la contrainte les refusait,
 * ce qui faisait échouer la génération et l'approbation du rapport.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE audits DROP CONSTRAINT IF EXISTS audits_status_check');
        DB::statement("ALTER TABLE audits ADD CONSTRAINT audits_status_check CHECK (status::text IN ('planned','in_progress','report_draft','report_approved','completed','cancelled'))");
    }

    public function down(): void
    {
        DB::statement("UPDATE audits SET status = 'in_progress' WHERE status IN ('report_draft','report_approved')");
        DB::statement('ALTER TABLE audits DROP CONSTRAINT IF EXISTS audits_status_check');
        DB::statement("ALTER TABLE audits ADD CONSTRAINT audits_status_check CHECK (status::text IN ('planned','in_progress','completed','cancelled'))");
    }
};
