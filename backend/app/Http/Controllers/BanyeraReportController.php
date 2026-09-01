<?php

namespace App\Http\Controllers;

use App\Models\BanyeraTransaction;
use Carbon\Carbon;
use Illuminate\Http\Request;

class BanyeraReportController extends Controller
{
    private function applyUserFilter($query, Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId === null || $userId === '' || $userId === 'all') return $query;
        if (!ctype_digit((string) $userId)) abort(400, 'Invalid user filter.');

        return $query->where('banyera_transactions.created_by', (int) $userId);
    }

    private function buildReportQuery()
    {
        return BanyeraTransaction::query()
            ->select([
                'banyera_transactions.banyera_id',
                'banyera_transactions.boat_id',
                'banyera_transactions.transaction_date',
                'banyera_transactions.created_at',
                'banyera_transactions.voided_at',
                'banyera_transactions.total_fee',
            ])
            // Use constraint loading to reduce N+1 queries
            ->with([
                'boat:boat_id,boat_name,boat_type_id',
                'boat.boatType:boat_type_id,type_name',
                'items:item_id,banyera_id,classification_id,quantity,fee_id,subtotal',
                'items.classification:classification_id,classification_name',
                'items.fee:fee_id,amount',
            ])
            ->whereNull('banyera_transactions.voided_at');
    }

    private function formatBanyeraDateValue($value): ?string
    {
        return $value ? Carbon::parse($value, 'Asia/Manila')->format('Y-m-d H:i:s') : null;
    }

    private function renderReport($query)
    {
        $rows = $query->orderBy('banyera_transactions.transaction_date', 'desc')
            ->orderBy('banyera_transactions.created_at', 'desc')
            ->get()
            ->map(function (BanyeraTransaction $transaction) {
                return [
                    'banyera_id' => $transaction->banyera_id,
                    'transaction_date' => $this->formatBanyeraDateValue($transaction->transaction_date),
                    'created_at' => $this->formatBanyeraDateValue($transaction->created_at),
                    'voided_at' => $transaction->voided_at ? $this->formatBanyeraDateValue($transaction->voided_at) : null,
                    'is_voided' => !is_null($transaction->voided_at),
                    'total_fee' => (float) $transaction->total_fee,
                    'boat' => $transaction->boat ? [
                        'boat_name' => $transaction->boat->boat_name,
                        'boat_type' => $transaction->boat->boatType ? [
                            'type_name' => $transaction->boat->boatType->type_name,
                        ] : null,
                    ] : null,
                    'items' => $transaction->items->map(function ($item) {
                        return [
                            'quantity' => (int) $item->quantity,
                            'subtotal' => (float) $item->subtotal,
                            'classification' => $item->classification ? [
                                'classification_name' => $item->classification->classification_name,
                            ] : null,
                            'classification_name' => $item->classification?->classification_name,
                            'fee' => $item->fee ? [
                                'amount' => (float) $item->fee->amount,
                            ] : null,
                            'fee_amount' => $item->fee ? (float) $item->fee->amount : null,
                        ];
                    })->values()->all(),
                ];
            });

        // Calculate totals from collection to avoid extra DB query
        $totalRevenue = $rows->sum('total_fee');

        return response()->json([
            'rows' => $rows,
            'total_records' => $rows->count(),
            'totalRevenue' => round($totalRevenue, 2),
        ]);
    }

    public function daily(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
        ]);

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();

        $query = $this->buildReportQuery()
            ->whereDate('banyera_transactions.transaction_date', $date);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }

    public function monthly(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'regex:/^(0[1-9]|1[0-2])$/'],
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildReportQuery()
            ->whereYear('banyera_transactions.transaction_date', (int) $validated['year'])
            ->whereMonth('banyera_transactions.transaction_date', (int) $validated['month']);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }

    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildReportQuery()
            ->whereYear('banyera_transactions.transaction_date', (int) $validated['year']);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }
}
