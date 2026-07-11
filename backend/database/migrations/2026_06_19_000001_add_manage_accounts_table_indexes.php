<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->index(['created_at', 'user_id'], 'users_created_user_idx');
            $table->index(['status', 'created_at', 'user_id'], 'users_status_created_user_idx');
            $table->index(['role', 'created_at', 'user_id'], 'users_role_created_user_idx');
            $table->index(['created_by', 'created_at'], 'users_created_by_created_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_created_user_idx');
            $table->dropIndex('users_status_created_user_idx');
            $table->dropIndex('users_role_created_user_idx');
            $table->dropIndex('users_created_by_created_idx');
        });
    }
};
