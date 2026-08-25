<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('boat_owners', function (Blueprint $table) {
            if (!Schema::hasColumn('boat_owners', 'owner_signature_updated_by')) {
                $table
                    ->foreignId('owner_signature_updated_by')
                    ->nullable()
                    ->after('owner_signature_signed_at')
                    ->constrained('users', 'user_id')
                    ->nullOnDelete();
            }
        });

        if (
            Schema::hasColumn('boat_owners', 'owner_signature_updated_by') &&
            Schema::hasColumn('boat_owners', 'owner_signature_data_url') &&
            Schema::hasColumn('banyera_transactions', 'owner_id') &&
            Schema::hasColumn('banyera_transactions', 'owner_signature_data_url') &&
            Schema::hasColumn('banyera_transactions', 'owner_signature_signed_at') &&
            Schema::hasColumn('banyera_transactions', 'created_by')
        ) {
            DB::statement("
                UPDATE boat_owners bo
                JOIN (
                    SELECT bt.owner_id, bt.created_by
                    FROM banyera_transactions bt
                    INNER JOIN (
                        SELECT owner_id, MAX(owner_signature_signed_at) AS owner_signature_signed_at
                        FROM banyera_transactions
                        WHERE owner_id IS NOT NULL
                          AND owner_signature_data_url IS NOT NULL
                          AND owner_signature_signed_at IS NOT NULL
                        GROUP BY owner_id
                    ) latest
                      ON latest.owner_id = bt.owner_id
                     AND latest.owner_signature_signed_at = bt.owner_signature_signed_at
                    WHERE bt.created_by IS NOT NULL
                ) signatures ON signatures.owner_id = bo.owner_id
                SET bo.owner_signature_updated_by = signatures.created_by
                WHERE bo.owner_signature_updated_by IS NULL
                  AND bo.owner_signature_data_url IS NOT NULL
            ");
        }

        if (
            Schema::hasColumn('boat_owners', 'owner_signature_updated_by') &&
            Schema::hasColumn('boat_owners', 'created_by')
        ) {
            DB::statement("
                UPDATE boat_owners
                SET owner_signature_updated_by = created_by
                WHERE owner_signature_updated_by IS NULL
                  AND owner_signature_data_url IS NOT NULL
                  AND created_by IS NOT NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::table('boat_owners', function (Blueprint $table) {
            if (Schema::hasColumn('boat_owners', 'owner_signature_updated_by')) {
                $table->dropConstrainedForeignId('owner_signature_updated_by');
            }
        });
    }
};
