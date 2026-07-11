<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notifications')) {
            return;
        }

        Schema::table('notifications', function (Blueprint $table) {
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('notifications', 'notifications_recipient_created_idx')) {
                $table->index(['recipient_user_id', 'created_at', 'notification_id'], 'notifications_recipient_created_idx');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('notifications', 'notifications_recipient_read_created_idx')) {
                $table->index(['recipient_user_id', 'is_read', 'created_at', 'notification_id'], 'notifications_recipient_read_created_idx');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('notifications', 'notifications_created_idx')) {
                $table->index(['created_at', 'notification_id'], 'notifications_created_idx');
            }
            if (!Schema::getConnection()->getSchemaBuilder()->hasIndex('notifications', 'notifications_read_at_idx')) {
                $table->index(['read_at', 'notification_id'], 'notifications_read_at_idx');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('notifications')) {
            return;
        }

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_recipient_created_idx');
            $table->dropIndex('notifications_recipient_read_created_idx');
            $table->dropIndex('notifications_created_idx');
            $table->dropIndex('notifications_read_at_idx');
        });
    }
};
