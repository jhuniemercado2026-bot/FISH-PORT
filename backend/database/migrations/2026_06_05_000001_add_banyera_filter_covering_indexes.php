<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('banyera_transactions') && !$this->indexExists('banyera_transactions', 'idx_banyera_status_date_created_id')) {
            Schema::table('banyera_transactions', function (Blueprint $table) {
                $table->index(
                    ['voided_at', 'transaction_date', 'created_at', 'banyera_id'],
                    'idx_banyera_status_date_created_id'
                );
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('banyera_transactions') || !$this->indexExists('banyera_transactions', 'idx_banyera_status_date_created_id')) {
            return;
        }

        Schema::table('banyera_transactions', function (Blueprint $table) {
            $table->dropIndex('idx_banyera_status_date_created_id');
        });
    }

    private function indexExists(string $tableName, string $indexName): bool
    {
        $databaseName = DB::getDatabaseName();

        return !empty(DB::select(
            'SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1',
            [$databaseName, $tableName, $indexName]
        ));
    }
};
