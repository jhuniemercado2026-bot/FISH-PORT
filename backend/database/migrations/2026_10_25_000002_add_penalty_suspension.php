<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bill_penalties', function (Blueprint $table) {
            // Retain the assessed fee so switching back on cannot duplicate it.
            $table->decimal('suspended_amount', 12, 2)->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('bill_penalties', fn (Blueprint $table) => $table->dropColumn('suspended_amount'));
    }
};
