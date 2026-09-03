<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\Bill;
use App\Models\BillItem;
use App\Models\BanyeraTransaction;
use App\Models\Boat;
use App\Models\Docking;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BillController extends Controller
{
    private function summarizeBillItems(array $items): array
    {
        return collect($items)->map(function (array $item) {
            $type = ucfirst((string) ($item['transaction_type'] ?? 'item'));
            $amount = number_format((float) ($item['amount'] ?? 0), 2);

            if (!empty($item['docking_id'])) {
                return $type . ' #' . $item['docking_id'] . ' (PHP ' . $amount . ')';
            }

            if (!empty($item['banyera_id'])) {
                return $type . ' #' . $item['banyera_id'] . ' (PHP ' . $amount . ')';
            }

            return $type . ' (PHP ' . $amount . ')';
        })->values()->all();
    }

    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('bills.bill_id', (int) $highlightId)
            ->first(['bills.bill_id', 'bills.created_at']);

        if (!$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('bills.created_at', '>', $target->created_at)
                    ->orWhere(function ($tieQuery) use ($target) {
                        $tieQuery
                            ->where('bills.created_at', $target->created_at)
                            ->where('bills.bill_id', '>', $target->bill_id);
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        try {
            if ($request->boolean('all') && $request->boolean('compact')) {
                $bills = Bill::query()
                    ->select('bill_id', 'bill_reference_no', 'boat_id', 'total_amount', 'created_at')
                    ->tableFilters(
                        $request->query('search', ''),
                        $request->query('status', 'all'),
                        $request->query('period', 'all'),
                        $request->query('boat', 'all')
                    )
                    ->tableSort($request->query('sort', 'created_at_desc'));
                $this->applyFiscalYear($bills, $request, 'bills.created_at');
                $bills = $bills->get();

                return response()->json($bills->map(fn (Bill $bill) => $this->transformCompactBill($bill)));
            }

            $query = Bill::forTableIndex()
                ->tableFilters(
                    $request->query('search', ''),
                    $request->query('status', 'all'),
                    $request->query('period', 'all'),
                    $request->query('boat', 'all')
                )
                ->tableSort($request->query('sort', 'created_at_desc'));
            $this->applyFiscalYear($query, $request, 'bills.created_at');

            if ($request->boolean('all')) {
                $bills = $query->get();

                return response()->json($bills->map(fn (Bill $bill) => $this->transformBill($bill)));
            }

            $perPage = 10;
            $page = max((int) $request->query('page', 1), 1);
            $page = $this->highlightedPage($query, $request->query('highlight_bill_id'), $page, $perPage);
            $bills = $query->paginate($perPage, ['*'], 'page', $page);

            $bills->getCollection()->transform(fn (Bill $bill) => $this->transformBill($bill));

            return response()->json([
                'data' => $bills->items(),
                'meta' => [
                    'current_page' => $bills->currentPage(),
                    'last_page' => $bills->lastPage(),
                    'per_page' => $bills->perPage(),
                    'total' => $bills->total(),
                    'from' => $bills->firstItem(),
                    'to' => $bills->lastItem(),
                ],
                'stats' => $this->billStats($request),
            ]);
        } catch (\Exception $e) {
            // Return empty data structure if query times out or fails
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => 10,
                    'total' => 0,
                    'from' => 0,
                    'to' => 0,
                ],
                'stats' => [
                    'total_records' => 0,
                    'today_records' => 0,
                    'today_payments' => 0,
                ],
            ], 200);
        }
    }

    private function highlightedSoaPage($query, ?string $highlightBoatId, int $requestedPage, int $perPage): int
    {
        $highlightBoatId = trim((string) $highlightBoatId);

        if ($highlightBoatId === '' || !ctype_digit($highlightBoatId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('boat.boat_id', (int) $highlightBoatId)
            ->first(['boat.boat_id', 'boat.created_at as boat_created_at', 'summary.latest_billed_date']);

        if (!$target?->boat_id) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('boat.created_at', '>', $target->boat_created_at)
                    ->orWhere(function ($dateTieQuery) use ($target) {
                        $dateTieQuery
                            ->where('boat.created_at', $target->boat_created_at)
                            ->where(function ($billedTieQuery) use ($target) {
                                if ($target->latest_billed_date === null) {
                                    $billedTieQuery
                                        ->whereNotNull('summary.latest_billed_date')
                                        ->orWhere(function ($sameNullTieQuery) use ($target) {
                                            $sameNullTieQuery
                                                ->whereNull('summary.latest_billed_date')
                                                ->where('boat.boat_id', '>', $target->boat_id);
                                        });
                                    return;
                                }

                                $billedTieQuery
                                    ->where('summary.latest_billed_date', '>', $target->latest_billed_date)
                                    ->orWhere(function ($sameBilledDateTieQuery) use ($target) {
                                        $sameBilledDateTieQuery
                                            ->where('summary.latest_billed_date', $target->latest_billed_date)
                                            ->where('boat.boat_id', '>', $target->boat_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    private function highlightedOwnerStatementPage($query, ?string $highlightOwnerId, int $requestedPage, int $perPage): int
    {
        $highlightOwnerId = trim((string) $highlightOwnerId);

        if ($highlightOwnerId === '' || !ctype_digit($highlightOwnerId)) {
            return $requestedPage;
        }

        $source = fn () => DB::query()->fromSub(clone $query, 'owner_highlight_source');
        $target = $source()
            ->whereRaw('FIND_IN_SET(?, owner_ids)', [(int) $highlightOwnerId])
            ->first(['owner_id', 'owner_ids', 'owner_firstname_sort', 'owner_lastname_sort', 'owner_archived_sort']);

        if (!$target?->owner_id) {
            return $requestedPage;
        }

        $targetArchived = (int) $target->owner_archived_sort;
        $targetFirstName = (string) ($target->owner_firstname_sort ?? '');
        $targetLastName = (string) ($target->owner_lastname_sort ?? '');

        $rowsBeforeTarget = $source()
            ->where(function ($positionQuery) use ($targetArchived, $targetFirstName, $targetLastName) {
                $positionQuery
                    ->where('owner_archived_sort', '<', $targetArchived)
                    ->orWhere(function ($sameArchiveQuery) use ($targetArchived, $targetFirstName, $targetLastName) {
                        $sameArchiveQuery
                            ->where('owner_archived_sort', $targetArchived)
                            ->where(function ($nameQuery) use ($targetFirstName, $targetLastName) {
                                $nameQuery
                                    ->where('owner_firstname_sort', '<', $targetFirstName)
                                    ->orWhere(function ($sameFirstNameQuery) use ($targetFirstName, $targetLastName) {
                                        $sameFirstNameQuery
                                            ->where('owner_firstname_sort', $targetFirstName)
                                            ->where('owner_lastname_sort', '<', $targetLastName);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function statementOfAccount(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');
        $selectedBoat = trim((string) $request->query('boat', ''));
        $highlightBoatId = $request->query('highlight_boat_id', '');
        $statementType = (string) $request->query('statement_type', 'boats');
        $fiscalYear = null;
        $period = $this->statementPeriod($request, $fiscalYear);

        if ($request->boolean('selected_only') && $selectedBoat !== '') {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => $perPage,
                    'total' => 0,
                    'from' => 0,
                    'to' => 0,
                ],
                'stats' => [
                    'total_billed' => 0,
                    'total_collected' => 0,
                    'total_receivables' => 0,
                ],
                'selected_record' => $this->statementBoatDetails($selectedBoat, $period),
            ]);
        }

        if ($statementType === 'owners') {
            return $this->statementOwnerResponse($request, $period);
        }

        $paymentTotals = DB::table('payments')
            ->select(
                'bill_id',
                DB::raw('COALESCE(SUM(amount_paid), 0) as total_paid'),
                DB::raw('COUNT(*) as payment_count')
            )
            ->groupBy('bill_id');
        $this->applyStatementPeriod($paymentTotals, 'payments.payment_date', $period);

        $billSummaries = DB::table('bills as b')
            ->leftJoinSub($paymentTotals, 'payment_totals', function ($join) {
                $join->on('payment_totals.bill_id', '=', 'b.bill_id');
            })
            ->select([
                'b.boat_id',
                DB::raw('SUM(b.total_amount) as billed_total'),
                DB::raw('SUM(COALESCE(payment_totals.total_paid, 0)) as paid_total'),
                DB::raw('SUM(GREATEST(b.total_amount - COALESCE(payment_totals.total_paid, 0), 0)) as balance_total'),
                DB::raw('COUNT(b.bill_id) as bill_count'),
                DB::raw('SUM(COALESCE(payment_totals.payment_count, 0)) as payment_count'),
                DB::raw('MAX(b.created_at) as latest_billed_date'),
            ])
            ->groupBy('b.boat_id');
        $this->applyStatementPeriod($billSummaries, 'b.created_at', $period);

        $unbilledDockings = DB::table('dockings as d')
            ->leftJoin('bill_items as bi', 'bi.docking_id', '=', 'd.docking_id')
            ->whereNull('bi.docking_id')
            ->whereNull('d.voided_at')
            ->select('d.boat_id', DB::raw('SUM(d.docking_fee) as unbilled_docking_total'))
            ->groupBy('d.boat_id');
        $this->applyStatementPeriod($unbilledDockings, 'd.docking_date', $period);

        $unbilledBanyera = DB::table('banyera_transactions as bt')
            ->leftJoin('bill_items as bi', 'bi.banyera_id', '=', 'bt.banyera_id')
            ->whereNull('bi.banyera_id')
            ->whereNull('bt.voided_at')
            ->select('bt.boat_id', DB::raw('SUM(bt.total_fee) as unbilled_banyera_total'))
            ->groupBy('bt.boat_id');
        $this->applyStatementPeriod($unbilledBanyera, 'bt.transaction_date', $period);

        $query = DB::table('boats as boat')
            ->leftJoin('boat_owners as owner', 'owner.owner_id', '=', 'boat.owner_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->leftJoinSub($billSummaries, 'summary', function ($join) {
                $join->on('summary.boat_id', '=', 'boat.boat_id');
            })
            ->leftJoinSub($unbilledDockings, 'unbilled_dockings', function ($join) {
                $join->on('unbilled_dockings.boat_id', '=', 'boat.boat_id');
            })
            ->leftJoinSub($unbilledBanyera, 'unbilled_banyera', function ($join) {
                $join->on('unbilled_banyera.boat_id', '=', 'boat.boat_id');
            })
            ->select([
                'boat.boat_id',
                'boat.boat_name',
                DB::raw("TRIM(CONCAT(COALESCE(owner.owner_firstname, ''), ' ', COALESCE(owner.owner_lastname, ''))) as owner_name"),
                'boat_type.type_name as boat_type',
                'boat.created_at as boat_created_at',
                'boat.deleted_at as boat_deleted_at',
                DB::raw('COALESCE(summary.billed_total, 0) as billed_total'),
                DB::raw('COALESCE(summary.paid_total, 0) as paid_total'),
                DB::raw('COALESCE(summary.balance_total, 0) as balance_total'),
                DB::raw('COALESCE(summary.bill_count, 0) as bill_count'),
                DB::raw('COALESCE(summary.payment_count, 0) as payment_count'),
                DB::raw('summary.latest_billed_date as latest_billed_date'),
                DB::raw('COALESCE(unbilled_dockings.unbilled_docking_total, 0) as unbilled_docking_total'),
                DB::raw('COALESCE(unbilled_banyera.unbilled_banyera_total, 0) as unbilled_banyera_total'),
                DB::raw('(COALESCE(summary.billed_total, 0) + COALESCE(unbilled_dockings.unbilled_docking_total, 0) + COALESCE(unbilled_banyera.unbilled_banyera_total, 0)) as total_billed'),
                DB::raw('(COALESCE(summary.balance_total, 0) + COALESCE(unbilled_dockings.unbilled_docking_total, 0) + COALESCE(unbilled_banyera.unbilled_banyera_total, 0)) as balance_due'),
            ]);

        $masterStatsRows = DB::query()->fromSub(clone $query, 'master_stats_source')->get();

        if ($search !== '') {
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery
                    ->where('boat.boat_name', 'like', "%{$search}%")
                    ->orWhereRaw("TRIM(CONCAT(COALESCE(owner.owner_firstname, ''), ' ', COALESCE(owner.owner_lastname, ''))) like ?", ["%{$search}%"]);
            });
        }

        if ($status !== 'all') {
            $query->whereRaw($this->statementStatusSql() . ' = ?', [$status]);
        }

        $statsRows = DB::query()->fromSub(clone $query, 'stats_source')->get();
        $stats = [
            'total_billed' => (float) $statsRows->sum('total_billed'),
            'total_collected' => (float) $statsRows->sum('paid_total'),
            'total_receivables' => (float) $statsRows->sum('balance_due'),
        ];
        $masterStats = [
            'total_billed' => (float) $masterStatsRows->sum('total_billed'),
            'total_collected' => (float) $masterStatsRows->sum('paid_total'),
            'total_receivables' => (float) $masterStatsRows->sum('balance_due'),
        ];

        $page = max((int) $request->query('page', 1), 1);
        $page = $this->highlightedSoaPage($query, $highlightBoatId, $page, $perPage);

        $records = $query
            ->orderByDesc('boat.created_at')
            ->orderByDesc('summary.latest_billed_date')
            ->orderByDesc('boat.boat_id')
            ->paginate($perPage, ['*'], 'page', $page)
            ->appends($request->query());

        $items = collect($records->items())->map(fn ($row) => $this->transformStatementBoatRecord($row))->values();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $records->currentPage(),
                'last_page' => $records->lastPage(),
                'per_page' => $records->perPage(),
                'total' => $records->total(),
                'from' => $records->firstItem(),
                'to' => $records->lastItem(),
            ],
            'stats' => $stats,
            'overview_stats' => $masterStats,
            'selected_record' => $selectedBoat !== '' ? $this->statementBoatDetails($selectedBoat, $period) : null,
        ]);
    }

    public function boatStatement(Request $request)
    {
        $request->merge(['statement_type' => 'boats']);

        return $this->statementOfAccount($request);
    }

    public function ownerStatement(Request $request)
    {
        return $this->statementOwnerResponse($request, null);
    }

    public function store(Request $request)
    {
        $validated = $this->validateBill($request);

        $bill = DB::transaction(function () use ($validated) {
            $items = $this->normalizeItems($validated['items']);
            $this->ensureTransactionsAreUnbilled($items);

            $bill = Bill::create([
                'boat_id' => $validated['boat_id'],
                'total_amount' => collect($items)->sum('amount'),
                'created_by' => Auth::id(),
            ]);

            foreach ($items as $item) {
                BillItem::create([
                    'bill_id' => $bill->bill_id,
                    ...$item,
                ]);
            }

            return $bill->load($this->billRelations());
        });

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Billing',
            details: 'Created billing record #' . ($bill->bill_reference_no ?? $bill->bill_id) . ' for boat "' . ($bill->boat?->boat_name ?? 'Unknown boat') . '".',
            user: Auth::user()
        );

        $billPayload = $this->transformBill($bill)->toArray();

        broadcast(new TransactionUpdated('billing', 'created', $billPayload));

        if ($request->boolean('minimal')) {
            return response()->json([
                'bill_id' => $bill->bill_id,
                'bill_reference_no' => $bill->bill_reference_no,
                'boat_id' => $bill->boat_id,
                'total_amount' => (float) $bill->total_amount,
                'created_at' => $bill->created_at,
            ], 201);
        }

        return response()->json($billPayload, 201);
    }

    public function show($id)
    {
        $bill = Bill::with($this->billRelations())->findOrFail($id);

        return response()->json($this->transformBill($bill));
    }

    public function update(Request $request, $id)
    {
        $bill = Bill::with($this->billRelations())->findOrFail($id);
        $validated = $this->validateBill($request);
        $beforeState = [
            'boat' => $bill->boat?->boat_name ?? ('Boat #' . $bill->boat_id),
            'total_amount' => number_format((float) $bill->total_amount, 2),
            'items' => $this->summarizeBillItems(
                $bill->items->map(fn ($item) => [
                    'transaction_type' => $item->transaction_type,
                    'docking_id' => $item->docking_id,
                    'banyera_id' => $item->banyera_id,
                    'amount' => $item->amount,
                ])->all()
            ),
        ];

        $bill = DB::transaction(function () use ($validated, $bill) {
            $items = $this->normalizeItems($validated['items']);
            $this->ensureTransactionsAreUnbilled($items, $bill->bill_id);

            $bill->update([
                'boat_id' => $validated['boat_id'],
                'total_amount' => collect($items)->sum('amount'),
            ]);

            BillItem::query()->where('bill_id', $bill->bill_id)->delete();

            foreach ($items as $item) {
                BillItem::create([
                    'bill_id' => $bill->bill_id,
                    ...$item,
                ]);
            }

            return $bill->load($this->billRelations());
        });

        $afterState = [
            'boat' => $bill->boat?->boat_name ?? ('Boat #' . $bill->boat_id),
            'total_amount' => number_format((float) $bill->total_amount, 2),
            'items' => $this->summarizeBillItems($validated['items']),
        ];

        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $beforeState,
            $afterState,
            [
                'boat' => 'boat',
                'total_amount' => 'total amount',
                'items' => 'bill items',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Billing',
            details: 'Updated billing record #' . ($bill->bill_reference_no ?? $bill->bill_id) . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        $billPayload = $this->transformBill($bill)->toArray();

        broadcast(new TransactionUpdated('billing', 'updated', $billPayload));

        if ($request->boolean('minimal')) {
            return response()->json([
                'bill_id' => $bill->bill_id,
                'bill_reference_no' => $bill->bill_reference_no,
                'boat_id' => $bill->boat_id,
                'total_amount' => (float) $bill->total_amount,
                'updated_at' => $bill->updated_at,
            ]);
        }

        return response()->json($billPayload);
    }

    public function destroy($id)
    {
        $bill = Bill::with('boat')->findOrFail($id);
        $bill->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Billing',
            details: 'Archived billing record #' . ($bill->bill_reference_no ?? $bill->bill_id) . ' for boat "' . ($bill->boat?->boat_name ?? 'Unknown boat') . '".',
            user: Auth::user()
        );

        broadcast(new TransactionUpdated('billing', 'updated', [
            'bill_id' => $bill->bill_id,
            'boat_id' => $bill->boat_id,
            'deleted_at' => optional($bill->deleted_at)->toIso8601String(),
        ]));

        return response()->json(['message' => 'Billing record archived successfully.']);
    }

    private function validateBill(Request $request): array
    {
        return $request->validate([
            'boat_id' => 'required|exists:boats,boat_id',
            'items' => 'required|array|min:1',
            'items.*.transaction_type' => ['required', Rule::in(['docking', 'banyera'])],
            'items.*.docking_id' => 'nullable|integer|exists:dockings,docking_id',
            'items.*.banyera_id' => 'nullable|integer|exists:banyera_transactions,banyera_id',
            'items.*.amount' => 'nullable|numeric|min:0',
        ]);
    }

    private function normalizeItems(array $items): array
    {
        return collect($items)
            ->map(function (array $item) {
                $transactionType = $item['transaction_type'];

                $normalized = [
                    'transaction_type' => $transactionType,
                    'docking_id' => null,
                    'banyera_id' => null,
                    'amount' => 0,
                ];

                if ($transactionType === 'docking') {
                    $record = Docking::findOrFail($item['docking_id']);
                    if (!is_null($record->voided_at)) {
                        throw ValidationException::withMessages([
                            'items' => 'Selected billing item is no longer available.',
                        ]);
                    }
                    $normalized['docking_id'] = $record->docking_id;
                    $normalized['amount'] = (float) ($item['amount'] ?? $record->docking_fee ?? 0);
                }

                if ($transactionType === 'banyera') {
                    $record = BanyeraTransaction::findOrFail($item['banyera_id']);
                    if (!is_null($record->voided_at)) {
                        throw ValidationException::withMessages([
                            'items' => 'Selected billing item is no longer available.',
                        ]);
                    }
                    $normalized['banyera_id'] = $record->banyera_id;
                    $normalized['amount'] = (float) ($item['amount'] ?? $record->total_fee ?? 0);
                }

                return $normalized;
            })
            ->values()
            ->all();
    }

    private function billRelations(): array
    {
        return Bill::tableRelations();
    }

    private function ensureTransactionsAreUnbilled(array $items, ?int $ignoreBillId = null): void
    {
        $dockingIds = collect($items)->pluck('docking_id')->filter()->values()->all();
        $banyeraIds = collect($items)->pluck('banyera_id')->filter()->values()->all();

        $conflicts = BillItem::query()
            ->with('bill')
            ->whereHas('bill', function ($query) use ($ignoreBillId) {
                if ($ignoreBillId !== null) {
                    $query->where('bill_id', '!=', $ignoreBillId);
                }
            })
            ->where(function ($query) use ($dockingIds, $banyeraIds) {
                if (!empty($dockingIds)) {
                    $query->orWhereIn('docking_id', $dockingIds);
                }

                if (!empty($banyeraIds)) {
                    $query->orWhereIn('banyera_id', $banyeraIds);
                }
            })
            ->get();

        if ($conflicts->isEmpty()) {
            return;
        }

        $existingBill = $conflicts->first()?->bill;
        $referenceNumber = $existingBill?->bill_reference_no
            ? substr($existingBill->bill_reference_no, -6)
            : str_pad((string) ($existingBill?->bill_id ?? 0), 6, '0', STR_PAD_LEFT);

        throw ValidationException::withMessages([
            'items' => 'Bill already exists. Reference number ' . $referenceNumber . '.',
        ]);
    }

    private function statementStatusSql(): string
    {
        return "CASE
            WHEN (COALESCE(summary.balance_total, 0) + COALESCE(unbilled_dockings.unbilled_docking_total, 0) + COALESCE(unbilled_banyera.unbilled_banyera_total, 0)) <= 0.009 THEN 'paid'
            WHEN COALESCE(summary.paid_total, 0) > 0.009 THEN 'partial'
            ELSE 'pending'
        END";
    }

    private function statementPeriod(Request $request, ?int $fiscalYear = null): ?array
    {
        $filterType = (string) $request->query('filter_type', '');

        if ($filterType === '' && $fiscalYear) {
            return ['filter_type' => 'yearly', 'year' => $fiscalYear];
        }

        if (!in_array($filterType, ['daily', 'monthly', 'yearly'], true)) {
            return null;
        }

        return [
            'filter_type' => $filterType,
            'date' => (string) $request->query('selected_date', ''),
            'month' => (string) $request->query('selected_month', ''),
            'year' => (string) $request->query('selected_year', ''),
        ];
    }

    private function applyStatementPeriod($query, string $column, ?array $period): void
    {
        if (!$period) {
            return;
        }

        if (($period['filter_type'] ?? '') === 'daily' && !empty($period['date'])) {
            $query->whereDate($column, $period['date']);
            return;
        }

        if (($period['filter_type'] ?? '') === 'monthly' && !empty($period['month'])) {
            $query->whereYear($column, (int) substr($period['month'], 0, 4))
                ->whereMonth($column, (int) substr($period['month'], 5, 2));
            return;
        }

        if (($period['filter_type'] ?? '') === 'yearly' && !empty($period['year'])) {
            $query->whereYear($column, (int) $period['year']);
        }
    }

    private function statementOwnerResponse(Request $request, ?array $period = null)
    {
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');
        $highlightOwnerId = $request->query('highlight_owner_id', '');
        $ownerId = $request->query('owner_id', '');

        $period ??= $this->statementPeriod($request);

        [$boatTotals, $paymentTotals] = $this->statementBoatTotalsSubqueries($period);

        $ownerNameSql = "TRIM(CONCAT(COALESCE(owner.owner_firstname, ''), ' ', COALESCE(owner.owner_lastname, '')))";
        $billedSumSql = 'COALESCE(SUM(COALESCE(boat_summary.total_billed, 0)), 0)';
        $paidSumSql = 'COALESCE(SUM(COALESCE(boat_summary.paid_total, 0)), 0)';
        $balanceSumSql = 'COALESCE(SUM(COALESCE(boat_summary.balance_due, 0)), 0)';
        $statusSql = "CASE
            WHEN {$balanceSumSql} <= 0.009 THEN 'paid'
            WHEN {$paidSumSql} > 0.009 THEN 'partial'
            ELSE 'pending'
        END";

        $query = DB::table('boat_owners as owner')
            ->leftJoinSub($boatTotals, 'boat_summary', function ($join) {
                $join->on('boat_summary.owner_id', '=', 'owner.owner_id');
            })
            ->select([
                DB::raw('MIN(owner.owner_id) as owner_id'),
                DB::raw('GROUP_CONCAT(owner.owner_id) as owner_ids'),
                DB::raw("{$ownerNameSql} as owner_name"),
                'owner.owner_firstname as owner_firstname_sort',
                'owner.owner_lastname as owner_lastname_sort',
                DB::raw('MIN(owner.created_at) as owner_created_at'),
                DB::raw('MAX(owner.deleted_at) as owner_deleted_at'),
                DB::raw('MAX(owner.deleted_at) is not null as owner_archived_sort'),
                DB::raw('COUNT(DISTINCT boat_summary.boat_id) as boat_count'),
                DB::raw('COALESCE(SUM(COALESCE(boat_summary.bill_count, 0)), 0) as bill_count'),
                DB::raw('COALESCE(SUM(COALESCE(boat_summary.payment_count, 0)), 0) as payment_count'),
                DB::raw("{$billedSumSql} as total_billed"),
                DB::raw("{$paidSumSql} as paid_total"),
                DB::raw("{$balanceSumSql} as balance_due"),
                DB::raw('MAX(boat_summary.latest_billed_date) as latest_billed_date'),
            ])
            ->groupBy('owner.owner_firstname', 'owner.owner_lastname');

        $masterStatsRows = DB::query()->fromSub(clone $query, 'owner_master_stats_source')->get();
        $masterStats = [
            'total_billed' => (float) $masterStatsRows->sum('total_billed'),
            'total_collected' => (float) $masterStatsRows->sum('paid_total'),
            'total_receivables' => (float) $masterStatsRows->sum('balance_due'),
        ];

        if ($search !== '') {
            $query->where(function ($searchQuery) use ($search, $ownerNameSql) {
                $searchQuery
                    ->whereRaw("{$ownerNameSql} like ?", ["%{$search}%"])
                    ->orWhereExists(function ($existsQuery) use ($search) {
                        $existsQuery
                            ->selectRaw('1')
                            ->from('boats as owner_search_boats')
                            ->whereColumn('owner_search_boats.owner_id', 'owner.owner_id')
                            ->where('owner_search_boats.boat_name', 'like', "%{$search}%");
                    });
            });
        }

        if ($ownerId !== '' && ctype_digit((string) $ownerId)) {
            $query->where('owner.owner_id', (int) $ownerId);
        }

        if ($status !== 'all') {
            $query->havingRaw("{$statusSql} = ?", [$status]);
        }

        $statsRows = DB::query()->fromSub(clone $query, 'owner_stats_source')->get();
        $stats = [
            'total_billed' => (float) $statsRows->sum('total_billed'),
            'total_collected' => (float) $statsRows->sum('paid_total'),
            'total_receivables' => (float) $statsRows->sum('balance_due'),
        ];

        $page = $this->highlightedOwnerStatementPage($query, $highlightOwnerId, $page, $perPage);

        $records = $query
            ->orderByRaw('MAX(owner.deleted_at) is not null')
            ->orderBy('owner.owner_firstname')
            ->orderBy('owner.owner_lastname')
            ->paginate($perPage, ['*'], 'page', $page)
            ->appends($request->query());

        $items = collect($records->items())->map(fn ($row) => $this->transformStatementOwnerRecord($row))->values();
        $ownerIds = $items
            ->flatMap(fn ($owner) => $owner['owner_ids'] ?? [])
            ->filter()
            ->unique()
            ->values()
            ->all();
        $boatsByOwner = $this->statementBoatRowsForOwners($ownerIds, $period);

        $items = $items->map(function (array $owner) use ($boatsByOwner) {
            $owner['boats'] = collect($owner['owner_ids'] ?? [])
                ->flatMap(fn ($ownerId) => $boatsByOwner->get((int) $ownerId, collect()))
                ->values();
            return $owner;
        })->values();

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $records->currentPage(),
                'last_page' => $records->lastPage(),
                'per_page' => $records->perPage(),
                'total' => $records->total(),
                'from' => $records->firstItem(),
                'to' => $records->lastItem(),
            ],
            'stats' => $stats,
            'overview_stats' => $masterStats,
            'selected_record' => null,
        ]);
    }

    private function statementBoatTotalsSubqueries(?array $period = null): array
    {
        $paymentTotals = DB::table('payments')
            ->select(
                'bill_id',
                DB::raw('COALESCE(SUM(amount_paid), 0) as total_paid'),
                DB::raw('COUNT(*) as payment_count')
            )
            ->groupBy('bill_id');
        $this->applyStatementPeriod($paymentTotals, 'payments.payment_date', $period);

        $billSummaries = DB::table('bills as b')
            ->leftJoinSub($paymentTotals, 'payment_totals', function ($join) {
                $join->on('payment_totals.bill_id', '=', 'b.bill_id');
            })
            ->select([
                'b.boat_id',
                DB::raw('SUM(b.total_amount) as billed_total'),
                DB::raw('SUM(COALESCE(payment_totals.total_paid, 0)) as paid_total'),
                DB::raw('SUM(GREATEST(b.total_amount - COALESCE(payment_totals.total_paid, 0), 0)) as balance_total'),
                DB::raw('COUNT(b.bill_id) as bill_count'),
                DB::raw('SUM(COALESCE(payment_totals.payment_count, 0)) as payment_count'),
                DB::raw('MAX(b.created_at) as latest_billed_date'),
            ])
            ->groupBy('b.boat_id');
        $this->applyStatementPeriod($billSummaries, 'b.created_at', $period);

        $unbilledDockings = DB::table('dockings as d')
            ->leftJoin('bill_items as bi', 'bi.docking_id', '=', 'd.docking_id')
            ->whereNull('bi.docking_id')
            ->whereNull('d.voided_at')
            ->select('d.boat_id', DB::raw('SUM(d.docking_fee) as unbilled_docking_total'))
            ->groupBy('d.boat_id');
        $this->applyStatementPeriod($unbilledDockings, 'd.docking_date', $period);

        $unbilledBanyera = DB::table('banyera_transactions as bt')
            ->leftJoin('bill_items as bi', 'bi.banyera_id', '=', 'bt.banyera_id')
            ->whereNull('bi.banyera_id')
            ->whereNull('bt.voided_at')
            ->select('bt.boat_id', DB::raw('SUM(bt.total_fee) as unbilled_banyera_total'))
            ->groupBy('bt.boat_id');
        $this->applyStatementPeriod($unbilledBanyera, 'bt.transaction_date', $period);

        $boatTotals = DB::table('boats as boat')
            ->leftJoin('boat_owners as owner', 'owner.owner_id', '=', 'boat.owner_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->leftJoinSub($billSummaries, 'summary', function ($join) {
                $join->on('summary.boat_id', '=', 'boat.boat_id');
            })
            ->leftJoinSub($unbilledDockings, 'unbilled_dockings', function ($join) {
                $join->on('unbilled_dockings.boat_id', '=', 'boat.boat_id');
            })
            ->leftJoinSub($unbilledBanyera, 'unbilled_banyera', function ($join) {
                $join->on('unbilled_banyera.boat_id', '=', 'boat.boat_id');
            })
            ->select([
                'boat.boat_id',
                'boat.owner_id',
                'boat.boat_name',
                DB::raw("TRIM(CONCAT(COALESCE(owner.owner_firstname, ''), ' ', COALESCE(owner.owner_lastname, ''))) as owner_name"),
                'boat_type.type_name as boat_type',
                'boat.created_at as boat_created_at',
                'boat.deleted_at as boat_deleted_at',
                DB::raw('COALESCE(summary.billed_total, 0) as billed_total'),
                DB::raw('COALESCE(summary.paid_total, 0) as paid_total'),
                DB::raw('COALESCE(summary.balance_total, 0) as balance_total'),
                DB::raw('COALESCE(summary.bill_count, 0) as bill_count'),
                DB::raw('COALESCE(summary.payment_count, 0) as payment_count'),
                DB::raw('summary.latest_billed_date as latest_billed_date'),
                DB::raw('COALESCE(unbilled_dockings.unbilled_docking_total, 0) as unbilled_docking_total'),
                DB::raw('COALESCE(unbilled_banyera.unbilled_banyera_total, 0) as unbilled_banyera_total'),
                DB::raw('(COALESCE(summary.billed_total, 0) + COALESCE(unbilled_dockings.unbilled_docking_total, 0) + COALESCE(unbilled_banyera.unbilled_banyera_total, 0)) as total_billed'),
                DB::raw('(COALESCE(summary.balance_total, 0) + COALESCE(unbilled_dockings.unbilled_docking_total, 0) + COALESCE(unbilled_banyera.unbilled_banyera_total, 0)) as balance_due'),
            ]);

        return [$boatTotals, $paymentTotals];
    }

    private function transformStatementOwnerRecord(object $row): array
    {
        $balance = (float) ($row->balance_due ?? 0);
        $paid = (float) ($row->paid_total ?? 0);
        $status = $balance <= 0.009 ? 'paid' : ($paid > 0.009 ? 'partial' : 'pending');

        return [
            'owner_key' => (string) $row->owner_id,
            'owner_id' => (int) $row->owner_id,
            'owner_ids' => collect(explode(',', (string) ($row->owner_ids ?? $row->owner_id)))
                ->map(fn ($id) => (int) $id)
                ->filter()
                ->unique()
                ->values()
                ->all(),
            'owner_name' => trim((string) $row->owner_name) !== '' ? $row->owner_name : '-',
            'owner_created_at' => $row->owner_created_at,
            'owner_deleted_at' => $row->owner_deleted_at,
            'is_archived' => $row->owner_deleted_at !== null,
            'boat_count' => (int) ($row->boat_count ?? 0),
            'bill_count' => (int) ($row->bill_count ?? 0),
            'payment_count' => (int) ($row->payment_count ?? 0),
            'total_billed' => (float) ($row->total_billed ?? 0),
            'total_paid' => $paid,
            'balance_due' => $balance,
            'latest_billed_date' => $row->latest_billed_date,
            'statement_status' => $status,
            'statement_status_label' => match ($status) {
                'paid' => 'Paid',
                'partial' => 'Partial',
                default => 'Unpaid',
            },
            'boats' => [],
        ];
    }

    private function statementBoatRowsForOwners(array $ownerIds, ?array $period = null)
    {
        if (empty($ownerIds)) {
            return collect();
        }

        [$boatTotals] = $this->statementBoatTotalsSubqueries($period);

        return DB::query()
            ->fromSub($boatTotals, 'boat_statement_rows')
            ->whereIn('owner_id', $ownerIds)
            ->orderBy('boat_name')
            ->get()
            ->map(fn ($row) => $this->transformStatementBoatRecord($row))
            ->groupBy(fn ($row) => (int) ($row['owner_id'] ?? 0));
    }

    private function transformStatementBoatRecord(object $row): array
    {
        $balance = (float) ($row->balance_due ?? 0);
        $paid = (float) ($row->paid_total ?? 0);
        $status = $balance <= 0.009 ? 'paid' : ($paid > 0.009 ? 'partial' : 'pending');

        return [
            'boat_key' => (string) $row->boat_id,
            'boat_id' => $row->boat_id,
            'owner_id' => isset($row->owner_id) ? (int) $row->owner_id : null,
            'boat_name' => $row->boat_name ?: '-',
            'owner_name' => trim((string) $row->owner_name) !== '' ? $row->owner_name : '-',
            'boat_type' => $row->boat_type ?: '-',
            'boat_created_at' => $row->boat_created_at,
            'boat_deleted_at' => $row->boat_deleted_at ?? null,
            'is_archived' => ($row->boat_deleted_at ?? null) !== null,
            'total_billed' => (float) ($row->total_billed ?? 0),
            'total_paid' => $paid,
            'balance_due' => $balance,
            'bill_count' => (int) ($row->bill_count ?? 0),
            'payment_count' => (int) ($row->payment_count ?? 0),
            'latest_billed_date' => $row->latest_billed_date,
            'bills' => [],
            'unbilled_charges' => [],
            'statement_status' => $status,
            'statement_status_label' => match ($status) {
                'paid' => 'Paid',
                'partial' => 'Partial',
                default => 'Unpaid',
            },
        ];
    }

    private function statementBoatDetails(string $boatKey, ?array $period = null): ?array
    {
        $boatId = (int) $boatKey;
        if ($boatId <= 0) {
            return null;
        }

        $billsQuery = Bill::with([...$this->billRelations(), 'payments'])
            ->withCount('payments')
            ->withSum('payments as total_paid', 'amount_paid')
            ->where('boat_id', $boatId)
            ->latest('created_at');
        $this->applyStatementPeriod($billsQuery, 'created_at', $period);

        $bills = $billsQuery
            ->get()
            ->map(function (Bill $bill) {
                $this->transformBill($bill);
                $bill->setAttribute('bill_reference', substr((string) ($bill->bill_reference_no ?? ''), -6) ?: str_pad((string) $bill->bill_id, 6, '0', STR_PAD_LEFT));
                $bill->setAttribute('date_billed', $bill->created_at);
                $bill->setAttribute('line_items', $bill->items);

                return $bill;
            });

        $firstBill = $bills->first();
        $boat = $firstBill?->boat ?? Boat::withTrashed()->with(['owner', 'boatType'])->find($boatId);

        $unbilledCharges = collect();
        $billedDockingIds = BillItem::query()->whereNotNull('docking_id')->pluck('docking_id')->all();
        $billedBanyeraIds = BillItem::query()->whereNotNull('banyera_id')->pluck('banyera_id')->all();

        $unbilledDockingsQuery = Docking::query()
            ->where('boat_id', $boatId)
            ->whereNull('voided_at')
            ->when(!empty($billedDockingIds), fn ($query) => $query->whereNotIn('docking_id', $billedDockingIds))
            ->orderBy('docking_date');
        $this->applyStatementPeriod($unbilledDockingsQuery, 'docking_date', $period);
        $unbilledDockingsQuery->get()
            ->each(function (Docking $docking) use ($unbilledCharges) {
                $unbilledCharges->push([
                    'transaction_key' => 'unbilled-docking-' . $docking->docking_id,
                    'date' => optional($docking->docking_date)->toDateString(),
                    'bill_reference' => '-',
                    'reference' => '-',
                    'description' => 'Docking Fee',
                    'charge' => (float) $docking->docking_fee,
                    'payment' => 0,
                    'type' => 'Unbilled',
                ]);
            });

        $unbilledBanyeraQuery = BanyeraTransaction::query()
            ->where('boat_id', $boatId)
            ->whereNull('voided_at')
            ->when(!empty($billedBanyeraIds), fn ($query) => $query->whereNotIn('banyera_id', $billedBanyeraIds))
            ->orderBy('transaction_date');
        $this->applyStatementPeriod($unbilledBanyeraQuery, 'transaction_date', $period);
        $unbilledBanyeraQuery->get()
            ->each(function (BanyeraTransaction $transaction) use ($unbilledCharges) {
                $unbilledCharges->push([
                    'transaction_key' => 'unbilled-banyera-' . $transaction->banyera_id,
                    'date' => optional($transaction->transaction_date)->toDateString(),
                    'bill_reference' => '-',
                    'reference' => '-',
                    'description' => 'Banyera Fee',
                    'charge' => (float) $transaction->total_fee,
                    'payment' => 0,
                    'type' => 'Unbilled',
                ]);
            });

        $totalBilled = (float) $bills->sum('total_amount') + (float) $unbilledCharges->sum('charge');
        $totalPaid = (float) $bills->sum('amount_paid');
        $balance = max($totalBilled - $totalPaid, 0);
        $status = $balance <= 0.009 ? 'paid' : ($totalPaid > 0.009 ? 'partial' : 'pending');

        return [
            'boat_key' => (string) $boatId,
            'boat_id' => $boatId,
            'boat_name' => $boat?->boat_name ?? ($firstBill?->boat_name ?? '-'),
            'owner_name' => $boat?->owner?->full_name ?? ($firstBill?->payer_name ?? '-'),
            'boat_type' => $boat?->boatType?->type_name ?? '-',
            'boat_created_at' => $boat?->created_at,
            'boat_deleted_at' => $boat?->deleted_at,
            'is_archived' => $boat?->deleted_at !== null,
            'total_billed' => $totalBilled,
            'total_paid' => $totalPaid,
            'balance_due' => $balance,
            'bill_count' => $bills->count(),
            'payment_count' => (int) $bills->sum('payments_count'),
            'latest_billed_date' => $bills->max('created_at'),
            'bills' => $bills->values(),
            'unbilled_charges' => $unbilledCharges->sortBy('date')->values(),
            'statement_status' => $status,
            'statement_status_label' => match ($status) {
                'paid' => 'Paid',
                'partial' => 'Partial',
                default => 'Unpaid',
            },
        ];
    }

    private function transformBill(Bill $bill): Bill
    {
        $bill->createdBy?->append('full_name');
        $totalPaid = (float) ($bill->total_paid ?? 0);
        $balance = max((float) $bill->total_amount - $totalPaid, 0);

        $bill->setAttribute('bill_number', 'BILL-' . ($bill->bill_reference_no ?? str_pad((string) $bill->bill_id, 9, '0', STR_PAD_LEFT)));
        $bill->setAttribute('payer_name', $bill->boat?->owner?->full_name ?? $bill->boat?->boat_name ?? 'Unknown');
        $bill->setAttribute('boat_name', $bill->boat?->boat_name);
        $bill->setAttribute('created_by_name', $bill->createdBy?->full_name ?? $bill->createdBy?->email);
        $bill->setAttribute('payments_count', (int) ($bill->payments_count ?? ((bool) ($bill->has_payments ?? false) ? 1 : 0)));
        $bill->setAttribute('amount_paid', $totalPaid);
        $bill->setAttribute('balance', $balance);
        $bill->items->each(function (BillItem $item) {
            $transactionDate = match ($item->transaction_type) {
                'docking' => $item->docking?->docking_date,
                'banyera' => $item->banyeraTransaction?->transaction_date,
                default => null,
            };

            $item->setAttribute('transaction_date', $transactionDate);
        });
        $bill->setAttribute(
            'transaction_labels',
            $bill->items->map(function (BillItem $item) {
                return match ($item->transaction_type) {
                    'docking' => 'Docking',
                    'banyera' => 'Banyera',
                    default => ucfirst($item->transaction_type),
                };
            })->values()
        );
        $bill->setAttribute('transaction_summary', $bill->items->pluck('transaction_type')->unique()->values()->join(', '));

        return $bill;
    }

    private function transformCompactBill(Bill $bill): array
    {
        return [
            'bill_id' => $bill->bill_id,
            'bill_reference_no' => $bill->bill_reference_no,
            'boat_id' => $bill->boat_id,
            'total_amount' => (float) ($bill->total_amount ?? 0),
            'billing_date' => $bill->created_at,
            'created_at' => $bill->created_at,
        ];
    }

    private function billStats(Request $request): array
    {
        try {
            $today = now('Asia/Manila');
            $fiscalYear = $this->fiscalYear($request);
            $statsDate = $fiscalYear
                ? $today->copy()->year($fiscalYear)
                : $today;
            $billsQuery = Bill::query();
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
        } catch (\Exception $e) {
            // Return default stats if query times out or fails
            return [
                'total_records' => 0,
                'total_payment_records' => 0,
                'today_records' => 0,
                'today_payments' => 0,
            ];
        }
    }
}
