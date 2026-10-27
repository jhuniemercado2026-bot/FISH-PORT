# Signature encryption deployment

New signatures are validated PNG/JPEG data URLs and are encrypted in the database using Laravel's authenticated encryption and the existing APP_KEY. Owner signatures, transaction signatures, and signature audit images all use encrypted casts. New images are no longer uploaded to Cloudinary. Existing authenticated API responses still contain decrypted image data so mobile previews and PDF printing continue to work. Private API responses use Cache-Control: private, no-store. Signature images and asset IDs are removed recursively from public realtime broadcasts.

## Deploy existing installations

Back up the database and the current APP_KEY securely. Do not run key:generate on an existing installation. Losing APP_KEY loses access to signatures; rotation requires retaining the old key through APP_PREVIOUS_KEYS. Database and key backups must be stored separately with restricted access.

Run these from the backend directory during a maintenance window. Keep application writes and queue workers stopped until the migration finishes. Deploy the new code while maintenance mode is active, and restart workers using the new release before serving traffic.

```powershell
php artisan down
php artisan migrate --force
php artisan signatures:purge-public-copies --dry-run
php artisan signatures:purge-public-copies
php artisan up
```

The migration imports old images from the configured Cloudinary account over HTTPS, validates them, and encrypts their bytes. It also encrypts existing Base64 images. It uses raw database writes so the model casts cannot encrypt values twice. A failed migration preserves source images and can be rerun; already encrypted rows are verified and skipped. Do not bring the application up after a failed migration: strict encrypted casts cannot read remaining plaintext values. Fix unavailable images or configuration and rerun the migration. Automatic rollback to plaintext is deliberately blocked.

The cleanup command verifies every stored signature can be decrypted into an image before removing legacy assets recorded by owner/audit public IDs. It requests Cloudinary CDN invalidation and can be retried. Review the Cloudinary Signature folder for untracked or orphaned uploads as well; the command only removes recorded assets. Previously downloaded copies and older plaintext backups cannot be recalled. CDN invalidation may take time.

## Access and transport

Keep the API and web application behind HTTPS and restrict database access. Signatures are decrypted for existing Sanctum-authenticated routes; existing account access rules still determine who can view or print them. A captured handwritten signature is not a cryptographic document signature. Authorized viewers can still copy an image they can see.

No production database or Cloudinary account is changed merely by deploying these source files. The migration and cleanup commands must be run against each deployed installation.

When restoring a backup from before encryption, keep the application in maintenance mode and rerun the encryption migration before serving requests. New encrypted backups require the matching APP_KEY (or a configured previous key).
