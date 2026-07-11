<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bills', function (Blueprint $table) {
            $table->increments('bill_id');
            $table->string('bill_reference_no', 9)->nullable()->unique('bills_bill_reference_no_unique');
            $table->unsignedBigInteger('boat_id')->nullable();
            $table->decimal('total_amount', 12, 2);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();

            $table->foreign('boat_id')->references('boat_id')->on('boats');
            $table->foreign('created_by')->references('user_id')->on('users');

            $table->index('boat_id', 'idx_bill_boat');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bills');
    }
};
