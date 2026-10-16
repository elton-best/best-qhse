<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sensibilisation (ISO 14001:2026 §7.3) : campagnes couvrant les quatre points de 7.3, supports avec accusé de lecture,
 * causeries de 10 minutes avec émargement par QR code, personnes extérieures invitées avec attestation.
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
        Schema::create('awareness_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('objective')->nullable();
            $table->string('audience', 15)->default('all_site');
            $table->json('selected_user_ids')->nullable();
            $table->json('aspect_ids')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('status', 10)->default('draft');
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $this->audit($table);
            $table->index(['enterprise_id', 'site_id', 'status']);
        });

        Schema::create('awareness_materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('campaign_id')->constrained('awareness_campaigns')->cascadeOnDelete();
            $table->string('topic', 20);
            $table->string('type', 10);
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('url')->nullable();
            $table->json('questions')->nullable();
            $table->unsignedSmallInteger('pass_mark')->default(70);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();
            $table->index(['campaign_id', 'position']);
        });

        Schema::create('awareness_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('campaign_id')->constrained('awareness_campaigns')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->string('kind', 10)->default('internal');
            $table->string('external_name')->nullable();
            $table->string('external_email')->nullable();
            $table->string('organization')->nullable();
            $table->char('token_hash', 64)->nullable()->unique();
            $table->timestamp('invited_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('attestation_number')->nullable()->unique();
            $table->timestamps();
            $table->unique(['campaign_id', 'user_id']);
        });

        Schema::create('awareness_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('participant_id')->constrained('awareness_participants')->cascadeOnDelete();
            $table->foreignId('material_id')->constrained('awareness_materials')->cascadeOnDelete();
            $table->timestamp('read_at');
            $table->unsignedSmallInteger('quiz_score')->nullable();
            $table->boolean('passed')->default(true);
            $table->timestamps();
            $table->index(['participant_id', 'material_id']);
        });

        Schema::create('awareness_talks', function (Blueprint $table) {
            $table->id();
            $table->string('ref')->unique();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->foreignId('responsible_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('campaign_id')->nullable()->constrained('awareness_campaigns')->nullOnDelete();
            $table->string('topic', 20)->nullable();
            $table->date('held_on');
            $table->unsignedSmallInteger('duration_minutes')->default(10);
            $table->text('notes')->nullable();
            $table->string('qr_token', 48)->unique();
            $table->string('status', 10)->default('open');
            $table->timestamp('closed_at')->nullable();
            $this->audit($table);
            $table->index(['enterprise_id', 'site_id', 'held_on']);
        });

        Schema::create('awareness_attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enterprise_id')->constrained()->cascadeOnDelete();
            $table->foreignId('talk_id')->constrained('awareness_talks')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name');
            $table->string('organization')->nullable();
            $table->string('method', 10)->default('qr');
            $table->timestamp('signed_at');
            $table->timestamps();
            $table->unique(['talk_id', 'user_id']);
        });

        $moduleId = DB::table('modules')->where('code', 'support')->value('id');
        if ($moduleId) {
            DB::table('sub_modules')->updateOrInsert(['code' => 'campagnes_sensibilisation'], [
                'module_id' => $moduleId, 'name' => 'Campagnes de sensibilisation', 'description' => 'Campagnes, supports avec accusé de lecture, causeries et attestations (ISO 14001 §7.3).',
                'icon' => 'megaphone', 'route' => 'campagnes-sensibilisation', 'order' => 35, 'is_active' => true, 'is_common' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        foreach (['awareness_attendances', 'awareness_talks', 'awareness_receipts', 'awareness_participants', 'awareness_materials', 'awareness_campaigns'] as $table) {
            Schema::dropIfExists($table);
        }
        DB::table('sub_modules')->where('code', 'campagnes_sensibilisation')->delete();
    }
};
