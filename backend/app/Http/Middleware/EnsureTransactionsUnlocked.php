<?php

namespace App\Http\Middleware;

use App\Models\BanyeraTransaction;
use App\Models\Bill;
use App\Models\Docking;
use App\Models\Payment;
use App\Services\TransactionLockService;
use App\Models\VehicleTicket;
use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTransactionsUnlocked
{
    public function __construct(private TransactionLockService $transactionLockService)
    {
    }

    private function normalizeDateValue($value): ?string
    {
        if (!$value) {
            return null;
        }

        try {
            return Carbon::parse($value, 'Asia/Manila')->toDateString();
        } catch (\Throwable $exception) {
            return null;
        }
    }

    private function resolveTargetTransactionDate(Request $request): ?string
    {
        $route = $request->route();
        $uri = $route?->uri() ?? '';
        $id = $route?->parameter('id');

        if (str_contains($uri, 'banyera-transactions')) {
            return $this->normalizeDateValue(
                $request->input('transaction_date')
                ?: BanyeraTransaction::query()->find($id)?->transaction_date
            );
        }

        if (str_contains($uri, 'dockings')) {
            return $this->normalizeDateValue(
                $request->input('docking_date')
                ?: Docking::query()->find($id)?->docking_date
            );
        }

        if (str_contains($uri, 'vehicle-tickets')) {
            return $this->normalizeDateValue(
                $request->input('ticket_date')
                ?: VehicleTicket::query()->find($id)?->ticket_date
            );
        }

        if (str_contains($uri, 'payments')) {
            return $this->normalizeDateValue(
                $request->input('payment_date')
                ?: Payment::query()->find($id)?->payment_date
            );
        }

        if (str_contains($uri, 'bills')) {
            return $this->normalizeDateValue(
                Bill::query()->find($id)?->created_at
            );
        }

        return null;
    }

    private function isVehicleTicketRoute(Request $request): bool
    {
        return str_contains($request->route()?->uri() ?? '', 'vehicle-tickets');
    }

    private function resolveTargetVehicleTicket(Request $request): ?VehicleTicket
    {
        $id = $request->route()?->parameter('id');

        return $id ? VehicleTicket::query()->find($id) : null;
    }

    private function targetsLockedVehicleTicketScope(Request $request, array $activeLock): bool
    {
        if (($activeLock['applies_to'] ?? null) === 'transactions') {
            $targetDate = $this->resolveTargetTransactionDate($request);

            return !$targetDate || $targetDate === ($activeLock['date'] ?? null);
        }

        if (($activeLock['applies_to'] ?? null) !== 'vehicle-tickets' || !$this->isVehicleTicketRoute($request)) {
            return false;
        }

        $userId = (int) ($request->user()?->user_id ?? 0);
        $lockedUserId = (int) ($activeLock['submitted_by'] ?? 0);

        if ($userId <= 0 || $lockedUserId <= 0 || $userId !== $lockedUserId) {
            return false;
        }

        $targetDate = $this->resolveTargetTransactionDate($request);

        if ($targetDate && $targetDate !== ($activeLock['date'] ?? null)) {
            return false;
        }

        $targetTicket = $this->resolveTargetVehicleTicket($request);
        $ticketType = strtolower(trim((string) ($request->input('ticket_type') ?: $targetTicket?->ticket_type ?: 'daily')));

        if ($ticketType !== 'daily') {
            return false;
        }

        $ticketOwnerId = (int) ($targetTicket?->created_by ?? $userId);

        return $ticketOwnerId === $lockedUserId;
    }

    private function shouldBypassTransactionLock(Request $request): bool
    {
        return strtolower(trim((string) ($request->user()?->role ?? ''))) === 'head';
    }

    public function handle(Request $request, Closure $next): Response
    {
        if ($this->shouldBypassTransactionLock($request)) {
            return $next($request);
        }

        $activeLock = $this->transactionLockService->getActiveLock($request->user(), 'vehicle-tickets');

        if ($activeLock && $this->targetsLockedVehicleTicketScope($request, $activeLock)) {
            return response()->json([
                'message' => $activeLock['message'],
                'transaction_lock' => $activeLock,
            ], 423);
        }

        return $next($request);
    }
}
