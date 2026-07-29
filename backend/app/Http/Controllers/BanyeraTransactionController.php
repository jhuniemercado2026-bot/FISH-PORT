<?php

namespace App\Http\Controllers;

use App\Models\BanyeraItem;
use App\Models\BanyeraTransaction;
use App\Models\BillItem;
use App\Models\Boat;
use App\Models\Fee;
use App\Models\FishClassification;
use App\Services\ActivityLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BanyeraTransactionController extends Controller
{
    private ?bool $banyeraItemsHasDaugColumn = null;

    private function manilaNow(): Carbon
    {
        return Carbon::now('Asia/Manila');
    }

    private function banyeraItemsHasDaugColumn(): bool
    {
        if ($this->banyeraItemsHasDaugColumn === null) {
            $this->banyeraItemsHasDaugColumn = Schema::hasColumn('banyera_items', 'daug');
        }

        return $this->banyeraItemsHasDaugColumn;
    }

    private function buildBanyeraItemAttributes(int $banyeraId, array $item): array
    {
        $attributes = [
            'banyera_id' => $banyeraId,
            'classification_id' => $item['classification_id'],
            'quantity' => $item['quantity'],
            'fee_id' => $item['fee_id'],
            'subtotal' => $item['subtotal'],
        ];

        if ($this->banyeraItemsHasDaugColumn()) {
            $attributes['daug'] = $item['daug'] ?? null;
        }

        return $attributes;
    }

    private function normalizeBanyeraItemPayload(array $items): array
    {
        $feeAmounts = Fee::query()
            ->whereIn('fee_id', collect($items)->pluck('fee_id')->filter()->unique()->values())
            ->pluck('amount', 'fee_id');

        return collect($items)->map(function (array $item) use ($feeAmounts) {
            $quantity = (int) ($item['quantity'] ?? 0);
            $feeAmount = (float) ($feeAmounts[$item['fee_id']] ?? 0);

            return [
                ...$item,
                'quantity' => $quantity,
                'subtotal' => $feeAmount * $quantity,
                'daug' => array_key_exists('daug', $item) ? $item['daug'] : null,
            ];
        })->values()->all();
    }

    private function calculateBanyeraItemsTotal(iterable $items): float
    {
        return (float) collect($items)->sum(function ($item) {
            return (float) (is_array($item) ? ($item['subtotal'] ?? 0) : ($item->subtotal ?? 0));
        });
    }

    private function appendTransactionState(BanyeraTransaction $transaction): BanyeraTransaction
    {
        $transaction->createdBy?->append('full_name');
        $transaction->voidedBy?->append('full_name');
        $transaction->setAttribute('transaction_date', $this->formatBanyeraDateValue($transaction->transaction_date));
        if ($transaction->relationLoaded('items')) {
            $transaction->setAttribute('total_fee', $this->calculateBanyeraItemsTotal($transaction->items));
        }
        $transaction->setAttribute('created_by_name', $transaction->createdBy?->full_name ?? $transaction->createdBy?->email);
        $transaction->setAttribute('voided_by_name', $transaction->voidedBy?->full_name ?? $transaction->voidedBy?->email);
        $transaction->setAttribute('is_voided', !is_null($transaction->voided_at));
        $transaction->setAttribute('status', !is_null($transaction->voided_at) ? 'voided' : 'active');
        $transaction->setAttribute(
            'is_billed',
            array_key_exists('billed_exists', $transaction->getAttributes())
                ? (bool) $transaction->billed_exists
                : $this->banyeraIsBilled($transaction->banyera_id)
        );

        return $transaction;
    }

    private function loadTransactionRelations(BanyeraTransaction $transaction): void
    {
        $transaction->load([
            'boat.owner',
            'boat.boatType',
            'items.classification',
            'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
            'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
        ]);
    }

    private function applyBoatFilter($query, Request $request): void
    {
        $boatId = trim((string) $request->query('boat_id', ''));

        if ($boatId !== '' && $boatId !== 'all' && ctype_digit($boatId)) {
            $query->where('banyera_transactions.boat_id', (int) $boatId);
        }
    }

    private function compactTransactionForBilling(BanyeraTransaction $transaction): array
    {
        return [
            'banyera_id' => $transaction->banyera_id,
            'boat_id' => $transaction->boat_id,
            'boat' => $transaction->boat ? [
                'boat_id' => $transaction->boat->boat_id,
                'boat_name' => $transaction->boat->boat_name,
            ] : null,
            'transaction_date' => $this->formatBanyeraDateValue($transaction->transaction_date),
            'total_fee' => $transaction->total_fee,
            'is_billed' => (bool) ($transaction->billed_exists ?? false),
        ];
    }

    private function resolveActiveBoatForBanyera(int $boatId): ?Boat
    {
        return Boat::query()
            ->where('status', 'active')
            ->find($boatId);
    }

    private function formatBanyeraDateLabel($value): string
    {
        return $value ? Carbon::parse($value, 'Asia/Manila')->format('F j, Y') : 'blank';
    }

    private function formatBanyeraDateValue($value): ?string
    {
        return $value ? Carbon::parse($value, 'Asia/Manila')->format('Y-m-d H:i:s') : null;
    }

    private function summarizeBanyeraItems(iterable $items): array
    {
        return collect($items)->map(function ($item) {
            $isArray = is_array($item);
            $name =
                (!$isArray ? $item->classification?->classification_name : null) ??
                ($isArray ? ($item['classification_name'] ?? null) : null) ??
                ($isArray ? ($item['classification_id'] ?? null) : ($item->classification_id ?? null)) ??
                'Unknown';
            $quantity = $isArray ? ($item['quantity'] ?? 0) : ($item->quantity ?? 0);
            $subtotal = number_format((float) ($isArray ? ($item['subtotal'] ?? 0) : ($item->subtotal ?? 0)), 2);

            return $name . ' x' . $quantity . ' (PHP ' . $subtotal . ')';
        })->values()->all();
    }

    private function banyeraDateIsInFuture($dateTimeValue): bool
    {
        if (!$dateTimeValue) {
            return false;
        }

        $transactionDate = Carbon::parse($dateTimeValue, 'Asia/Manila')->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        return $transactionDate > $today;
    }

    private function banyeraIsToday($dateTimeValue): bool
    {
        if (!$dateTimeValue) {
            return false;
        }

        $transactionDate = Carbon::parse($dateTimeValue, 'Asia/Manila')->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        return $transactionDate === $today;
    }

    private function banyeraExistsForBoatOnDate($boatId, $transactionDate, $excludeBanyeraId = null): bool
    {
        $date = Carbon::parse($transactionDate, 'Asia/Manila')->toDateString();

        $query = BanyeraTransaction::where('boat_id', $boatId)
            ->whereNull('voided_at')
            ->whereDate('transaction_date', $date);

        if ($excludeBanyeraId) {
            $query->where('banyera_id', '!=', $excludeBanyeraId);
        }

        return $query->exists();
    }

    private function banyeraIsBilled($banyeraId): bool
    {
        return BillItem::where('banyera_id', $banyeraId)->exists();
    }

    private function banyeraStats(Request $request): array
    {
        $today = Carbon::now('Asia/Manila');
        $fiscalYear = $this->fiscalYear($request);
        $statsDate = $fiscalYear
            ? $today->copy()->year($fiscalYear)->toDateString()
            : $today->toDateString();
        $activeQuery = BanyeraTransaction::query()->whereNull('voided_at');
        $this->applyFiscalYear($activeQuery, $request, 'banyera_transactions.transaction_date');

        $todayTotalFeeQuery = DB::table('banyera_transactions as transactions')
            ->leftJoin('banyera_items as items', 'items.banyera_id', '=', 'transactions.banyera_id')
            ->whereNull('transactions.voided_at')
            ->whereDate('transactions.transaction_date', $statsDate);

        $this->applyFiscalYear($todayTotalFeeQuery, $request, 'transactions.transaction_date');

        return [
            'total_records' => (clone $activeQuery)->count(),
            'today_count' => (clone $activeQuery)->whereDate('transaction_date', $statsDate)->count(),
            'today_total_fee' => (float) $todayTotalFeeQuery->sum('items.subtotal'),
        ];
    }

    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('banyera_transactions.banyera_id', (int) $highlightId)
            ->first([
                'banyera_transactions.banyera_id',
                'banyera_transactions.transaction_date',
                'banyera_transactions.created_at',
            ]);

        if (!$target?->transaction_date || !$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('banyera_transactions.transaction_date', '>', $target->transaction_date)
                    ->orWhere(function ($dateTieQuery) use ($target) {
                        $dateTieQuery
                            ->where('banyera_transactions.transaction_date', $target->transaction_date)
                            ->where(function ($createdTieQuery) use ($target) {
                                $createdTieQuery
                                    ->where('banyera_transactions.created_at', '>', $target->created_at)
                                    ->orWhere(function ($idTieQuery) use ($target) {
                                        $idTieQuery
                                            ->where('banyera_transactions.created_at', $target->created_at)
                                            ->where('banyera_transactions.banyera_id', '>', $target->banyera_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    private function highlightedClassificationPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('classification_id', (int) $highlightId)
            ->first(['classification_id', 'classification_name']);

        if (!$target?->classification_name) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('classification_name', '<', $target->classification_name)
                    ->orWhere(function ($nameTieQuery) use ($target) {
                        $nameTieQuery
                            ->where('classification_name', $target->classification_name)
                            ->where('classification_id', '<', $target->classification_id);
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        $includeVoided = $request->boolean('include_voided');
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);

        if ($request->boolean('all') && $request->boolean('compact')) {
            $compactQuery = BanyeraTransaction::query()
                ->select([
                    'banyera_transactions.banyera_id',
                    'banyera_transactions.boat_id',
                    'banyera_transactions.transaction_date',
                    'banyera_transactions.total_fee',
                    'banyera_transactions.voided_at',
                    'banyera_transactions.created_at',
                ])
                ->with('boat:boat_id,boat_name')
                ->withExists(['billItems as billed_exists'])
                ->when(!$includeVoided, fn ($filtered) => $filtered->whereNull('banyera_transactions.voided_at'))
                ->tableFilters(
                    $request->query('search', ''),
                    $request->query('status', 'all'),
                    $request->query('period', 'all'),
                    $request->query('fish_type', 'all')
                )
                ->tableSort($request->query('sort', 'transaction_date_desc'));

            $this->applyBoatFilter($compactQuery, $request);
            $this->applyFiscalYear($compactQuery, $request, 'banyera_transactions.transaction_date');

            $transactions = $compactQuery->get();

            return response()->json(
                $transactions->map(fn (BanyeraTransaction $transaction) => $this->compactTransactionForBilling($transaction))->values()
            );
        }

        $query = BanyeraTransaction::query()
            ->forTableIndex($includeVoided)
            ->tableFilters(
                $request->query('search', ''),
                $request->query('status', 'all'),
                $request->query('period', 'all'),
                $request->query('fish_type', 'all')
            )
            ->tableSort($request->query('sort', 'transaction_date_desc'));
        $this->applyBoatFilter($query, $request);
        $this->applyFiscalYear($query, $request, 'banyera_transactions.transaction_date');

        if ($request->boolean('all')) {
            $transactions = $query->get();
            $transactions->each(fn ($transaction) => $this->appendTransactionState($transaction));

            return response()->json(
                $transactions->map(fn (BanyeraTransaction $t) => $this->transformTransaction($t))->values()
            );
        }

        $page = $this->highlightedPage($query, $request->query('highlight_banyera_id'), $page, $perPage);
        $transactions = $query->paginate($perPage, ['*'], 'page', $page);

        $transactions->getCollection()->transform(function ($transaction) {
            return $this->appendTransactionState($transaction);
        });

        return response()->json([
            'data' => collect($transactions->items())->map(fn ($t) => $this->transformTransaction($t))->values()->all(),
            'meta' => [
                'current_page' => $transactions->currentPage(),
                'last_page' => $transactions->lastPage(),
                'per_page' => $transactions->perPage(),
                'total' => $transactions->total(),
                'from' => $transactions->firstItem(),
                'to' => $transactions->lastItem(),
            ],
            'stats' => $this->banyeraStats($request),
        ]);
    }

    public function classifications()
    {
        $request = request();
        $fiscalYear = $this->fiscalYear($request);

        $query = FishClassification::query()
            ->with('createdBy:user_id,first_name,last_name,email')
            ->withCount(['banyeraItems as fish_using_count' => function ($q) use ($fiscalYear) {
                $q->whereHas('transaction', function ($t) use ($fiscalYear) {
                    if ($fiscalYear) {
                        $t->whereYear('transaction_date', $fiscalYear);
                    }
                    $t->whereNull('voided_at');
                });
            }])
            ->active();

        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');

        $summaryQuery = (clone $query);
        $summaryActiveTotal = (clone $summaryQuery)->count();
        $summaryTotal = FishClassification::withTrashed()->count();
        $summaryUsed = (clone $summaryQuery)
            ->whereHas('banyeraItems', function ($qi) use ($fiscalYear) {
                $qi->whereHas('transaction', function ($t) use ($fiscalYear) {
                    if ($fiscalYear) {
                        $t->whereYear('transaction_date', $fiscalYear);
                    }
                    $t->whereNull('voided_at');
                });
            })
            ->count();
        $summaryUnused = max(0, $summaryActiveTotal - $summaryUsed);

        if ($search !== '') {
            $query->where('classification_name', 'like', "{$search}%");
        }

        if (in_array($status, ['used', 'active'], true)) {
            $query->whereHas('banyeraItems', function ($qi) use ($fiscalYear) {
                $qi->whereHas('transaction', function ($t) use ($fiscalYear) {
                    if ($fiscalYear) {
                        $t->whereYear('transaction_date', $fiscalYear);
                    }
                    $t->whereNull('voided_at');
                });
            });
        } elseif (in_array($status, ['unused', 'inactive'], true)) {
            $query->whereDoesntHave('banyeraItems', function ($qi) use ($fiscalYear) {
                $qi->whereHas('transaction', function ($t) use ($fiscalYear) {
                    if ($fiscalYear) {
                        $t->whereYear('transaction_date', $fiscalYear);
                    }
                    $t->whereNull('voided_at');
                });
            });
        }

        $query->orderBy('classification_name')->orderBy('classification_id');

        if ($request->boolean('paginated')) {
            $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
            $page = max((int) $request->query('page', 1), 1);
            $page = $this->highlightedClassificationPage($query, $request->query('highlight_classification_id'), $page, $perPage);
            $classifications = $query->paginate($perPage, ['*'], 'page', $page);

            $classifications->getCollection()->each(fn ($classification) => $classification->createdBy?->append('full_name'));

            return response()->json([
                'data' => collect($classifications->items())->map(fn($c) => $this->transformClassification($c))->values()->all(),
                'meta' => [
                    'current_page' => $classifications->currentPage(),
                    'last_page' => $classifications->lastPage(),
                    'per_page' => $classifications->perPage(),
                    'total' => $classifications->total(),
                    'from' => $classifications->firstItem(),
                    'to' => $classifications->lastItem(),
                ],
                'summary' => [
                    'total' => $summaryTotal,
                    'used' => $summaryUsed,
                    'unused' => $summaryUnused,
                ],
            ]);
        }

        $list = $query->get()->each(fn ($classification) => $classification->createdBy?->append('full_name'));

        return response()->json([
            'data' => collect($list)->map(fn($c) => $this->transformClassification($c))->values()->all(),
            'summary' => [
                'total' => $summaryTotal,
                'used' => $summaryUsed,
                'unused' => $summaryUnused,
            ],
        ]);
    }

    public function storeClassification(Request $request)
    {
        $validated = $request->validate([
            'classification_name' => [
                'required',
                'string',
                'max:50',
                Rule::unique('fish_classifications', 'classification_name')->whereNull('deleted_at'),
            ],
        ]);

        $classification = FishClassification::create([
            'classification_name' => trim($validated['classification_name']),
            'created_by' => Auth::id(),
        ]);

        $classification->load('createdBy:user_id,first_name,last_name,email');
        $classification->loadCount('activeBanyeraItems as fish_using_count');
        $classification->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Banyera',
            details: 'Created fish classification "' . $classification->classification_name . '".',
            user: Auth::user()
        );

        return response()->json($this->transformClassification($classification), 201);
    }

    public function updateClassification(Request $request, $id)
    {
        $classification = FishClassification::query()->findOrFail($id);

        $validated = $request->validate([
            'classification_name' => [
                'required',
                'string',
                'max:50',
                Rule::unique('fish_classifications', 'classification_name')
                    ->ignore($classification->classification_id, 'classification_id')
                    ->whereNull('deleted_at'),
            ],
        ]);

        $classification->update([
            'classification_name' => trim($validated['classification_name']),
        ]);

        $classification->load('createdBy:user_id,first_name,last_name,email');
        $classification->loadCount('activeBanyeraItems as fish_using_count');
        $classification->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Banyera',
            details: 'Updated fish classification "' . $classification->classification_name . '".',
            user: Auth::user()
        );

        return response()->json($this->transformClassification($classification));
    }

    public function destroyClassification($id)
    {
        $classification = FishClassification::query()->findOrFail($id);

        $classificationName = $classification->classification_name;
        $classification->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Banyera',
            details: 'Archived fish classification "' . $classificationName . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Fish classification archived successfully.']);
    }

    public function restoreClassification($id)
    {
        $classification = FishClassification::onlyTrashed()->findOrFail($id);
        $classificationName = $classification->classification_name;
        $classification->restore();

        $classification->load('createdBy:user_id,first_name,last_name,email');
        $classification->loadCount('activeBanyeraItems as fish_using_count');
        $classification->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Banyera',
            details: 'Restored fish classification "' . $classificationName . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Fish classification restored successfully.',
            'classification' => $this->transformClassification($classification),
        ]);
    }

    private function transformClassification($classification): array
    {
        $createdBy = $classification->createdBy ? [
            'user_id' => $classification->createdBy->user_id,
            'email' => $classification->createdBy->email ?? null,
            'first_name' => $classification->createdBy->first_name ?? null,
            'last_name' => $classification->createdBy->last_name ?? null,
            'full_name' => $classification->createdBy->full_name ?? trim(($classification->createdBy->first_name ?? '') . ' ' . ($classification->createdBy->last_name ?? '')),
            'role' => $classification->createdBy->role ?? null,
            'status' => $classification->createdBy->status ?? null,
        ] : null;

        return [
            'classification_id' => $classification->classification_id,
            'created_at' => $classification->created_at,
            'updated_at' => $classification->updated_at,
            'deleted_at' => $classification->deleted_at ?? null,
            'classification_name' => $classification->classification_name,
            'created_by' => $createdBy,
            'fish_using_count' => $classification->fish_using_count ?? 0,
        ];
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'boat_id' => [
                'required',
                'integer',
                Rule::exists('boats', 'boat_id')->whereNull('deleted_at'),
            ],
            'transaction_date' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.classification_id' => 'required|integer|exists:fish_classifications,classification_id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.fee_id' => 'required|integer|exists:fees,fee_id',
            'items.*.subtotal' => 'nullable|numeric|min:0',
            'items.*.daug' => 'nullable|numeric|min:0',
        ]);

        $transactionDate = $validated['transaction_date'] ?? $this->manilaNow()->format('Y-m-d H:i:s');

        if ($this->banyeraDateIsInFuture($transactionDate)) {
            return response()->json([
                'message' => 'Banyera date cannot be in the future.',
                'errors' => [
                    'transaction_date' => ['Banyera date cannot be in the future.'],
                ],
            ], 422);
        }

        if (!$this->resolveActiveBoatForBanyera((int) $validated['boat_id'])) {
            return response()->json([
                'message' => 'Only active boats can be used for Banyera transactions.',
                'errors' => [
                    'boat_id' => ['Only active boats can be used for Banyera transactions.'],
                ],
            ], 422);
        }

        if ($this->banyeraExistsForBoatOnDate($validated['boat_id'], $transactionDate)) {
            return response()->json([
                'message' => 'A banyera record already exists for this boat on this date.',
            ], 422);
        }

        $transaction = DB::transaction(function () use ($validated, $transactionDate) {
            $itemPayload = $this->normalizeBanyeraItemPayload($validated['items'] ?? []);
            $totalFee = $this->calculateBanyeraItemsTotal($itemPayload);

            $transaction = BanyeraTransaction::create([
                'boat_id' => $validated['boat_id'],
                'transaction_date' => $transactionDate,
                'total_fee' => $totalFee,
                'created_by' => Auth::id(),
            ]);

            foreach ($itemPayload as $item) {
                BanyeraItem::create($this->buildBanyeraItemAttributes($transaction->banyera_id, $item));
            }

            $this->loadTransactionRelations($transaction);
            return $transaction;
        });

        $this->appendTransactionState($transaction);

        return response()->json($this->transformTransaction($transaction), 201);
    }

    public function update(Request $request, $id)
    {
        $transaction = BanyeraTransaction::query()
            ->with(['boat', 'items.classification'])
            ->findOrFail($id);

        if (!is_null($transaction->voided_at)) {
            return response()->json([
                'message' => 'This banyera transaction has already been voided and can no longer be updated.',
            ], 422);
        }

        if ($request->boolean('editable_only') || $request->boolean('daug_only')) {
            $validated = $request->validate([
                'items' => 'nullable|array',
                'items.*.item_id' => 'required|integer|exists:banyera_items,item_id',
                'items.*.daug' => 'nullable|numeric|min:0',
            ]);

            $itemPayload = $validated['items'] ?? [];
            $existingItems = BanyeraItem::query()
                ->where('banyera_id', $transaction->banyera_id)
                ->pluck('item_id')
                ->map(fn ($itemId) => (int) $itemId)
                ->all();

            foreach ($itemPayload as $item) {
                if (!in_array((int) $item['item_id'], $existingItems, true)) {
                    return response()->json([
                        'message' => 'One or more banyera items do not belong to this transaction.',
                    ], 422);
                }
            }

            DB::transaction(function () use ($validated, $itemPayload, $transaction) {
                foreach ($itemPayload as $item) {
                    BanyeraItem::query()
                        ->where('item_id', $item['item_id'])
                        ->update(['daug' => $item['daug'] ?? null]);
                }
            });

            $updatedTransaction = BanyeraTransaction::query()
                ->with([
                    'boat.owner',
                    'boat.boatType',
                    'items.classification',
                    'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
                    'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
                ])
                ->findOrFail($transaction->banyera_id);

            app(ActivityLogService::class)->log(
                action: 'UPDATE',
                module: 'Banyera',
                details: 'Updated daug values for banyera transaction #' . $transaction->banyera_id . '.',
                user: Auth::user()
            );

            $this->appendTransactionState($updatedTransaction);

            return response()->json($updatedTransaction);
        }

        if ($this->banyeraIsBilled($transaction->banyera_id)) {
            return response()->json([
                'message' => 'This banyera transaction has been billed and can no longer be updated.',
            ], 422);
        }

        $validated = $request->validate([
            'boat_id' => 'required|integer|exists:boats,boat_id',
            'transaction_date' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.classification_id' => 'required|integer|exists:fish_classifications,classification_id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.fee_id' => 'required|integer|exists:fees,fee_id',
            'items.*.subtotal' => 'nullable|numeric|min:0',
            'items.*.daug' => 'nullable|numeric|min:0',
        ]);

        if ($this->banyeraDateIsInFuture($validated['transaction_date'] ?? $transaction->transaction_date)) {
            return response()->json([
                'message' => 'Banyera date cannot be in the future.',
                'errors' => [
                    'transaction_date' => ['Banyera date cannot be in the future.'],
                ],
            ], 422);
        }

        $boatIdChanged = $transaction->boat_id != $validated['boat_id'];

        if ($boatIdChanged && !$this->resolveActiveBoatForBanyera((int) $validated['boat_id'])) {
            return response()->json([
                'message' => 'Only active boats can be used for Banyera transactions.',
                'errors' => [
                    'boat_id' => ['Only active boats can be used for Banyera transactions.'],
                ],
            ], 422);
        }

        $dateChanged = Carbon::parse($transaction->transaction_date)->toDateString() !== Carbon::parse($validated['transaction_date'] ?? $transaction->transaction_date)->toDateString();

        if (
            ($boatIdChanged || $dateChanged)
            && $this->banyeraExistsForBoatOnDate(
                $validated['boat_id'],
                $validated['transaction_date'] ?? $transaction->transaction_date,
                $transaction->banyera_id
            )
        ) {
            return response()->json([
                'message' => 'A banyera record already exists for this boat on this date.',
            ], 422);
        }

        $beforeState = [
            'boat' => $transaction->boat?->boat_name ?? ('Boat #' . $transaction->boat_id),
            'transaction_date' => $this->formatBanyeraDateLabel($transaction->transaction_date),
            'items' => $this->summarizeBanyeraItems($transaction->items),
            'total_fee' => number_format((float) $transaction->total_fee, 2),
        ];

        $updatedTransaction = DB::transaction(function () use ($validated, $transaction) {
            $itemPayload = $this->normalizeBanyeraItemPayload($validated['items'] ?? []);
            $totalFee = $this->calculateBanyeraItemsTotal($itemPayload);

            $transaction->update([
                'boat_id' => $validated['boat_id'],
                'transaction_date' => $validated['transaction_date'] ?? $transaction->transaction_date,
                'total_fee' => $totalFee,
            ]);

            BanyeraItem::query()->where('banyera_id', $transaction->banyera_id)->delete();

            foreach ($itemPayload as $item) {
                BanyeraItem::create($this->buildBanyeraItemAttributes($transaction->banyera_id, $item));
            }

            return $this->loadTransactionRelations($transaction);
        });

        $afterState = [
            'boat' => $updatedTransaction->boat?->boat_name ?? ('Boat #' . $updatedTransaction->boat_id),
            'transaction_date' => $this->formatBanyeraDateLabel($updatedTransaction->transaction_date),
            'items' => $this->summarizeBanyeraItems($updatedTransaction->items),
            'total_fee' => number_format((float) $updatedTransaction->total_fee, 2),
        ];

        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $beforeState,
            $afterState,
            [
                'boat' => 'Boat',
                'transaction_date' => 'Date',
                'items' => 'Banyera items',
                'total_fee' => 'Total fee',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Banyera',
            details: 'Updated banyera transaction #' . $transaction->banyera_id . ($changeDetails !== '' ? ': ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        $this->appendTransactionState($updatedTransaction);

        return response()->json($this->transformTransaction($updatedTransaction));
    }

    public function void($id)
    {
        $transaction = BanyeraTransaction::with([
            'boat.owner',
            'boat.boatType',
            'items.classification',
            'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
            'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
        ])
            ->findOrFail($id);

        if (!is_null($transaction->voided_at)) {
            return response()->json([
                'message' => 'This banyera transaction has already been voided.',
            ], 422);
        }

        $validated = request()->validate([
            'void_reason' => 'required|string|max:500',
        ]);

        if ($this->banyeraIsBilled($transaction->banyera_id)) {
            return response()->json([
                'message' => 'This banyera transaction has been billed and can no longer be voided.',
            ], 422);
        }

        $transaction->update([
            'void_reason' => trim($validated['void_reason']),
            'voided_at' => $this->manilaNow(),
            'voided_by' => Auth::id(),
        ]);

        $this->loadTransactionRelations($transaction);
        $this->appendTransactionState($transaction);

        app(ActivityLogService::class)->log(
            action: 'VOID',
            module: 'Banyera',
            details: 'Voided banyera transaction #' . $transaction->banyera_id . ' with reason: "' . trim($validated['void_reason']) . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Banyera transaction voided successfully.',
            'transaction' => $this->transformTransaction($transaction),
        ]);
    }

    public function unvoid($id)
    {
        $transaction = BanyeraTransaction::with([
            'boat.owner',
            'boat.boatType',
            'items.classification',
            'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
            'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
        ])
            ->findOrFail($id);

        if (is_null($transaction->voided_at)) {
            return response()->json([
                'message' => 'This banyera transaction is not voided.',
            ], 422);
        }

        if ($this->banyeraIsBilled($transaction->banyera_id)) {
            return response()->json([
                'message' => 'This banyera transaction has been billed and can no longer be restored.',
            ], 422);
        }

        if (!$this->banyeraIsToday($transaction->transaction_date)) {
            return response()->json([
                'message' => "Only today's banyera records can be restored.",
            ], 422);
        }

        $transaction->update([
            'void_reason' => null,
            'voided_at' => null,
            'voided_by' => null,
        ]);

        $this->loadTransactionRelations($transaction);
        $this->appendTransactionState($transaction);

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Banyera',
            details: 'Restored voided banyera transaction #' . $transaction->banyera_id . '.',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Banyera transaction restored successfully.',
            'transaction' => $this->transformTransaction($transaction),
        ]);
    }

    public function destroy($id)
    {
        return response()->json([
            'message' => 'Banyera transactions cannot be deleted or archived.',
        ], 422);
    }



    private function transformTransaction(BanyeraTransaction $transaction): array
    {
        $transaction->createdBy?->append('full_name');
        $transaction->voidedBy?->append('full_name');

        $boat = null;
        if ($transaction->boat) {
            $boat = [
                'boat_id' => $transaction->boat->boat_id,
                'boat_name' => $transaction->boat->boat_name,
                'owner_id' => $transaction->boat->owner_id,
                'boat_type_id' => $transaction->boat->boat_type_id,
                'status' => $transaction->boat->status,
                'owner' => $transaction->boat->owner ? [
                    'owner_id' => $transaction->boat->owner->owner_id,
                    'owner_firstname' => $transaction->boat->owner->owner_firstname,
                    'owner_lastname' => $transaction->boat->owner->owner_lastname,
                    'deleted_at' => $transaction->boat->owner->deleted_at ?? null,
                    'full_name' => $transaction->boat->owner->full_name ?? trim(($transaction->boat->owner->owner_firstname ?? '') . ' ' . ($transaction->boat->owner->owner_lastname ?? '')),
                ] : null,
                'boat_type' => $transaction->boat->boatType ? [
                    'boat_type_id' => $transaction->boat->boatType->boat_type_id,
                    'type_name' => $transaction->boat->boatType->type_name,
                    'deleted_at' => $transaction->boat->boatType->deleted_at ?? null,
                ] : null,
            ];
        }

        $items = collect($transaction->items ?? [])->map(function ($item) {
            $isArray = is_array($item);
            $classification = $isArray ? ($item['classification'] ?? null) : ($item->classification ?? null);

            return [
                'item_id' => $isArray ? ($item['item_id'] ?? null) : ($item->item_id ?? null),
                'banyera_id' => $isArray ? ($item['banyera_id'] ?? null) : ($item->banyera_id ?? null),
                'classification_id' => $isArray ? ($item['classification_id'] ?? null) : ($item->classification_id ?? null),
                'quantity' => $isArray ? ($item['quantity'] ?? 0) : ($item->quantity ?? 0),
                'fee_id' => $isArray ? ($item['fee_id'] ?? null) : ($item->fee_id ?? null),
                'subtotal' => number_format((float) ($isArray ? ($item['subtotal'] ?? 0) : ($item->subtotal ?? 0)), 2),
                'daug' => $isArray ? ($item['daug'] ?? null) : ($item->daug ?? null),
                'classification' => $classification ? [
                    'classification_id' => $classification->classification_id ?? ($classification['classification_id'] ?? null),
                    'classification_name' => $classification->classification_name ?? ($classification['classification_name'] ?? null),
                ] : null,
            ];
        })->values()->all();

        $createdBy = $transaction->createdBy ? [
            'user_id' => $transaction->createdBy->user_id,
            'first_name' => $transaction->createdBy->first_name,
            'last_name' => $transaction->createdBy->last_name,
            'email' => $transaction->createdBy->email ?? null,
            'full_name' => $transaction->createdBy->full_name ?? trim(($transaction->createdBy->first_name ?? '') . ' ' . ($transaction->createdBy->last_name ?? '')),
        ] : null;

        $voidedBy = $transaction->voidedBy ? [
            'user_id' => $transaction->voidedBy->user_id,
            'first_name' => $transaction->voidedBy->first_name,
            'last_name' => $transaction->voidedBy->last_name,
            'email' => $transaction->voidedBy->email ?? null,
            'full_name' => $transaction->voidedBy->full_name ?? trim(($transaction->voidedBy->first_name ?? '') . ' ' . ($transaction->voidedBy->last_name ?? '')),
        ] : null;

        return [
            'banyera_id' => $transaction->banyera_id,
            'boat_id' => $transaction->boat_id,
            'transaction_date' => $transaction->transaction_date,
            'total_fee' => number_format((float) ($transaction->total_fee ?? 0), 2),
            'createdBy' => $createdBy,
            'void_reason' => $transaction->void_reason ?? null,
            'voided_at' => $transaction->voided_at ?? null,
            'voided_by' => $transaction->voided_by ?? null,
            'voidedBy' => $voidedBy,
            'created_at' => $transaction->created_at,
            'updated_at' => $transaction->updated_at,
            'billed_exists' => array_key_exists('billed_exists', $transaction->getAttributes()) ? (bool) $transaction->billed_exists : null,
            'created_by_name' => $transaction->created_by_name ?? null,
            'voided_by_name' => $transaction->voided_by_name ?? null,
            'is_voided' => $transaction->is_voided ?? (!is_null($transaction->voided_at)),
            'status' => $transaction->status ?? (!is_null($transaction->voided_at) ? 'voided' : 'active'),
            'is_billed' => $transaction->is_billed ?? (array_key_exists('billed_exists', $transaction->getAttributes()) ? (bool) $transaction->billed_exists : $this->banyeraIsBilled($transaction->banyera_id)),
            'boat' => $boat,
            'items' => $items,
        ];
    }
}
