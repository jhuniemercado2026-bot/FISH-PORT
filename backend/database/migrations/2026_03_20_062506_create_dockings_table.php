<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dockings', function (Blueprint $table) {
            $table->increments('docking_id');
            $table->unsignedBigInteger('boat_id');
            $table->unsignedInteger('fee_id');
            $table->dateTime('docking_date');
            $table->decimal('docking_fee', 12, 2);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('boat_id')->references('boat_id')->on('boats');
            $table->foreign('fee_id')->references('fee_id')->on('fees');
            $table->foreign('created_by')->references('user_id')->on('users');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dockings');
    }
};
