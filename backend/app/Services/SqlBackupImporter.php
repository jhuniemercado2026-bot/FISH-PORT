<?php

namespace App\Services;

use RuntimeException;

class SqlBackupImporter
{
    /** Stream statements instead of sending the entire backup as one MySQL packet. */
    public function import(string $path, callable $execute): void
    {
        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new RuntimeException('Unable to read the SQL backup.');
        }

        $buffer = '';
        $delimiter = ';';
        $quote = null;
        $blockComment = false;
        $executableComment = false;
        $escaped = false;
        $lineNumber = 0;
        $statementNumber = 0;
        $run = function () use (&$buffer, &$statementNumber, &$lineNumber, $execute): void {
            $statement = trim($buffer);
            $buffer = '';
            if ($statement === '') return;

            // Backups from another host must stay in the configured database.
            if (preg_match('/^(?:CREATE\s+DATABASE\b|USE\s+)/i', $statement)) return;

            $statementNumber++;
            try {
                $execute($statement);
            } catch (\Throwable $error) {
                throw new RuntimeException(
                    "SQL import failed at statement {$statementNumber} (line {$lineNumber}): " . $error->getMessage(),
                    0,
                    $error
                );
            }
        };

        try {
            while (($line = fgets($handle)) !== false) {
                $lineNumber++;
                if ($lineNumber === 1) $line = preg_replace('/^\xEF\xBB\xBF/', '', $line);

                if ($quote === null && !$blockComment && trim($buffer) === ''
                    && preg_match('/^\s*DELIMITER\s+(\S+)\s*$/i', $line, $match)) {
                    $delimiter = $match[1];
                    continue;
                }

                $length = strlen($line);
                for ($i = 0; $i < $length; $i++) {
                    $char = $line[$i];
                    $next = $line[$i + 1] ?? '';
                    if ($blockComment) {
                        if ($char === '*' && $next === '/') {
                            if ($executableComment) $buffer .= '*/';
                            $blockComment = false;
                            $executableComment = false;
                            $i++;
                        } elseif ($executableComment) {
                            $buffer .= $char;
                        }
                        continue;
                    }
                    if ($quote !== null) {
                        $buffer .= $char;
                        if ($escaped) {
                            $escaped = false;
                        } elseif ($char === '\\') {
                            $escaped = true;
                        } elseif ($char === $quote) {
                            if ($next === $quote) {
                                $buffer .= $next;
                                $i++;
                            } else {
                                $quote = null;
                            }
                        }
                        continue;
                    }
                    if (substr($line, $i, strlen($delimiter)) === $delimiter) {
                        $run();
                        $i += strlen($delimiter) - 1;
                    } elseif ($char === '#' || ($char === '-' && $next === '-'
                        && ($i + 2 >= $length || ctype_space($line[$i + 2])))) {
                        $buffer .= "\n";
                        break;
                    } elseif ($char === '/' && $next === '*') {
                        $blockComment = true;
                        $executableComment = ($line[$i + 2] ?? '') === '!'
                            || substr($line, $i + 2, 2) === 'M!';
                        $buffer .= $executableComment ? '/*' : ' ';
                        $i++;
                    } elseif (in_array($char, ["'", '"', '`'], true)) {
                        $quote = $char;
                        $buffer .= $char;
                    } else {
                        $buffer .= $char;
                    }
                }
            }
            if (!feof($handle)) throw new RuntimeException('Unable to finish reading the SQL backup.');
            if ($quote !== null || $blockComment) {
                throw new RuntimeException("The SQL backup is incomplete near line {$lineNumber}.");
            }
            $run();
            if ($statementNumber === 0) throw new RuntimeException('The SQL backup contains no importable statements.');
        } finally {
            fclose($handle);
        }
    }
}
