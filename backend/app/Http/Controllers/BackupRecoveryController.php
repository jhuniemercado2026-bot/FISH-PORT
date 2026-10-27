<?php

namespace App\Http\Controllers;

use App\Events\AccountStatusUpdated;
use App\Events\MasterDataUpdated;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\SqlBackupImporter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
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
        $restoreActor = $request->user();
        $restoreActorId = (int) ($restoreActor?->user_id ?? 0);
        $restoreActorName = $restoreActor ? trim($restoreActor->full_name) : null;
        $restoreActorRole = $restoreActor?->role;
        // The SQL import replaces the token table too. Keep the uploader's live
        // credentials outside the database until the import has finished.
        $actorTokens = $restoreActor->tokens()->get()->map->getAttributes()->all();
        $actorSessions = Schema::hasTable('sessions')
            ? DB::table('sessions')->where('user_id', $restoreActorId)->get()->map(fn ($session) => (array) $session)->all()
            : [];

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

        $localDisk = Storage::disk('local');
        $localDisk->makeDirectory(self::RECOVERY_DIRECTORY);

        $storedPath = $uploadedFile->storeAs(
            self::RECOVERY_DIRECTORY,
            now('Asia/Manila')->format('Ymd_His') . '_' . Str::slug(pathinfo($uploadedFile->getClientOriginalName(), PATHINFO_FILENAME)) . '.sql',
            'local'
        );

        if (!is_string($storedPath) || $storedPath === '') {
            throw new \RuntimeException('The uploaded SQL file could not be saved to the recovery directory.');
        }

        $absoluteSqlPath = $localDisk->path($storedPath);

        if (!is_file($absoluteSqlPath) || !is_readable($absoluteSqlPath)) {
            throw new \RuntimeException('The uploaded SQL file is missing or unreadable on the server: ' . $absoluteSqlPath);
        }

        try {
            $this->restoreDatabase($absoluteSqlPath);
            $loggedOutAccounts = $this->logoutOtherUsersAfterRestore($restoreActor, $actorTokens, $actorSessions);
        } catch (\Throwable $error) {
            $details = $error->getMessage() ?: 'The uploaded SQL file could not be restored.';
            report($error);

            return response()->json([
                'message' => 'Unable to recover the database from the selected file.',
                'details' => $details,
            ], 500);
        } finally {
            $localDisk->delete($storedPath);
        }

        $restoredActor = $restoreActorId > 0 ? User::find($restoreActorId) : null;

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Database Recovery',
            details: 'Recovered database from uploaded SQL file "' . $uploadedFile->getClientOriginalName() . '". Safety backup: "' . basename($preRestoreBackupPath) . '". Logged out ' . $loggedOutAccounts . ' other account(s).',
            user: $restoredActor,
            userName: $restoreActorName,
            userRole: $restoreActorRole
        );

        return response()->json([
            'message' => 'Database recovered successfully.',
            'safety_backup' => basename($preRestoreBackupPath),
            'logged_out_accounts' => $loggedOutAccounts,
        ]);
    }

    private function logoutOtherUsersAfterRestore(User $actor, array $actorTokens, array $actorSessions): int
    {
        $actorId = $actor->getKey();
        $accounts = DB::transaction(function () use ($actor, $actorId, $actorTokens, $actorSessions) {
            // Retain the account that authorized recovery, even when the uploaded
            // backup predates that account or contains its old password/status.
            $attributes = $actor->getAttributes();
            $attributes['status'] = 'online';
            if (!empty($attributes['created_by']) && !User::whereKey($attributes['created_by'])->exists()) {
                $attributes['created_by'] = null;
            }
            DB::table('users')->updateOrInsert(['user_id' => $actorId], $attributes);

            // Delete imported credentials as well as live credentials. Otherwise
            // an old backup can silently re-enable previously revoked tokens.
            $tokenModel = $actor->tokens()->getRelated();
            $tokenModel->newQuery()->delete();
            if ($actorTokens !== []) {
                $tokenModel->newQuery()->insert($actorTokens);
            }
            if (Schema::hasTable('sessions')) {
                DB::table('sessions')->delete();
                if ($actorSessions !== []) {
                    DB::table('sessions')->insert($actorSessions);
                }
            }

            User::where('user_id', '!=', $actorId)
                ->where('status', '!=', 'deactivated')
                ->update(['status' => 'offline']);

            return User::where('user_id', '!=', $actorId)->get();
        });

        // Session invalidation must succeed even if the host cannot reach Pusher.
        // Clients also check /me periodically when realtime is unavailable.
        try {
            broadcast(new MasterDataUpdated('database', 'restored', [
                'reason' => 'backup_restore',
                'excluded_user_id' => $actorId,
                'affected_roles' => ['head', 'coordinator', 'inspector'],
                'message' => 'The database was restored. Please sign in again to refresh your data.',
            ]));

            foreach ($accounts as $account) {
                broadcast(new AccountStatusUpdated([
                    'user_id' => $account->user_id,
                    'id' => $account->user_id,
                    'email' => $account->email,
                    'name' => $account->full_name ?: $account->email,
                    'role' => $account->role,
                    'status' => $account->status,
                    'presence_status' => 'offline',
                ]));
            }
        } catch (\Throwable $error) {
            report($error);
        }

        return $accounts->count();
    }

    private function backupDirectory(): string
    {
        $candidates = [
            storage_path('app/private/' . self::BACKUP_DIRECTORY),
            storage_path('app/' . self::BACKUP_DIRECTORY),
            rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . self::BACKUP_DIRECTORY,
        ];

        foreach ($candidates as $candidate) {
            if (!is_dir($candidate) && !@mkdir($candidate, 0775, true) && !is_dir($candidate)) {
                continue;
            }

            if (is_writable($candidate)) {
                return $candidate;
            }
        }

        throw new RuntimeException('The backup directory is not writable.');
    }

    private function createDatabaseBackup(string $prefix = 'backup'): string
    {
        $this->ensureMysqlConnection();

        $connection = DB::connection();
        $database = (string) $connection->getDatabaseName();
        $path = $this->backupDirectory() . DIRECTORY_SEPARATOR . $this->backupFilename($prefix);

        try {
            $this->writeDatabaseBackupWithMysqldump($database, $path, $connection->getConfig());

            if (!is_file($path) || filesize($path) === 0) {
                throw new RuntimeException('The generated backup file is empty.');
            }

            return $path;
        } catch (\Throwable $dumpError) {
            @unlink($path);

            try {
                $this->writeDatabaseBackupFallback($database, $path);
            } catch (\Throwable $fallbackError) {
                @unlink($path);
                report($dumpError);
                report($fallbackError);

                throw new RuntimeException(
                    'The server could not create the SQL backup with mysqldump or the PHP database exporter. Check Laravel logs and confirm the database user has SELECT and SHOW CREATE permissions and the backup directory is writable.',
                    0,
                    $fallbackError
                );
            }

            if (!is_file($path) || filesize($path) === 0) {
                @unlink($path);
                throw new RuntimeException('The generated SQL backup was empty.', 0, $dumpError);
            }

            return $path;
        }
    }

    private function writeDatabaseBackupWithMysqldump(string $database, string $path, array $config): void
    {
        $binary = $this->resolveMysqlDumpBinary();
        if ($binary === null) {
            throw new RuntimeException('mysqldump is not available on this server.');
        }

        $process = new Process([
            $binary,
            '--host=' . ($config['host'] ?? '127.0.0.1'),
            '--port=' . (string) ($config['port'] ?? '3306'),
            '--user=' . ($config['username'] ?? 'root'),
            '--default-character-set=utf8mb4',
            '--single-transaction',
            '--routines',
            '--triggers',
            '--add-drop-table',
            '--result-file=' . $path,
            $database,
        ], null, $this->mysqlProcessEnv($config), null, self::PROCESS_TIMEOUT_SECONDS);

        if (($config['password'] ?? '') !== '') {
            $process->setEnv(['MYSQL_PWD' => (string) $config['password']]);
        }

        $process->run();

        if (!$process->isSuccessful()) {
            $message = trim($process->getErrorOutput() ?: $process->getOutput());
            throw new RuntimeException($message !== '' ? $message : 'mysqldump failed.');
        }

        if (!is_file($path) || filesize($path) === 0) {
            throw new RuntimeException('The generated SQL backup file is empty.');
        }
    }

    private function buildMysqldumpCommand(string $database, string $path, array $config, string $binary): string
    {
        $host = (string) ($config['host'] ?? '127.0.0.1');
        $port = (string) ($config['port'] ?? '3306');
        $username = (string) ($config['username'] ?? 'root');
        $password = (string) ($config['password'] ?? '');

        $parts = [
            $binary,
            '--host=' . escapeshellarg($host),
            '--port=' . escapeshellarg($port),
            '--user=' . escapeshellarg($username),
            '--default-character-set=utf8mb4',
            '--single-transaction',
            '--routines',
            '--triggers',
            '--add-drop-table',
            '--result-file=' . escapeshellarg($path),
            escapeshellarg($database),
        ];

        if ($password !== '') {
            array_splice($parts, 4, 0, ['--password=' . escapeshellarg($password)]);
        }

        return implode(' ', $parts);
    }

    private function resolveMysqlDumpBinary(): ?string
    {
        foreach (['MYSQLDUMP_PATH', 'MYSQL_BIN_PATH'] as $envKey) {
            $configuredPath = env($envKey);
            if (is_string($configuredPath) && trim($configuredPath) !== '' && is_file(trim($configuredPath))) {
                return trim($configuredPath);
            }
        }

        $candidates = [
            'mysqldump',
            'mariadb-dump',
            'mysql',
            'mariadb',
        ];

        foreach ($candidates as $candidate) {
            $path = $this->findBinary($candidate);
            if ($path !== null) {
                return $path;
            }
        }

        return null;
    }

    private function findBinary(string $name): ?string
    {
        $pathEntries = [];

        $envPath = getenv('PATH');
        if (is_string($envPath) && $envPath !== '') {
            $pathEntries = explode(PATH_SEPARATOR, $envPath);
        }

        foreach ($pathEntries as $entry) {
            $candidate = rtrim($entry, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $name;
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        $roots = PHP_OS_FAMILY === 'Windows'
            ? [
                'C:\\xampp\\mysql\\bin',
                'C:\\laragon\\bin\\mysql\\mysql-8.0\\bin',
                'C:\\laragon\\bin\\mysql\\mysql-8.4\\bin',
                'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin',
                'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin',
            ]
            : [
                '/usr/local/mysql/bin',
                '/usr/local/bin',
                '/usr/bin',
                '/opt/homebrew/bin',
                '/usr/local/cpanel/3rdparty/bin',
            ];

        $suffix = PHP_OS_FAMILY === 'Windows' ? '.exe' : '';

        foreach ($roots as $root) {
            $path = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $name . $suffix;
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
    }

    private function writeDatabaseBackupFallback(string $database, string $path): void
    {
        $connection = DB::connection();
        if (!in_array($connection->getDriverName(), ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('The PHP SQL exporter supports MySQL and MariaDB connections only.');
        }

        $pdo = $connection->getPdo();
        $handle = fopen($path, 'wb');
        if ($handle === false) {
            throw new RuntimeException('Unable to create the fallback backup file.');
        }

        $write = static function (string $contents) use ($handle): void {
            while ($contents !== '') {
                $written = fwrite($handle, $contents);
                if ($written === false || $written === 0) {
                    throw new RuntimeException('Unable to write the fallback backup file.');
                }
                $contents = substr($contents, $written);
            }
        };
        $quoteIdentifier = static fn (string $identifier): string => '`' . str_replace('`', '``', $identifier) . '`';
        $bufferedQueryAttribute = defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')
            ? constant('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY')
            : null;
        $previousBufferedQuery = null;

        try {
            if ($bufferedQueryAttribute !== null) {
                $previousBufferedQuery = $pdo->getAttribute($bufferedQueryAttribute);
                $pdo->setAttribute($bufferedQueryAttribute, false);
            }

            $write("-- Auto-generated SQL backup\n");
            $write('-- Database: `' . str_replace('`', '``', $database) . "`\n");
            $write('-- Generated: ' . now('Asia/Manila')->toDateTimeString() . "\n\n");
            $write("SET FOREIGN_KEY_CHECKS=0;\n\n");

            $tables = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
                ->fetchAll(\PDO::FETCH_COLUMN, 0);

            foreach ($tables as $table) {
                $tableName = (string) $table;
                $quotedTable = $quoteIdentifier($tableName);
                $createRow = $pdo->query('SHOW CREATE TABLE ' . $quotedTable)->fetch(\PDO::FETCH_NUM);
                $createStatement = $createRow[1] ?? null;
                if (!is_string($createStatement) || $createStatement === '') {
                    continue;
                }

                $write('DROP TABLE IF EXISTS ' . $quotedTable . ";\n");
                $write($createStatement . ";\n\n");

                $columnRows = $pdo->query('SHOW COLUMNS FROM ' . $quotedTable)->fetchAll(\PDO::FETCH_ASSOC);
                $columns = array_map(static fn ($column) => (string) $column['Field'], $columnRows);
                if ($columns === []) {
                    continue;
                }

                $quotedColumns = array_map($quoteIdentifier, $columns);
                $rows = $pdo->query('SELECT * FROM ' . $quotedTable);
                while ($row = $rows->fetch(\PDO::FETCH_NUM)) {
                    $values = [];
                    foreach ($row as $value) {
                        if ($value === null) {
                            $values[] = 'NULL';
                            continue;
                        }

                        $quotedValue = $pdo->quote((string) $value);
                        if ($quotedValue === false) {
                            throw new RuntimeException('Unable to serialize a database value for the SQL backup.');
                        }
                        $values[] = $quotedValue;
                    }

                    $write(
                        'INSERT INTO ' . $quotedTable . ' (' . implode(', ', $quotedColumns) . ') VALUES ('
                        . implode(', ', $values) . ");\n"
                    );
                }

                $write("\n");
            }

            $write("SET FOREIGN_KEY_CHECKS=1;\n");
        } finally {
            if ($bufferedQueryAttribute !== null && $previousBufferedQuery !== null) {
                $pdo->setAttribute($bufferedQueryAttribute, $previousBufferedQuery);
            }
            fclose($handle);
        }
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

        if (!is_file($sqlPath) || !is_readable($sqlPath) || strtolower(pathinfo($sqlPath, PATHINFO_EXTENSION)) !== 'sql') {
            throw new RuntimeException('The recovery file is missing, unreadable, or not a valid .sql file: ' . $sqlPath);
        }

        $database = (string) DB::connection()->getDatabaseName();
        $config = DB::connection()->getConfig();
        $this->writeDatabaseRestoreWithMysql($database, $sqlPath, $config);
    }

    private function writeDatabaseRestoreWithMysql(string $database, string $sqlPath, array $config): void
    {
        // Imports may exceed PHP's normal request timeout. Hosts can still enforce
        // their own limit, but do not stop a healthy import after 30 seconds.
        if (function_exists('set_time_limit')) @set_time_limit(self::PROCESS_TIMEOUT_SECONDS);

        if (!function_exists('mysqli_connect')) {
            // PDO is already required by Laravel; no shell access is needed on
            // shared hosting. Use a separate connection for imported session SETs.
            $pdo = (new \Illuminate\Database\Connectors\MySqlConnector())->connect(
                array_replace($config, ['database' => $database])
            );
            try {
                $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
                app(SqlBackupImporter::class)->import($sqlPath, static function (string $sql) use ($pdo): void {
                    $statement = $pdo->query($sql);
                    if ($statement !== false) $statement->closeCursor();
                });
            } finally {
                $pdo = null;
            }
            return;
        }

        $mysqli = @mysqli_init();
        if ($mysqli === false) {
            throw new RuntimeException('The server cannot initialize MySQL for SQL recovery.');
        }

        $host = (string) ($config['host'] ?? '127.0.0.1');
        $port = (int) ($config['port'] ?? 3306);
        $username = (string) ($config['username'] ?? 'root');
        $password = (string) ($config['password'] ?? '');
        $socket = $config['unix_socket'] ?? null;

        $connected = $socket !== null && $socket !== ''
            ? $mysqli->real_connect($host, $username, $password, $database, $port, $socket)
            : $mysqli->real_connect($host, $username, $password, $database, $port);

        if ($connected === false) {
            throw new RuntimeException('Unable to connect to MySQL for SQL recovery: ' . $mysqli->connect_error);
        }

        if (!$mysqli->set_charset('utf8mb4')) {
            throw new RuntimeException('Unable to set the MySQL client charset to utf8mb4: ' . $mysqli->error);
        }

        try {
            $mysqli->query('SET FOREIGN_KEY_CHECKS=0');
            app(SqlBackupImporter::class)->import($sqlPath, static function (string $sql) use ($mysqli): void {
                $result = $mysqli->query($sql);
                if ($result === false) throw new RuntimeException($mysqli->error ?: 'The SQL restore failed.');
                if ($result instanceof \mysqli_result) $result->free();
            });
        } finally {
            $mysqli->close();
        }
    }

    private function buildMysqlImportCommand(string $database, string $sqlPath, array $config, string $binary): string
    {
        $host = (string) ($config['host'] ?? '127.0.0.1');
        $port = (string) ($config['port'] ?? '3306');
        $username = (string) ($config['username'] ?? 'root');
        $password = (string) ($config['password'] ?? '');

        $command = implode(' ', [
            $binary,
            '--host=' . escapeshellarg($host),
            '--port=' . escapeshellarg($port),
            '--user=' . escapeshellarg($username),
            '--default-character-set=utf8mb4',
            '--database=' . escapeshellarg($database),
        ]);

        if ($password !== '') {
            $command = 'env MYSQL_PWD=' . escapeshellarg($password) . ' ' . $command;
        }

        return $command . ' < ' . escapeshellarg($sqlPath) . ' 2>&1';
    }

    private function mysqlProcessEnv(array $config): array
    {
        $env = [];

        if (($config['host'] ?? null) !== null) {
            $env['DB_HOST'] = (string) $config['host'];
        }

        if (($config['port'] ?? null) !== null) {
            $env['DB_PORT'] = (string) $config['port'];
        }

        if (($config['database'] ?? null) !== null) {
            $env['DB_DATABASE'] = (string) $config['database'];
        }

        if (($config['username'] ?? null) !== null) {
            $env['DB_USERNAME'] = (string) $config['username'];
        }

        return $env;
    }

    private function mysqlCommand(string $binary, array $extraArguments = []): array
    {
        $connection = DB::connection()->getConfig();
        $command = [$this->resolveMysqlBinary($binary)];

        if (!empty($connection['unix_socket'])) {
            $command[] = '--socket=' . $connection['unix_socket'];
        } else {
            $command[] = '--host=' . ($connection['host'] ?? '127.0.0.1');
            $command[] = '--port=' . ($connection['port'] ?? 3306);
        }

        $command[] = '--user=' . ($connection['username'] ?? 'root');

        $password = (string) ($connection['password'] ?? '');
        if ($password !== '') {
            $command[] = '--password=' . $password;
        }

        return array_merge($command, $extraArguments);
    }

    private function resolveMysqlBinary(string $binary): ?string
    {
        $binaryVariants = $this->mysqlBinaryVariants($binary);

        foreach ($binaryVariants as $variant) {
            foreach (['MYSQL_BIN_PATH', 'MYSQL_BINARY', 'MARIADB_BIN_PATH', 'MARIADB_BINARY', strtoupper(str_replace('-', '_', $variant)) . '_BINARY'] as $envKey) {
                $configuredPath = env($envKey);
                if (is_string($configuredPath) && trim($configuredPath) !== '' && is_file(trim($configuredPath))) {
                    return trim($configuredPath);
                }
            }
        }

        foreach ($binaryVariants as $variant) {
            foreach ($this->mysqlBinaryCandidates($variant) as $candidate) {
                if (is_file($candidate)) {
                    return $candidate;
                }
            }
        }

        return $binary;
    }

    private function mysqlBinaryVariants(string $binary): array
    {
        $variants = [$binary];

        if ($binary === 'mysqldump') {
            $variants[] = 'mariadb-dump';
        }

        if ($binary === 'mysql') {
            $variants[] = 'mariadb';
        }

        return array_values(array_unique($variants));
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
            '/usr/local/mysql/bin/' . $fileName,
            '/usr/local/bin/' . $fileName,
            '/usr/bin/' . $fileName,
            '/opt/alt/php' . PHP_MAJOR_VERSION . '/' . 'usr/bin/' . $fileName,
            '/usr/local/mysql/bin/' . $binary,
            '/usr/bin/' . $binary,
            '/usr/local/bin/' . $binary,
        ];
    }

    private function ensureMysqlConnection(): void
    {
        $connection = DB::connection();
        if (!in_array($connection->getDriverName(), ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('Backup and recovery currently supports MySQL and MariaDB only.');
        }

        if (!$connection->getDatabaseName()) {
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
            $message = 'The database dump utility failed and the PHP export fallback could not complete. Verify the database user has SELECT and SHOW CREATE permissions and that the backup directory is writable. Details are recorded in the server logs.';
        } elseif ($error instanceof \PDOException) {
            $message = 'The PHP database export could not read or serialize database data. Verify PDO MySQL is enabled and the database user has SELECT and SHOW CREATE permissions. Details are recorded in the server logs.';
        } elseif ($error instanceof RuntimeException) {
            $message = $error->getMessage() ?: $fallbackMessage;
        }

        return response()->json(['message' => $message], 500);
    }
}
