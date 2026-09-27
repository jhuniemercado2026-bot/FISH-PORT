<?php

namespace Tests\Feature;

use App\Http\Controllers\BackupRecoveryController;
use ReflectionClass;
use Tests\TestCase;

class BackupRecoveryControllerTest extends TestCase
{
    public function test_backup_directory_is_resolved_to_a_writable_location(): void
    {
        $controller = new BackupRecoveryController();
        $reflection = new ReflectionClass($controller);
        $method = $reflection->getMethod('backupDirectory');
        $method->setAccessible(true);

        $directory = $method->invoke($controller);

        $this->assertIsString($directory);
        $this->assertDirectoryExists($directory);
        $this->assertTrue(is_writable($directory), 'The backup directory should be writable.');
    }

    public function test_mysql_binary_falls_back_to_mariadb_binary_when_available(): void
    {
        $controller = new BackupRecoveryController();
        $reflection = new ReflectionClass($controller);
        $method = $reflection->getMethod('resolveMysqlBinary');
        $method->setAccessible(true);

        $binaryPath = tempnam(sys_get_temp_dir(), 'maria-dump');
        $this->assertNotFalse($binaryPath);

        putenv('MARIADB_DUMP_BINARY=' . $binaryPath);

        try {
            $binary = $method->invoke($controller, 'mysqldump');
            $this->assertSame($binaryPath, $binary);
        } finally {
            putenv('MARIADB_DUMP_BINARY');
            if (is_file($binaryPath)) {
                unlink($binaryPath);
            }
        }
    }
}
