<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->index(['created_at', 'id'], 'activity_logs_created_id_index');
            $table->index(['severity', 'created_at'], 'activity_logs_severity_created_index');
            $table->index(['module', 'created_at'], 'activity_logs_module_created_index');
            $table->index(['user_name', 'created_at'], 'activity_logs_user_name_created_index');
            $table->index(['user_id', 'created_at'], 'activity_logs_user_created_index');
        });
    }

    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_created_id_index');
            $table->dropIndex('activity_logs_severity_created_index');
            $table->dropIndex('activity_logs_module_created_index');
            $table->dropIndex('activity_logs_user_name_created_index');
            $table->dropIndex('activity_logs_user_created_index');
        });
    }
};
