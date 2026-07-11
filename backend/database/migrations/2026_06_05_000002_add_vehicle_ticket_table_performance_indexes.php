<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicle_tickets', function (Blueprint $table) {
            $table->index(['ticket_type', 'ticket_date'], 'idx_vehicle_tickets_type_date');
            $table->index(['vehicle_type_id', 'ticket_date'], 'idx_vehicle_tickets_vehicle_type_date');
            $table->index(['voided_at', 'ticket_date'], 'idx_vehicle_tickets_voided_date');
            $table->index(['ticket_date', 'created_at'], 'idx_vehicle_tickets_date_created');
            $table->index(['created_by', 'ticket_date'], 'idx_vehicle_tickets_created_by_date');
            $table->index('official_receipt_no', 'idx_vehicle_tickets_or_number');
            $table->index('driver_name', 'idx_vehicle_tickets_driver_name');
        });

        Schema::table('fees', function (Blueprint $table) {
            $table->index('fee_type_name', 'idx_fees_fee_type_name');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->index('first_name', 'idx_users_first_name');
            $table->index('last_name', 'idx_users_last_name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_last_name');
            $table->dropIndex('idx_users_first_name');
        });

        Schema::table('fees', function (Blueprint $table) {
            $table->dropIndex('idx_fees_fee_type_name');
        });

        Schema::table('vehicle_tickets', function (Blueprint $table) {
            $table->dropIndex('idx_vehicle_tickets_driver_name');
            $table->dropIndex('idx_vehicle_tickets_or_number');
            $table->dropIndex('idx_vehicle_tickets_created_by_date');
            $table->dropIndex('idx_vehicle_tickets_date_created');
            $table->dropIndex('idx_vehicle_tickets_voided_date');
            $table->dropIndex('idx_vehicle_tickets_vehicle_type_date');
            $table->dropIndex('idx_vehicle_tickets_type_date');
        });
    }
};
