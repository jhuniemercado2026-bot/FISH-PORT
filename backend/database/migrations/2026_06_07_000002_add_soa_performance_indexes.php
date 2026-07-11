<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boats', function (Blueprint $table) {
            if (!Schema::hasColumn('boats', 'boat_name')) {
                return;
            }

            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('boats', 'idx_boats_name')) {
                $table->index('boat_name', 'idx_boats_name');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('boats', 'idx_boats_type_owner')) {
                $table->index(['boat_type_id', 'owner_id'], 'idx_boats_type_owner');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('boats', 'idx_boats_created_id')) {
                $table->index(['created_at', 'boat_id'], 'idx_boats_created_id');
            }
        });

        Schema::table('boat_owners', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('boat_owners', 'idx_boat_owners_name')) {
                $table->index(['owner_firstname', 'owner_lastname'], 'idx_boat_owners_name');
            }
        });

        Schema::table('boat_types', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('boat_types', 'idx_boat_types_name')) {
                $table->index('type_name', 'idx_boat_types_name');
            }
        });

        Schema::table('dockings', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('dockings', 'idx_dockings_boat_voided')) {
                $table->index(['boat_id', 'voided_at'], 'idx_dockings_boat_voided');
            }
        });

        Schema::table('banyera_transactions', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('banyera_transactions', 'idx_banyera_boat_voided')) {
                $table->index(['boat_id', 'voided_at'], 'idx_banyera_boat_voided');
            }
        });

        Schema::table('bill_items', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('bill_items', 'idx_bill_items_docking')) {
                $table->index('docking_id', 'idx_bill_items_docking');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('bill_items', 'idx_bill_items_banyera')) {
                $table->index('banyera_id', 'idx_bill_items_banyera');
            }
        });
    }

    public function down(): void
    {
        Schema::table('bill_items', function (Blueprint $table) {
            $table->dropIndex('idx_bill_items_banyera');
            $table->dropIndex('idx_bill_items_docking');
        });

        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->dropIndex('idx_banyera_boat_voided');
        });

        Schema::table('dockings', function (Blueprint $table) {
            $table->dropIndex('idx_dockings_boat_voided');
        });

        Schema::table('boat_types', function (Blueprint $table) {
            $table->dropIndex('idx_boat_types_name');
        });

        Schema::table('boat_owners', function (Blueprint $table) {
            $table->dropIndex('idx_boat_owners_name');
        });

        Schema::table('boats', function (Blueprint $table) {
            $table->dropIndex('idx_boats_created_id');
            $table->dropIndex('idx_boats_type_owner');
            $table->dropIndex('idx_boats_name');
        });
    }
};
