<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('bill_penalties', 'original_penalty_rule_id')) {
            Schema::table('bill_penalties', function (Blueprint $table) {
                // Replaced assessments retain their original rule and amounts.
                $table->foreignId('original_penalty_rule_id')->nullable()->constrained('billing_penalty_rules');
            });
        }
    }

    public function down(): void
    {
        Schema::table('bill_penalties', function (Blueprint $table) {
            $table->dropForeign(['original_penalty_rule_id']);
            $table->dropColumn('original_penalty_rule_id');
        });
    }
};
