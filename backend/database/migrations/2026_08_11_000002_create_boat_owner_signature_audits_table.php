<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('boat_owner_signature_audits')) {
            Schema::create('boat_owner_signature_audits', function (Blueprint $table) {
                $table->id('signature_audit_id');
                $table->foreignId('owner_id')->constrained('boat_owners', 'owner_id')->cascadeOnDelete();
                $table->longText('signature_data_url');
                $table->timestamp('signed_at')->nullable();
                $table->foreignId('inspector_id')->nullable()->constrained('users', 'user_id')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (
            Schema::hasColumn('boat_owners', 'owner_signature_data_url') &&
            Schema::hasColumn('boat_owners', 'owner_signature_signed_at') &&
            Schema::hasColumn('boat_owners', 'owner_signature_updated_by')
        ) {
            DB::statement("
                INSERT INTO boat_owner_signature_audits (
                    owner_id,
                    signature_data_url,
                    signed_at,
                    inspector_id,
                    created_at,
                    updated_at
                )
                SELECT
                    owner_id,
                    owner_signature_data_url,
                    owner_signature_signed_at,
                    owner_signature_updated_by,
                    COALESCE(owner_signature_signed_at, NOW()),
                    COALESCE(owner_signature_signed_at, NOW())
                FROM boat_owners
                WHERE owner_signature_data_url IS NOT NULL
                  AND owner_signature_data_url <> ''
                  AND NOT EXISTS (
                      SELECT 1
                      FROM boat_owner_signature_audits audits
                      WHERE audits.owner_id = boat_owners.owner_id
                  )
            ");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('boat_owner_signature_audits');
    }
};
