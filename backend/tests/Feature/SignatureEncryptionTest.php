<?php

namespace Tests\Feature;

use App\Events\MasterDataUpdated;
use App\Events\TransactionUpdated;
use App\Http\Middleware\PreventPrivateResponseCaching;
use App\Models\BanyeraTransaction;
use App\Models\BoatOwner;
use App\Models\BoatOwnerSignatureAudit;
use App\Services\LegacySignatureMigration;
use App\Services\SignatureStorage;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Tests\TestCase;

class SignatureEncryptionTest extends TestCase
{
    private const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.default' => 'signature_testing',
            'database.connections.signature_testing' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '',
            ],
            'app.key' => 'base64:'.base64_encode(str_repeat('s', 32)),
            'services.cloudinary.cloud_name' => 'signature-test',
            'services.cloudinary.url' => null,
        ]);
        app()->forgetInstance('encrypter');
        Crypt::clearResolvedInstance('encrypter');
        Http::preventStrayRequests();

        foreach (LegacySignatureMigration::FIELDS as [$table, $key, $field]) {
            Schema::create($table, function (Blueprint $blueprint) use ($table, $key, $field) {
                $blueprint->id($key);
                $blueprint->longText($field)->nullable($table !== 'boat_owner_signature_audits');
                $blueprint->string($table === 'boat_owner_signature_audits' ? 'signature_public_id' : 'owner_signature_public_id')->nullable();
                $blueprint->softDeletes();
                $blueprint->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        DB::purge('signature_testing');
        parent::tearDown();
    }

    public function test_all_three_models_encrypt_database_bytes_and_preserve_api_image_data(): void
    {
        foreach ([new BoatOwner, new BanyeraTransaction, new BoatOwnerSignatureAudit] as $model) {
            $field = $model instanceof BoatOwnerSignatureAudit ? 'signature_data_url' : 'owner_signature_data_url';
            $model->$field = app(SignatureStorage::class)->normalize(self::IMAGE);
            $model->save();

            $raw = DB::table($model->getTable())->where($model->getKeyName(), $model->getKey())->value($field);
            $this->assertNotSame(self::IMAGE, $raw);
            $this->assertStringNotContainsString('data:image', $raw);
            $this->assertSame(self::IMAGE, Crypt::decryptString($raw));
            $this->assertSame(self::IMAGE, $model->fresh()->toArray()[$field]);
        }
    }

    public function test_corrupted_ciphertext_is_rejected_instead_of_returned_as_an_image(): void
    {
        $owner = new BoatOwner;
        $owner->setRawAttributes(['owner_signature_data_url' => 'tampered-ciphertext']);
        $this->expectException(DecryptException::class);
        $owner->owner_signature_data_url;
    }

    public function test_new_signatures_reject_urls_and_disguised_non_image_data(): void
    {
        foreach (['https://res.cloudinary.com/signature-test/image/upload/signature.png', 'data:image/png;base64,'.base64_encode('not an image')] as $value) {
            try {
                app(SignatureStorage::class)->normalize($value);
                $this->fail('Unsafe signature accepted.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('owner_signature_data_url', $exception->errors());
            }
        }
        Http::assertNothingSent();
    }

    public function test_migration_imports_old_cloud_images_and_encrypts_plaintext_idempotently(): void
    {
        $url = 'https://res.cloudinary.com/signature-test/image/upload/v1/Opol%20Fish%20Port/Signature/test.png';
        Http::fake([$url => Http::response(base64_decode(explode(',', self::IMAGE)[1]), 200)]);
        DB::table('boat_owners')->insert(['owner_signature_data_url' => $url]);
        DB::table('banyera_transactions')->insert(['owner_signature_data_url' => self::IMAGE]);
        DB::table('boat_owner_signature_audits')->insert(['signature_data_url' => self::IMAGE]);

        app(LegacySignatureMigration::class)->run();
        $encrypted = [];
        foreach (LegacySignatureMigration::FIELDS as [$table, $key, $field]) {
            $encrypted[$table] = DB::table($table)->value($field);
            $this->assertSame(self::IMAGE, Crypt::decryptString($encrypted[$table]));
        }

        app(LegacySignatureMigration::class)->run();
        foreach (LegacySignatureMigration::FIELDS as [$table, $key, $field]) {
            $this->assertSame($encrypted[$table], DB::table($table)->value($field));
        }
        Http::assertSentCount(1);
    }

    public function test_migration_blocks_other_hosts_and_keeps_the_original_value(): void
    {
        $url = 'https://example.com/private.png';
        DB::table('boat_owners')->insert(['owner_signature_data_url' => $url]);
        try {
            app(LegacySignatureMigration::class)->run();
            $this->fail('Unexpected remote image accepted.');
        } catch (RuntimeException $exception) {
            $this->assertSame($url, DB::table('boat_owners')->value('owner_signature_data_url'));
        }
        Http::assertNothingSent();
    }

    public function test_legacy_import_uses_the_cloudinary_url_account_and_refuses_redirects(): void
    {
        config(['services.cloudinary.url' => 'cloudinary://test-key:test-secret@url-account']);
        $url = 'https://res.cloudinary.com/url-account/image/upload/signature.png';
        Http::fake([$url => Http::response('', 302, ['Location' => 'https://example.com/image.png'])]);
        try {
            app(SignatureStorage::class)->importLegacy($url);
            $this->fail('Image redirect accepted.');
        } catch (RuntimeException $exception) {
            Http::assertSentCount(1);
            Http::assertSent(fn ($request) => $request->url() === $url);
        }
    }

    public function test_failed_image_download_preserves_source_and_can_be_retried(): void
    {
        $url = 'https://res.cloudinary.com/signature-test/image/upload/signature.png';
        DB::table('boat_owners')->insert(['owner_signature_data_url' => $url]);
        Http::fake([$url => Http::sequence()->push('missing', 404)->push(base64_decode(explode(',', self::IMAGE)[1]), 200)]);
        try {
            app(LegacySignatureMigration::class)->run();
            $this->fail('Missing image accepted.');
        } catch (RuntimeException $exception) {
            $this->assertSame($url, DB::table('boat_owners')->value('owner_signature_data_url'));
        }
        app(LegacySignatureMigration::class)->run();
        $this->assertSame(self::IMAGE, Crypt::decryptString(DB::table('boat_owners')->value('owner_signature_data_url')));
    }

    public function test_cleanup_refuses_to_delete_assets_before_encryption(): void
    {
        DB::table('boat_owners')->insert([
            'owner_signature_data_url' => self::IMAGE,
            'owner_signature_public_id' => 'Opol Fish Port/Signature/test',
        ]);
        $this->artisan('signatures:purge-public-copies')->assertFailed();
        Http::assertNothingSent();
    }

    public function test_cleanup_dry_run_verifies_encrypted_copies_without_provider_access(): void
    {
        DB::table('boat_owners')->insert([
            'owner_signature_data_url' => Crypt::encryptString(self::IMAGE),
            'owner_signature_public_id' => 'Opol Fish Port/Signature/test',
        ]);
        $this->artisan('signatures:purge-public-copies', ['--dry-run' => true])
            ->expectsOutputToContain('1 legacy public signature assets')->assertSuccessful();
        Http::assertNothingSent();
    }

    public function test_signature_routes_require_authentication(): void
    {
        $this->getJson('/api/boat-owners/1')->assertUnauthorized();
        $this->getJson('/api/boat-owners/1/signature-audits')->assertUnauthorized();
    }

    public function test_private_responses_disable_caching(): void
    {
        $response = (new PreventPrivateResponseCaching)->handle(Request::create('/api/boat-owners/1'),
            fn () => response()->json(['owner_signature_data_url' => self::IMAGE]));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_public_broadcasts_never_include_nested_signature_images_or_asset_ids(): void
    {
        $record = [
            'boat_id' => 1,
            'owner_signature_data_url' => self::IMAGE,
            'owner' => ['owner_id' => 2, 'owner_signature_data_url' => self::IMAGE, 'owner_signature_public_id' => 'secret-id'],
            'audits' => [['signature_data_url' => self::IMAGE, 'signature_public_id' => 'secret-id']],
        ];
        foreach ([new MasterDataUpdated('boats', 'updated', $record), new TransactionUpdated('banyera', 'created', $record)] as $event) {
            $payload = $event->broadcastWith();
            $encoded = json_encode($payload);
            $this->assertStringNotContainsString('data:image', $encoded);
            $this->assertStringNotContainsString('secret-id', $encoded);
            $this->assertSame(2, $payload['record']['owner']['owner_id']);
        }
    }

    public function test_cleanup_refuses_assets_without_an_encrypted_image_copy(): void
    {
        DB::table('boat_owners')->insert([
            'owner_signature_data_url' => null,
            'owner_signature_public_id' => 'Opol Fish Port/Signature/test',
        ]);
        $this->artisan('signatures:purge-public-copies', ['--dry-run' => true])->assertFailed();
    }

    public function test_null_and_empty_legacy_values_are_migrated_without_breaking_reads(): void
    {
        DB::table('boat_owners')->insert(['owner_signature_data_url' => null]);
        DB::table('boat_owner_signature_audits')->insert(['signature_data_url' => '']);
        app(LegacySignatureMigration::class)->run();
        $this->assertNull(DB::table('boat_owners')->value('owner_signature_data_url'));
        $this->assertSame('', Crypt::decryptString(DB::table('boat_owner_signature_audits')->value('signature_data_url')));
        $this->artisan('signatures:purge-public-copies', ['--dry-run' => true])->assertSuccessful();
    }
}
