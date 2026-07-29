<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boats', function (Blueprint $table) {
            $table->string('image_public_id', 255)->nullable()->after('image_path');
        });
    }

    public function down(): void
    {
        Schema::table('boats', function (Blueprint $table) {
            $table->dropColumn('image_public_id');
        });
    }
};
