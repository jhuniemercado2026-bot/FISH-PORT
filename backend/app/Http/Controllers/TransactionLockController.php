<?php

namespace App\Http\Controllers;

use App\Services\TransactionLockService;
use Illuminate\Http\Request;

class TransactionLockController extends Controller
{
    public function __construct(private TransactionLockService $transactionLockService)
    {
    }

    public function index(Request $request)
    {
        if (strtolower(trim((string) ($request->user()?->role ?? ''))) === 'head') {
            return response()->json([
                'transaction_lock' => null,
            ]);
        }

        return response()->json([
            'transaction_lock' => $this->transactionLockService->getActiveLock(
                $request->user(),
                $request->query('resource')
            ),
        ]);
    }
}
