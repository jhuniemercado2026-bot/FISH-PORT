<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class PenaltyToggleProgress
{
    private function key(string $token): string
    {
        return 'penalty-toggle-progress:' . $token;
    }

    public function start(string $token, int $userId, int $ruleId): void
    {
        // File storage exposes progress while the financial DB transaction is
        // still open, and works on shared hosting without a queue worker.
        abort_unless(Cache::store('file')->add($this->key($token), [
            'user_id' => $userId, 'rule_id' => $ruleId, 'status' => 'running',
            'progress' => 0, 'processed' => 0, 'total' => null,
        ], now()->addHour()), 409, 'This penalty update has already been started.');
    }

    public function read(string $token, int $userId): array
    {
        $state = Cache::store('file')->get($this->key($token));
        abort_unless($state, 404);
        abort_unless($state['user_id'] === $userId, 403);
        unset($state['user_id']);
        return $state;
    }

    public function update(string $token, array $values): void
    {
        try {
            $state = Cache::store('file')->get($this->key($token));
            if (!$state) return;
            Cache::store('file')->put($this->key($token), array_merge($state, $values), now()->addHour());
        } catch (\Throwable $error) {
            // Losing progress updates must never turn a committed save into an error.
            report($error);
        }
    }
}
