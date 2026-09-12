<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicle_tickets', function (Blueprint $table) {
            $table->increments('ticket_id');
            $table->string('control_number', 6)->nullable()->unique();
            $table->string('official_receipt_no', 7)->nullable();
            $table->unsignedInteger('vehicle_type_id');
            $table->string('plate_number', 50);
            $table->string('driver_name', 50)->nullable();
            $table->enum('ticket_type', ['annual', 'daily']);
            $table->unsignedInteger('fee_id');
            $table->decimal('daily_fee', 12, 2)->default(0);
            $table->decimal('banyera_fee', 12, 2)->default(0);
            $table->decimal('ticket_fee', 12, 2);
            $table->dateTime('ticket_date');
            $table->date('end_date')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users', 'user_id');
            $table->text('void_reason')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users', 'user_id');
            $table->timestamps();

            $table->foreign('vehicle_type_id')->references('vehicle_type_id')->on('vehicle_types');
            $table->foreign('fee_id')->references('fee_id')->on('fees');

            $table->index('vehicle_type_id', 'idx_ticket_vehicle_type');
            $table->index('plate_number', 'idx_ticket_plate');
            $table->index('control_number', 'idx_ticket_control_number');
            $table->index('ticket_date', 'idx_ticket_date');
            $table->index('voided_at', 'idx_vehicle_tickets_voided_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicle_tickets');
    }
};
