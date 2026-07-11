<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;

class ActivityLogService
{
    // Centralized activity logger keeps audit entries consistent across modules.
    public function log(
        string $action,
        string $module,
        ?string $details = null,
        ?User $user = null,
        ?string $userName = null,
        ?string $userRole = null
    ): ActivityLog {
        $normalizedAction = strtoupper(trim($action));
        $resolvedName = $userName
            ?? ($user ? trim($user->full_name) : null)
            ?? $user?->email
            ?? 'System';

        if ($resolvedName === '') {
            $resolvedName = $user?->email ?: 'System';
        }

        return ActivityLog::create([
            'user_id' => $user?->user_id,
            'user_name' => $resolvedName,
            'user_role' => $userRole ?? $user?->role,
            'action' => $normalizedAction,
            'module' => $module,
            'details' => $details,
            'severity' => $this->resolveSeverity($normalizedAction),
        ]);
    }

    public function describeChanges(array $before, array $after, array $labels = []): string
    {
        $keys = array_values(array_unique(array_merge(array_keys($before), array_keys($after))));
        $changes = [];

        foreach ($keys as $key) {
            $beforeValue = $before[$key] ?? null;
            $afterValue = $after[$key] ?? null;

            if ($this->normalizeComparableValue($beforeValue) === $this->normalizeComparableValue($afterValue)) {
                continue;
            }

            $label = $labels[$key] ?? ucfirst(str_replace('_', ' ', (string) $key));
            $changes[] = $label . ' from "' . $this->formatActivityValue($beforeValue) . '" to "' . $this->formatActivityValue($afterValue) . '"';
        }

        return implode('; ', $changes);
    }

    private function resolveSeverity(string $action): string
    {
        return match ($action) {
            'DELETE' => 'critical',
            'UPDATE', 'ARCHIVE', 'RESTORE' => 'warning',
            default => 'info',
        };
    }

    private function normalizeComparableValue(mixed $value): string
    {
        if (is_array($value)) {
            return implode(' | ', array_map(fn ($item) => $this->normalizeComparableValue($item), $value));
        }

        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        return trim((string) $value);
    }

    private function formatActivityValue(mixed $value): string
    {
        if (is_array($value)) {
            $formatted = array_values(array_filter(array_map(
                fn ($item) => $this->formatActivityValue($item),
                $value
            ), fn ($item) => $item !== 'blank'));

            return empty($formatted) ? 'blank' : implode(', ', $formatted);
        }

        if ($value === null) {
            return 'blank';
        }

        $stringValue = trim((string) $value);

        if ($stringValue === '') {
            return 'blank';
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        return $stringValue;
    }
}
