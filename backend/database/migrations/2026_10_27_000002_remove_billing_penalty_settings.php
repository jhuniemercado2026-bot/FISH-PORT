<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('billing_penalty_rules') || ! Schema::hasColumn('bill_penalties', 'penalty_rule_id')) {
            throw new RuntimeException('Migrate to dated penalty rules before removing legacy settings.');
        }

        if (! Schema::hasColumn('billing_penalty_rules', 'revision')) {
            Schema::table('billing_penalty_rules', fn (Blueprint $table) => $table->unsignedInteger('revision')->default(1));
        }

        if (! Schema::hasTable('billing_penalty_settings')) {
            return;
        }

        $settings = DB::table('billing_penalty_settings')->orderBy('id')->get();
        if (! DB::table('billing_penalty_rules')->exists()
            && $settings->contains(fn ($setting) => (float) $setting->amount > 0)) {
            throw new RuntimeException('Legacy penalty settings have not been imported into rules. The table was preserved.');
        }

        // Preserve the removed configuration without creating another runtime singleton table.
        $backup = 'retired-penalty-settings-'.Str::uuid().'.json';
        $contents = json_encode([
            'created_at' => now()->toIso8601String(),
            'encrypted_settings' => Crypt::encryptString($settings->toJson()),
        ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
        if (! Storage::disk('local')->put($backup, $contents)
            || Storage::disk('local')->get($backup) !== $contents) {
            throw new RuntimeException('Cannot verify the legacy settings backup. The table was preserved.');
        }

        Schema::drop('billing_penalty_settings');
    }

    public function down(): void
    {
        throw new RuntimeException('Legacy penalty settings were retired. Restore a coordinated database/application backup if rollback is required; the encrypted configuration backup is in private storage.');
    }
};
