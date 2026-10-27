<?php

namespace App\Console\Commands;

use App\Services\LegacySignatureMigration;
use App\Services\SignatureStorage;
use Cloudinary\Cloudinary;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class PurgePublicSignatureCopies extends Command
{
    protected $signature = 'signatures:purge-public-copies {--dry-run : Verify encrypted copies and list the number of public assets without deleting them}';

    protected $description = 'Remove legacy Cloudinary signature images after verifying encrypted database copies.';

    public function handle(): int
    {
        try {
            // Fail closed: every stored signature must be decryptable image data.
            foreach (LegacySignatureMigration::FIELDS as [$table, $key, $field]) {
                DB::table($table)->whereNotNull($field)->orderBy($key)->chunkById(50, function ($rows) use ($field) {
                    foreach ($rows as $row) {
                        $plain = Crypt::decryptString($row->$field);
                        if ($plain !== '') {
                            app(SignatureStorage::class)->normalize($plain);
                        }
                    }
                }, $key);
            }

            $ids = DB::table('boat_owners')->whereNotNull('owner_signature_public_id')->pluck('owner_signature_public_id')
                ->merge(DB::table('boat_owner_signature_audits')->whereNotNull('signature_public_id')->pluck('signature_public_id'))
                ->filter()->unique()->values();

            foreach ([['boat_owners', 'owner_signature_public_id', 'owner_signature_data_url'],
                ['boat_owner_signature_audits', 'signature_public_id', 'signature_data_url']] as [$table, $idField, $imageField]) {
                if (DB::table($table)->whereNotNull($idField)->where($idField, '!=', '')
                    ->whereNull($imageField)->exists()) {
                    throw new RuntimeException('A public asset has no encrypted image copy.');
                }
                foreach (DB::table($table)->whereNotNull($idField)->where($idField, '!=', '')->cursor() as $row) {
                    app(SignatureStorage::class)->normalize(Crypt::decryptString($row->$imageField));
                }
            }

            foreach ($ids as $id) {
                if (! str_starts_with($id, 'Opol Fish Port/Signature/') || str_contains($id, '..')) {
                    throw new RuntimeException('Unexpected signature asset folder.');
                }
            }

            $this->info($ids->count().' legacy public signature assets; encrypted database copies verified.');
            if ($this->option('dry-run') || $ids->isEmpty()) {
                return self::SUCCESS;
            }

            $url = config('services.cloudinary.url');
            if (! $url) {
                $cloud = config('services.cloudinary.cloud_name');
                $key = config('services.cloudinary.api_key');
                $secret = config('services.cloudinary.api_secret');
                if (! $cloud || ! $key || ! $secret) {
                    throw new RuntimeException('Cloudinary credentials are required.');
                }
                $url = sprintf('cloudinary://%s:%s@%s', $key, $secret, $cloud);
            }

            $api = (new Cloudinary($url))->uploadApi();
            foreach ($ids as $id) {
                $result = $api->destroy($id, ['resource_type' => 'image', 'invalidate' => true]);
                if (! in_array($result['result'] ?? '', ['ok', 'not found'], true)) {
                    throw new RuntimeException('Cloudinary did not confirm deletion.');
                }
            }

            $this->info('Legacy public copies removed; CDN invalidation requested. Asset IDs are retained for audit and safe retries.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            // Do not print image contents, URLs, or credentials from provider errors.
            $this->error('Cleanup stopped. Verify the encryption migration, APP_KEY, and Cloudinary configuration before retrying. Encrypted copies were preserved.');

            return self::FAILURE;
        }
    }
}
