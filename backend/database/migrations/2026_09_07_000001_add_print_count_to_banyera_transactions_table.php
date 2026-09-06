<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->unsignedInteger('print_count')->default(0)->after('total_fee');
        });
    }

    public function down(): void
    {
        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->dropColumn('print_count');
        });
    }
};
