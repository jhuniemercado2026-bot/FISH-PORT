<?php

namespace App\Services;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LegacySignatureMigration
{
    public const FIELDS = [
        ['boat_owners', 'owner_id', 'owner_signature_data_url'],
        ['banyera_transactions', 'banyera_id', 'owner_signature_data_url'],
        ['boat_owner_signature_audits', 'signature_audit_id', 'signature_data_url'],
    ];

    public function run(): void
    {
        $storage = app(SignatureStorage::class);
        foreach (self::FIELDS as [$table, $key, $field]) {
            if (! Schema::hasColumn($table, $field)) {
                continue;
            }

            DB::table($table)->whereNotNull($field)->orderBy($key)->chunkById(50, function ($rows) use ($table, $key, $field, $storage) {
                foreach ($rows as $row) {
                    $value = $row->$field;
                    try {
                        $plain = Crypt::decryptString($value);
                        $encrypted = true;
                    } catch (DecryptException $exception) {
                        $plain = $value;
                        $encrypted = false;
                    }

                    if ($plain === '') {
                        if (! $encrypted) {
                            DB::table($table)->where($key, $row->$key)->update([$field => Crypt::encryptString('')]);
                        }
                        continue;
                    }

                    $image = $storage->importLegacy($plain);
                    if (! $encrypted || $image !== $plain) {
                        // Query builder intentionally bypasses the model's encrypted cast.
                        DB::table($table)->where($key, $row->$key)->update([$field => Crypt::encryptString($image)]);
                    }
                }
            }, $key);
        }
    }
}
