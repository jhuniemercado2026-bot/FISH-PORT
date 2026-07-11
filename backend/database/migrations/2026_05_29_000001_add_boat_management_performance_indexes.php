<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boats', function (Blueprint $table) {
            $table->index(['deleted_at', 'created_at'], 'idx_boats_active_created');
            $table->index(['deleted_at', 'status'], 'idx_boats_active_status');
            $table->index(['deleted_at', 'owner_id'], 'idx_boats_active_owner');
            $table->index(['deleted_at', 'boat_type_id'], 'idx_boats_active_type');
            $table->index(['owner_id', 'deleted_at'], 'idx_boats_owner_active');
            $table->index(['boat_type_id', 'deleted_at'], 'idx_boats_type_active');
            $table->index('boat_name', 'idx_boats_name');
        });

        Schema::table('boat_owners', function (Blueprint $table) {
            $table->index(['deleted_at', 'created_at'], 'idx_boat_owners_active_created');
            $table->index('owner_firstname', 'idx_boat_owners_firstname');
            $table->index('owner_lastname', 'idx_boat_owners_lastname');
            $table->index('contact_number', 'idx_boat_owners_contact');
        });

        Schema::table('boat_types', function (Blueprint $table) {
            $table->index(['deleted_at', 'created_at'], 'idx_boat_types_active_created');
            $table->index('type_name', 'idx_boat_types_name');
        });
    }

    public function down(): void
    {
        Schema::table('boat_types', function (Blueprint $table) {
            $table->dropIndex('idx_boat_types_name');
            $table->dropIndex('idx_boat_types_active_created');
        });

        Schema::table('boat_owners', function (Blueprint $table) {
            $table->dropIndex('idx_boat_owners_contact');
            $table->dropIndex('idx_boat_owners_lastname');
            $table->dropIndex('idx_boat_owners_firstname');
            $table->dropIndex('idx_boat_owners_active_created');
        });

        Schema::table('boats', function (Blueprint $table) {
            $table->dropIndex('idx_boats_name');
            $table->dropIndex('idx_boats_type_active');
            $table->dropIndex('idx_boats_owner_active');
            $table->dropIndex('idx_boats_active_type');
            $table->dropIndex('idx_boats_active_owner');
            $table->dropIndex('idx_boats_active_status');
            $table->dropIndex('idx_boats_active_created');
        });
    }
};
