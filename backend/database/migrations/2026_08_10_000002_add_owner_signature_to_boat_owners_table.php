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
            if (!Schema::hasColumn('boat_owners', 'owner_signature_data_url')) {
                $table->longText('owner_signature_data_url')->nullable()->after('contact_number');
            }

            if (!Schema::hasColumn('boat_owners', 'owner_signature_signed_at')) {
                $table->timestamp('owner_signature_signed_at')->nullable()->after('owner_signature_data_url');
            }
        });

        if (
            Schema::hasColumn('banyera_transactions', 'owner_id') &&
            Schema::hasColumn('banyera_transactions', 'owner_signature_data_url') &&
            Schema::hasColumn('banyera_transactions', 'owner_signature_signed_at')
        ) {
            DB::statement("
                UPDATE boat_owners bo
                JOIN (
                    SELECT bt.owner_id, bt.owner_signature_data_url, bt.owner_signature_signed_at
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
                    WHERE bt.owner_signature_data_url IS NOT NULL
                ) signatures ON signatures.owner_id = bo.owner_id
                SET bo.owner_signature_data_url = signatures.owner_signature_data_url,
                    bo.owner_signature_signed_at = signatures.owner_signature_signed_at
                WHERE bo.owner_signature_data_url IS NULL
            ");
        }
    }

    public function down(): void
    {
        Schema::table('boat_owners', function (Blueprint $table) {
            if (Schema::hasColumn('boat_owners', 'owner_signature_signed_at')) {
                $table->dropColumn('owner_signature_signed_at');
            }

            if (Schema::hasColumn('boat_owners', 'owner_signature_data_url')) {
                $table->dropColumn('owner_signature_data_url');
            }
        });
    }
};
