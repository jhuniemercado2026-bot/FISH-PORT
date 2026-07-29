<?php

namespace App\Services;

use App\Events\TransactionLockUpdated;
use App\Models\Remittance;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class TransactionLockService
{
    public function getActiveLock(): ?array
    {
        $cached = Cache::get('transaction_lock');
        if (is_array($cached) && ($cached['is_locked'] ?? false)) {
            if (($cached['lock_type'] ?? 'remittance') === 'remittance') {
                try {
                    $unlockAt = Carbon::parse($cached['unlock_at'])->setTimezone('Asia/Manila');
                    if (Carbon::now('Asia/Manila')->lessThan($unlockAt)) {
                        $remittanceId = (int) ($cached['remittance_id'] ?? 0);
                        $isValidRemittance = $remittanceId > 0 && Remittance::query()
                            ->where('remittance_id', $remittanceId)
                            ->whereIn('status', ['pending', 'remitted'])
                            ->exists();

                        if ($isValidRemittance) {
                            return $cached;
                        }
                    }
                } catch (\Throwable $exception) {
                    // fall through and clear invalid lock
                }

                Cache::forget('transaction_lock');
            }

            Cache::forget('transaction_lock');
        }

        $today = Carbon::now('Asia/Manila')->toDateString();
        $latestRemittance = Remittance::query()
            ->whereDate('date', $today)
            ->whereIn('status', ['pending', 'remitted'])
            ->latest('updated_at')
            ->latest('remittance_id')
            ->first();

        if (!$latestRemittance) {
            return null;
        }

        $payload = $this->buildLockPayload($latestRemittance);

        if ($payload !== null) {
            $this->cacheLockPayload($payload);
        }

        return $payload;
    }

    public function setLockForRemittance(Remittance $remittance): void
    {
        $payload = $this->buildLockPayload($remittance);

        if ($payload === null) {
            return;
        }

        $this->cacheLockPayload($payload);

        try {
            broadcast(new TransactionLockUpdated($payload));
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function cacheLockPayload(array $payload): void
    {
        $ttl = max(
            0,
            Carbon::parse($payload['unlock_at'])->getTimestamp() - Carbon::parse($payload['locked_at'])->getTimestamp()
        );
        if ($ttl > 0) {
            Cache::put('transaction_lock', $payload, $ttl);
        }
    }

    private function buildLockPayload(Remittance $remittance): ?array
    {
        $remittanceDate = Carbon::parse($remittance->date, 'Asia/Manila')->toDateString();
        $lockedAt = Carbon::now('Asia/Manila');
        $unlockAt = Carbon::createFromFormat('Y-m-d', $remittanceDate, 'Asia/Manila')->endOfDay();

        if ($unlockAt->lessThanOrEqualTo($lockedAt)) {
            return null;
        }

        return [
            'is_locked' => true,
            'lock_type' => 'remittance',
            'remittance_id' => $remittance->remittance_id,
            'remittance_reference_no' => $remittance->remittance_reference_no,
            'date' => $remittanceDate,
            'locked_at' => $lockedAt->toIso8601String(),
            'remitted_at' => $lockedAt->toIso8601String(),
            'unlock_at' => $unlockAt->toIso8601String(),
            'unlock_date' => $unlockAt->toDateString(),
            'unlock_time' => $unlockAt->format('H:i:s'),
            'message' => 'Transactions are view-only until ' . $unlockAt->format('F j, Y \a\t g:i A') . '.',
        ];
    }
}
