<?php

namespace App\Services;

use App\Models\Remittance;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class TransactionLockService
{
    public function getActiveLock(): ?array
    {
        $cached = Cache::get('transaction_lock');
        if (is_array($cached) && ($cached['is_locked'] ?? false)) {
            try {
                $unlockAt = Carbon::parse($cached['unlock_at'])->setTimezone('Asia/Manila');
                $now = Carbon::now('Asia/Manila');

                if ($now->lessThan($unlockAt)) {
                    $remittanceId = (int) ($cached['remittance_id'] ?? 0);

                    $isValidRemittance = $remittanceId > 0 && Remittance::query()
                        ->where('remittance_id', $remittanceId)
                        ->whereIn('status', ['pending', 'remitted'])
                        ->exists();

                    if ($isValidRemittance) {
                        return $cached;
                    }

                    Cache::forget('transaction_lock');
                } else {
                    Cache::forget('transaction_lock');
                }
            } catch (\Throwable $e) {
                Cache::forget('transaction_lock');
            }
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

        $remittanceDate = Carbon::parse($latestRemittance->date, 'Asia/Manila')->toDateString();
        $remittedAt = Carbon::parse($latestRemittance->updated_at, 'Asia/Manila');
        $unlockAt = Carbon::createFromFormat('Y-m-d', $remittanceDate, 'Asia/Manila')->endOfDay();
        $now = Carbon::now('Asia/Manila');

        if ($now->greaterThanOrEqualTo($unlockAt)) {
            return null;
        }

        $payload = [
            'is_locked' => true,
            'remittance_id' => $latestRemittance->remittance_id,
            'remittance_reference_no' => $latestRemittance->remittance_reference_no,
            'date' => $remittanceDate,
            'remitted_at' => $remittedAt->toIso8601String(),
            'unlock_at' => $unlockAt->toIso8601String(),
            'unlock_date' => $unlockAt->toDateString(),
            'unlock_time' => $unlockAt->format('H:i:s'),
            'message' => 'Transactions are view-only until ' . $unlockAt->format('F j, Y \a\t g:i A') . '.',
        ];

        $ttl = max(0, $unlockAt->diffInSeconds($now));
        if ($ttl > 0) {
            Cache::put('transaction_lock', $payload, $ttl);
        }

        return $payload;
    }

    public function setLockForRemittance(Remittance $remittance): void
    {
        $remittanceDate = Carbon::parse($remittance->date, 'Asia/Manila')->toDateString();
        $remittedAt = Carbon::now('Asia/Manila');
        $unlockAt = Carbon::createFromFormat('Y-m-d', $remittanceDate, 'Asia/Manila')->endOfDay();

        if ($unlockAt->lessThanOrEqualTo($remittedAt)) {
            return;
        }

        $payload = [
            'is_locked' => true,
            'remittance_id' => $remittance->remittance_id,
            'remittance_reference_no' => $remittance->remittance_reference_no,
            'date' => $remittanceDate,
            'remitted_at' => $remittedAt->toIso8601String(),
            'unlock_at' => $unlockAt->toIso8601String(),
            'unlock_date' => $unlockAt->toDateString(),
            'unlock_time' => $unlockAt->format('H:i:s'),
            'message' => 'Transactions are view-only until ' . $unlockAt->format('F j, Y \a\t g:i A') . '.',
        ];

        $ttl = max(0, $unlockAt->diffInSeconds($remittedAt));
        if ($ttl > 0) {
            Cache::put('transaction_lock', $payload, $ttl);
        }
    }
}
