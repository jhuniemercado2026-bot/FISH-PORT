<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('remittances', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('remittances', 'idx_remittances_date_id')) {
                $table->index(['date', 'remittance_id'], 'idx_remittances_date_id');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('remittances', 'idx_remittances_status_date')) {
                $table->index(['status', 'date'], 'idx_remittances_status_date');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('remittances', 'idx_remittances_submitted_date')) {
                $table->index(['submitted_by', 'date'], 'idx_remittances_submitted_date');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('remittances', 'idx_remittances_created_id')) {
                $table->index(['created_at', 'remittance_id'], 'idx_remittances_created_id');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('users', 'idx_users_first_last')) {
                $table->index(['first_name', 'last_name'], 'idx_users_first_last');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('users', 'idx_users_last_name')) {
                $table->index('last_name', 'idx_users_last_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_last_name');
            $table->dropIndex('idx_users_first_last');
        });

        Schema::table('remittances', function (Blueprint $table) {
            $table->dropIndex('idx_remittances_created_id');
            $table->dropIndex('idx_remittances_submitted_date');
            $table->dropIndex('idx_remittances_status_date');
            $table->dropIndex('idx_remittances_date_id');
        });
    }
};
