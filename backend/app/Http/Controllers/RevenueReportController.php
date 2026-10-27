<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RevenueReportController extends Controller
{
    private function reportUserRoles(Request $request): ?array
    {
        return match ($request->user()?->role) {
            'head' => ['coordinator', 'inspector'],
            'coordinator' => ['inspector'],
            default => null,
        };
    }

    private function requestedUserId(Request $request): array
    {
        $rawUserId = $request->query('user_id');

        if ($rawUserId === null || $rawUserId === '' || $rawUserId === 'all') {
            return ['valid' => true, 'value' => null];
        }

        if (!ctype_digit((string) $rawUserId)) {
            return ['valid' => false, 'value' => null];
        }

        return ['valid' => true, 'value' => (int) $rawUserId];
    }

    private function requestedTransactionType(Request $request): array
    {
        $transactionType = trim((string) $request->query('transaction_type', ''));
        $allowed = ['all', 'docking', 'banyera', 'ticket', 'registered', 'visiting', 'penalty'];

        if ($transactionType === '') {
            return ['valid' => true, 'value' => 'all'];
        }

        if (!in_array($transactionType, $allowed, true)) {
            return ['valid' => false, 'value' => 'all'];
        }

        return ['valid' => true, 'value' => $transactionType];
    }

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

    private function getRevenueRowsAndTotal(?string $date, ?string $month, ?string $year, ?int $userId = null, ?array $reportUserRoles = null, string $transactionType = 'all')
    {
        $penaltyRows = in_array($transactionType, ['all', 'registered', 'penalty'], true)
            ? $this->penaltyRevenueRows($date, $month, $year, $userId, $reportUserRoles) : [];
        if ($transactionType === 'penalty') {
            return ['rows' => $penaltyRows, 'totalRevenue' => round(array_sum(array_column($penaltyRows, 'total')), 2)];
        }
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
            ->selectRaw("GREATEST(0, bills.total_amount - COALESCE(bills.penalty_amount, 0) - COALESCE(SUM(payments.amount_paid), 0)) as receivable")
            ->leftJoin('bills', 'bills.bill_id', '=', 'bill_items.bill_id')
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'docking')
            ->groupBy('bill_items.docking_id', 'bills.total_amount', 'bills.penalty_amount');

        // Subquery to calculate receivable for banyera (bill.total - sum of payments)
        $banyeraReceivableSubquery = DB::table('bill_items')
            ->select('bill_items.banyera_id')
            ->selectRaw("GREATEST(0, bills.total_amount - COALESCE(bills.penalty_amount, 0) - COALESCE(SUM(payments.amount_paid), 0)) as receivable")
            ->leftJoin('bills', 'bills.bill_id', '=', 'bill_items.bill_id')
            ->leftJoin('payments', 'payments.bill_id', '=', 'bill_items.bill_id')
            ->where('bill_items.transaction_type', '=', 'banyera')
            ->groupBy('bill_items.banyera_id', 'bills.total_amount', 'bills.penalty_amount');

        // Use UNION to combine all revenue sources in a single query - FAR MORE EFFICIENT
        // Filter at DB level, not in PHP
        $dockingQuery = DB::table('dockings')
            ->select(
                'dockings.docking_date as date',
                DB::raw("CASE WHEN dockings.boat_category = 'visiting' THEN COALESCE(dockings.visiting_boat_name, visiting_boat_type.type_name, 'Visiting Boat') ELSE COALESCE(boats.boat_name, 'Docking') END as payorName"),
                DB::raw("COALESCE(docking_ors.orNumbers, '') as orNumber"),
                DB::raw("CASE WHEN dockings.boat_category = 'visiting' THEN 'Visiting Boat for Docking' ELSE 'Docking' END as description"),
                'dockings.docking_fee as amount',
                'dockings.docking_fee as total',
                DB::raw("CASE WHEN dockings.boat_category = 'visiting' THEN 0 ELSE COALESCE(docking_receivable.receivable, dockings.docking_fee) END as receivable"),
                DB::raw("1 as quantity"),
                DB::raw("CASE WHEN dockings.boat_category = 'visiting' THEN 'visitor_docking' ELSE 'docking' END as sourceType")
            )
            ->leftJoin('boats', 'boats.boat_id', '=', 'dockings.boat_id')
            ->leftJoin('boat_types as visiting_boat_type', 'visiting_boat_type.boat_type_id', '=', 'dockings.visiting_boat_type_id')
            ->leftJoinSub($dockingOrsSubquery, 'docking_ors', 'docking_ors.docking_id', '=', 'dockings.docking_id')
            ->leftJoinSub($dockingReceivableSubquery, 'docking_receivable', 'docking_receivable.docking_id', '=', 'dockings.docking_id')
            ->where('dockings.docking_fee', '>', 0);

        $banyeraQuery = DB::table('banyera_transactions')
            ->select(
                'banyera_transactions.transaction_date as date',
                DB::raw("CASE WHEN banyera_transactions.boat_category = 'visiting' THEN COALESCE(banyera_transactions.visiting_boat_name, visiting_boat_type.type_name, 'Visiting Boat') ELSE COALESCE(boats.boat_name, 'Banyera') END as payorName"),
                DB::raw("COALESCE(banyera_ors.orNumbers, '') as orNumber"),
                DB::raw("CASE WHEN banyera_transactions.boat_category = 'visiting' THEN 'Visiting Boat for Banyera' ELSE 'Banyera' END as description"),
                'banyera_transactions.total_fee as amount',
                'banyera_transactions.total_fee as total',
                DB::raw("CASE WHEN banyera_transactions.boat_category = 'visiting' THEN 0 ELSE COALESCE(banyera_receivable.receivable, banyera_transactions.total_fee) END as receivable"),
                DB::raw("1 as quantity"),
                DB::raw("CASE WHEN banyera_transactions.boat_category = 'visiting' THEN 'visitor_banyera' ELSE 'banyera' END as sourceType")
            )
            ->leftJoin('boats', 'boats.boat_id', '=', 'banyera_transactions.boat_id')
            ->leftJoin('boat_types as visiting_boat_type', 'visiting_boat_type.boat_type_id', '=', 'banyera_transactions.visiting_boat_type_id')
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

        if ($transactionType === 'docking') {
            $banyeraQuery->whereRaw('0 = 1');
            $ticketQuery->whereRaw('0 = 1');
        } elseif ($transactionType === 'banyera') {
            $dockingQuery->whereRaw('0 = 1');
            $ticketQuery->whereRaw('0 = 1');
        } elseif ($transactionType === 'ticket') {
            $dockingQuery->whereRaw('0 = 1');
            $banyeraQuery->whereRaw('0 = 1');
        } elseif ($transactionType === 'registered') {
            $dockingQuery->where('dockings.boat_category', 'registered');
            $banyeraQuery->where('banyera_transactions.boat_category', 'registered');
            $ticketQuery->whereRaw('0 = 1');
        } elseif ($transactionType === 'visiting') {
            $dockingQuery->where('dockings.boat_category', 'visiting');
            $banyeraQuery->where('banyera_transactions.boat_category', 'visiting');
            $ticketQuery->whereRaw('0 = 1');
        }

        if ($userId) {
            $dockingQuery->where('dockings.created_by', $userId);
            $banyeraQuery->where('banyera_transactions.created_by', $userId);
            $ticketQuery->where('vehicle_tickets.created_by', $userId);
        }

        if (!empty($reportUserRoles)) {
            $reportUserIds = DB::table('users')
                ->select('user_id')
                ->whereIn('role', $reportUserRoles);

            $dockingQuery->whereIn('dockings.created_by', clone $reportUserIds);
            $banyeraQuery->whereIn('banyera_transactions.created_by', clone $reportUserIds);
            $ticketQuery->whereIn('vehicle_tickets.created_by', clone $reportUserIds);
        }

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
            'rows' => collect($rows)->concat($penaltyRows)->sortBy('date')->values()->all(),
            'totalRevenue' => round($totalRevenue + array_sum(array_column($penaltyRows, 'total')), 2),
        ];
    }

    protected function penaltyRevenueRows(?string $date, ?string $month, ?string $year, ?int $userId, ?array $reportUserRoles): array
    {
        // Use saved effective charges, including paid fees retained when a rule
        // is Off. Do not recalculate historical charges using today's rate.
        $effective = 'CASE WHEN p.amount > p.suspended_amount THEN p.amount - p.suspended_amount ELSE 0 END';
        $query = DB::table('bill_penalties as p')
            ->join('bills as b', 'b.bill_id', '=', 'p.bill_id')
            ->leftJoin('boats', 'boats.boat_id', '=', 'b.boat_id')
            ->whereNotNull('b.boat_id')
            ->whereRaw("($effective) > 0")
            ->select('p.id', 'p.bill_id', 'p.period_ended_at', 'boats.boat_name', 'b.total_amount', 'b.penalty_amount', 'b.created_at as fiscal_date')
            ->selectRaw("($effective) as effective_amount")
            ->selectSub(DB::table('payments')->selectRaw('COALESCE(SUM(amount_paid), 0)')->whereColumn('payments.bill_id', 'p.bill_id'), 'paid_total')
            ->selectSub(DB::table('bill_penalties as earlier')
                ->selectRaw('COALESCE(SUM(CASE WHEN earlier.amount > earlier.suspended_amount THEN earlier.amount - earlier.suspended_amount ELSE 0 END), 0)')
                ->whereColumn('earlier.bill_id', 'p.bill_id')->whereColumn('earlier.id', '<', 'p.id'), 'prior_penalties');
        // Fiscal reporting follows the parent bill, while the assessment date
        // remains visible in the description and in the bill's penalty ledger.
        if ($date) $query->whereDate('b.created_at', $date);
        elseif ($month && $year) $query->whereYear('b.created_at', $year)->whereMonth('b.created_at', $month);
        elseif ($year) $query->whereYear('b.created_at', $year);
        if ($userId) $query->where('b.created_by', $userId);
        if ($reportUserRoles) $query->whereIn('b.created_by', DB::table('users')->select('user_id')->whereIn('role', $reportUserRoles));
        $charges = $query->orderBy('p.period_ended_at')->orderBy('p.id')->get();
        $receipts = $charges->isEmpty() ? collect() : DB::table('payments')
            ->whereIn('bill_id', $charges->pluck('bill_id')->unique())->get(['bill_id', 'official_receipt_no'])->groupBy('bill_id');
        return $charges->map(function ($charge) use ($receipts) {
            $principal = (float) $charge->total_amount - (float) $charge->penalty_amount;
            $paidTowardCharge = max(0, (float) $charge->paid_total - $principal - (float) $charge->prior_penalties);
            return $this->normalizeRevenueRow([
                'date' => $charge->fiscal_date, 'payorName' => $charge->boat_name ?? 'Boat',
                'orNumber' => ($receipts->get($charge->bill_id) ?? collect())->pluck('official_receipt_no')->filter()->unique()->implode(', '),
                'description' => 'Late payment penalty (Assessed ' . \Carbon\CarbonImmutable::parse($charge->period_ended_at, config('app.timezone', 'Asia/Manila'))
                    ->setTimezone('Asia/Manila')->format('M. j, Y') . ')', 'sourceType' => 'penalty', 'quantity' => 1,
                'amount' => $charge->effective_amount, 'total' => $charge->effective_amount,
                'receivable' => max(0, (float) $charge->effective_amount - $paidTowardCharge),
            ]);
        })->all();
    }

    public function daily(Request $request)
    {
        try {
            $date = trim((string) $request->query('date', ''));
            if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $requestedUserId = $this->requestedUserId($request);
            if (!$requestedUserId['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $requestedTransactionType = $this->requestedTransactionType($request);
            if (!$requestedTransactionType['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal(
                $date,
                null,
                null,
                $requestedUserId['value'],
                $requestedUserId['value'] ? $this->reportUserRoles($request) : null,
                $requestedTransactionType['value']
            );

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

            $requestedUserId = $this->requestedUserId($request);
            if (!$requestedUserId['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $requestedTransactionType = $this->requestedTransactionType($request);
            if (!$requestedTransactionType['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal(
                null,
                $month,
                $year,
                $requestedUserId['value'],
                $requestedUserId['value'] ? $this->reportUserRoles($request) : null,
                $requestedTransactionType['value']
            );

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

            $requestedUserId = $this->requestedUserId($request);
            if (!$requestedUserId['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $requestedTransactionType = $this->requestedTransactionType($request);
            if (!$requestedTransactionType['valid']) {
                return response()->json(['rows' => [], 'totalRevenue' => 0], 400);
            }

            $result = $this->getRevenueRowsAndTotal(
                null,
                null,
                $year,
                $requestedUserId['value'],
                $requestedUserId['value'] ? $this->reportUserRoles($request) : null,
                $requestedTransactionType['value']
            );

            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['rows' => [], 'totalRevenue' => 0, 'error' => $e->getMessage()], 500);
        }
    }

    public function users(Request $request)
    {
        $roles = $this->reportUserRoles($request);

        if (empty($roles)) {
            return response()->json(['message' => 'You are not allowed to use report user filters.'], 403);
        }

        $users = DB::table('users')
            ->select('user_id', 'first_name', 'last_name', 'email', 'role', 'status')
            ->whereIn('role', $roles)
            ->orderByRaw("CASE role WHEN 'coordinator' THEN 0 WHEN 'inspector' THEN 1 ELSE 2 END")
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->orderBy('email')
            ->get()
            ->map(function ($user) {
                $fullName = trim(implode(' ', array_filter([$user->first_name, $user->last_name])));

                return [
                    'user_id' => $user->user_id,
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'status' => $user->status,
                    'full_name' => $fullName !== '' ? $fullName : null,
                ];
            })
            ->values();

        return response()->json(['data' => $users]);
    }
}
