<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Une obligation applicable mais jamais évaluée est « non évaluée » (ISO 14001 §9.1.2), distincte de « non applicable ».
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE compliance_obligation_texts DROP CONSTRAINT IF EXISTS compliance_obligation_texts_compliance_status_check');
        DB::statement("ALTER TABLE compliance_obligation_texts ADD CONSTRAINT compliance_obligation_texts_compliance_status_check CHECK (compliance_status IN ('compliant','partial','non_compliant','not_applicable','not_evaluated'))");
    }

    public function down(): void
    {
        DB::statement("UPDATE compliance_obligation_texts SET compliance_status = 'not_applicable' WHERE compliance_status = 'not_evaluated'");
        DB::statement('ALTER TABLE compliance_obligation_texts DROP CONSTRAINT IF EXISTS compliance_obligation_texts_compliance_status_check');
        DB::statement("ALTER TABLE compliance_obligation_texts ADD CONSTRAINT compliance_obligation_texts_compliance_status_check CHECK (compliance_status IN ('compliant','partial','non_compliant','not_applicable'))");
    }
};
