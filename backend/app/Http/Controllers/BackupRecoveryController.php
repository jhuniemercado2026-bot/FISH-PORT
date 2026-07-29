<?php

namespace App\Http\Controllers;

use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Exception\RuntimeException;
use Symfony\Component\Process\Process;

class BackupRecoveryController extends Controller
{
    private const BACKUP_DIRECTORY = 'database-backups';
    private const RECOVERY_DIRECTORY = 'database-recovery';
    private const PROCESS_TIMEOUT_SECONDS = 300;

    public function download(Request $request)
    {
        if (!$this->canCreateDatabaseBackup($request)) {
            return response()->json(['message' => 'Only Head of MEEO accounts can create database backups.'], 403);
        }

        try {
            $path = $this->createDatabaseBackup();
        } catch (\Throwable $error) {
            return $this->databaseProcessError($error, 'Unable to create the database backup.');
        }

        app(ActivityLogService::class)->log(
            action: 'BACKUP',
            module: 'Database Backup',
            details: 'Downloaded database backup "' . basename($path) . '".',
            user: $request->user()
        );

        return response()->download($path, basename($path), [
            'Content-Type' => 'application/sql',
        ])->deleteFileAfterSend(true);
    }

    public function recover(Request $request)
    {
        if (!$this->canRecoverDatabase($request)) {
            return response()->json(['message' => 'Only Head of MEEO accounts can recover the database.'], 403);
        }

        $validated = $request->validate([
            'backup_file' => ['required', 'file', 'max:51200'],
        ]);

        $uploadedFile = $validated['backup_file'];

        if (strtolower($uploadedFile->getClientOriginalExtension()) !== 'sql') {
            return response()->json([
                'message' => 'Only .sql backup files can be recovered.',
                'errors' => [
                    'backup_file' => ['Only .sql backup files can be recovered.'],
                ],
            ], 422);
        }

        try {
            $preRestoreBackupPath = $this->createDatabaseBackup('pre-restore');
        } catch (\Throwable $error) {
            return $this->databaseProcessError($error, 'Recovery was cancelled because the safety backup could not be created.');
        }

        $storedPath = $uploadedFile->storeAs(
            self::RECOVERY_DIRECTORY,
            now('Asia/Manila')->format('Ymd_His') . '_' . Str::slug(pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME)) . '.sql'
        );

        $absoluteSqlPath = Storage::path($storedPath);

