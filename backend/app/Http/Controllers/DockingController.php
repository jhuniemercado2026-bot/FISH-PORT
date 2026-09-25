<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\Docking;
use App\Models\BillItem;
use App\Models\Boat;
use App\Models\Fee;
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

    private function visitingOwnerFullName(Docking $docking): ?string
    {
        $fullName = trim(collect([
            $docking->visiting_owner_firstname,
            $docking->visiting_owner_lastname,
        ])->filter()->implode(' '));

        return $fullName !== '' ? $fullName : null;
    }

    private function prepareDockingForResponse(Docking $docking): Docking
    {
        $docking->createdBy?->append('full_name');
        $docking->voidedBy?->append('full_name');
        $this->appendDockingDisplayFields($docking);
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
        $this->appendDockingDisplayFields($docking);
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
            'boat_category' => $docking->boat_category ?? 'registered',
            'boat_id' => $docking->boat_id,
            'visiting_boat_name' => $docking->visiting_boat_name,
            'visiting_owner_firstname' => $docking->visiting_owner_firstname,
            'visiting_owner_lastname' => $docking->visiting_owner_lastname,
            'visiting_owner_address' => $docking->visiting_owner_address,
            'visiting_contact_number' => $docking->visiting_contact_number,
            'visiting_boat_type_id' => $docking->visiting_boat_type_id,
            'display_boat_name' => $docking->display_boat_name,
            'display_boat_type_name' => $docking->display_boat_type_name,
            'display_owner_name' => $docking->display_owner_name,
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
            'visitingBoatType' => $docking->visitingBoatType ? [
                'boat_type_id' => $docking->visitingBoatType->boat_type_id,
                'type_name' => $docking->visitingBoatType->type_name,
            ] : null,
            'visiting_boat_type' => $docking->visitingBoatType ? [
                'boat_type_id' => $docking->visitingBoatType->boat_type_id,
                'type_name' => $docking->visitingBoatType->type_name,
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

    private function dockingExistsForVisitingBoatOnDate(string $boatName, $dockingDate, $excludeDockingId = null): bool
    {
        $date = Carbon::parse($dockingDate, 'Asia/Manila')->toDateString();
        $normalizedBoatName = mb_strtolower(trim($boatName));

        $query = Docking::query()
            ->where('boat_category', 'visiting')
            ->whereRaw('LOWER(TRIM(visiting_boat_name)) = ?', [$normalizedBoatName])
            ->whereDate('docking_date', $date)
            ->whereNull('voided_at');

        if ($excludeDockingId) {
            $query->where('docking_id', '!=', $excludeDockingId);
        }

        return $query->exists();
    }

    private function appendDockingDisplayFields(Docking $docking): void
    {
        $isVisiting = ($docking->boat_category ?? 'registered') === 'visiting';
        $docking->setAttribute('display_boat_name', $isVisiting ? ($docking->visiting_boat_name ?: null) : ($docking->boat?->boat_name ?: null));
        $docking->setAttribute('display_owner_name', $isVisiting ? $this->visitingOwnerFullName($docking) : ($docking->boat?->owner?->full_name ?? $docking->boat?->owner_name ?? null));
        $docking->setAttribute('display_boat_type_name', $isVisiting ? ($docking->visitingBoatType?->type_name ?: null) : ($docking->boat?->boatType?->type_name ?: null));
    }

    private function resolveDockingBoatTypeId(array $validated): ?int
    {
        if (($validated['boat_category'] ?? 'registered') === 'visiting') {
            return isset($validated['visiting_boat_type_id']) ? (int) $validated['visiting_boat_type_id'] : null;
        }

        $boat = Boat::withTrashed()->find($validated['boat_id'] ?? null);

        return $boat?->boat_type_id ? (int) $boat->boat_type_id : null;
    }

    private function validateDockingFeeMatchesBoatType(array $validated): ?array
    {
        if (empty($validated['fee_id'])) {
            return null;
        }

        $boatTypeId = $this->resolveDockingBoatTypeId($validated);
        $fee = Fee::query()->find($validated['fee_id']);

        if (!$fee || !$boatTypeId || (string) $fee->boat_type_id !== (string) $boatTypeId) {
            return [
                'message' => 'The selected docking fee does not match the selected boat type.',
                'errors' => [
                    'fee_id' => ['The selected docking fee does not match the selected boat type.'],
                ],
            ];
        }

        return null;
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
        $this->appendDockingDisplayFields($docking);

        return [
            'docking_id' => $docking->docking_id,
            'boat_category' => $docking->boat_category ?? 'registered',
            'boat_id' => $docking->boat_id,
            'display_boat_name' => $docking->display_boat_name,
            'display_boat_type_name' => $docking->display_boat_type_name,
            'display_owner_name' => $docking->display_owner_name,
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
                            'dockings.boat_category',
                            'dockings.boat_id',
                            'dockings.visiting_boat_name',
                            'dockings.visiting_owner_firstname',
                            'dockings.visiting_owner_lastname',
                            'dockings.visiting_owner_address',
                            'dockings.visiting_contact_number',
                            'dockings.visiting_boat_type_id',
                            'dockings.docking_date',
                            'dockings.docking_fee',
                            'dockings.voided_at',
                            'dockings.created_at',
                        ])
                        ->with(['boat:boat_id,boat_name', 'visitingBoatType:boat_type_id,type_name'])
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
            'boat_category' => ['nullable', Rule::in(['registered', 'visiting'])],
            'boat_id' => [
                Rule::requiredIf(fn () => $request->input('boat_category', 'registered') === 'registered'),
                'nullable',
                'integer',
                Rule::exists('boats', 'boat_id')->whereNull('deleted_at'),
            ],
            'visiting_boat_name' => [
                Rule::requiredIf(fn () => $request->input('boat_category') === 'visiting'),
                'nullable',
                'string',
                'max:255',
            ],
            'visiting_owner_firstname' => [
                Rule::requiredIf(fn () => $request->input('boat_category') === 'visiting'),
                'nullable',
                'string',
                'max:255',
            ],
            'visiting_owner_lastname' => [
                Rule::requiredIf(fn () => $request->input('boat_category') === 'visiting'),
                'nullable',
                'string',
                'max:255',
            ],
            'visiting_owner_address' => [
                Rule::requiredIf(fn () => $request->input('boat_category') === 'visiting'),
                'nullable',
                'string',
                'max:255',
            ],
            'visiting_contact_number' => ['nullable', 'string', 'regex:/^\d{11}$/'],
            'visiting_boat_type_id' => [
                Rule::requiredIf(fn () => $request->input('boat_category') === 'visiting'),
                'nullable',
                'integer',
                Rule::exists('boat_types', 'boat_type_id')->whereNull('deleted_at'),
            ],
            'fee_id' => 'required|exists:fees,fee_id',
            'docking_date' => 'required|date',
            'docking_fee' => 'required|numeric|min:0',
        ]);

        $validated['boat_category'] = $validated['boat_category'] ?? 'registered';

        if ($this->dockingDateIsInFuture($validated['docking_date'] ?? null)) {
            return response()->json([
                'message' => 'Docking date cannot be in the future.',
                'errors' => [
                    'docking_date' => ['Docking date cannot be in the future.'],
                ],
            ], 422);
        }

        if ($feeError = $this->validateDockingFeeMatchesBoatType($validated)) {
            return response()->json($feeError, 422);
        }

        if (
            $validated['boat_category'] === 'registered'
            && $this->dockingExistsForBoatOnDate($validated['boat_id'], $validated['docking_date'])
        ) {
            return response()->json([
                'code' => 'duplicate_record',
                'message' => 'A docking record already exists for this boat on this date.',
                'errors' => [
                    'boat_id' => ['Only one docking per boat per day is allowed.'],
                ],
            ], 422);
        }

        if (
            $validated['boat_category'] === 'visiting'
            && $this->dockingExistsForVisitingBoatOnDate($validated['visiting_boat_name'], $validated['docking_date'])
        ) {
            return response()->json([
                'code' => 'duplicate_record',
                'message' => 'A docking record already exists for this visiting boat on this date.',
                'errors' => [
                    'visiting_boat_name' => ['Only one docking per visiting boat per day is allowed.'],
                ],
            ], 422);
        }

        if ($validated['boat_category'] === 'registered') {
            $validated['visiting_boat_name'] = null;
            $validated['visiting_owner_firstname'] = null;
            $validated['visiting_owner_lastname'] = null;
            $validated['visiting_owner_address'] = null;
            $validated['visiting_contact_number'] = null;
            $validated['visiting_boat_type_id'] = null;
        } else {
            $validated['boat_id'] = null;
        }

        $docking = Docking::create([
            ...$validated,
            'created_by' => Auth::id(),
        ]);

        $docking->load(Docking::managementRelations());

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Docking',
            details: 'Created docking transaction for boat "' . ($docking->display_boat_name ?? $docking->boat?->boat_name ?? $docking->visiting_boat_name) . '" with fee PHP ' . number_format((float) $docking->docking_fee, 2) . '.',
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
            'boat_category' => ['sometimes', Rule::in(['registered', 'visiting'])],
            'boat_id' => 'nullable|integer|exists:boats,boat_id',
            'visiting_boat_name' => 'nullable|string|max:255',
            'visiting_owner_firstname' => 'nullable|string|max:255',
            'visiting_owner_lastname' => 'nullable|string|max:255',
            'visiting_owner_address' => 'nullable|string|max:255',
            'visiting_contact_number' => ['nullable', 'string', 'regex:/^\d{11}$/'],
            'visiting_boat_type_id' => 'nullable|integer|exists:boat_types,boat_type_id',
            'fee_id' => 'sometimes|required|exists:fees,fee_id',
            'docking_date' => 'sometimes|required|date',
            'docking_fee' => 'sometimes|required|numeric|min:0',
        ]);

        $nextValues = array_merge($docking->only([
            'boat_category',
            'boat_id',
            'visiting_boat_name',
            'visiting_owner_firstname',
            'visiting_owner_lastname',
            'visiting_owner_address',
            'visiting_contact_number',
            'visiting_boat_type_id',
            'fee_id',
            'docking_date',
            'docking_fee',
        ]), $validated);
        $nextValues['boat_category'] = $nextValues['boat_category'] ?? 'registered';

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

        if ($nextValues['boat_category'] === 'registered' && empty($nextValues['boat_id'])) {
            return response()->json([
                'message' => 'Please select a boat.',
                'errors' => ['boat_id' => ['Please select a boat.']],
            ], 422);
        }

        if (
            $nextValues['boat_category'] === 'visiting'
            && (empty($nextValues['visiting_boat_name']) || empty($nextValues['visiting_owner_firstname']) || empty($nextValues['visiting_owner_lastname']) || empty($nextValues['visiting_owner_address']) || empty($nextValues['visiting_boat_type_id']))
        ) {
            return response()->json([
                'message' => 'Please complete the visiting boat details.',
                'errors' => [
                    'visiting_boat_name' => empty($nextValues['visiting_boat_name']) ? ['Boat name is required.'] : [],
                    'visiting_owner_firstname' => empty($nextValues['visiting_owner_firstname']) ? ['First name is required.'] : [],
                    'visiting_owner_lastname' => empty($nextValues['visiting_owner_lastname']) ? ['Last name is required.'] : [],
                    'visiting_owner_address' => empty($nextValues['visiting_owner_address']) ? ['Address is required.'] : [],
                    'visiting_boat_type_id' => empty($nextValues['visiting_boat_type_id']) ? ['Boat type is required.'] : [],
                ],
            ], 422);
        }

        if ($feeError = $this->validateDockingFeeMatchesBoatType($nextValues)) {
            return response()->json($feeError, 422);
        }

        $boatIdChanged = $nextValues['boat_category'] === 'registered'
            && $docking->boat_id != ($nextValues['boat_id'] ?? null);
        $dateChanged = array_key_exists('docking_date', $validated) && Carbon::parse($docking->docking_date)->toDateString() !== Carbon::parse($validated['docking_date'])->toDateString();

        if ($nextValues['boat_category'] === 'registered' && ($boatIdChanged || $dateChanged || $docking->boat_category === 'visiting')) {
            $checkBoatId = $nextValues['boat_id'];
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

        if ($nextValues['boat_category'] === 'visiting') {
            $checkDate = $dateChanged ? $validated['docking_date'] : $docking->docking_date;

            if ($this->dockingExistsForVisitingBoatOnDate($nextValues['visiting_boat_name'], $checkDate, $id)) {
                return response()->json([
                    'message' => 'A docking record already exists for this visiting boat on this date.',
                    'errors' => [
                        'visiting_boat_name' => ['Only one docking per visiting boat per day is allowed.'],
                    ],
                ], 422);
            }
        }

        $beforeState = [
            'boat' => $docking->display_boat_name ?? $docking->boat?->boat_name ?? $docking->visiting_boat_name ?? ('Boat #' . $docking->boat_id),
            'fee_name' => $docking->fee?->fee_name ?? ('Fee #' . $docking->fee_id),
            'docking_date' => $this->formatDockingDateLabel($docking->docking_date?->toDateString()),
            'docking_fee' => number_format((float) $docking->docking_fee, 2),
        ];

        if (($nextValues['boat_category'] ?? 'registered') === 'registered') {
            $validated['visiting_boat_name'] = null;
            $validated['visiting_owner_firstname'] = null;
            $validated['visiting_owner_lastname'] = null;
            $validated['visiting_owner_address'] = null;
            $validated['visiting_contact_number'] = null;
            $validated['visiting_boat_type_id'] = null;
        } else {
            $validated['boat_id'] = null;
        }

        $docking->update($validated);
        $docking->load(Docking::managementRelations());
        $this->appendDockingDisplayFields($docking);

        $afterState = [
            'boat' => $docking->display_boat_name ?? $docking->boat?->boat_name ?? $docking->visiting_boat_name ?? ('Boat #' . $docking->boat_id),
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
            details: 'Updated docking record for boat "' . ($docking->display_boat_name ?? $docking->boat?->boat_name ?? $docking->visiting_boat_name) . '"' . ($changeDetails !== '' ? ' in ' . $changeDetails . '.' : '.'),
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
