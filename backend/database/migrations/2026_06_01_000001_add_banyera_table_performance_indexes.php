<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('banyera_transactions')) {
            Schema::table('banyera_transactions', function (Blueprint $table) {
                if (Schema::hasColumn('banyera_transactions', 'voided_at')) {
                    $table->index(['voided_at', 'transaction_date'], 'idx_banyera_status_date');
                    $table->index(['boat_id', 'transaction_date', 'voided_at'], 'idx_banyera_boat_date_status');
                }

                $table->index(['transaction_date', 'created_at'], 'idx_banyera_date_created');
                $table->index('total_fee', 'idx_banyera_total_fee');
                $table->index(['transaction_date', 'created_at', 'banyera_id'], 'idx_banyera_date_created_id');
                $table->index(['transaction_date', 'total_fee'], 'idx_banyera_date_total');
                $table->index(['created_by', 'transaction_date'], 'idx_banyera_creator_date');
            });
        }

        if (Schema::hasTable('banyera_items')) {
            Schema::table('banyera_items', function (Blueprint $table) {
                $table->index(['classification_id', 'banyera_id'], 'idx_banyera_items_classification_tx');
                $table->index(['fee_id', 'banyera_id'], 'idx_banyera_items_fee_tx');
            });
        }

        if (Schema::hasTable('boats')) {
            Schema::table('boats', function (Blueprint $table) {
                $table->index(['boat_name', 'deleted_at'], 'idx_boats_name_active');
                $table->index(['boat_type_id', 'boat_name'], 'idx_boats_type_name');
            });
        }

        if (Schema::hasTable('boat_owners')) {
            Schema::table('boat_owners', function (Blueprint $table) {
                $table->index(['owner_firstname', 'owner_lastname', 'deleted_at'], 'idx_boat_owners_name_active');
            });
        }

        if (Schema::hasTable('boat_types')) {
            Schema::table('boat_types', function (Blueprint $table) {
                $table->index(['type_name', 'deleted_at'], 'idx_boat_types_name_active');
            });
        }

        if (Schema::hasTable('fish_classifications')) {
            Schema::table('fish_classifications', function (Blueprint $table) {
                $table->index(['classification_name', 'deleted_at'], 'idx_fish_classifications_name_active');
            });
        }
    }

    public function down(): void
    {
        $this->dropIndexes('fish_classifications', ['idx_fish_classifications_name_active']);
        $this->dropIndexes('boat_types', ['idx_boat_types_name_active']);
        $this->dropIndexes('boat_owners', ['idx_boat_owners_name_active']);
        $this->dropIndexes('boats', ['idx_boats_name_active', 'idx_boats_type_name']);
        $this->dropIndexes('banyera_items', ['idx_banyera_items_classification_tx', 'idx_banyera_items_fee_tx']);
        $this->dropIndexes('banyera_transactions', [
            'idx_banyera_status_date',
            'idx_banyera_boat_date_status',
            'idx_banyera_date_created',
            'idx_banyera_total_fee',
            'idx_banyera_date_created_id',
            'idx_banyera_date_total',
            'idx_banyera_creator_date',
        ]);
    }

    private function dropIndexes(string $tableName, array $indexNames): void
    {
        if (!Schema::hasTable($tableName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($indexNames) {
            foreach ($indexNames as $indexName) {
                try {
                    $table->dropIndex($indexName);
                } catch (Throwable) {
                    //
                }
            }
        });
    }
};
