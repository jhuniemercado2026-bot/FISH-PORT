<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\Docking;
use App\Models\BillItem;
use App\Models\Boat;
use App\Services\ActivityLogService;
use App\Services\VoidRequestNotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class DockingController extends Controller
{
    private function manilaNow(): Carbon
    {
        return Carbon::now('Asia/Manila');
    }

    private function formatDockingDateTimeValue($value): ?string
    {
        if (!$value) {
            return null;
        }

        return Carbon::createFromFormat('Y-m-d H:i:s', (string) $value, 'Asia/Manila')
            ->format('Y-m-d H:i:s');
    }

    private function prepareDockingForResponse(Docking $docking): Docking
    {
        $docking->createdBy?->append('full_name');
        $docking->voidedBy?->append('full_name');
        $docking->is_billed = (bool) ($docking->is_billed ?? $this->dockingIsBilled($docking->docking_id));
        $docking->setAttribute('voided_by_name', $docking->voidedBy?->full_name ?? $docking->voidedBy?->email);
        $docking->setAttribute('is_voided', !is_null($docking->voided_at));
        $docking->setAttribute('status', !is_null($docking->voided_at) ? 'voided' : 'active');
        $docking->setAttribute(
            'docking_date',
            $this->formatDockingDateTimeValue($docking->getRawOriginal('docking_date'))
        );
        $docking->makeHidden(['created_at', 'updated_at', 'fee']);

        return $docking;
    }

    private function prepareDockingForCalendarResponse(Docking $docking): Docking
    {
        $docking->createdBy?->append('full_name');
        $docking->voidedBy?->append('full_name');
        $docking->setAttribute('voided_by_name', $docking->voidedBy?->full_name ?? $docking->voidedBy?->email);
        $docking->setAttribute('is_voided', !is_null($docking->voided_at));
        $docking->setAttribute('status', !is_null($docking->voided_at) ? 'voided' : 'active');
        $docking->setAttribute(
            'docking_date',
            $this->formatDockingDateTimeValue($docking->getRawOriginal('docking_date'))
        );

        return $docking;
    }

    private function compactDockingForCalendar(Docking $docking): array
    {
        $this->prepareDockingForCalendarResponse($docking);

        return [
            'docking_id' => $docking->docking_id,
            'boat_id' => $docking->boat_id,
            'docking_date' => $this->formatDockingDateTimeValue($docking->getRawOriginal('docking_date')),
            'docking_fee' => $docking->docking_fee,
            'void_reason' => $docking->void_reason,
            'voided_at' => $docking->voided_at,
            'voided_by' => $docking->voided_by,
            'voided_by_name' => $docking->voided_by_name,
            'is_voided' => $docking->is_voided,
            'status' => $docking->status,
            'boat' => $docking->boat ? [
                'boat_id' => $docking->boat->boat_id,
                'boat_name' => $docking->boat->boat_name,
                'owner' => $docking->boat->owner ? [
                    'owner_id' => $docking->boat->owner->owner_id,
                    'owner_firstname' => $docking->boat->owner->owner_firstname,
                    'owner_lastname' => $docking->boat->owner->owner_lastname,
                    'full_name' => $docking->boat->owner->full_name,
                ] : null,
                'boat_type' => $docking->boat->boatType ? [
                    'boat_type_id' => $docking->boat->boatType->boat_type_id,
                    'type_name' => $docking->boat->boatType->type_name,
                ] : null,
                'boatType' => $docking->boat->boatType ? [
                    'boat_type_id' => $docking->boat->boatType->boat_type_id,
                    'type_name' => $docking->boat->boatType->type_name,
                ] : null,
            ] : null,
            'createdBy' => $docking->createdBy ? [
                'user_id' => $docking->createdBy->user_id,
                'first_name' => $docking->createdBy->first_name,
                'last_name' => $docking->createdBy->last_name,
                'email' => $docking->createdBy->email,
                'full_name' => $docking->createdBy->full_name,
            ] : null,
            'voidedBy' => $docking->voidedBy ? [
                'user_id' => $docking->voidedBy->user_id,
                'first_name' => $docking->voidedBy->first_name,
                'last_name' => $docking->voidedBy->last_name,
                'email' => $docking->voidedBy->email,
                'full_name' => $docking->voidedBy->full_name,
            ] : null,
        ];
    }

    private function formatDockingDateLabel(?string $value): string
    {
        return $value ? Carbon::parse($value, 'Asia/Manila')->format('F j, Y') : '';
    }

    private function dockingDateIsInFuture(?string $dateTimeValue): bool
    {
        if (!$dateTimeValue) {
            return false;
        }

        $dockingDate = Carbon::parse($dateTimeValue, 'Asia/Manila')->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        return $dockingDate > $today;
    }

    private function dockingExistsForBoatOnDate($boatId, $dockingDate, $excludeDockingId = null): bool
    {
        $date = Carbon::parse($dockingDate, 'Asia/Manila')->toDateString();
        
        $query = Docking::where('boat_id', $boatId)
            ->whereDate('docking_date', $date)
            ->whereNull('voided_at');
        
        if ($excludeDockingId) {
            $query->where('docking_id', '!=', $excludeDockingId);
        }
        
        return $query->exists();
    }

    private function dockingIsBilled($dockingId): bool
    {
        return BillItem::where('docking_id', $dockingId)->exists();
    }

    private function dockingIsToday($dateTimeValue): bool
    {
        if (!$dateTimeValue) {
            return false;
        }

        $dockingDate = Carbon::parse($dateTimeValue, 'Asia/Manila')->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        return $dockingDate === $today;
    }

    private function baseDockingQuery()
    {
        return Docking::forTableIndex();
    }

    private function applyDockingFilters($query, Request $request)
    {
        $query->tableFilters(
            $request->query('search', ''),
            $request->query('docking_status', $request->query('status', 'all')),
            $request->query('docking_period', $request->query('period', 'all')),
            $request->query('boat_type_id', $request->query('boat_type', 'all'))
        );

        $boatId = trim((string) $request->query('boat_id', ''));

        if ($boatId !== '' && $boatId !== 'all' && ctype_digit($boatId)) {
            $query->where('dockings.boat_id', (int) $boatId);
        }

        return $query;
    }

    private function compactDockingForBilling(Docking $docking): array
    {
        return [
            'docking_id' => $docking->docking_id,
            'boat_id' => $docking->boat_id,
            'boat' => $docking->boat ? [
                'boat_id' => $docking->boat->boat_id,
                'boat_name' => $docking->boat->boat_name,
            ] : null,
            'docking_date' => $this->formatDockingDateTimeValue($docking->getRawOriginal('docking_date')),
            'docking_fee' => $docking->docking_fee,
            'is_billed' => (bool) ($docking->is_billed ?? false),
        ];
    }

    private function dockingStats(Request $request): array
    {
        $today = Carbon::now('Asia/Manila');
        $fiscalYear = $this->fiscalYear($request);
        $statsDate = $fiscalYear
            ? $today->copy()->year($fiscalYear)->toDateString()
            : $today->toDateString();
        $activeQuery = Docking::query()->whereNull('voided_at');
        $this->applyFiscalYear($activeQuery, $request, 'dockings.docking_date');

        return [
            'total_records' => (clone $activeQuery)->count(),
            'logged_today' => (clone $activeQuery)->whereDate('docking_date', $statsDate)->count(),
            'total_fee_today' => (float) (clone $activeQuery)->whereDate('docking_date', $statsDate)->sum('docking_fee'),
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
            ->where('dockings.docking_id', (int) $highlightId)
            ->first(['dockings.docking_id', 'dockings.docking_date', 'dockings.created_at']);

        if (!$target?->docking_date || !$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('dockings.docking_date', '>', $target->docking_date)
                    ->orWhere(function ($dateTieQuery) use ($target) {
                        $dateTieQuery
                            ->where('dockings.docking_date', $target->docking_date)
                            ->where(function ($createdTieQuery) use ($target) {
                                $createdTieQuery
                                    ->where('dockings.created_at', '>', $target->created_at)
                                    ->orWhere(function ($idTieQuery) use ($target) {
                                        $idTieQuery
                                            ->where('dockings.created_at', $target->created_at)
                                            ->where('dockings.docking_id', '>', $target->docking_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        if ($request->boolean('all')) {
            if ($request->boolean('compact')) {
                $dockingQuery = $this->applyDockingFilters(
                    Docking::query()
                        ->select([
                            'dockings.docking_id',
                            'dockings.boat_id',
                            'dockings.docking_date',
                            'dockings.docking_fee',
                            'dockings.voided_at',
                            'dockings.created_at',
                        ])
                        ->with('boat:boat_id,boat_name')
                        ->withExists(['billItems as is_billed']),
                    $request
                )
                    ->orderByDesc('dockings.docking_date')
                    ->orderByDesc('dockings.created_at')
                    ->orderByDesc('dockings.docking_id');
                $this->applyFiscalYear($dockingQuery, $request, 'dockings.docking_date');
                $dockings = $dockingQuery->get();

                return response()->json([
                    'data' => $dockings->map(fn (Docking $docking) => $this->compactDockingForBilling($docking))->values(),
                    'meta' => [
                        'current_page' => 1,
                        'last_page' => 1,
                        'per_page' => $dockings->count(),
                        'total' => $dockings->count(),
                        'from' => $dockings->isEmpty() ? 0 : 1,
                        'to' => $dockings->count(),
                    ],
                ]);
            }

            $dockingQuery = $this->applyDockingFilters($this->baseDockingQuery(), $request)
                ->orderByDesc('dockings.docking_date')
                ->orderByDesc('dockings.created_at')
                ->orderByDesc('dockings.docking_id');
            $this->applyFiscalYear($dockingQuery, $request, 'dockings.docking_date');
            $dockings = $dockingQuery->get();

            $dockings->each(function ($docking) {
                $this->prepareDockingForResponse($docking);
            });

            return response()->json([
                'data' => $dockings,
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => $dockings->count(),
                    'total' => $dockings->count(),
                    'from' => $dockings->isEmpty() ? 0 : 1,
                    'to' => $dockings->count(),
                ],
                'stats' => $this->dockingStats($request),
            ]);
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $dockingQuery = $this->applyDockingFilters($this->baseDockingQuery(), $request)
            ->orderByDesc('dockings.docking_date')
            ->orderByDesc('dockings.created_at')
            ->orderByDesc('dockings.docking_id');
        $this->applyFiscalYear($dockingQuery, $request, 'dockings.docking_date');
        $page = $this->highlightedPage($dockingQuery, $request->query('highlight_docking_id'), $page, $perPage);
        $dockings = $dockingQuery->paginate($perPage, ['*'], 'page', $page);

        $dockings->getCollection()->transform(function ($docking) {
            return $this->prepareDockingForResponse($docking);
        });

        return response()->json([
            'data' => $dockings->items(),
            'meta' => [
                'current_page' => $dockings->currentPage(),
                'last_page' => $dockings->lastPage(),
                'per_page' => $dockings->perPage(),
                'total' => $dockings->total(),
                'from' => $dockings->firstItem(),
                'to' => $dockings->lastItem(),
            ],
            'stats' => $this->dockingStats($request),
        ]);
    }

    public function calendar(Request $request)
    {
        $validated = $request->validate([
            'start' => 'required|date',
            'end' => 'required|date|after_or_equal:start',
        ]);

        $start = Carbon::parse($validated['start'], 'Asia/Manila')->startOfDay();
        $end = Carbon::parse($validated['end'], 'Asia/Manila')->endOfDay();

        $dockings = Docking::forCalendarIndex()
            ->whereBetween('docking_date', [$start, $end])
            ->whereNull('voided_at')
            ->oldest('docking_date')
            ->get();

        return response()->json([
            'data' => $dockings->map(fn (Docking $docking) => $this->compactDockingForCalendar($docking))->values(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'boat_id' => ['required', 'integer', Rule::exists('boats', 'boat_id')->whereNull('deleted_at')],
            'fee_id' => 'required|exists:fees,fee_id',
            'docking_date' => 'required|date',
            'docking_fee' => 'required|numeric|min:0',
        ]);

        if ($this->dockingDateIsInFuture($validated['docking_date'] ?? null)) {
            return response()->json([
                'message' => 'Docking date cannot be in the future.',
                'errors' => [
                    'docking_date' => ['Docking date cannot be in the future.'],
                ],
            ], 422);
        }

        // Check if a docking already exists for this boat on this date
        if ($this->dockingExistsForBoatOnDate($validated['boat_id'], $validated['docking_date'])) {
            return response()->json([
                'code' => 'duplicate_record',
                'message' => 'A docking record already exists for this boat on this date.',
                'errors' => [
                    'boat_id' => ['Only one docking per boat per day is allowed.'],
                ],
            ], 422);
        }

        $docking = Docking::create([
            ...$validated,
            'created_by' => Auth::id(),
        ]);

        $docking->load(Docking::managementRelations());

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Docking',
            details: 'Created docking transaction for boat "' . $docking->boat?->boat_name . '" with fee PHP ' . number_format((float) $docking->docking_fee, 2) . '.',
            user: Auth::user()
        );

        $this->prepareDockingForResponse($docking);
        broadcast(new TransactionUpdated('docking', 'created', $docking->toArray()));

        return response()->json($docking, 201);
    }

    public function show($id)
    {
        $docking = Docking::with(Docking::managementRelations())->findOrFail($id);
        $this->prepareDockingForResponse($docking);

        return response()->json($docking);
    }

    public function update(Request $request, $id)
    {
        $docking = Docking::with(Docking::managementRelations())->findOrFail($id);

        if (!is_null($docking->voided_at)) {
            return response()->json([
                'message' => 'Voided docking records can no longer be edited.',
            ], 422);
        }

        $validated = $request->validate([
            'boat_id' => 'sometimes|required|exists:boats,boat_id',
            'fee_id' => 'sometimes|required|exists:fees,fee_id',
            'docking_date' => 'sometimes|required|date',
            'docking_fee' => 'sometimes|required|numeric|min:0',
        ]);

        if (
            array_key_exists('docking_date', $validated)
            && $this->dockingDateIsInFuture($validated['docking_date'])
        ) {
            return response()->json([
                'message' => 'Docking date cannot be in the future.',
                'errors' => [
                    'docking_date' => ['Docking date cannot be in the future.'],
                ],
            ], 422);
        }

        // Check if boat_id or docking_date is being changed
        $boatIdChanged = array_key_exists('boat_id', $validated) && $docking->boat_id != $validated['boat_id'];
        $dateChanged = array_key_exists('docking_date', $validated) && Carbon::parse($docking->docking_date)->toDateString() !== Carbon::parse($validated['docking_date'])->toDateString();

        // If either boat_id or docking_date is being changed, check for duplicates
        if ($boatIdChanged || $dateChanged) {
            $checkBoatId = $boatIdChanged ? $validated['boat_id'] : $docking->boat_id;
            $checkDate = $dateChanged ? $validated['docking_date'] : $docking->docking_date;

            if ($boatIdChanged && !Boat::active()->where('boat_id', $checkBoatId)->exists()) {
                return response()->json([
                    'message' => 'The selected boat is archived and cannot be used for new docking records.',
                    'errors' => [
                        'boat_id' => ['The selected boat is archived and cannot be used for new docking records.'],
                    ],
                ], 422);
            }
            
            if ($this->dockingExistsForBoatOnDate($checkBoatId, $checkDate, $id)) {
                return response()->json([
                    'message' => 'A docking record already exists for this boat on this date.',
                    'errors' => [
                        'boat_id' => ['Only one docking per boat per day is allowed.'],
                    ],
                ], 422);
            }
        }

        $beforeState = [
            'boat' => $docking->boat?->boat_name ?? ('Boat #' . $docking->boat_id),
            'fee_name' => $docking->fee?->fee_name ?? ('Fee #' . $docking->fee_id),
            'docking_date' => $this->formatDockingDateLabel($docking->docking_date?->toDateString()),
            'docking_fee' => number_format((float) $docking->docking_fee, 2),
        ];

        $docking->update($validated);
        $docking->load(Docking::managementRelations());

        $afterState = [
            'boat' => $docking->boat?->boat_name ?? ('Boat #' . $docking->boat_id),
            'fee_name' => $docking->fee?->fee_name ?? ('Fee #' . $docking->fee_id),
            'docking_date' => $this->formatDockingDateLabel($docking->docking_date?->toDateString()),
            'docking_fee' => number_format((float) $docking->docking_fee, 2),
        ];

        $changeDetails = app(ActivityLogService::class)->describeChanges(
            $beforeState,
            $afterState,
            [
                'boat' => 'boat',
                'fee_name' => 'applicable fee',
                'docking_date' => 'date',
                'docking_fee' => 'docking fee',
            ]
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Docking',
            details: 'Updated docking record for boat "' . $docking->boat?->boat_name . '"' . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
            user: Auth::user()
        );

        $this->prepareDockingForResponse($docking);

        return response()->json($docking);
    }

    public function void(Request $request, $id)
    {
        $docking = Docking::with(Docking::managementRelations())
            ->findOrFail($id);

        if (!is_null($docking->voided_at)) {
            return response()->json([
                'message' => 'This docking record has already been voided.',
            ], 422);
        }

        $validated = $request->validate([
            'void_reason' => 'required|string|max:500',
        ]);

        if ($this->dockingIsBilled($docking->docking_id)) {
            return response()->json([
                'message' => 'This docking record has been billed and can no longer be voided.',
            ], 422);
        }

        $reason = trim($validated['void_reason']);

        $docking->update([
            'void_reason' => $reason,
            'voided_at' => $this->manilaNow(),
            'voided_by' => Auth::id(),
        ]);

        $docking->load(Docking::managementRelations());
        $docking->load('voidedBy:user_id,first_name,last_name,email');
        $docking->voidedBy?->append('full_name');
        $this->prepareDockingForResponse($docking);
        $docking->makeHidden(['created_by', 'boat.owner', 'boat.boatType', 'is_billed']);

        app(ActivityLogService::class)->log(
            action: 'VOID',
            module: 'Docking',
            details: 'Voided docking record for boat "' . $docking->boat?->boat_name . '" with reason: "' . $reason . '".',
            user: Auth::user()
        );

        broadcast(new TransactionUpdated('docking', 'updated', $docking->toArray()));
        app(VoidRequestNotificationService::class)->notifyRequester('docking', $docking);

        return response()->json([
            'message' => 'Docking record voided successfully.',
            'docking' => $docking,
        ]);
    }

    public function unvoid($id)
    {
        $docking = Docking::with(Docking::managementRelations())
            ->findOrFail($id);

        if (is_null($docking->voided_at)) {
            return response()->json([
                'message' => 'This docking record is not voided.',
            ], 422);
        }

        if ($this->dockingIsBilled($docking->docking_id)) {
            return response()->json([
                'message' => 'This docking record has been billed and can no longer be restored.',
            ], 422);
        }

        if (!$this->dockingIsToday($docking->docking_date)) {
            return response()->json([
                'message' => "Only today's docking records can be restored.",
            ], 422);
        }

        $docking->update([
            'void_reason' => null,
            'voided_at' => null,
            'voided_by' => null,
        ]);

        $docking->load(Docking::managementRelations());
        $this->prepareDockingForResponse($docking);

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Docking',
            details: 'Restored voided docking record for boat "' . $docking->boat?->boat_name . '".',
            user: Auth::user()
        );

        broadcast(new TransactionUpdated('docking', 'updated', $docking->toArray()));

        return response()->json([
            'message' => 'Docking record restored successfully.',
            'docking' => $docking,
        ]);
    }

    public function destroy($id)
    {
        return response()->json([
            'message' => 'Docking records cannot be deleted or archived.',
        ], 422);
    }
}
