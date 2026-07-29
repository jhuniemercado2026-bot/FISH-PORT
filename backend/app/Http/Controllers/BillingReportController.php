<?php

namespace App\Http\Controllers;

use App\Models\Bill;
use Illuminate\Http\Request;

class BillingReportController extends Controller
{
    private function emptyReportPayload(): array
    {
        return [
            'rows' => [],
            'bills' => [],
            'totalBillings' => 0,
            'totalPaid' => 0,
            'totalBalance' => 0,
        ];
    }

    private function getBillingRowsAndTotals(?string $date, ?string $month, ?string $year): array
    {
        $query = Bill::query()
            ->with([
                'boat:boat_id,boat_name,owner_id',
                'boat.owner:owner_id,owner_firstname,owner_lastname',
                'payments:payment_id,bill_id,amount_paid',
            ]);

        if ($date) {
            $query->whereDate('created_at', $date);
        } elseif ($month && $year) {
            $query->whereYear('created_at', $year)
                ->whereMonth('created_at', $month);
        } elseif ($year) {
            $query->whereYear('created_at', $year);
        }

        $bills = $query
            ->orderBy('created_at')
            ->orderBy('bill_id')
            ->get();

        $rows = $bills->map(function (Bill $bill) {
            $paidAmount = (float) $bill->payments->sum('amount_paid');
            $totalAmount = (float) ($bill->total_amount ?? $bill->amount ?? $bill->grand_total ?? $bill->balance_due ?? 0);
            $balanceDue = (float) ($bill->balance_due ?? max($totalAmount - $paidAmount, 0));
            $owner = $bill->boat?->owner;
            $ownerName = trim(implode(' ', array_filter([$owner?->owner_firstname, $owner?->owner_lastname])));

            return [
                'rowKey' => 'bill-' . $bill->bill_id,
                'date' => optional($bill->created_at)->toDateString(),
                'billReferenceNo' => $bill->bill_reference_no ?? '-',
                'boatName' => $bill->boat?->boat_name ?? '-',
                'ownerName' => $ownerName ?: '-',
                'totalAmount' => round($totalAmount, 2),
                'paidAmount' => round($paidAmount, 2),
                'balanceDue' => round($balanceDue, 2),
                'status' => strtoupper((string) ($balanceDue <= 0 ? 'paid' : ($paidAmount > 0 ? 'partial' : 'unpaid'))),
            ];
        })->values()->all();

        return [
            'rows' => $rows,
            'bills' => $rows,
            'totalBillings' => round((float) collect($rows)->sum('totalAmount'), 2),
            'totalPaid' => round((float) collect($rows)->sum('paidAmount'), 2),
            'totalBalance' => round((float) collect($rows)->sum('balanceDue'), 2),
        ];
    }

    public function daily(Request $request)
    {
        $date = trim((string) $request->query('date', ''));
        if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getBillingRowsAndTotals($date, null, null));
    }

    public function monthly(Request $request)
    {
        $month = trim((string) $request->query('month', ''));
        $year = trim((string) $request->query('year', ''));

        if (!preg_match('/^\d{1,2}$/', $month) || !preg_match('/^\d{4}$/', $year)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getBillingRowsAndTotals(null, $month, $year));
    }

    public function yearly(Request $request)
    {
        $year = trim((string) $request->query('year', ''));
        if (!preg_match('/^\d{4}$/', $year)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getBillingRowsAndTotals(null, null, $year));
    }
}
