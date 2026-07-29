<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monthly_targets', function (Blueprint $table) {
            $table->id('monthly_target_id');
            $table->unsignedSmallInteger('target_year');
            $table->unsignedTinyInteger('target_month');
            $table->decimal('amount', 14, 2)->default(0);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->unique(['target_year', 'target_month'], 'monthly_targets_year_month_unique');
            $table->foreign('created_by')->references('user_id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('user_id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monthly_targets');
    }
};
