<?php

use App\Services\LegacySignatureMigration;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        app(LegacySignatureMigration::class)->run();
    }

    public function down(): void
    {
        throw new RuntimeException('Signature encryption cannot be rolled back automatically. Preserve APP_KEY and restore a coordinated application/database backup if necessary.');
    }
};
