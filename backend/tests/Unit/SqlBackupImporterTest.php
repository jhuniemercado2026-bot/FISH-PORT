<?php

namespace Tests\Unit;

use App\Services\SqlBackupImporter;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class SqlBackupImporterTest extends TestCase
{
    private function import(string $sql, callable $execute): void
    {
        $path = tempnam(sys_get_temp_dir(), 'restore-test-');
        try {
            file_put_contents($path, $sql);
            (new SqlBackupImporter())->import($path, $execute);
        } finally {
            unlink($path);
        }
    }

    public function test_large_backup_is_sent_as_individual_statements_and_restores_penalty_data(): void
    {
        $pdo = new \PDO('sqlite::memory:');
        $sql = 'CREATE TABLE billing_penalty_rules (id INTEGER, name TEXT);' . "\n"
            . 'CREATE TABLE bill_penalties (rule_id INTEGER, amount INTEGER);' . "\n";
        for ($i = 1; $i <= 12000; $i++) {
            $sql .= "INSERT INTO billing_penalty_rules VALUES ({$i}, '" . str_repeat('Monthly penalty ', 12) . "');\n";
            $sql .= "INSERT INTO bill_penalties VALUES ({$i}, 50);\n";
        }
        $this->assertGreaterThan(2 * 1024 * 1024, strlen($sql));
        $largestPacket = 0;
        $this->import($sql, static function ($statement) use ($pdo, &$largestPacket): void {
            $largestPacket = max($largestPacket, strlen($statement));
            $pdo->exec($statement);
        });
        $this->assertLessThan(1024, $largestPacket);
        $this->assertSame(12000, (int) $pdo->query('SELECT COUNT(*) FROM billing_penalty_rules')->fetchColumn());
        $this->assertSame(600000, (int) $pdo->query('SELECT SUM(amount) FROM bill_penalties')->fetchColumn());
    }

    public function test_quotes_comments_and_mysql_session_commands_are_preserved(): void
    {
        $statements = [];
        $this->import(<<<'SQL'
-- Header ; ignored
# Comment ; ignored
/* Header ; ignored */
/*!40101 SET NAMES utf8mb4 */;
INSERT INTO `semi;colon` VALUES ('semi;colon', 'it\'s ok', 'it''s doubled', "double;quote", NULL);
INSERT INTO `semi;colon` VALUES ('line one
line two; -- literal /* comment */');
SQL, function ($sql) use (&$statements): void { $statements[] = $sql; });
        $this->assertCount(3, $statements);
        $this->assertSame('/*!40101 SET NAMES utf8mb4 */', $statements[0]);
        $this->assertStringContainsString("'it\\'s ok', 'it''s doubled'", $statements[1]);
        $this->assertStringContainsString('line two; -- literal /* comment */', $statements[2]);
    }

    public function test_custom_delimiter_keeps_routine_body_together(): void
    {
        $statements = [];
        $this->import(<<<'SQL'
DELIMITER $$
CREATE PROCEDURE sample()
BEGIN
 SELECT 'literal $$';
 SELECT 2;
END$$
DELIMITER ;
SELECT 3;
SQL, function ($sql) use (&$statements): void { $statements[] = $sql; });
        $this->assertCount(2, $statements);
        $this->assertStringContainsString("SELECT 'literal $$';", $statements[0]);
        $this->assertStringEndsWith('END', $statements[0]);
        $this->assertSame('SELECT 3', $statements[1]);
    }

    public function test_source_database_directives_do_not_switch_the_restore_destination(): void
    {
        $statements = [];
        $this->import("\xEF\xBB\xBF-- Export\nCREATE DATABASE `source_db`;\nUSE `source_db`;\nSELECT 1;", function ($sql) use (&$statements): void { $statements[] = $sql; });
        $this->assertSame(['SELECT 1'], $statements);
    }

    public function test_failure_stops_import_and_identifies_statement_without_retrying(): void
    {
        $executed = [];
        try {
            $this->import("SELECT 1;\nBROKEN;\nSELECT 3;", function ($sql) use (&$executed): void {
                $executed[] = $sql;
                if ($sql === 'BROKEN') throw new RuntimeException('Invalid SQL');
            });
            $this->fail('Expected an import error.');
        } catch (RuntimeException $error) {
            $this->assertSame('SQL import failed at statement 2 (line 2): Invalid SQL', $error->getMessage());
        }
        $this->assertSame(['SELECT 1', 'BROKEN'], $executed);
    }

    public function test_truncated_backup_is_rejected(): void
    {
        $this->expectExceptionMessage('The SQL backup is incomplete');
        $this->import("INSERT INTO test VALUES ('unfinished", static function (): void {});
    }

    public function test_empty_backup_is_rejected(): void
    {
        $this->expectExceptionMessage('The SQL backup contains no importable statements.');
        $this->import('-- comments only', static function (): void {});
    }
}
