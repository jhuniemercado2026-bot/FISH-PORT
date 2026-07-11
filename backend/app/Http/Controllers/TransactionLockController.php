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
        return response()->json([
            'transaction_lock' => $this->transactionLockService->getActiveLock(),
        ]);
    }
}