        try {
            $this->restoreDatabase($absoluteSqlPath);
        } catch (\Throwable $error) {
            return $this->databaseProcessError($error, 'Unable to recover the database from the selected file.');
        } finally {
            Storage::delete($storedPath);
        }

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Database Recovery',
            details: 'Recovered database from uploaded SQL file "' . $uploadedFile->getClientOriginalName() . '". Safety backup: "' . basename($preRestoreBackupPath) . '".',
            user: $request->user()
        );

        return response()->json([
            'message' => 'Database recovered successfully.',
            'safety_backup' => basename($preRestoreBackupPath),
        ]);
    }

    private function createDatabaseBackup(string $prefix = 'backup'): string
    {
        $this->ensureMysqlConnection();

        $directory = storage_path('app/private/' . self::BACKUP_DIRECTORY);
        File::ensureDirectoryExists($directory);

        $database = (string) config('database.connections.mysql.database');
        $filename = $this->backupFilename($prefix);
        $path = $directory . DIRECTORY_SEPARATOR . $filename;

        $process = new Process($this->mysqlCommand('mysqldump', [
            '--single-transaction',
            '--routines',
            '--triggers',
            $database,
        ]));
        $process->setEnv($this->processEnvironment());
        $process->setTimeout(self::PROCESS_TIMEOUT_SECONDS);

        $handle = fopen($path, 'wb');
        if ($handle === false) {
            throw new RuntimeException('Unable to create the backup file.');
        }

        try {
            $process->mustRun(function ($type, $buffer) use ($handle) {
                if ($type === Process::OUT) {
                    fwrite($handle, $buffer);
                }
            });
        } finally {
            fclose($handle);
        }

        if (!is_file($path) || filesize($path) === 0) {
            @unlink($path);
            throw new RuntimeException('The generated backup file is empty.');
        }

        return $path;
    }

    private function backupFilename(string $prefix): string
    {
        $date = now('Asia/Manila')->format('d-m-Y');

        if ($prefix === 'backup') {
            return "opol_fish_port_{$date}.sql";
        }

        return 'opol_fish_port_' . Str::slug($prefix, '_') . "_{$date}.sql";
    }

    private function restoreDatabase(string $sqlPath): void
    {
        $this->ensureMysqlConnection();

        if (!is_file($sqlPath) || strtolower(pathinfo($sqlPath, PATHINFO_EXTENSION)) !== 'sql') {
            throw new RuntimeException('The recovery file is not a valid SQL file.');
        }

        $database = (string) config('database.connections.mysql.database');
        $process = new Process($this->mysqlCommand('mysql', [$database]));
        $process->setEnv($this->processEnvironment());
        $process->setTimeout(self::PROCESS_TIMEOUT_SECONDS);

        $handle = fopen($sqlPath, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to read the recovery file.');
        }

        try {
            $process->setInput($handle);
            $process->mustRun();
        } finally {
            fclose($handle);
        }
    }

    private function mysqlCommand(string $binary, array $extraArguments = []): array
    {
        $connection = config('database.connections.mysql');
        $command = [
            $this->resolveMysqlBinary($binary),
            '--host=' . ($connection['host'] ?? '127.0.0.1'),
            '--port=' . ($connection['port'] ?? 3306),
            '--user=' . ($connection['username'] ?? 'root'),
        ];

        $password = (string) ($connection['password'] ?? '');
        if ($password !== '') {
            $command[] = '--password=' . $password;
        }

        return array_merge($command, $extraArguments);
    }

    private function resolveMysqlBinary(string $binary): string
    {
        $envKey = strtoupper($binary) . '_BINARY';
        $configuredPath = env($envKey);

        if ($configuredPath && is_file($configuredPath)) {
            return $configuredPath;
        }

        foreach ($this->mysqlBinaryCandidates($binary) as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return $binary;
    }

    private function mysqlBinaryCandidates(string $binary): array
    {
        $fileName = PHP_OS_FAMILY === 'Windows' ? $binary . '.exe' : $binary;

        return [
            'C:\\xampp\\mysql\\bin\\' . $fileName,
            'C:\\laragon\\bin\\mysql\\mysql-8.0\\bin\\' . $fileName,
            'C:\\laragon\\bin\\mysql\\mysql-5.7\\bin\\' . $fileName,
            'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\' . $fileName,
            'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\' . $fileName,
            '/usr/bin/' . $binary,
            '/usr/local/bin/' . $binary,
        ];
    }

    private function ensureMysqlConnection(): void
    {
        if (config('database.default') !== 'mysql') {
            throw new RuntimeException('Backup and recovery currently supports MySQL only.');
        }

        if (!config('database.connections.mysql.database')) {
            throw new RuntimeException('The MySQL database name is missing.');
        }
    }

    private function processEnvironment(): array
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return [];
        }

        $systemRoot = getenv('SystemRoot') ?: getenv('WINDIR') ?: 'C:\\Windows';

        return [
            'SystemRoot' => $systemRoot,
            'WINDIR' => $systemRoot,
            'COMSPEC' => getenv('COMSPEC') ?: $systemRoot . '\\System32\\cmd.exe',
        ];
    }

    private function canCreateDatabaseBackup(Request $request): bool
    {
        return strtolower((string) $request->user()?->role) === 'head';
    }

    private function canRecoverDatabase(Request $request): bool
    {
        return strtolower((string) $request->user()?->role) === 'head';
    }

    private function databaseProcessError(\Throwable $error, string $fallbackMessage)
    {
        report($error);

        $message = $fallbackMessage;
        if ($error instanceof ProcessFailedException) {
            $message = trim($error->getProcess()->getErrorOutput()) ?: $fallbackMessage;
        } elseif ($error instanceof RuntimeException) {
            $message = $error->getMessage() ?: $fallbackMessage;
        }

        return response()->json(['message' => $message], 500);
    }
}
