<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dockings', function (Blueprint $table) {
            if (!Schema::hasColumn('dockings', 'void_reason')) {
                $table->text('void_reason')->nullable()->after('created_by');
            }

            if (!Schema::hasColumn('dockings', 'voided_at')) {
                $table->timestamp('voided_at')->nullable()->after('void_reason');
            }

            if (!Schema::hasColumn('dockings', 'voided_by')) {
                $table->unsignedBigInteger('voided_by')->nullable()->after('voided_at');
                $table->foreign('voided_by')->references('user_id')->on('users');
            }
        });

        Schema::table('dockings', function (Blueprint $table) {
            $table->index('boat_id', 'idx_dockings_boat');
            $table->index('docking_date', 'idx_dockings_date');
            $table->index('docking_fee', 'idx_dockings_fee_amount');
            $table->index(['voided_at', 'docking_date'], 'idx_dockings_status_date');
            $table->index(['docking_date', 'created_at', 'docking_id'], 'idx_dockings_date_created_id');
            $table->index(['boat_id', 'docking_date', 'voided_at'], 'idx_dockings_boat_date_status');
        });

        Schema::table('boats', function (Blueprint $table) {
            $table->index('boat_type_id', 'idx_docking_boats_type');
            $table->index(['boat_type_id', 'boat_id'], 'idx_docking_boats_type_boat');
        });
    }

    public function down(): void
    {
        Schema::table('boats', function (Blueprint $table) {
            $table->dropIndex('idx_docking_boats_type_boat');
            $table->dropIndex('idx_docking_boats_type');
        });

        Schema::table('dockings', function (Blueprint $table) {
            $table->dropIndex('idx_dockings_boat_date_status');
            $table->dropIndex('idx_dockings_date_created_id');
            $table->dropIndex('idx_dockings_status_date');
            $table->dropIndex('idx_dockings_fee_amount');
            $table->dropIndex('idx_dockings_date');
            $table->dropIndex('idx_dockings_boat');
        });
    }
};
