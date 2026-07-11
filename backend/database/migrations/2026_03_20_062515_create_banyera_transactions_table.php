<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('banyera_transactions', function (Blueprint $table) {
            $table->id('banyera_id');

            $table->foreignId('boat_id')
                ->constrained('boats', 'boat_id');

            $table->dateTime('transaction_date')->useCurrent();
            $table->decimal('total_fee', 12, 2)->default(0.00);

            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users', 'user_id');

            $table->text('void_reason')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->foreignId('voided_by')
                ->nullable()
                ->constrained('users', 'user_id');

            $table->timestamps();

            $table->index('boat_id', 'idx_banyera_boat');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('banyera_transactions');
    }
};
