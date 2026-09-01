<?php

namespace App\Services;

use App\Events\TransactionLockUpdated;
use App\Models\Remittance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

class TransactionLockService
{
    public function getActiveLock(?User $user = null, ?string $resource = null): ?array
    {
        if ($this->isHead($user)) {
            return null;
        }

        if ($this->canReceiveGlobalLock($user)) {
            $globalLock = $this->resolveCachedLock($this->globalCacheKey(), $user);
            if ($globalLock !== null) {
                return $globalLock;
            }

            $today = Carbon::now('Asia/Manila')->toDateString();
            $latestCoordinatorRemittance = Remittance::query()
                ->whereDate('date', $today)
                ->whereIn('status', [Remittance::STATUS_UNCHECKED, Remittance::STATUS_CHECKED])
                ->whereHas('submittedBy', fn ($query) => $query->where('role', 'coordinator'))
                ->latest('updated_at')
                ->latest('remittance_id')
                ->first();

            if ($latestCoordinatorRemittance) {
                $payload = $this->buildLockPayload($latestCoordinatorRemittance);

                if ($payload !== null) {
                    $this->cacheLockPayload($payload);
                    return $payload;
                }
            }
        }

        if ($resource !== 'vehicle-tickets') {
            return null;
        }

        $cacheKey = $this->cacheKey($user);
        $cached = $this->resolveCachedLock($cacheKey, $user);
        if ($cached !== null) {
            return $cached;
        }

        $today = Carbon::now('Asia/Manila')->toDateString();
        $latestRemittance = Remittance::query()
            ->whereDate('date', $today)
            ->when($user, fn ($query) => $query->where('submitted_by', $user->user_id))
            ->whereIn('status', [Remittance::STATUS_UNCHECKED, Remittance::STATUS_CHECKED])
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
            Cache::put($this->cacheKeyFromPayload($payload), $payload, $ttl);
        }
    }

    private function buildLockPayload(Remittance $remittance): ?array
    {
        $remittance->loadMissing('submittedBy');
        $remittanceDate = Carbon::parse($remittance->date, 'Asia/Manila')->toDateString();
        $lockedAt = Carbon::now('Asia/Manila');
        $unlockAt = Carbon::createFromFormat('Y-m-d', $remittanceDate, 'Asia/Manila')->endOfDay();
        $isCoordinatorRemittance = $this->isCoordinator($remittance->submittedBy);

        if ($unlockAt->lessThanOrEqualTo($lockedAt)) {
            return null;
        }

        return [
            'is_locked' => true,
            'lock_type' => 'remittance',
            'lock_scope' => $isCoordinatorRemittance ? 'global' : 'user',
            'applies_to' => $isCoordinatorRemittance ? 'transactions' : 'vehicle-tickets',
            'remittance_id' => $remittance->remittance_id,
            'remittance_reference_no' => $remittance->remittance_reference_no,
            'submitted_by' => $remittance->submitted_by,
            'submitted_by_role' => $remittance->submittedBy?->role,
            'date' => $remittanceDate,
            'locked_at' => $lockedAt->toIso8601String(),
            'remitted_at' => $lockedAt->toIso8601String(),
            'unlock_at' => $unlockAt->toIso8601String(),
            'unlock_date' => $unlockAt->toDateString(),
            'unlock_time' => $unlockAt->format('H:i:s'),
            'message' => $isCoordinatorRemittance
                ? 'Transactions are view-only until ' . $unlockAt->format('F j, Y \a\t g:i A') . '.'
                : 'Daily vehicle tickets are view-only until ' . $unlockAt->format('F j, Y \a\t g:i A') . '.',
        ];
    }

    private function resolveCachedLock(string $cacheKey, ?User $user): ?array
    {
        $cached = Cache::get($cacheKey);
        if (!is_array($cached) || !($cached['is_locked'] ?? false)) {
            return null;
        }

        if (($cached['lock_type'] ?? 'remittance') !== 'remittance') {
            Cache::forget($cacheKey);
            return null;
        }

        try {
            $unlockAt = Carbon::parse($cached['unlock_at'])->setTimezone('Asia/Manila');
            if (Carbon::now('Asia/Manila')->greaterThanOrEqualTo($unlockAt)) {
                Cache::forget($cacheKey);
                return null;
            }

            $remittanceId = (int) ($cached['remittance_id'] ?? 0);
            $remittanceQuery = Remittance::query()
                ->where('remittance_id', $remittanceId)
                ->whereIn('status', [Remittance::STATUS_UNCHECKED, Remittance::STATUS_CHECKED]);

            if (($cached['lock_scope'] ?? 'user') === 'global') {
                $remittanceQuery->whereHas('submittedBy', fn ($query) => $query->where('role', 'coordinator'));
            } else {
                $remittanceQuery->when($user, fn ($query) => $query->where('submitted_by', $user->user_id));
            }

            $remittance = $remittanceId > 0 ? $remittanceQuery->first() : null;

            if ($remittance) {
                $freshPayload = $this->buildLockPayload($remittance);

                if ($freshPayload !== null) {
                    $this->cacheLockPayload($freshPayload);
                    return $freshPayload;
                }
            }
        } catch (\Throwable $exception) {
            // fall through and clear invalid lock
        }

        Cache::forget($cacheKey);
        return null;
    }

    private function cacheKey(?User $user): string
    {
        return $user?->user_id ? 'transaction_lock:user:' . $user->user_id : 'transaction_lock';
    }

    private function cacheKeyFromPayload(array $payload): string
    {
        if (($payload['lock_scope'] ?? null) === 'global') {
            return $this->globalCacheKey();
        }

        $submittedBy = (int) ($payload['submitted_by'] ?? 0);

        return $submittedBy > 0 ? 'transaction_lock:user:' . $submittedBy : 'transaction_lock';
    }

    private function globalCacheKey(): string
    {
        return 'transaction_lock:global:coordinator';
    }

    private function canReceiveGlobalLock(?User $user): bool
    {
        $role = strtolower(trim((string) ($user?->role ?? '')));

        return in_array($role, ['coordinator', 'inspector'], true);
    }

    private function isHead(?User $user): bool
    {
        return strtolower(trim((string) ($user?->role ?? ''))) === 'head';
    }

    private function isCoordinator(?User $user): bool
    {
        return strtolower(trim((string) ($user?->role ?? ''))) === 'coordinator';
    }
}
