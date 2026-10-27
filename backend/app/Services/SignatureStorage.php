<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class SignatureStorage
{
    public const MAX_BYTES = 1500000;

    /** Accept image bytes only; URLs supplied by clients must never be fetched. */
    public function normalize(string $value): string
    {
        if (! preg_match('/\Adata:image\/(png|jpeg);base64,([A-Za-z0-9+\/=\r\n]+)\z/', $value, $matches)) {
            throw ValidationException::withMessages([
                'owner_signature_data_url' => 'The signature must be a PNG or JPEG image, not an image URL.',
            ]);
        }

        $bytes = base64_decode($matches[2], true);
        $image = $bytes === false ? false : @getimagesizefromstring($bytes);
        if ($bytes === false || strlen($bytes) > self::MAX_BYTES || ! $image
            || ($image['mime'] ?? '') !== 'image/'.$matches[1]
            || $image[0] > 8192 || $image[1] > 8192) {
            throw ValidationException::withMessages([
                'owner_signature_data_url' => 'The signature image is invalid or exceeds the allowed size.',
            ]);
        }

        return 'data:'.$image['mime'].';base64,'.base64_encode($bytes);
    }

    /** Realtime channels are public; signature data belongs only in authenticated API responses. */
    public static function redact(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (in_array($key, ['owner_signature_data_url', 'signature_data_url', 'owner_signature_public_id', 'signature_public_id'], true)) {
                unset($payload[$key]);
            } elseif (is_array($value)) {
                $payload[$key] = self::redact($value);
            }
        }

        return $payload;
    }

    /** Used only by the offline migration, never by an HTTP request. */
    public function importLegacy(string $value): string
    {
        if (str_starts_with($value, 'data:image/')) {
            return $this->normalize($value);
        }

        $cloud = config('services.cloudinary.url')
            ? parse_url(config('services.cloudinary.url'), PHP_URL_HOST)
            : config('services.cloudinary.cloud_name');
        $url = parse_url($value);
        $path = $url['path'] ?? '';
        if (! $cloud || ! is_array($url)
            || ! in_array($url['scheme'] ?? '', ['https', 'http'], true)
            || ($url['host'] ?? '') !== 'res.cloudinary.com'
            || isset($url['user']) || isset($url['pass']) || isset($url['port'])
            || ! str_starts_with($path, '/'.$cloud.'/image/upload/')
            || str_contains(rawurldecode($path), '..')) {
            throw new RuntimeException('Legacy signature is not an image from the configured Cloudinary account. Migration stopped; the source was preserved.');
        }

        // Upgrade old HTTP URLs and disable redirects to prevent fetching other hosts.
        $response = Http::timeout(30)->withOptions([
            'allow_redirects' => false,
            'on_headers' => function ($response) {
                if ((int) $response->getHeaderLine('Content-Length') > self::MAX_BYTES) {
                    throw new RuntimeException('Legacy signature exceeds the allowed size.');
                }
            },
            'progress' => function ($total, $downloaded) {
                if ($downloaded > self::MAX_BYTES) {
                    throw new RuntimeException('Legacy signature exceeds the allowed size.');
                }
            },
        ])->get('https://res.cloudinary.com'.$path.(isset($url['query']) ? '?'.$url['query'] : ''));

        if ($response->status() !== 200) {
            throw new RuntimeException('A legacy signature could not be downloaded. Migration stopped; the source was preserved.');
        }

        $bytes = $response->body();
        $image = @getimagesizefromstring($bytes);

        return $this->normalize('data:'.($image['mime'] ?? 'invalid').';base64,'.base64_encode($bytes));
    }
}
