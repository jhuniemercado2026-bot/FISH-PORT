<?php

namespace App\Http\Controllers;

use App\Events\MasterDataUpdated;
use App\Enums\FeeTypeName;
use App\Jobs\SendFeeChangeInspectorNotifications;
use App\Models\Fee;
use App\Services\ActivityLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class FeeController extends Controller
{
    private function getFeeTypeLabel(Fee $fee): string
    {
        return $fee->fee_name ?? ($fee->fee_type_name?->value ?? 'Unknown Fee');
    }

    private function formatFeeApplicableLabel(Fee $fee): string
    {
        if ($fee->vehicleType?->type_name) {
            return $fee->vehicleType->type_name;
        }

        if ($fee->boatType?->type_name) {
            return $fee->boatType->type_name;
        }

        return 'General';
    }

    private function syncPreviousFeeEffectivityForPending(array $validated, ?int $ignoreFeeId = null): void
    {
        $effectiveFrom = $validated['effective_from'];
        $today = now()->toDateString();

        if ($effectiveFrom <= $today) {
            return;
        }

        $boatTypeId = ($validated['vehicle_type_id'] ?? null) ? null : ($validated['boat_type_id'] ?? null);
        $vehicleTypeId = $validated['vehicle_type_id'] ?? null;
        $replacementEndDate = Carbon::parse($effectiveFrom)->subDay()->toDateString();

        $currentActiveFeeQuery = Fee::query()
            ->where('fee_type_name', $validated['fee_type_name'])
            ->where('boat_type_id', $boatTypeId)
            ->where('vehicle_type_id', $vehicleTypeId)
            ->where('effective_from', '<=', $today)
            ->where(function ($query) use ($today) {
                $query
                    ->whereNull('effective_to')
                    ->orWhere('effective_to', '>=', $today);
            })
            ->latest('effective_from')
            ->latest('created_at');

        if ($ignoreFeeId) {
            $currentActiveFeeQuery->where('fee_id', '!=', $ignoreFeeId);
        }

        $currentActiveFee = $currentActiveFeeQuery->first();

        if (!$currentActiveFee) {
            return;
        }

        if ($currentActiveFee->effective_to && $currentActiveFee->effective_to->toDateString() <= $replacementEndDate) {
            return;
        }

        $currentActiveFee->update([
            'effective_to' => $replacementEndDate,
        ]);
    }

    private function validateFeeEffectivityWindow(array $validated, ?int $ignoreFeeId = null): void
    {
        $boatTypeId = ($validated['vehicle_type_id'] ?? null) ? null : ($validated['boat_type_id'] ?? null);
        $vehicleTypeId = $validated['vehicle_type_id'] ?? null;
        $effectiveFrom = $validated['effective_from'];
        $effectiveTo = $validated['effective_to'] ?? null;
        $today = now()->toDateString();

        $overlappingFeeQuery = Fee::query()
            ->where('fee_type_name', $validated['fee_type_name'])
            ->where('boat_type_id', $boatTypeId)
            ->where('vehicle_type_id', $vehicleTypeId);

        if ($ignoreFeeId) {
            $overlappingFeeQuery->where('fee_id', '!=', $ignoreFeeId);
        }

        $overlappingFeeQuery->where(function ($query) use ($effectiveFrom, $effectiveTo) {
            $query
                ->where(function ($innerQuery) use ($effectiveFrom) {
                    $innerQuery
                        ->where('effective_from', '<=', $effectiveFrom)
                        ->where(function ($endQuery) use ($effectiveFrom) {
                            $endQuery
                                ->whereNull('effective_to')
                                ->orWhere('effective_to', '>=', $effectiveFrom);
                        });
                })
                ->orWhere(function ($innerQuery) use ($effectiveFrom, $effectiveTo) {
                    if (!$effectiveTo) {
                        $innerQuery
                            ->where('effective_from', '>=', $effectiveFrom);

                        return;
                    }

                    $innerQuery
                        ->where('effective_from', '<=', $effectiveTo)
                        ->where(function ($endQuery) use ($effectiveFrom) {
                            $endQuery
                                ->whereNull('effective_to')
                                ->orWhere('effective_to', '>=', $effectiveFrom);
                        });
                });
        });

        $overlappingFees = $overlappingFeeQuery->get();

        if ($effectiveFrom > $today) {
            $conflicts = $overlappingFees->filter(function (Fee $fee) use ($today) {
                $feeEffectiveFrom = $fee->effective_from?->toDateString();
                $feeEffectiveTo = $fee->effective_to?->toDateString();

                $isCurrentActiveFee =
                    $feeEffectiveFrom &&
                    $feeEffectiveFrom <= $today &&
                    (!$feeEffectiveTo || $feeEffectiveTo >= $today);

                return !$isCurrentActiveFee;
            });

            if ($conflicts->isEmpty()) {
                return;
            }
        } elseif ($overlappingFees->isEmpty()) {
            return;
        }

        if (!$overlappingFees->isEmpty()) {
            abort(response()->json([
                'message' => 'A fee with the same type and applicable record is still within its effective period. End the current fee effectivity first before adding or updating this one.',
                'errors' => [
                    'effective_from' => [
                        'A fee with the same type and applicable record is still within its effective period.',
                    ],
                ],
            ], 422));
        }
    }

    private function feeSelectionColumns(): array
    {
        return [
            'fee_id',
            'fee_type_name',
            'boat_type_id',
            'vehicle_type_id',
            'amount',
            'effective_from',
            'effective_to',
            'created_at',
        ];
    }

    private function prepareFeeForResponse(Fee $fee): array
    {
        $fee->loadMissing([
            'boatType:boat_type_id,type_name',
            'vehicleType:vehicle_type_id,type_name,deleted_at',
        ]);

        return [
            'fee_id' => $fee->fee_id,
            'fee_type_name' => $fee->getAttribute('fee_type_name') instanceof FeeTypeName
                ? $fee->getAttribute('fee_type_name')->value
                : $fee->getAttribute('fee_type_name'),
            'fee_name' => $fee->fee_name,
            'amount' => (float) $fee->amount,
            'boat_type_id' => $fee->boat_type_id,
            'vehicle_type_id' => $fee->vehicle_type_id,
            'boat_type' => $fee->boatType ? [
                'boat_type_id' => $fee->boatType->boat_type_id,
                'type_name' => $fee->boatType->type_name,
            ] : null,
            'vehicle_type' => $fee->vehicleType ? [
                'vehicle_type_id' => $fee->vehicleType->vehicle_type_id,
                'type_name' => $fee->vehicleType->type_name,
                'deleted_at' => $fee->vehicleType->deleted_at?->toDateTimeString(),
            ] : null,
            'effective_from' => $fee->effective_from?->toDateString(),
            'effective_to' => $fee->effective_to?->toDateString(),
            'created_at' => $fee->created_at?->toISOString(),
        ];
    }

    private function queueInspectorFeeNotifications(Fee $fee, string $action): void
    {
        SendFeeChangeInspectorNotifications::dispatch(
            (int) $fee->fee_id,
            $action,
            Auth::id(),
        )->afterResponse();
    }

    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('fee_id', (int) $highlightId)
            ->first(['fee_id', 'effective_from', 'created_at']);

        if (!$target?->effective_from || !$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('created_at', '>', $target->created_at)
                    ->orWhere(function ($createdTieQuery) use ($target) {
                        $createdTieQuery
                            ->where('created_at', $target->created_at)
                            ->where(function ($effectiveTieQuery) use ($target) {
                                $effectiveTieQuery
                                    ->where('effective_from', '>', $target->effective_from)
                                    ->orWhere(function ($idTieQuery) use ($target) {
                                        $idTieQuery
                                            ->where('effective_from', $target->effective_from)
                                            ->where('fee_id', '>', $target->fee_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        $page = max((int) $request->query('page', 1), 1);
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $search = $request->query('search', '');
        $status = $request->query('status', 'all');
        $feeType = $request->query('fee_type', 'all');
        $period = $request->query('period', 'all');
        $compact = $request->boolean('compact');
        $all = $request->boolean('all') || !$request->hasAny(['page', 'per_page', 'search', 'status', 'fee_type', 'period', 'highlight_fee_id']);

        // Return minimal fees for form lookups (docking, banyera, etc.)
        if ($compact) {
            $fees = Fee::forFormLookup()
                ->with([
                    'boatType:boat_type_id,type_name',
                    'vehicleType:vehicle_type_id,type_name,deleted_at',
                ])
                ->orderBy('fee_type_name')
                ->orderBy('effective_from', 'desc')
                ->get();

            return response()->json($fees);
        }

        $query = Fee::query()
            ->select($this->feeSelectionColumns())
            ->with([
                'boatType:boat_type_id,type_name',
                'vehicleType:vehicle_type_id,type_name,deleted_at',
            ])
            ->searchTable($search)
            ->tableFilters($status, $feeType, $period)
            ->tableSort();

        if ($all) {
            $fees = $query->get();

            return response()->json($fees->map(fn (Fee $fee) => $this->prepareFeeForResponse($fee))->values());
        }

        $page = $this->highlightedPage($query, $request->query('highlight_fee_id'), $page, $perPage);
        $paginated = $query->paginate($perPage, ['*'], 'page', $page);
        $items = $paginated->getCollection()
            ->map(fn (Fee $fee) => $this->prepareFeeForResponse($fee))
            ->values();

        $today = now()->toDateString();
        $activeFeesCount = Fee::where('effective_from', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('effective_to')
                    ->orWhere('effective_to', '>=', $today);
            })
            ->count();

        $activeFeeTypesCount = Fee::where('effective_from', '<=', $today)
            ->where(function ($q) use ($today) {
                $q->whereNull('effective_to')
                    ->orWhere('effective_to', '>=', $today);
            })
            ->distinct('fee_type_name')
            ->count('fee_type_name');

        return response()->json([
            'data' => $items,
            'meta' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
            'stats' => [
                'total_records' => Fee::count(),
                'active_fees' => $activeFeesCount,
                'active_fee_types' => $activeFeeTypesCount,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'fee_type_name' => ['required', Rule::enum(FeeTypeName::class)],
            'boat_type_id' => 'nullable|exists:boat_types,boat_type_id',
            'vehicle_type_id' => 'nullable|exists:vehicle_types,vehicle_type_id',
            'amount' => 'required|numeric|min:0',
            'effective_from' => 'required|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
        ]);

        $this->validateFeeEffectivityWindow($validated);
        $this->syncPreviousFeeEffectivityForPending($validated);

        $fee = Fee::create([
            ...$validated,
            'boat_type_id' => ($validated['vehicle_type_id'] ?? null) ? null : ($validated['boat_type_id'] ?? null),
            'vehicle_type_id' => $validated['vehicle_type_id'] ?? null,
            'created_by' => Auth::id(),
        ]);

        $fee->loadMissing(['boatType', 'vehicleType']);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Set Fees',
            details: 'Created fee record in "' . $this->getFeeTypeLabel($fee) . '" for "' . $this->formatFeeApplicableLabel($fee) . '".',
            user: Auth::user()
        );

        $this->queueInspectorFeeNotifications($fee, 'created');
        $payload = $this->prepareFeeForResponse($fee);
        broadcast(new MasterDataUpdated('fees', 'created', $payload));

        return response()->json($payload, 201);
    }

    public function show($id)
    {
        $fee = Fee::query()
            ->select($this->feeSelectionColumns())
            ->with(['boatType:boat_type_id,type_name', 'vehicleType:vehicle_type_id,type_name,deleted_at'])
            ->findOrFail($id);

        return response()->json($this->prepareFeeForResponse($fee));
    }

    public function update(Request $request, $id)
    {
        $fee = Fee::with(['boatType', 'vehicleType'])->findOrFail($id);

        $validated = $request->validate([
            'fee_type_name' => ['required', Rule::enum(FeeTypeName::class)],
            'boat_type_id' => 'nullable|exists:boat_types,boat_type_id',
            'vehicle_type_id' => 'nullable|exists:vehicle_types,vehicle_type_id',
            'amount' => 'required|numeric|min:0',
            'effective_from' => 'required|date',
            'effective_to' => 'nullable|date|after_or_equal:effective_from',
        ]);

        $this->validateFeeEffectivityWindow($validated, (int) $fee->fee_id);
        $this->syncPreviousFeeEffectivityForPending($validated, (int) $fee->fee_id);

        $beforeState = [
            'fee_type_name' => $this->getFeeTypeLabel($fee),
            'applicable_to' => $this->formatFeeApplicableLabel($fee),
            'amount' => number_format((float) $fee->amount, 2),
            'effective_from' => optional($fee->effective_from)->toDateString(),
            'effective_to' => optional($fee->effective_to)->toDateString(),
        ];

        $fee->update([
            ...$validated,
            'boat_type_id' => ($validated['vehicle_type_id'] ?? null) ? null : ($validated['boat_type_id'] ?? null),
            'vehicle_type_id' => $validated['vehicle_type_id'] ?? null,
        ]);
        $fee->load(['boatType', 'vehicleType']);

        $afterState = [
            'fee_type_name' => $this->getFeeTypeLabel($fee),
            'applicable_to' => $this->formatFeeApplicableLabel($fee),
            'amount' => number_format((float) $fee->amount, 2),
            'effective_from' => optional($fee->effective_from)->toDateString(),
            'effective_to' => optional($fee->effective_to)->toDateString(),
        ];

        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $beforeState,
            $afterState,
            [
                'fee_type_name' => 'fee type',
                'applicable_to' => 'applicable to',
                'amount' => 'amount',
                'effective_from' => 'effective from',
                'effective_to' => 'effective to',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Set Fees',
            details: 'Updated fee record for "' . $this->getFeeTypeLabel($fee) . '"' . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        $this->queueInspectorFeeNotifications($fee, 'updated');
        $payload = $this->prepareFeeForResponse($fee);
        broadcast(new MasterDataUpdated('fees', 'updated', $payload));

        return response()->json($payload);
    }

}
