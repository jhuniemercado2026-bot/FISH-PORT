<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\Payment;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PaymentController extends Controller
{
    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('p.payment_id', (int) $highlightId)
            ->first(['p.payment_id', 'p.payment_date']);

        if (!$target?->payment_date) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('p.payment_date', '>', $target->payment_date)
                    ->orWhere(function ($tieQuery) use ($target) {
                        $tieQuery
                            ->where('p.payment_date', $target->payment_date)
                            ->where('p.payment_id', '>', $target->payment_id);
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        if (!$request->boolean('all')) {
            $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
            $page = max((int) $request->query('page', 1), 1);
            $includePayments = $request->boolean('include_payments', true);
            $records = collect();
            $meta = [
                'current_page' => $page,
                'last_page' => 1,
                'per_page' => $perPage,
                'total' => 0,
                'from' => null,
                'to' => null,
            ];

            if ($includePayments) {
                $query = $this->paymentRecordQuery()
                    ->when(trim((string) $request->query('bill_id', '')) !== '', fn ($query) => $query->where('b.bill_id', (int) $request->query('bill_id')))
                    ->searchTable($request->query('search', ''))
                    ->tableFilters([
                        'status' => $request->query('status', 'all'),
                        'period' => $request->query('period', 'all'),
                    ])
                    ->tableSort($request->query('sort'));
                $this->applyFiscalYear($query, $request, 'p.payment_date');

                $page = $this->highlightedPage($query, $request->query('highlight_payment_id'), $page, $perPage);
                $allPayments = $query->get();
                $hydratedPayments = Payment::hydrateRunningTotals(collect($allPayments));
                $total = $hydratedPayments->count();
                $offset = ($page - 1) * $perPage;
                $items = $hydratedPayments->slice($offset, $perPage)->values();
                $paymentHistoryByBillId = $this->paymentHistoriesForBills($items->pluck('bill_id'));
                $records = collect($items->map(fn ($payment) => $this->transformPaymentRecord(
                    $payment,
                    $paymentHistoryByBillId[(string) $payment->bill_id] ?? []
                )));
                $meta = [
                    'current_page' => $page,
                    'last_page' => max(1, (int) ceil($total / $perPage)),
                    'per_page' => $perPage,
                    'total' => $total,
                    'from' => $total === 0 ? null : $offset + 1,
                    'to' => $total === 0 ? null : min($offset + $perPage, $total),
                ];
            }

            $response = [
                'data' => $records->values(),
                'meta' => $meta,
                'payments' => $records->values(),
                'payments_meta' => $meta,
                'paymentable_bills' => $request->boolean('include_paymentable') ? $this->paymentableBills($request) : [],
            ];

            if ($includePayments) {
                $response['stats'] = $this->paymentStats($request);
            } else {
                $response['stats'] = [
                    'total_records' => 0,
                    'total_payment_records' => 0,
                    'today_records' => 0,
                    'today_payments' => 0,
                ];
            }

            return response()->json($response);
        }

        $records = $this->paymentRecords($request);

        return response()->json([
            'data' => $records,
            'meta' => [
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => $records->count(),
                'total' => $records->count(),
                'from' => $records->isEmpty() ? null : 1,
                'to' => $records->count(),
            ],
            'payments' => $records,
                'paymentable_bills' => $request->boolean('include_paymentable') ? $this->paymentableBills($request) : [],
            'stats' => $this->paymentStats($request),
        ]);
    }

    public function show($id)
    {
        $payment = $this->paymentRecordQuery()
            ->where('p.payment_id', $id)
            ->first();

        abort_unless($payment !== null, 404);

        $paymentHistoryByBillId = $this->paymentHistoriesForBills(collect([$payment->bill_id]));

        return response()->json($this->transformPaymentRecord(
            $payment,
            $paymentHistoryByBillId[(string) $payment->bill_id] ?? []
        ));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'payment_scope' => ['nullable', Rule::in(['single_bill', 'selected_bills', 'all_bills_per_boat'])],
            'bill_id' => 'nullable|integer|exists:bills,bill_id',
            'bill_ids' => 'nullable|array|min:1',
            'bill_ids.*' => 'integer|exists:bills,bill_id',
            'boat_id' => 'nullable|integer|exists:boats,boat_id',
            'amount_paid' => 'required|numeric|min:0.01',
            'payment_method' => ['nullable', Rule::in(['cash'])],
            'payment_date' => 'required|date',
            'remarks' => 'nullable|string',
            'official_receipt_no' => 'required|digits:7',
        ]);

        $validated['official_receipt_no'] = trim($validated['official_receipt_no']);
        $this->ensureOfficialReceiptNoAvailable($validated['official_receipt_no']);

        $scope = $validated['payment_scope'] ?? 'single_bill';
        $minimal = $request->boolean('minimal');

        if ($scope === 'selected_bills') {
            return $this->storeSelectedBillsPayment($validated, $minimal);
        }

        if ($scope === 'all_bills_per_boat') {
            return $this->storeBoatPayments($validated, $minimal);
        }

        return $this->storeSingleBillPayment($validated, $minimal);
    }

    private function storeSingleBillPayment(array $validated, bool $minimal = false)
    {
        if (empty($validated['bill_id'])) {
            throw ValidationException::withMessages([
                'bill_id' => 'Bill reference is required.',
            ]);
        }

        $bill = $this->paymentableBillQuery()
            ->where('b.bill_id', $validated['bill_id'])
            ->first();

        if (!$bill) {
            throw ValidationException::withMessages([
                'bill_id' => 'The selected bill is already fully paid or unavailable.',
            ]);
        }

        $remainingBalance = (float) $bill->balance;
        $amountPaid = (float) $validated['amount_paid'];

        if ($amountPaid > $remainingBalance) {
            throw ValidationException::withMessages([
                'amount_paid' => 'Amount paid cannot exceed the remaining balance of ' . number_format($remainingBalance, 2) . '.',
            ]);
        }

        $payment = DB::transaction(function () use ($validated) {
            $payment = Payment::create([
                'bill_id' => $validated['bill_id'],
                'amount_paid' => $validated['amount_paid'],
                'status' => 'partial',
                'official_receipt_no' => trim($validated['official_receipt_no']),
                'payment_method' => $validated['payment_method'] ?? 'cash',
                'payment_date' => $validated['payment_date'],
                'remarks' => $validated['remarks'] ?? null,
                'received_by' => Auth::id(),
            ]);

            $record = $this->paymentRecordQuery()
                ->where('p.payment_id', $payment->payment_id)
                ->first();

            abort_unless($record !== null, 404);

            return $record;
        });

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Payments',
            details: $this->paymentRecordedActivityDetails($payment),
            user: Auth::user()
        );

        broadcast(new TransactionUpdated('payment', 'created', $this->transformPaymentRecord($payment)));

        if ($minimal) {
            return response()->json([
                'payment_id' => $payment->payment_id,
                'payment_reference' => $payment->payment_reference_no,
                'bill_id' => $payment->bill_id,
                'amount_paid' => (float) $payment->amount_paid,
                'official_receipt_no' => $payment->official_receipt_no,
                'payment_date' => $payment->payment_date,
                'payment_method' => $payment->payment_method,
                'remarks' => $payment->remarks,
            ], 201);
        }

        return response()->json($this->transformPaymentRecord($payment), 201);
    }

    private function storeBoatPayments(array $validated, bool $minimal = false)
    {
        if (empty($validated['boat_id'])) {
            throw ValidationException::withMessages([
                'boat_id' => 'Boat name is required.',
            ]);
        }

        $bills = $this->paymentableBillQuery()
            ->where('b.boat_id', $validated['boat_id'])
            ->orderBy('b.created_at')
            ->get();

        if ($bills->isEmpty()) {
            throw ValidationException::withMessages([
                'boat_id' => 'The selected boat has no unpaid bills available.',
            ]);
        }

        $totalRemainingBalance = (float) $bills->sum(fn ($bill) => (float) $bill->balance);
        $amountPaid = (float) $validated['amount_paid'];

        if (abs($amountPaid - $totalRemainingBalance) > 0.009) {
            throw ValidationException::withMessages([
                'amount_paid' => 'Amount paid must match the boat outstanding balance of ' . number_format($totalRemainingBalance, 2) . '.',
            ]);
        }

        $createdPayments = DB::transaction(function () use ($bills, $validated) {
            return $bills->map(function ($bill) use ($validated) {
                return Payment::create([
                    'bill_id' => $bill->bill_id,
                    'amount_paid' => $bill->balance,
                    'status' => 'partial',
                    'official_receipt_no' => trim($validated['official_receipt_no']),
                    'payment_method' => $validated['payment_method'] ?? 'cash',
                    'payment_date' => $validated['payment_date'],
                    'remarks' => $validated['remarks'] ?? null,
                    'received_by' => Auth::id(),
                ]);
            });
        });

        $paymentRecords = $this->paymentRecordQuery()
            ->whereIn('p.payment_id', $createdPayments->pluck('payment_id'))
            ->orderByDesc('p.payment_id')
            ->get();

        $firstRecord = $paymentRecords->first();
        abort_unless($firstRecord !== null, 404);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Payments',
            details: $this->paymentRecordedActivityDetails($paymentRecords),
            user: Auth::user()
        );

        $payments = $paymentRecords->map(fn ($payment) => $this->transformPaymentRecord($payment))->values();

        $payments->each(fn ($payment) => broadcast(new TransactionUpdated('payment', 'created', $payment)));

        if ($minimal) {
            return response()->json([
                'scope' => 'all_bills_per_boat',
                'payments' => $payments->map(fn ($payment) => [
                    'payment_id' => $payment['payment_id'],
                    'payment_reference' => $payment['payment_reference'],
                    'bill_id' => $payment['bill_id'],
                    'amount_paid' => $payment['amount_paid'],
                    'official_receipt_no' => $payment['official_receipt_no'],
                    'payment_date' => $payment['payment_date'],
                    'payment_method' => $payment['payment_method'],
                    'remarks' => $payment['remarks'],
                ])->values(),
            ], 201);
        }

        return response()->json([
            'scope' => 'all_bills_per_boat',
            'payments' => $payments,
        ], 201);
    }

    private function storeSelectedBillsPayment(array $validated, bool $minimal = false)
    {
        if (empty($validated['boat_id'])) {
            throw ValidationException::withMessages([
                'boat_id' => 'Boat name is required.',
            ]);
        }

        $selectedBillIds = collect($validated['bill_ids'] ?? [])
            ->filter()
            ->map(fn ($billId) => (int) $billId)
            ->unique()
            ->values();

        if ($selectedBillIds->isEmpty()) {
            throw ValidationException::withMessages([
                'bill_ids' => 'Select at least one bill.',
            ]);
        }

        $bills = $this->paymentableBillQuery()
            ->where('b.boat_id', $validated['boat_id'])
            ->whereIn('b.bill_id', $selectedBillIds)
            ->orderBy('b.created_at')
            ->get();

        if ($bills->count() !== $selectedBillIds->count()) {
            throw ValidationException::withMessages([
                'bill_ids' => 'One or more selected bills are unavailable.',
            ]);
        }

        $totalRemainingBalance = (float) $bills->sum(fn ($bill) => (float) $bill->balance);
        $amountPaid = (float) $validated['amount_paid'];

        if ($amountPaid > $totalRemainingBalance) {
            throw ValidationException::withMessages([
                'amount_paid' => 'Amount paid cannot exceed the selected bills total of ' . number_format($totalRemainingBalance, 2) . '.',
            ]);
        }

        $allocations = $this->buildSelectedBillAllocations($bills, $amountPaid);

        $createdPayments = DB::transaction(function () use ($allocations, $validated) {
            return collect($allocations)->map(function ($entry) use ($validated) {
                $bill = $entry['bill'];

                return Payment::create([
                    'bill_id' => $bill->bill_id,
                    'amount_paid' => $entry['amount_paid'],
                    'status' => 'partial',
                    'official_receipt_no' => trim($validated['official_receipt_no']),
                    'payment_method' => $validated['payment_method'] ?? 'cash',
                    'payment_date' => $validated['payment_date'],
                    'remarks' => $validated['remarks'] ?? null,
                    'received_by' => Auth::id(),
                ]);
            });
        });

        $paymentRecords = $this->paymentRecordQuery()
            ->whereIn('p.payment_id', $createdPayments->pluck('payment_id'))
            ->orderByDesc('p.payment_id')
            ->get();

        $firstRecord = $paymentRecords->first();
        abort_unless($firstRecord !== null, 404);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Payments',
            details: $this->paymentRecordedActivityDetails($paymentRecords),
            user: Auth::user()
        );

        $payments = $paymentRecords->map(fn ($payment) => $this->transformPaymentRecord($payment))->values();

        $payments->each(fn ($payment) => broadcast(new TransactionUpdated('payment', 'created', $payment)));

        if ($minimal) {
            return response()->json([
                'scope' => 'selected_bills',
                'payments' => $payments->map(fn ($payment) => [
                    'payment_id' => $payment['payment_id'],
                    'payment_reference' => $payment['payment_reference'],
                    'bill_id' => $payment['bill_id'],
                    'amount_paid' => $payment['amount_paid'],
                    'official_receipt_no' => $payment['official_receipt_no'],
                    'payment_date' => $payment['payment_date'],
                    'payment_method' => $payment['payment_method'],
                    'remarks' => $payment['remarks'],
                ])->values(),
            ], 201);
        }

        return response()->json([
            'scope' => 'selected_bills',
            'payments' => $payments,
        ], 201);
    }

    private function buildSelectedBillAllocations($bills, float $amountPaid): array
    {
        $remainingAmountCents = (int) round($amountPaid * 100);
        $orderedBills = $bills
            ->map(fn ($bill) => [
                'bill' => $bill,
                'bill_date' => (string) ($bill->bill_date ?? $bill->created_at ?? ''),
                'balance_cents' => (int) round(((float) $bill->balance) * 100),
            ])
            ->sortBy([
                ['bill_date', 'asc'],
                [fn ($entry) => (int) ($entry['bill']->bill_id ?? 0), 'asc'],
            ])
            ->values();
        $allocations = [];

        foreach ($orderedBills as $entry) {
            if ($remainingAmountCents <= 0) {
                break;
            }

            $allocatedCents = min($entry['balance_cents'], $remainingAmountCents);

            if ($allocatedCents <= 0) {
                continue;
            }

            $allocations[] = [
                'bill' => $entry['bill'],
                'amount_paid' => $allocatedCents / 100,
            ];

            $remainingAmountCents -= $allocatedCents;
        }

        return $allocations;
    }

    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'official_receipt_no' => 'required|digits:7',
            'remarks' => 'nullable|string',
        ]);

        $payment = Payment::query()->findOrFail($id);
        $validated['official_receipt_no'] = trim($validated['official_receipt_no']);
        $beforeState = [
            'official_receipt_no' => trim((string) $payment->official_receipt_no),
            'remarks' => (string) ($payment->remarks ?? ''),
        ];

        if ($validated['official_receipt_no'] !== trim((string) $payment->official_receipt_no)) {
            $this->ensureOfficialReceiptNoAvailable($validated['official_receipt_no'], $payment->payment_id);
        }

        $payment->update([
            'official_receipt_no' => $validated['official_receipt_no'],
            'remarks' => $validated['remarks'] ?? null,
        ]);

        $record = $this->paymentRecordQuery()
            ->where('p.payment_id', $payment->payment_id)
            ->first();

        abort_unless($record !== null, 404);

        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $beforeState,
            [
                'official_receipt_no' => trim((string) $payment->official_receipt_no),
                'remarks' => (string) ($payment->remarks ?? ''),
            ],
            [
                'official_receipt_no' => 'official receipt no.',
                'remarks' => 'remarks',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Payments',
            details: 'Updated payment #' . ($record->payment_reference_no ?? $payment->payment_id) . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        if ($request->boolean('minimal')) {
            return response()->json([
                'payment_id' => $record->payment_id,
                'payment_reference' => $record->payment_reference_no,
                'bill_id' => $record->bill_id,
                'amount_paid' => (float) $record->amount_paid,
                'official_receipt_no' => $record->official_receipt_no,
                'payment_date' => $record->payment_date,
                'payment_method' => $record->payment_method,
                'remarks' => $record->remarks,
            ]);
        }

        return response()->json($this->transformPaymentRecord($record));
    }

    private function paymentRecords(Request $request)
    {
        $query = $this->paymentRecordQuery()->tableSort();
        $this->applyFiscalYear($query, $request, 'p.payment_date');

        $payments = Payment::hydrateRunningTotals(collect($query->get()));
        $paymentHistoryByBillId = $this->paymentHistoriesForBills($payments->pluck('bill_id'));

        return $payments
            ->map(fn ($payment) => $this->transformPaymentRecord(
                $payment,
                $paymentHistoryByBillId[(string) $payment->bill_id] ?? []
            ))
            ->values();
    }

    private function paymentStats(Request $request): array
    {
        $today = now('Asia/Manila');
        $fiscalYear = $this->fiscalYear($request);
        $statsDate = $fiscalYear
            ? $today->copy()->year($fiscalYear)
            : $today;
        $billsQuery = DB::table('bills');
        $this->applyFiscalYear($billsQuery, $request, 'bills.created_at');
        $paymentsQuery = DB::table('payments');
        $this->applyFiscalYear($paymentsQuery, $request, 'payments.payment_date');

        return [
            'total_records' => (clone $billsQuery)->count(),
            'total_payment_records' => (clone $paymentsQuery)->count(),
            'today_records' => (clone $billsQuery)->whereBetween('created_at', [
                $statsDate->copy()->startOfDay(),
                $statsDate->copy()->endOfDay(),
            ])->count(),
            'today_payments' => (clone $paymentsQuery)->whereBetween('payment_date', [
                $statsDate->copy()->startOfDay(),
                $statsDate->copy()->endOfDay(),
            ])->count(),
        ];
    }

    private function todayReceivablesTotal(string $today): float
    {
        $paymentTotals = DB::table('payments')
            ->select('bill_id', DB::raw('COALESCE(SUM(amount_paid), 0) as total_paid'))
            ->groupBy('bill_id');

        $billedReceivablesToday = (float) DB::table('bills as b')
            ->leftJoinSub($paymentTotals, 'payment_totals', function ($join) {
                $join->on('payment_totals.bill_id', '=', 'b.bill_id');
            })
            ->whereDate('b.created_at', $today)
            ->sum(DB::raw('GREATEST(b.total_amount - COALESCE(payment_totals.total_paid, 0), 0)'));

        $billedDockingIds = DB::table('bill_items')
            ->whereNotNull('docking_id')
            ->pluck('docking_id')
            ->filter()
            ->all();

        $billedBanyeraIds = DB::table('bill_items')
            ->whereNotNull('banyera_id')
            ->pluck('banyera_id')
            ->filter()
            ->all();

        $unbilledDockingToday = (float) DB::table('dockings')
            ->whereDate('docking_date', $today)
            ->whereNull('voided_at')
            ->when(!empty($billedDockingIds), fn ($query) => $query->whereNotIn('docking_id', $billedDockingIds))
            ->sum('docking_fee');

        $unbilledBanyeraToday = (float) DB::table('banyera_transactions')
            ->whereDate('transaction_date', $today)
            ->whereNull('voided_at')
            ->when(!empty($billedBanyeraIds), fn ($query) => $query->whereNotIn('banyera_id', $billedBanyeraIds))
            ->sum('total_fee');

        return $billedReceivablesToday + $unbilledDockingToday + $unbilledBanyeraToday;
    }

    private function ensureOfficialReceiptNoAvailable(string $officialReceiptNo, ?int $ignorePaymentId = null): void
    {
        $query = Payment::query()
            ->whereRaw('TRIM(official_receipt_no) = ?', [$officialReceiptNo]);

        if ($ignorePaymentId !== null) {
            $query->where('payment_id', '!=', $ignorePaymentId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'official_receipt_no' => 'Official Receipt No. already exists.',
            ]);
        }
    }

    private function paymentRecordQuery()
    {
        return Payment::query()->forTableIndex();
    }

    private function paymentableBills(?Request $request = null)
    {
        $query = $this->paymentableBillQuery()->orderByDesc('b.created_at');
        if ($request) {
            $this->applyFiscalYear($query, $request, 'b.created_at');
        }

        $bills = $query->get();
        $paymentHistoryByBillId = $this->paymentHistoriesForBills($bills->pluck('bill_id'));

        return $bills
            ->map(fn ($bill) => $this->transformPaymentableBill(
                $bill,
                $paymentHistoryByBillId[(string) $bill->bill_id] ?? []
            ))
            ->values();
    }

    private function paymentableBillQuery()
    {
        $paymentTotals = DB::table('payments')
            ->select('bill_id', DB::raw('COALESCE(SUM(amount_paid), 0) as total_paid'))
            ->groupBy('bill_id');

        $billTransactions = DB::table('bill_items')
            ->select(
                'bill_id',
                DB::raw("
                    GROUP_CONCAT(
                        DISTINCT CASE transaction_type
                            WHEN 'docking' THEN 'Docking'
                            WHEN 'banyera' THEN 'Banyera'
                            WHEN 'ticket' THEN 'Vehicle Ticket'
                            ELSE transaction_type
                        END
                        ORDER BY transaction_type
                        SEPARATOR ', '
                    ) as transaction_summary
                ")
            )
            ->groupBy('bill_id');

        return DB::table('bills as b')
            ->leftJoinSub($paymentTotals, 'payment_totals', function ($join) {
                $join->on('payment_totals.bill_id', '=', 'b.bill_id');
            })
            ->leftJoinSub($billTransactions, 'bill_transactions', function ($join) {
                $join->on('bill_transactions.bill_id', '=', 'b.bill_id');
            })
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->leftJoin('boat_owners as owner', 'owner.owner_id', '=', 'boat.owner_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->select([
                'b.bill_id',
                'b.bill_reference_no',
                'b.boat_id',
                'b.total_amount',
                'b.created_at as bill_date',
                'boat.boat_name',
                'owner.owner_firstname',
                'owner.owner_lastname',
                'boat_type.type_name as boat_type',
                'bill_transactions.transaction_summary',
                DB::raw('COALESCE(payment_totals.total_paid, 0) as total_paid'),
                DB::raw('(b.total_amount - COALESCE(payment_totals.total_paid, 0)) as balance'),
            ])
            ->whereRaw('(b.total_amount - COALESCE(payment_totals.total_paid, 0)) > 0');
    }

    private function paymentHistoriesForBills($billIds)
    {
        $billIds = collect($billIds)
            ->filter(fn ($billId) => $billId !== null && $billId !== '')
            ->map(fn ($billId) => (int) $billId)
            ->unique()
            ->values();

        if ($billIds->isEmpty()) {
            return collect();
        }

        return DB::table('payments')
            ->whereIn('bill_id', $billIds)
            ->orderBy('payment_date')
            ->orderBy('payment_id')
            ->get()
            ->groupBy(fn ($payment) => (string) $payment->bill_id)
            ->map(fn ($payments) => $payments
                ->map(fn ($payment) => [
                    'payment_id' => $payment->payment_id,
                    'payment_reference' => $payment->payment_reference_no,
                    'official_receipt_no' => $payment->official_receipt_no,
                    'payment_date' => $payment->payment_date,
                    'amount_paid' => (float) $payment->amount_paid,
                    'payment_method' => $payment->payment_method,
                    'payment_method_label' => $this->paymentMethodLabel($payment->payment_method),
                    'remarks' => $payment->remarks,
                    'created_at' => $payment->created_at,
                ])
                ->values()
                ->all()
            );
    }

    private function transformPaymentRecord(object $payment, array $paymentTransactionsHistory = []): array
    {
        $billReference = $this->formatBillReference($payment->bill_reference_no, $payment->bill_id);
        $paymentReference = $payment->payment_reference_no;

        return [
            'payment_id' => $payment->payment_id,
            'payment_reference' => $paymentReference,
            'official_receipt_no' => $payment->official_receipt_no,
            'bill_id' => $payment->bill_id,
            'bill_reference' => $billReference,
            'boat_id' => $payment->boat_id,
            'boat_name' => $payment->boat_name,
            'owner_name' => $this->joinName($payment->owner_firstname, $payment->owner_lastname),
            'boat_type' => $payment->boat_type,
            'amount_paid' => (float) $payment->amount_paid,
            'payment_method' => $payment->payment_method,
            'payment_method_label' => $this->paymentMethodLabel($payment->payment_method),
            'payment_date' => $payment->payment_date,
            'total_amount' => (float) $payment->total_amount,
            'bill_total_paid' => (float) $payment->bill_total_paid,
            'balance' => (float) $payment->balance,
            'status' => $payment->status,
            'remarks' => $payment->remarks,
            'payment_transactions_history' => $paymentTransactionsHistory,
            'received_by_name' => $this->joinName($payment->received_by_first_name, $payment->received_by_last_name) ?: $payment->received_by_email,
            'created_at' => $payment->created_at,
            'updated_at' => $payment->updated_at,
        ];
    }

    private function paymentRecordedActivityDetails($paymentRecords): string
    {
        $records = is_iterable($paymentRecords)
            ? collect($paymentRecords)
            : collect([$paymentRecords]);

        $firstRecord = $records->first();
        $boatName = trim((string) ($firstRecord->boat_name ?? '')) ?: 'Unknown boat';
        $referenceNumbers = $records
            ->map(fn ($record) => trim((string) ($record->payment_reference_no ?? $record->payment_reference ?? $record->payment_id ?? '')))
            ->filter()
            ->unique()
            ->join(', ');
        $amount = $records->sum(fn ($record) => (float) ($record->amount_paid ?? 0));

        return 'Recorded payment for boat "' . $boatName . '" with reference number "' .
            ($referenceNumbers !== '' ? $referenceNumbers : '-') .
            '" and an amount of ₱' . number_format($amount, 2) . '.';
    }

    private function transformPaymentableBill(object $bill, array $paymentTransactionsHistory = []): array
    {
        return [
            'bill_id' => $bill->bill_id,
            'bill_reference_no' => $bill->bill_reference_no,
            'bill_reference' => $this->formatBillReference($bill->bill_reference_no, $bill->bill_id),
            'boat_id' => $bill->boat_id,
            'boat_name' => $bill->boat_name,
            'owner_name' => $this->joinName($bill->owner_firstname, $bill->owner_lastname),
            'boat_type' => $bill->boat_type,
            'transaction_summary' => $bill->transaction_summary,
            'bill_date' => $bill->bill_date,
            'amount_due' => (float) $bill->total_amount,
            'total_paid' => (float) $bill->total_paid,
            'balance' => (float) $bill->balance,
            'payment_transactions_history' => $paymentTransactionsHistory,
        ];
    }

    private function formatBillReference($billingId, $billId): string
    {
        if ($billingId) {
            return substr((string) $billingId, -6);
        }

        return str_pad((string) $billId, 6, '0', STR_PAD_LEFT);
    }

    private function joinName(?string $firstName, ?string $lastName): string
    {
        return trim(collect([$firstName, $lastName])->filter()->join(' '));
    }

    private function paymentMethodLabel(string $value): string
    {
        return match ($value) {
            'gcash' => 'GCash',
            'bank_transfer' => 'Bank Transfer',
            default => 'Cash',
        };
    }
}
