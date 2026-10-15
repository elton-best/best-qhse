<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Système de management de l'énergie (ISO 50001:2018).
 *
 * Les IPÉ (`ipe`, `ipe_valeurs`), les consommations (`consommations_energie`)
 * et les équipements (`equipements`) existent déjà et sont réutilisés par clé
 * étrangère ; seules les tables des autres sections énergie sont créées ici.
 */
return new class extends Migration
{
    /**
     * Colonnes communes : référence, périmètre (entreprise + site), responsable.
     */
    private function commonColumns(Blueprint $table): void
    {
        $table->id();
        $table->string('ref')->unique();
        $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
        $table->foreignId('site_id')->constrained()->cascadeOnDelete();
        $table->string('title');
        $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
    }

    private function auditColumns(Blueprint $table): void
    {
        $table->timestamps();
        $table->foreignId('created_by')->nullable();
        $table->foreignId('updated_by')->nullable();
        $table->foreignId('deleted_by')->nullable();
        $table->softDeletes();
        $table->index(['enterprise_id', 'site_id']);
    }

    public function up(): void
    {
        // §6.5 Situation énergétique de référence
        Schema::create('energy_baselines', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->string('energy_source');
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('baseline_consumption', 15, 3);
            $table->string('unit', 30);
            $table->text('relevant_variables')->nullable();
            $table->text('normalization_method')->nullable();
            $table->foreignId('ipe_id')->nullable()->constrained('ipe')->nullOnDelete();
            $table->text('adjustment_notes')->nullable();
            $table->string('status', 20)->default('draft');
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $this->auditColumns($table);
        });

        // §6.6 Planification de la collecte des données énergétiques
        Schema::create('energy_data_collection_plans', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->string('energy_source')->nullable();
            $table->string('data_point');
            $table->text('measurement_method')->nullable();
            $table->foreignId('equipment_id')->nullable()->constrained('equipements')->nullOnDelete();
            $table->string('frequency', 20)->default('monthly');
            $table->string('unit', 30)->nullable();
            $table->string('data_source')->nullable();
            $table->string('storage_location')->nullable();
            $table->date('last_collected_at')->nullable();
            $table->date('next_due_date')->nullable();
            $table->string('status', 20)->default('planned');
            $this->auditColumns($table);
        });

        // §6.2 Objectifs énergétiques, cibles et plans d'action
        Schema::create('energy_objectives', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->string('objective_type', 20)->default('objective');
            $table->foreignId('ipe_id')->nullable()->constrained('ipe')->nullOnDelete();
            $table->string('energy_source')->nullable();
            $table->decimal('baseline_value', 15, 3)->nullable();
            $table->decimal('target_value', 15, 3)->nullable();
            $table->string('unit', 30)->nullable();
            $table->decimal('current_value', 15, 3)->nullable();
            $table->date('deadline')->nullable();
            $table->text('action_plan')->nullable();
            $table->text('resources_needed')->nullable();
            $table->unsignedTinyInteger('progress_percent')->default(0);
            $table->string('status', 20)->default('planned');
            $this->auditColumns($table);
        });

        // §8.3 Conception énergétique
        Schema::create('energy_design_reviews', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->string('project_ref')->nullable();
            $table->string('design_stage', 20)->default('concept');
            $table->text('description')->nullable();
            $table->text('performance_criteria')->nullable();
            $table->decimal('expected_saving', 15, 3)->nullable();
            $table->string('unit', 30)->nullable();
            $table->text('review_notes')->nullable();
            $table->text('outputs')->nullable();
            $table->date('review_date')->nullable();
            $table->string('status', 20)->default('planned');
            $this->auditColumns($table);
        });

        // §8.4 Achats de services énergétiques, produits et énergie
        Schema::create('energy_purchases', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->foreignId('provider_partner_id')->nullable()->constrained('provider_partners')->nullOnDelete();
            $table->string('supplier_name')->nullable();
            $table->string('energy_type');
            $table->string('contract_ref')->nullable();
            $table->decimal('quantity', 15, 3)->nullable();
            $table->string('unit', 30)->nullable();
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->decimal('total_amount', 15, 2)->nullable();
            $table->date('purchase_date')->nullable();
            $table->date('delivery_date')->nullable();
            $table->text('evaluation_criteria')->nullable();
            $table->unsignedTinyInteger('supplier_score')->nullable();
            $table->text('evaluation_notes')->nullable();
            $table->string('status', 20)->default('draft');
            $this->auditColumns($table);
        });

        // §8.4 Achats d'équipements à impact énergétique
        Schema::create('energy_equipment_purchases', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->foreignId('equipment_id')->nullable()->constrained('equipements')->nullOnDelete();
            $table->foreignId('provider_partner_id')->nullable()->constrained('provider_partners')->nullOnDelete();
            $table->string('supplier_name')->nullable();
            $table->string('efficiency_class')->nullable();
            $table->decimal('expected_consumption', 15, 3)->nullable();
            $table->string('unit', 30)->nullable();
            $table->decimal('purchase_cost', 15, 2)->nullable();
            $table->decimal('lifecycle_cost', 15, 2)->nullable();
            $table->date('purchase_date')->nullable();
            $table->text('efficiency_criteria')->nullable();
            $table->text('evaluation_notes')->nullable();
            $table->string('status', 20)->default('draft');
            $this->auditColumns($table);
        });

        // §9.1.1 Surveillance, mesurage et analyse de la performance énergétique
        Schema::create('energy_monitoring_records', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->foreignId('ipe_id')->nullable()->constrained('ipe')->nullOnDelete();
            $table->foreignId('equipment_id')->nullable()->constrained('equipements')->nullOnDelete();
            $table->date('period_start');
            $table->date('period_end');
            $table->decimal('planned_value', 15, 3)->nullable();
            $table->decimal('measured_value', 15, 3);
            $table->decimal('deviation', 15, 3)->nullable();
            $table->decimal('deviation_percent', 8, 2)->nullable();
            $table->string('unit', 30)->nullable();
            $table->text('analysis')->nullable();
            $table->boolean('action_required')->default(false);
            $table->string('status', 20)->default('recorded');
            $this->auditColumns($table);
        });

        // §9.1.2 Évaluation de la conformité aux exigences légales et autres
        Schema::create('energy_compliance_evaluations', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->text('legal_requirement');
            $table->string('source')->nullable();
            $table->string('evaluation_method')->nullable();
            $table->date('evaluation_date')->nullable();
            $table->date('next_evaluation_date')->nullable();
            $table->string('result', 20)->default('not_evaluated');
            $table->text('gap_description')->nullable();
            $table->text('action_required')->nullable();
            $table->text('evidence')->nullable();
            $table->string('status', 20)->default('planned');
            $this->auditColumns($table);
        });

        // §9.2 Audit énergétique interne
        Schema::create('energy_internal_audits', function (Blueprint $table) {
            $this->commonColumns($table);
            $table->foreignId('audit_id')->nullable()->constrained('audits')->nullOnDelete();
            $table->text('scope')->nullable();
            $table->text('criteria')->nullable();
            $table->date('planned_date')->nullable();
            $table->date('actual_date')->nullable();
            $table->string('auditors')->nullable();
            $table->unsignedSmallInteger('nonconformities_count')->default(0);
            $table->unsignedSmallInteger('observations_count')->default(0);
            $table->text('findings')->nullable();
            $table->text('improvement_opportunities')->nullable();
            $table->text('conclusion')->nullable();
            $table->date('next_audit_date')->nullable();
            $table->string('status', 20)->default('planned');
            $this->auditColumns($table);
        });
    }

    public function down(): void
    {
        foreach ([
            'energy_internal_audits',
            'energy_compliance_evaluations',
            'energy_monitoring_records',
            'energy_equipment_purchases',
            'energy_purchases',
            'energy_design_reviews',
            'energy_objectives',
            'energy_data_collection_plans',
            'energy_baselines',
        ] as $tableName) {
            Schema::dropIfExists($tableName);
        }
    }
};
