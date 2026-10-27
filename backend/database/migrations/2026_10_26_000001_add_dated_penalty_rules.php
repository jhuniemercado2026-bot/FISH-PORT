<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL DDL can stop between statements; allow a safe migration retry.
        if (!Schema::hasTable('billing_penalty_rules')) Schema::create('billing_penalty_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->decimal('amount', 12, 2);
            $table->unsignedInteger('interval_value');
            $table->string('interval_unit', 10);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->index(['is_active', 'effective_from', 'effective_to'], 'penalty_rules_effectivity_idx');
        });
        if (!Schema::hasIndex('billing_penalty_rules', 'penalty_rules_effectivity_idx')) Schema::table('billing_penalty_rules', function (Blueprint $table) {
            $table->index(['is_active', 'effective_from', 'effective_to'], 'penalty_rules_effectivity_idx');
        });
        if (!Schema::hasColumn('bill_penalties', 'penalty_rule_id')) Schema::table('bill_penalties', function (Blueprint $table) {
            $table->foreignId('penalty_rule_id')->nullable()->constrained('billing_penalty_rules');
            $table->unique(['bill_id', 'penalty_rule_id', 'period_ended_at'], 'bill_penalty_rule_deadline_unique');
        });
        $settings = DB::table('billing_penalty_settings')->where('id', 1)->first();
        if ($settings && (float) $settings->amount > 0 && !DB::table('billing_penalty_rules')->exists()) {
            $earliest = DB::table('bills')->min('created_at');
            $firstAssessment = DB::table('bill_penalties')->where('settings_version', $settings->version)
                ->where('fixed_amount', $settings->amount)->where('interval_value', $settings->interval_value)
                ->where('interval_unit', $settings->interval_unit)->min('period_ended_at');
            $ruleId = DB::table('billing_penalty_rules')->insertGetId([
                'name' => 'Existing Boat Bill Penalty', 'amount' => $settings->amount,
                'interval_value' => $settings->interval_value, 'interval_unit' => $settings->interval_unit,
                'effective_from' => ($firstAssessment ?? $earliest) ? substr($firstAssessment ?? $earliest, 0, 10) : now('Asia/Manila')->toDateString(),
                'is_active' => $settings->is_active, 'created_by' => $settings->updated_by,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            // Keep earlier snapshots intact; associate only this rule's assessments.
            DB::table('bill_penalties')->where('settings_version', $settings->version)
                ->where('fixed_amount', $settings->amount)->where('interval_value', $settings->interval_value)
                ->where('interval_unit', $settings->interval_unit)->update(['penalty_rule_id' => $ruleId]);
        }
    }

    public function down(): void
    {
        Schema::table('bill_penalties', function (Blueprint $table) {
            $table->dropUnique('bill_penalty_rule_deadline_unique');
            $table->dropForeign(['penalty_rule_id']);
            $table->dropColumn('penalty_rule_id');
        });
        Schema::dropIfExists('billing_penalty_rules');
    }
};
