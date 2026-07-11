<?php

namespace App\Http\Middleware;

use App\Models\BanyeraTransaction;
use App\Models\Docking;
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

        return null;
    }

    public function handle(Request $request, Closure $next): Response
    {
        $activeLock = $this->transactionLockService->getActiveLock();

        if ($activeLock) {
            $targetDate = $this->resolveTargetTransactionDate($request);

            if ($targetDate && $targetDate !== ($activeLock['date'] ?? null)) {
                return $next($request);
            }

            return response()->json([
                'message' => $activeLock['message'],
                'transaction_lock' => $activeLock,
            ], 423);
        }

        return $next($request);
    }
}
