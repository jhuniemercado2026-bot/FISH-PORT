<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class BackupDatabaseToGoogleDrive extends Command
{
    protected $signature = 'database:backup-google-drive {--keep-local : Keep the generated SQL file after upload}';

    protected $description = 'Create a database SQL backup and upload it to Google Drive.';

    public function handle(): int
    {
        $connectionName = config('backup.database.connection') ?: config('database.default');
        $tempPath = $this->absolutePath(config('backup.database.temp_path'));
        $keepLocal = $this->option('keep-local') || filter_var(config('backup.database.keep_local'), FILTER_VALIDATE_BOOLEAN);
        $localPath = $this->absolutePath(config('backup.database.local_path'));
        $prefix = config('backup.database.filename_prefix', 'database_backup');
        $folderId = config('backup.google_drive.folder_id');
        $credentialsPath = $this->absolutePath(config('backup.google_drive.credentials_path'));
        $hasOAuthCredentials = config('backup.google_drive.client_id')
            && config('backup.google_drive.client_secret')
            && config('backup.google_drive.refresh_token');

        if (! $folderId) {
            $this->error('GOOGLE_DRIVE_BACKUP_FOLDER_ID is not configured.');

            return self::FAILURE;
        }

        if (! $hasOAuthCredentials && (! $credentialsPath || ! File::exists($credentialsPath))) {
            $this->error("Google Drive credentials file not found: {$credentialsPath}");

            return self::FAILURE;
        }

        File::ensureDirectoryExists($tempPath);

        $filename = sprintf('%s_%s.sql', $prefix, now()->format('Y-m-d_H-i-s'));
        $backupPath = rtrim($tempPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$filename;

        try {
            $this->info("Creating SQL backup: {$filename}");
            $this->writeDatabaseDump($connectionName, $backupPath);

            $this->info('Uploading backup to Google Drive...');
            $uploaded = $this->uploadToGoogleDrive($credentialsPath, $folderId, $backupPath, $filename);

            $this->info('Backup uploaded to Google Drive.');
            $this->line('File ID: '.$uploaded['id']);

            if ($keepLocal) {
                File::ensureDirectoryExists($localPath);

                $localBackupPath = rtrim($localPath, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.$filename;
                File::move($backupPath, $localBackupPath);
                $this->info("Local backup saved: {$localBackupPath}");
            } else {
                File::delete($backupPath);
                $this->info('Temporary local backup deleted.');
            }

            return self::SUCCESS;
        } catch (\Throwable $exception) {
            if (! $keepLocal && File::exists($backupPath)) {
                File::delete($backupPath);
            }

            report($exception);
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }

    private function writeDatabaseDump(string $connectionName, string $backupPath): void
    {
        $connection = DB::connection($connectionName);
        $driver = $connection->getDriverName();

        $handle = fopen($backupPath, 'wb');

        if (! $handle) {
            throw new RuntimeException("Unable to create backup file: {$backupPath}");
        }

        try {
            fwrite($handle, "-- Opol Fish Port database backup\n");
            fwrite($handle, '-- Created at: '.now()->toDateTimeString()."\n");
            fwrite($handle, "-- Connection: {$connectionName}\n\n");

            match ($driver) {
                'mysql', 'mariadb' => $this->writeMysqlDump($connection, $handle),
                'sqlite' => $this->writeSqliteDump($connection, $handle),
                default => throw new RuntimeException("Database backup is not supported for driver: {$driver}"),
            };
        } finally {
            fclose($handle);
        }
    }

    private function writeMysqlDump($connection, $handle): void
    {
        $pdo = $connection->getPdo();
        $database = $connection->getDatabaseName();

        fwrite($handle, "SET FOREIGN_KEY_CHECKS=0;\n\n");

        $tables = $pdo->query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')->fetchAll(\PDO::FETCH_NUM);

        foreach ($tables as $tableRow) {
            $table = $tableRow[0];
            $quotedTable = $this->quoteIdentifier($table);

            fwrite($handle, "DROP TABLE IF EXISTS {$quotedTable};\n");

            $createRow = $pdo->query('SHOW CREATE TABLE '.$quotedTable)->fetch(\PDO::FETCH_ASSOC);
            fwrite($handle, ($createRow['Create Table'] ?? array_values($createRow)[1]).";\n\n");

            $statement = $pdo->query('SELECT * FROM '.$quotedTable);

            while ($row = $statement->fetch(\PDO::FETCH_ASSOC)) {
                $columns = array_map(fn ($column) => $this->quoteIdentifier($column), array_keys($row));
                $values = array_map(fn ($value) => $value === null ? 'NULL' : $pdo->quote((string) $value), array_values($row));

                fwrite(
                    $handle,
                    sprintf(
                        'INSERT INTO %s (%s) VALUES (%s);',
                        $quotedTable,
                        implode(', ', $columns),
                        implode(', ', $values)
                    )."\n"
                );
            }

            fwrite($handle, "\n");
        }

        fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
        fwrite($handle, "-- Database: {$database}\n");
    }

    private function writeSqliteDump($connection, $handle): void
    {
        $pdo = $connection->getPdo();
        $tables = $pdo
            ->query("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            ->fetchAll(\PDO::FETCH_ASSOC);

        fwrite($handle, "PRAGMA foreign_keys=OFF;\n\n");

        foreach ($tables as $tableInfo) {
            $table = $tableInfo['name'];
            $quotedTable = $this->quoteIdentifier($table);

            fwrite($handle, "DROP TABLE IF EXISTS {$quotedTable};\n");
            fwrite($handle, $tableInfo['sql'].";\n\n");

            $statement = $pdo->query('SELECT * FROM '.$quotedTable);

            while ($row = $statement->fetch(\PDO::FETCH_ASSOC)) {
                $columns = array_map(fn ($column) => $this->quoteIdentifier($column), array_keys($row));
                $values = array_map(fn ($value) => $value === null ? 'NULL' : $pdo->quote((string) $value), array_values($row));

                fwrite(
                    $handle,
                    sprintf(
                        'INSERT INTO %s (%s) VALUES (%s);',
                        $quotedTable,
                        implode(', ', $columns),
                        implode(', ', $values)
                    )."\n"
                );
            }

            fwrite($handle, "\n");
        }

        fwrite($handle, "PRAGMA foreign_keys=ON;\n");
    }

    private function uploadToGoogleDrive(?string $credentialsPath, string $folderId, string $filePath, string $filename): array
    {
        $accessToken = $this->getGoogleAccessToken($credentialsPath);
        $boundary = 'opol_backup_'.bin2hex(random_bytes(12));
        $metadata = [
            'name' => $filename,
            'parents' => [$folderId],
        ];

        $body = "--{$boundary}\r\n";
        $body .= "Content-Type: application/json; charset=UTF-8\r\n\r\n";
        $body .= json_encode($metadata, JSON_THROW_ON_ERROR)."\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: application/sql\r\n\r\n";
        $body .= File::get($filePath)."\r\n";
        $body .= "--{$boundary}--";

        $response = Http::withToken($accessToken)
            ->withHeaders(['Content-Type' => "multipart/related; boundary={$boundary}"])
            ->withBody($body, "multipart/related; boundary={$boundary}")
            ->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');

        if (! $response->successful()) {
            throw new RuntimeException('Google Drive upload failed: '.$response->body());
        }

        return $response->json();
    }

    private function getGoogleAccessToken(?string $credentialsPath): string
    {
        if (
            config('backup.google_drive.client_id')
            && config('backup.google_drive.client_secret')
            && config('backup.google_drive.refresh_token')
        ) {
            return $this->getGoogleAccessTokenFromRefreshToken();
        }

        if (! $credentialsPath) {
            throw new RuntimeException('Google Drive credentials are not configured.');
        }

        return $this->getGoogleAccessTokenFromServiceAccount($credentialsPath);
    }

    private function getGoogleAccessTokenFromRefreshToken(): string
    {
        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'client_id' => config('backup.google_drive.client_id'),
            'client_secret' => config('backup.google_drive.client_secret'),
            'refresh_token' => config('backup.google_drive.refresh_token'),
            'grant_type' => 'refresh_token',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Google Drive OAuth refresh failed: '.$response->body());
        }

        $accessToken = $response->json('access_token');

        if (! $accessToken) {
            throw new RuntimeException('Google Drive OAuth refresh did not return an access token.');
        }

        return $accessToken;
    }

    private function getGoogleAccessTokenFromServiceAccount(string $credentialsPath): string
    {
        $credentials = json_decode(File::get($credentialsPath), true, 512, JSON_THROW_ON_ERROR);
        $tokenUri = $credentials['token_uri'] ?? 'https://oauth2.googleapis.com/token';
        $clientEmail = $credentials['client_email'] ?? null;
        $privateKey = $credentials['private_key'] ?? null;

        if (! $clientEmail || ! $privateKey) {
            throw new RuntimeException('Invalid Google Drive service account credentials.');
        }

        $now = time();
        $jwtHeader = $this->base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $jwtClaim = $this->base64UrlEncode(json_encode([
            'iss' => $clientEmail,
            'scope' => 'https://www.googleapis.com/auth/drive',
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
        ], JSON_THROW_ON_ERROR));

        $unsignedJwt = "{$jwtHeader}.{$jwtClaim}";

        if (! openssl_sign($unsignedJwt, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Unable to sign Google Drive access token request.');
        }

        $jwt = $unsignedJwt.'.'.$this->base64UrlEncode($signature);

        $response = Http::asForm()->post($tokenUri, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $jwt,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Google Drive authentication failed: '.$response->body());
        }

        $accessToken = $response->json('access_token');

        if (! $accessToken) {
            throw new RuntimeException('Google Drive authentication did not return an access token.');
        }

        return $accessToken;
    }

    private function quoteIdentifier(string $identifier): string
    {
        return '`'.str_replace('`', '``', $identifier).'`';
    }

    private function absolutePath(?string $path): ?string
    {
        if (! $path) {
            return $path;
        }

        if (str_starts_with($path, '/') || preg_match('/^[A-Za-z]:[\\\\\\/]/', $path)) {
            return $path;
        }

        return base_path($path);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
