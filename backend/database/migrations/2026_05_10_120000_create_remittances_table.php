<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('remittances', function (Blueprint $table) {
            $table->id('remittance_id');
            $table->string('remittance_reference_no')->unique();
            $table->date('date');
            $table->decimal('amount', 12, 2);
            $table->decimal('surplus', 12, 2)->default(0);
            $table->decimal('deficit', 12, 2)->default(0);
            $table->enum('status', ['pending', 'remitted'])->default('pending');
            $table->text('remarks')->nullable();
            $table->unsignedBigInteger('submitted_by');
            $table->timestamps();

            $table->foreign('submitted_by')->references('user_id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('remittances');
    }
};
