<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bills', function (Blueprint $table) {
            $table->index(['boat_id', 'created_at'], 'idx_bills_boat_created');
            $table->index(['created_by', 'created_at'], 'idx_bills_created_by_created');
            $table->index('total_amount', 'idx_bills_total_amount');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->index(['bill_id', 'amount_paid'], 'idx_payments_bill_amount');
            $table->index(['bill_id', 'status'], 'idx_payments_bill_status');
            $table->index(['payment_date', 'status'], 'idx_payments_date_status');
        });

        Schema::table('bill_items', function (Blueprint $table) {
            $table->index(['bill_id', 'transaction_type'], 'idx_bill_items_bill_type');
            $table->index(['transaction_type', 'docking_id'], 'idx_bill_items_type_docking');
            $table->index(['transaction_type', 'banyera_id'], 'idx_bill_items_type_banyera');
        });
    }

    public function down(): void
    {
        Schema::table('bill_items', function (Blueprint $table) {
            $table->dropIndex('idx_bill_items_type_banyera');
            $table->dropIndex('idx_bill_items_type_docking');
            $table->dropIndex('idx_bill_items_bill_type');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('idx_payments_date_status');
            $table->dropIndex('idx_payments_bill_status');
            $table->dropIndex('idx_payments_bill_amount');
        });

        Schema::table('bills', function (Blueprint $table) {
            $table->dropIndex('idx_bills_total_amount');
            $table->dropIndex('idx_bills_created_by_created');
            $table->dropIndex('idx_bills_boat_created');
        });
    }
};
