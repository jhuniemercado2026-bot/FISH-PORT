<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Fee types now live directly on fees.fee_type_name as an enum.
    }

    public function down(): void
    {
        // No-op for fresh installs.
    }
};
