<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('deduplication_key', 191)->nullable();
            $table->unique(['recipient_user_id', 'deduplication_key'], 'notifications_recipient_dedup_unique');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->dropUnique('notifications_recipient_dedup_unique');
            $table->dropColumn('deduplication_key');
        });
    }
};
