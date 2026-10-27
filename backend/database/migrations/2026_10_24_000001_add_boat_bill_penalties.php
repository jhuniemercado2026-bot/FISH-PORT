<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_penalty_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('percentage', 5, 2)->default(0);
            $table->unsignedInteger('interval_value')->default(1);
            $table->string('interval_unit', 10)->default('months');
            $table->boolean('is_active')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });
        DB::table('billing_penalty_settings')->insert([
            'id' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        Schema::table('bills', function (Blueprint $table) {
            $table->decimal('penalty_amount', 12, 2)->default(0);
        });
        Schema::create('bill_penalties', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('bill_id');
            $table->unsignedInteger('period_number');
            $table->unsignedInteger('settings_version');
            $table->dateTime('schedule_anchor_at');
            $table->unsignedInteger('schedule_period_number');
            $table->dateTime('period_ended_at');
            $table->decimal('percentage', 5, 2);
            $table->unsignedInteger('interval_value');
            $table->string('interval_unit', 10);
            $table->decimal('base_amount', 12, 2);
            $table->decimal('amount', 12, 2);
            $table->timestamps();
            $table->foreign('bill_id')->references('bill_id')->on('bills')->cascadeOnDelete();
            $table->unique(['bill_id', 'period_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bill_penalties');
        Schema::table('bills', fn (Blueprint $table) => $table->dropColumn('penalty_amount'));
        Schema::dropIfExists('billing_penalty_settings');
    }
};
