<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('dockings')) {
            return;
        }

        DB::statement('ALTER TABLE dockings MODIFY boat_id BIGINT UNSIGNED NULL');

        Schema::table('dockings', function (Blueprint $table) {
            if (!Schema::hasColumn('dockings', 'boat_category')) {
                $table->string('boat_category', 20)->default('registered')->after('docking_id');
            }

            if (!Schema::hasColumn('dockings', 'visiting_boat_name')) {
                $table->string('visiting_boat_name')->nullable()->after('boat_id');
            }

            if (!Schema::hasColumn('dockings', 'visiting_owner_firstname')) {
                $table->string('visiting_owner_firstname')->nullable()->after('visiting_boat_name');
            }

            if (!Schema::hasColumn('dockings', 'visiting_owner_lastname')) {
                $table->string('visiting_owner_lastname')->nullable()->after('visiting_owner_firstname');
            }

            if (!Schema::hasColumn('dockings', 'visiting_owner_address')) {
                $table->string('visiting_owner_address')->nullable()->after('visiting_owner_lastname');
            }

            if (!Schema::hasColumn('dockings', 'visiting_contact_number')) {
                $table->string('visiting_contact_number', 50)->nullable()->after('visiting_owner_address');
            }

            if (!Schema::hasColumn('dockings', 'visiting_boat_type_id')) {
                $table->unsignedBigInteger('visiting_boat_type_id')->nullable()->after('visiting_contact_number');
                $table->foreign('visiting_boat_type_id', 'dockings_visiting_boat_type_id_foreign')
                    ->references('boat_type_id')
                    ->on('boat_types')
                    ->nullOnDelete();
            }

            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('dockings', 'idx_dockings_category_visiting_type')) {
                $table->index(['boat_category', 'visiting_boat_type_id'], 'idx_dockings_category_visiting_type');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('dockings')) {
            return;
        }

        Schema::table('dockings', function (Blueprint $table) {
            if (Schema::getConnection()->getSchemaBuilder()->hasIndex('dockings', 'idx_dockings_category_visiting_type')) {
                $table->dropIndex('idx_dockings_category_visiting_type');
            }

            if (Schema::hasColumn('dockings', 'visiting_boat_type_id')) {
                $table->dropForeign('dockings_visiting_boat_type_id_foreign');
            }

            foreach ([
                'visiting_boat_type_id',
                'visiting_contact_number',
                'visiting_owner_address',
                'visiting_owner_lastname',
                'visiting_owner_firstname',
                'visiting_boat_name',
                'boat_category',
            ] as $column) {
                if (Schema::hasColumn('dockings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        DB::statement('ALTER TABLE dockings MODIFY boat_id BIGINT UNSIGNED NOT NULL');
    }
};
