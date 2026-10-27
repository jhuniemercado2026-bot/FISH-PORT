<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billing_penalty_settings', function (Blueprint $table) {
            $table->decimal('amount', 12, 2)->default(0);
        });
        Schema::table('bill_penalties', function (Blueprint $table) {
            // Null identifies a historical percentage assessment.
            $table->decimal('fixed_amount', 12, 2)->nullable();
        });
        // A percentage cannot be converted to a fixed fee without a bill balance.
        // Keep historical charges and require the Head to configure the new fee.
        DB::table('billing_penalty_settings')->update([
            'is_active' => false,
            'version' => DB::raw('version + 1'),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('billing_penalty_settings')->update(['is_active' => false]);
        Schema::table('bill_penalties', fn (Blueprint $table) => $table->dropColumn('fixed_amount'));
        Schema::table('billing_penalty_settings', fn (Blueprint $table) => $table->dropColumn('amount'));
    }
};
