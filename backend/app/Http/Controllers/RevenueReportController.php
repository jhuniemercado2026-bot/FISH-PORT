<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RevenueReportController extends Controller
{
    protected function normalizeRevenueRow(object|array $row): array
    {
        $payload = is_array($row) ? $row : (array) $row;
        $amount = (float) ($payload['amount'] ?? $payload['fee'] ?? $payload['receivable'] ?? 0);
        $receivable = (float) ($payload['receivable'] ?? $amount);
        $fee = (float) ($payload['fee'] ?? $amount);
        $total = (float) ($payload['total'] ?? $amount);

        return [
            'date' => (string) ($payload['date'] ?? ''),
            'payorName' => (string) ($payload['payorName'] ?? ''),
            'orNumber' => (string) ($payload['orNumber'] ?? ''),
            'description' => (string) ($payload['description'] ?? ''),
            'amount' => round($amount, 2),
            'fee' => round($fee, 2),
            'receivable' => round($receivable, 2),
            'total' => round($total, 2),
            'quantity' => (int) ($payload['quantity'] ?? 0),
            'sourceType' => (string) ($payload['sourceType'] ?? ''),
        ];
    }

    private function getRevenueRowsAndTotal(?string $date, ?string $month, ?string $year)
    {
        // Build subqueries for OR numbers and receivable amounts
        $dockingOrsSubquery = DB::table('bill_items')
            ->select('bill_items.docking_id')
            ->selectRaw("GROUP_CONCAT(DISTINCT payments.official_receipt_no SEPARATOR ', ') as orNumbers")
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'docking')
            ->groupBy('bill_items.docking_id');

        $banyeraOrsSubquery = DB::table('bill_items')
            ->select('bill_items.banyera_id')
            ->selectRaw("GROUP_CONCAT(DISTINCT payments.official_receipt_no SEPARATOR ', ') as orNumbers")
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'banyera')
            ->groupBy('bill_items.banyera_id');

        // Subquery to calculate receivable for dockings (bill.total - sum of payments)
        $dockingReceivableSubquery = DB::table('bill_items')
            ->select('bill_items.docking_id')
            ->selectRaw("GREATEST(0, bills.total_amount - COALESCE(SUM(payments.amount_paid), 0)) as receivable")
            ->leftJoin('bills', 'bills.bill_id', '=', 'bill_items.bill_id')
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'docking')
            ->groupBy('bill_items.docking_id', 'bills.total_amount');

        // Subquery to calculate receivable for banyera (bill.total - sum of payments)
        $banyeraReceivableSubquery = DB::table('bill_items')
            ->select('bill_items.banyera_id')
            ->selectRaw("GREATEST(0, bills.total_amount - COALESCE(SUM(payments.amount_paid), 0)) as receivable")
            ->leftJoin('bills', 'bills.bill_id', '=', 'bill_items.bill_id')
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'banyera')
            ->groupBy('bill_items.banyera_id', 'bills.total_amount');

        // Use UNION to combine all revenue sources in a single query - FAR MORE EFFICIENT
        // Filter at DB level, not in PHP
        $dockingQuery = DB::table('dockings')
            ->select(
                'dockings.docking_date as date',
                DB::raw("COALESCE(boats.boat_name, 'Docking') as payorName"),
                DB::raw("COALESCE(docking_ors.orNumbers, '') as orNumber"),
                DB::raw("'Docking' as description"),
                'dockings.docking_fee as amount',
                'dockings.docking_fee as total',
                DB::raw("COALESCE(docking_receivable.receivable, dockings.docking_fee) as receivable"),
                DB::raw("1 as quantity"),
                DB::raw("'docking' as sourceType")
            )
            ->leftJoin('boats', 'boats.boat_id', '=', 'dockings.boat_id')
            ->leftJoinSub($dockingOrsSubquery, 'docking_ors', 'docking_ors.docking_id', '=', 'dockings.docking_id')
            ->leftJoinSub($dockingReceivableSubquery, 'docking_receivable', 'docking_receivable.docking_id', '=', 'dockings.docking_id')
            ->where('dockings.docking_fee', '>', 0);

        $banyeraQuery = DB::table('banyera_transactions')
            ->select(
                'banyera_transactions.transaction_date as date',
                DB::raw("COALESCE(boats.boat_name, 'Banyera') as payorName"),
                DB::raw("COALESCE(banyera_ors.orNumbers, '') as orNumber"),
                DB::raw("'Banyera' as description"),
                'banyera_transactions.total_fee as amount',
                'banyera_transactions.total_fee as total',
                DB::raw("COALESCE(banyera_receivable.receivable, banyera_transactions.total_fee) as receivable"),
                DB::raw("1 as quantity"),
                DB::raw("'banyera' as sourceType")
            )
            ->leftJoin('boats', 'boats.boat_id', '=', 'banyera_transactions.boat_id')
            ->leftJoinSub($banyeraOrsSubquery, 'banyera_ors', 'banyera_ors.banyera_id', '=', 'banyera_transactions.banyera_id')
            ->leftJoinSub($banyeraReceivableSubquery, 'banyera_receivable', 'banyera_receivable.banyera_id', '=', 'banyera_transactions.banyera_id')
            ->where('banyera_transactions.total_fee', '>', 0);

        $ticketQuery = DB::table('vehicle_tickets')
            ->select(
                'vehicle_tickets.ticket_date as date',
                DB::raw("COALESCE(vehicle_tickets.plate_number, vehicle_types.type_name, 'Vehicle Ticket') as payorName"),
                DB::raw("GROUP_CONCAT(DISTINCT vehicle_tickets.official_receipt_no SEPARATOR ', ') as orNumber"),
                DB::raw("CASE WHEN vehicle_tickets.ticket_type = 'annual' THEN 'Annual Ticket' ELSE 'Daily Ticket' END as description"),
                DB::raw("ROUND(SUM(vehicle_tickets.ticket_fee) / COUNT(*), 2) as amount"),
                DB::raw("SUM(vehicle_tickets.ticket_fee) as total"),
                DB::raw("0 as receivable"),
                DB::raw("COUNT(*) as quantity"),
                DB::raw("'ticket' as sourceType")
            )
            ->leftJoin('vehicle_types', 'vehicle_types.vehicle_type_id', '=', 'vehicle_tickets.vehicle_type_id')
            ->where('vehicle_tickets.ticket_fee', '>', 0)
            ->whereNull('vehicle_tickets.voided_at')
            ->groupBy('vehicle_tickets.ticket_date', 'vehicle_tickets.plate_number', 'vehicle_types.type_name', 'vehicle_tickets.ticket_type');

        // Apply date filters
        if ($date) {
            $dockingQuery->whereDate('dockings.docking_date', $date);
            $banyeraQuery->whereDate('banyera_transactions.transaction_date', $date);
            $ticketQuery->whereDate('vehicle_tickets.ticket_date', $date);
        } elseif ($month && $year) {
            $dockingQuery->whereYear('dockings.docking_date', $year)->whereMonth('dockings.docking_date', $month);
            $banyeraQuery->whereYear('banyera_transactions.transaction_date', $year)->whereMonth('banyera_transactions.transaction_date', $month);
            $ticketQuery->whereYear('vehicle_tickets.ticket_date', $year)->whereMonth('vehicle_tickets.ticket_date', $month);
        } elseif ($year) {
            $dockingQuery->whereYear('dockings.docking_date', $year);
            $banyeraQuery->whereYear('banyera_transactions.transaction_date', $year);
            $ticketQuery->whereYear('vehicle_tickets.ticket_date', $year);
        }

        // Combine with UNION and sort at database level
        $query = $dockingQuery
            ->unionAll($banyeraQuery)
            ->unionAll($ticketQuery)
            ->orderBy('date')
            ->get();

        // Calculate total in a single pass
        $totalRevenue = 0;
        $rows = [];
        
        foreach ($query as $row) {
            $normalizedRow = $this->normalizeRevenueRow([
                'date' => $row->date,
                'payorName' => $row->payorName,
                'orNumber' => $row->orNumber,
                'description' => $row->description,
                'amount' => $row->amount,
                'fee' => $row->amount,
                'receivable' => $row->receivable,
                'total' => $row->total,
                'quantity' => $row->quantity,
                'sourceType' => $row->sourceType,
            ]);

            $totalRevenue += (float) $normalizedRow['total'];
            $rows[] = $normalizedRow;
        }

        return [
            'rows' => $rows,
            'totalRevenue' => round($totalRevenue, 2),
        ];
    }

    public function daily(Request $request)
    {
        try {
            $date = trim((string) $request->query('date', ''));
            if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal($date, null, null);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['rows' => [], 'totalRevenue' => 0, 'error' => $e->getMessage()], 500);
        }
    }

    public function monthly(Request $request)
    {
        try {
            $month = trim((string) $request->query('month', ''));
            $year = trim((string) $request->query('year', ''));

            if (!preg_match('/^\d{1,2}$/', $month) || !preg_match('/^\d{4}$/', $year)) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal(null, $month, $year);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['rows' => [], 'totalRevenue' => 0, 'error' => $e->getMessage()], 500);
        }
    }

    public function yearly(Request $request)
    {
        try {
            $year = trim((string) $request->query('year', ''));

            if (!preg_match('/^\d{4}$/', $year)) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal(null, null, $year);

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['rows' => [], 'totalRevenue' => 0, 'error' => $e->getMessage()], 500);
        }
    }
}
