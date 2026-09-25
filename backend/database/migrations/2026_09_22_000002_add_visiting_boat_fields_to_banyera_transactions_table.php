<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE banyera_transactions MODIFY boat_id BIGINT UNSIGNED NULL');

        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->string('boat_category', 20)->default('registered')->after('boat_id');
            $table->string('visiting_boat_name')->nullable()->after('boat_category');
            $table->string('visiting_owner_firstname')->nullable()->after('visiting_boat_name');
            $table->string('visiting_owner_lastname')->nullable()->after('visiting_owner_firstname');
            $table->string('visiting_owner_address')->nullable()->after('visiting_owner_lastname');
            $table->string('visiting_contact_number', 20)->nullable()->after('visiting_owner_address');
            $table->foreignId('visiting_boat_type_id')
                ->nullable()
                ->after('visiting_contact_number')
                ->constrained('boat_types', 'boat_type_id');

            $table->index(['boat_category', 'visiting_boat_type_id'], 'idx_banyera_category_visiting_type');
        });
    }

    public function down(): void
    {
        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->dropIndex('idx_banyera_category_visiting_type');
            $table->dropForeign(['visiting_boat_type_id']);
            $table->dropColumn([
                'boat_category',
                'visiting_boat_name',
                'visiting_owner_firstname',
                'visiting_owner_lastname',
                'visiting_owner_address',
                'visiting_contact_number',
                'visiting_boat_type_id',
            ]);
        });

        DB::statement('ALTER TABLE banyera_transactions MODIFY boat_id BIGINT UNSIGNED NOT NULL');
    }
};
