<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->increments('payment_id');
            $table->string('payment_reference_no', 6)->unique();
            $table->unsignedInteger('bill_id');
            $table->decimal('amount_paid', 12, 2);
            $table->enum('status', ['partial', 'paid']);
            $table->string('official_receipt_no', 100);
            $table->enum('payment_method', ['cash'])->default('cash');
            $table->dateTime('payment_date')->useCurrent();
            $table->text('remarks')->nullable();
            $table->unsignedBigInteger('received_by');
            $table->timestamps();

            $table->foreign('bill_id')->references('bill_id')->on('bills');
            $table->foreign('received_by')->references('user_id')->on('users');
        });

        DB::unprepared("
            CREATE TRIGGER trg_set_payment_status
            BEFORE INSERT ON payments
            FOR EACH ROW BEGIN
                DECLARE v_total_amount DECIMAL(12,2);
                DECLARE v_total_paid   DECIMAL(12,2);

                SELECT total_amount INTO v_total_amount
                FROM bills WHERE bill_id = NEW.bill_id;

                SELECT IFNULL(SUM(amount_paid), 0) INTO v_total_paid
                FROM payments WHERE bill_id = NEW.bill_id;

                SET NEW.status =
                    CASE
                        WHEN (v_total_paid + NEW.amount_paid) >= v_total_amount THEN 'paid'
                        ELSE 'partial'
                    END;
            END
        ");
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_set_payment_status');
        Schema::dropIfExists('payments');
    }
};
