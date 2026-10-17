<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Performance environnementale et surveillance (ISO 14001:2026 §9.1.1) : indicateurs, relevés traçables,
 * registre des instruments de surveillance et de mesure avec historique d'étalonnage.
 */
return new class extends Migration
{
    private function audit(Blueprint $table): void
    {
        $table->timestamps();
        $table->foreignId('created_by')->nullable();
        $table->foreignId('updated_by')->nullable();
        $table->foreignId('deleted_by')->nullable();
        $table->softDeletes();
    }

    public function up(): void
    {
        Schema::create('monitoring_instruments', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('instrument_type', 40)->default('other');
            $table->string('serial_number')->nullable();
            $table->string('location')->nullable();
            $table->string('measurement_range')->nullable();
            $table->string('accuracy')->nullable();
            $table->date('last_calibration_date')->nullable();
            $table->unsignedSmallInteger('calibration_frequency_days')->default(365);
            $table->date('next_calibration_date')->nullable();
            $table->string('status', 20)->default('in_service');
            $this->audit($table);
            $table->index(['enterprise_id', 'site_id']);
            $table->index('next_calibration_date');
        });

        Schema::create('instrument_calibrations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('instrument_id')->constrained('monitoring_instruments')->cascadeOnDelete();
            $table->date('calibrated_on');
            $table->date('next_due_on')->nullable();
            $table->string('result', 10);
            $table->string('certificate_ref')->nullable();
            $table->string('provider')->nullable();
            $table->text('note')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('environmental_indicators', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('library_code', 40)->nullable();
            $table->string('category', 30)->default('other');
            $table->string('unit', 30);
            $table->text('formula')->nullable();
            $table->string('scope')->nullable();
            $table->text('measurement_method')->nullable();
            $table->string('frequency', 15)->default('monthly');
            $table->string('data_source')->nullable();
            $table->string('threshold_direction', 3)->default('max');
            $table->decimal('target_value', 16, 4)->nullable();
            $table->decimal('alert_threshold', 16, 4)->nullable();
            $table->boolean('allows_negative')->default(false);
            $table->string('normalization', 20)->default('none');
            $table->string('normalization_unit', 30)->nullable();
            $table->foreignId('aspect_id')->nullable()->constrained('environmental_aspects')->nullOnDelete();
            $table->unsignedBigInteger('objective_id')->nullable();
            $table->foreignId('obligation_id')->nullable()->constrained('compliance_obligation_texts')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $this->audit($table);
            $table->unique(['enterprise_id', 'site_id', 'library_code']);
            $table->index(['enterprise_id', 'site_id']);
        });

        Schema::create('indicator_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->foreignId('indicator_id')->constrained('environmental_indicators')->cascadeOnDelete();
            $table->date('measured_on');
            $table->decimal('value', 16, 4);
            $table->string('unit', 30);
            $table->decimal('activity_quantity', 16, 4)->nullable();
            $table->foreignId('instrument_id')->nullable()->constrained('monitoring_instruments')->nullOnDelete();
            $table->boolean('instrument_valid')->nullable();
            $table->string('source', 10)->default('manual');
            $table->string('client_uuid', 64)->nullable();
            $table->string('evidence_path')->nullable();
            $table->string('evidence_name')->nullable();
            $table->text('note')->nullable();
            $table->json('flags')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('supersedes_id')->nullable()->constrained('indicator_readings')->nullOnDelete();
            $table->foreignId('superseded_by_id')->nullable()->constrained('indicator_readings')->nullOnDelete();
            $table->text('correction_reason')->nullable();
            $table->timestamps();
            $table->unique(['enterprise_id', 'client_uuid']);
            $table->index(['indicator_id', 'measured_on']);
        });

        $moduleId = DB::table('modules')->where('code', 'evaluation')->value('id');
        if ($moduleId) {
            DB::table('sub_modules')->updateOrInsert(['code' => 'performance_environnementale'], [
                'module_id' => $moduleId, 'name' => 'Performance environnementale', 'description' => 'Indicateurs, relevés traçables et instruments de mesure (ISO 14001 §9.1.1).',
                'icon' => 'activity', 'route' => 'performance-environnementale', 'order' => 30, 'is_active' => true, 'is_common' => false,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('indicator_readings');
        Schema::dropIfExists('environmental_indicators');
        Schema::dropIfExists('instrument_calibrations');
        Schema::dropIfExists('monitoring_instruments');
        DB::table('sub_modules')->where('code', 'performance_environnementale')->delete();
    }
};
