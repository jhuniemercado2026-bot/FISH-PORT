<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bill_items', function (Blueprint $table) {
            $table->increments('bill_item_id');
            $table->unsignedInteger('bill_id');
            $table->enum('transaction_type', ['docking', 'banyera']);
            $table->unsignedInteger('docking_id')->nullable();
            $table->unsignedBigInteger('banyera_id')->nullable();
            $table->decimal('amount', 12, 2);
            $table->timestamps();

            $table->foreign('bill_id')->references('bill_id')->on('bills');
            $table->foreign('docking_id')->references('docking_id')->on('dockings');
            $table->foreign('banyera_id')->references('banyera_id')->on('banyera_transactions');

            $table->index('bill_id', 'idx_bill_item_bill');
            $table->index('docking_id', 'idx_bill_item_docking');
            $table->index('banyera_id', 'idx_bill_item_banyera');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bill_items');
    }
};
