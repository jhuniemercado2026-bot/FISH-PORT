<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->foreignId('owner_id')
                ->nullable()
                ->after('boat_id')
                ->constrained('boat_owners', 'owner_id')
                ->nullOnDelete();
            $table->longText('owner_signature_data_url')->nullable()->after('total_fee');
            $table->timestamp('owner_signature_signed_at')->nullable()->after('owner_signature_data_url');
        });
    }

    public function down(): void
    {
        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->dropForeign(['owner_id']);
            $table->dropColumn([
                'owner_id',
                'owner_signature_data_url',
                'owner_signature_signed_at',
            ]);
        });
    }
};
