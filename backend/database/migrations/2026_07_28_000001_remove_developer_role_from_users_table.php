<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            return;
        }

        DB::table('users')
            ->where('role', 'developer')
            ->update(['role' => 'head']);

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('head', 'coordinator', 'inspector') NOT NULL");
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('users') || DB::getDriverName() !== 'mysql') {
            return;
        }

        DB::statement("ALTER TABLE users MODIFY role ENUM('head', 'coordinator', 'inspector', 'developer') NOT NULL");
    }
};
