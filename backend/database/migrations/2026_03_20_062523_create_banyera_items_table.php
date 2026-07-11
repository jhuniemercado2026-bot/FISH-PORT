<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('banyera_items', function (Blueprint $table) {
            $table->id('item_id');

            $table->foreignId('banyera_id')
                ->constrained('banyera_transactions', 'banyera_id');

            $table->foreignId('classification_id')
                ->constrained('fish_classifications', 'classification_id');

            $table->integer('quantity');

            $table->unsignedInteger('fee_id');
            $table->foreign('fee_id')->references('fee_id')->on('fees');

            $table->decimal('subtotal', 12, 2);
            $table->decimal('daug', 12, 2)->nullable();

            $table->timestamps();

            $table->index('banyera_id', 'idx_banyera_item');
            $table->index('classification_id', 'idx_banyera_classification');
        });

        DB::unprepared('
            CREATE TRIGGER trg_update_banyera_total
            AFTER INSERT ON banyera_items
            FOR EACH ROW
            BEGIN
                UPDATE banyera_transactions
                SET total_fee = (
                    SELECT IFNULL(SUM(subtotal), 0)
                    FROM banyera_items
                    WHERE banyera_id = NEW.banyera_id
                )
                WHERE banyera_id = NEW.banyera_id;
            END
        ');

        DB::unprepared('
            CREATE TRIGGER trg_update_banyera_total_on_update
            AFTER UPDATE ON banyera_items
            FOR EACH ROW
            BEGIN
                UPDATE banyera_transactions
                SET total_fee = (
                    SELECT IFNULL(SUM(subtotal), 0)
                    FROM banyera_items
                    WHERE banyera_id = NEW.banyera_id
                )
                WHERE banyera_id = NEW.banyera_id;
            END
        ');
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_update_banyera_total_on_update');
        DB::unprepared('DROP TRIGGER IF EXISTS trg_update_banyera_total');
        Schema::dropIfExists('banyera_items');
    }
};
