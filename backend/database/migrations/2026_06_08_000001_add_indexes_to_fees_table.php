<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fees', function (Blueprint $table) {
            // Index for pagination ordering (effective_from DESC, created_at DESC)
            $table->index(['effective_from', 'created_at'], 'idx_fees_effective_created');

            // Index for search on fee_type_name
            $table->index('fee_type_name', 'idx_fees_type_name');

            // Index for foreign key filters
            $table->index('boat_type_id', 'idx_fees_boat_type');
            $table->index('vehicle_type_id', 'idx_fees_vehicle_type');

            // Index for status filtering (effective_from and effective_to)
            $table->index('effective_from', 'idx_fees_effective_from');
            $table->index('effective_to', 'idx_fees_effective_to');

            // Composite index for fee_type_name + effective_from (common filter + sort combo)
            $table->index(['fee_type_name', 'effective_from'], 'idx_fees_type_effective');

            // Composite index for boat_type_id + effective_from (filter + sort combo)
            $table->index(['boat_type_id', 'effective_from'], 'idx_fees_boat_type_effective');

            // Composite index for vehicle_type_id + effective_from (filter + sort combo)
            $table->index(['vehicle_type_id', 'effective_from'], 'idx_fees_vehicle_type_effective');

        });
    }

    public function down(): void
    {
        Schema::table('fees', function (Blueprint $table) {
            $table->dropIndex('idx_fees_effective_created');
            $table->dropIndex('idx_fees_type_name');
            $table->dropIndex('idx_fees_boat_type');
            $table->dropIndex('idx_fees_vehicle_type');
            $table->dropIndex('idx_fees_effective_from');
            $table->dropIndex('idx_fees_effective_to');
            $table->dropIndex('idx_fees_type_effective');
            $table->dropIndex('idx_fees_boat_type_effective');
            $table->dropIndex('idx_fees_vehicle_type_effective');
        });
    }
};
