<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boat_owners', function (Blueprint $table) {
            if (!Schema::hasColumn('boat_owners', 'owner_signature_public_id')) {
                $table->string('owner_signature_public_id')->nullable()->after('owner_signature_data_url');
            }
        });

        Schema::table('boat_owner_signature_audits', function (Blueprint $table) {
            if (!Schema::hasColumn('boat_owner_signature_audits', 'signature_public_id')) {
                $table->string('signature_public_id')->nullable()->after('signature_data_url');
            }
        });
    }

    public function down(): void
    {
        Schema::table('boat_owner_signature_audits', function (Blueprint $table) {
            if (Schema::hasColumn('boat_owner_signature_audits', 'signature_public_id')) {
                $table->dropColumn('signature_public_id');
            }
        });

        Schema::table('boat_owners', function (Blueprint $table) {
            if (Schema::hasColumn('boat_owners', 'owner_signature_public_id')) {
                $table->dropColumn('owner_signature_public_id');
            }
        });
    }
};
