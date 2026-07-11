<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->index('official_receipt_no', 'idx_payments_receipt');
            $table->index(['payment_date', 'payment_id'], 'idx_payments_date_id');
            $table->index(['status', 'created_at'], 'idx_payments_status_created');
            $table->index(['status', 'payment_date', 'payment_id'], 'idx_payments_status_date_id');
            $table->index(['bill_id', 'payment_date'], 'idx_payments_bill_date');
            $table->index(['received_by', 'payment_date'], 'idx_payments_received_date');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('idx_payments_received_date');
            $table->dropIndex('idx_payments_bill_date');
            $table->dropIndex('idx_payments_status_date_id');
            $table->dropIndex('idx_payments_status_created');
            $table->dropIndex('idx_payments_date_id');
            $table->dropIndex('idx_payments_receipt');
        });
    }
};
