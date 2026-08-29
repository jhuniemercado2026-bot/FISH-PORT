<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Services\ActivityLogService;
use App\Services\TransactionLockService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class RemittanceController extends Controller
{
    public function __construct(private TransactionLockService $transactionLockService)
    {
    }

    private function highlightedPage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('remittance_id', (int) $highlightId)
            ->first(['remittance_id', 'date', 'created_at']);

        if (!$target?->date || !$target?->created_at) {
            return $requestedPage;
        }

        $targetDate = $target->date instanceof \DateTimeInterface
            ? $target->date->format('Y-m-d')
            : Carbon::parse($target->date, 'Asia/Manila')->toDateString();

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target, $targetDate) {
                $positionQuery
                    ->where('date', '>', $targetDate)
                    ->orWhere(function ($dateTieQuery) use ($target, $targetDate) {
                        $dateTieQuery
                            ->whereDate('date', $targetDate)
                            ->where(function ($createdTieQuery) use ($target) {
                                $createdTieQuery
                                    ->where('created_at', '>', $target->created_at)
                                    ->orWhere(function ($idTieQuery) use ($target) {
                                        $idTieQuery
                                            ->where('created_at', $target->created_at)
                                            ->where('remittance_id', '>', $target->remittance_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    private function remittancePayload(Remittance $remittance): array
    {
        $submittedBy = $remittance->submittedBy;
        $submittedByName = trim((string) implode(' ', array_filter([
            $submittedBy?->first_name,
            $submittedBy?->last_name,
        ])));

        return [
            'remittance_id' => $remittance->remittance_id,
            'remittance_reference_no' => $remittance->remittance_reference_no,
            'date' => optional($remittance->date)->toDateString(),
            'amount' => round((float) $remittance->amount, 2),
            'surplus' => round((float) $remittance->surplus, 2),
            'deficit' => round((float) $remittance->deficit, 2),
            'status' => $remittance->status,
            'remarks' => $remittance->remarks,
            'submitted_by' => $remittance->submitted_by,
            'submitted_by_name' => $submittedByName !== '' ? $submittedByName : $submittedBy?->email,
            'submitted_by_email' => $submittedBy?->email,
            'submitted_by_role' => $submittedBy?->role,
            'created_at' => optional($remittance->created_at)->toIso8601String(),
            'updated_at' => optional($remittance->updated_at)->toIso8601String(),
        ];
    }

    private function broadcastRemittance(Remittance $remittance, string $action): array
    {
        $remittance->refresh()->loadMissing('submittedBy');
        $payload = $this->remittancePayload($remittance);

        broadcast(new TransactionUpdated('remittance', $action, $payload));

        return $payload;
    }

    private function transactionLockForUser(?User $user = null): ?array
    {
        $user ??= Auth::user();

        if (strtolower(trim((string) ($user?->role ?? ''))) === 'head') {
            return null;
        }

        return $this->transactionLockService->getActiveLock($user, 'vehicle-tickets');
    }

    private function canManageRemittance(?User $user, Remittance $remittance): bool
    {
        $managerRole = strtolower(trim((string) ($user?->role ?? '')));
        $submitterRole = strtolower(trim((string) ($remittance->submittedBy?->role ?? '')));

        return match ($managerRole) {
            'coordinator' => $submitterRole === 'inspector',
            'head' => $submitterRole === 'coordinator',
            default => false,
        };
    }

    private function manageRemittanceDeniedMessage(Remittance $remittance): string
    {
        $submitterRole = strtolower(trim((string) ($remittance->submittedBy?->role ?? '')));

        return match ($submitterRole) {
            'inspector' => 'Only the coordinator can accept or undo inspector remittances.',
            'coordinator' => 'Only the head can accept or undo coordinator remittances.',
            default => 'You are not allowed to accept or undo this remittance.',
        };
    }

    private function remittanceApproverRole(Remittance $remittance): ?string
    {
        $submitterRole = strtolower(trim((string) ($remittance->submittedBy?->role ?? '')));

        return match ($submitterRole) {
            'inspector' => 'coordinator',
            'coordinator' => 'head',
            default => null,
        };
    }

    private function resolveRemittanceApproverUserIds(Remittance $remittance): array
    {
        $approverRole = $this->remittanceApproverRole($remittance);

        if (!$approverRole) {
            return [];
        }

        return User::query()
            ->where('role', $approverRole)
            ->whereIn('status', ['online', 'offline'])
            ->orderBy('user_id')
            ->pluck('user_id')
            ->all();
    }

    private function noRemittanceApproverMessage(Remittance $remittance): string
    {
        return match ($this->remittanceApproverRole($remittance)) {
            'coordinator' => 'No active coordinators are available to receive this remittance.',
            'head' => 'No active heads are available to receive this remittance.',
            default => 'No approver is available to receive this remittance.',
        };
    }

    private function createRemittanceSubmittedNotifications(Remittance $remittance, array $approverUserIds): void
    {
        $this->pruneRemittanceSubmittedNotifications($remittance, $approverUserIds);

        foreach ($approverUserIds as $approverUserId) {
            Notification::updateOrCreate([
                'recipient_user_id' => $approverUserId,
                'related_type' => 'remittance',
                'related_id' => $remittance->remittance_id,
                'title' => 'New remittance submitted',
            ], [
                'message' => $this->remittanceSubmittedMessage($remittance),
                'sender_user_id' => Auth::id(),
                'is_read' => false,
                'read_at' => null,
            ]);
        }
    }

    private function pruneRemittanceSubmittedNotifications(Remittance $remittance, array $approverUserIds): void
    {
        $allowedRecipientIds = array_values(array_filter(array_map('intval', $approverUserIds)));

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('title', 'New remittance submitted')
            ->when(!empty($allowedRecipientIds), fn ($query) => $query->whereNotIn('recipient_user_id', $allowedRecipientIds))
            ->delete();
    }

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $query = Remittance::query()
            ->forTableIndex()
            ->searchTable($request->query('search'))
            ->tableFilters([
                'status' => $request->query('status', 'all'),
                'period' => $request->query('period', 'all'),
            ])
            ->orderByDesc('date')
            ->orderByDesc('created_at')
            ->orderByDesc('remittance_id');
        $this->applyFiscalYear($query, $request, 'date');
        $statsQuery = (clone $query)
            ->whereHas('submittedBy', fn ($submitterQuery) => $submitterQuery->where('role', 'coordinator'))
            ->reorder();
        $stats = [
            'total_remittances' => (float) (clone $statsQuery)->sum('amount'),
            'total_surplus' => (float) (clone $statsQuery)->sum('surplus'),
            'total_deficit' => (float) (clone $statsQuery)->sum('deficit'),
            'today_remittances' => (float) (clone $statsQuery)
                ->whereDate('date', Carbon::now('Asia/Manila')->toDateString())
                ->sum('amount'),
        ];

        if ($request->boolean('all')) {
            $remittances = $query->get()->map(fn (Remittance $remittance) => $this->remittancePayload($remittance));

            return response()->json([
                'data' => $remittances,
                'stats' => $stats,
                'transaction_lock' => $this->transactionLockForUser($request->user()),
            ]);
        }

        $page = $this->highlightedPage($query, $request->query('highlight_remittance_id'), $page, $perPage);
        $remittances = $query->paginate($perPage, ['*'], 'page', $page);
        $items = $remittances->getCollection()->map(fn (Remittance $remittance) => $this->remittancePayload($remittance))->values();

        $meta = [
            'current_page' => $remittances->currentPage(),
            'last_page' => $remittances->lastPage(),
            'per_page' => $remittances->perPage(),
            'total' => $remittances->total(),
            'from' => $remittances->firstItem(),
            'to' => $remittances->lastItem(),
        ];

        return response()->json([
            'data' => $items,
            'meta' => $meta,
            'stats' => $stats,
            'transaction_lock' => $this->transactionLockForUser($request->user()),
        ]);
    }

    public function todayCollection(Request $request)
    {
        $date = Carbon::parse($request->query('date', now('Asia/Manila')->toDateString()), 'Asia/Manila')->toDateString();
        $hasSubmittedRemittance = Remittance::query()
            ->whereDate('date', $date)
            ->where('submitted_by', $request->user()?->user_id)
            ->exists();

        return response()->json([
            'date' => $date,
            'amount' => $hasSubmittedRemittance
                ? 0
                : $this->calculateDateAmount($date, $this->collectionUserIdForRemittance($request->user())),
            'has_submitted_remittance' => $hasSubmittedRemittance,
            'breakdown' => $hasSubmittedRemittance
                ? []
                : $this->dateCollectionBreakdown($date, $this->collectionUserIdForRemittance($request->user())),
            'remittance_progress' => $this->remittanceProgressForDate($date),
        ]);
    }

    public function show($id)
    {
        $remittance = Remittance::with('submittedBy')->findOrFail($id);

        return response()->json([
            'remittance' => $this->remittancePayload($remittance),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'amount' => 'required|numeric|min:0',
            'surplus' => 'nullable|numeric|min:0',
            'deficit' => 'nullable|numeric|min:0',
            'remarks' => 'nullable|string',
        ]);

        $surplus = round((float) ($validated['surplus'] ?? 0), 2);
        $deficit = round((float) ($validated['deficit'] ?? 0), 2);
        $remarks = trim((string) ($validated['remarks'] ?? ''));

        if (($surplus > 0 || $deficit > 0) && $remarks === '') {
            return response()->json([
                'message' => 'Remarks is required when there is a surplus or deficit.',
                'errors' => [
                    'remarks' => ['Remarks is required when there is a surplus or deficit.'],
                ],
            ], 422);
        }

        $duplicateExists = Remittance::query()
            ->whereDate('date', $validated['date'])
            ->where('submitted_by', Auth::id())
            ->exists();

        if ($duplicateExists) {
            return response()->json([
                'message' => 'You already submitted a remittance record for this date.',
                'errors' => [
                    'date' => ['You already submitted a remittance record for this date.'],
                ],
            ], 422);
        }

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();
        $todayCollection = $this->calculateDateAmount($date, $this->collectionUserIdForRemittance($request->user()));
        $remittanceProgress = $this->remittanceProgressForDate($date);
        $amount = round((float) $validated['amount'], 2);

        if ($todayCollection <= 0) {
            return response()->json([
                'message' => 'No cash collections were found for the selected date.',
                'errors' => [
                    'date' => ['No cash collections were found for the selected date.'],
                ],
            ], 422);
        }

        if (
            strtolower(trim((string) ($request->user()?->role ?? ''))) === 'coordinator' &&
            (int) ($remittanceProgress['pending_users'] ?? 0) > 0
        ) {
            return response()->json([
                'message' => 'Cannot submit remittance until all inspectors with vehicle ticket collections have submitted their remittance.',
                'errors' => [
                    'remittance_progress' => ['All inspectors with vehicle ticket collections must submit their remittance first.'],
                ],
                'remittance_progress' => $remittanceProgress,
            ], 422);
        }

        $remittance = Remittance::create([
            'date' => $date,
            'amount' => $amount,
            'surplus' => $surplus,
            'deficit' => $deficit,
            'status' => 'pending',
            'remarks' => $remarks !== '' ? $remarks : null,
            'submitted_by' => Auth::id(),
        ]);

        $remittance->loadMissing('submittedBy');
        $approverUserIds = $this->resolveRemittanceApproverUserIds($remittance);

        if (empty($approverUserIds)) {
            $remittance->delete();

            return response()->json([
                'message' => $this->noRemittanceApproverMessage($remittance),
            ], 422);
        }

        // Immediately set a server-side transaction lock based on this submission so
        // other endpoints will be view-only while this remittance stands.
        try {
            $this->transactionLockService->setLockForRemittance($remittance);
        } catch (\Throwable $e) {
            // best-effort: do not prevent remittance creation if lock write fails
        }

        $this->createRemittanceSubmittedNotifications($remittance, $approverUserIds);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Remittance',
            details: 'Created remittance "' . $remittance->remittance_reference_no . '" for date "' . $date .
                '" with amount "PHP ' . number_format((float) $remittance->amount, 2) . '".',
            user: Auth::user()
        );

        $payload = $this->broadcastRemittance($remittance, 'created');

        return response()->json([
            'message' => 'Remittance submitted successfully.',
            'remittance' => $payload,
            'transaction_lock' => $this->transactionLockForUser($request->user()),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $remittance = Remittance::findOrFail($id);

        $validated = $request->validate([
            'date' => 'required|date',
            'amount' => 'required|numeric|min:0',
            'surplus' => 'nullable|numeric|min:0',
            'deficit' => 'nullable|numeric|min:0',
            'remarks' => 'nullable|string',
            'status' => 'nullable|in:pending,remitted',
        ]);

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();
        $amount = round((float) $validated['amount'], 2);
        $surplus = round((float) ($validated['surplus'] ?? 0), 2);
        $deficit = round((float) ($validated['deficit'] ?? 0), 2);

        $originalDate = optional($remittance->date)->toDateString();
        $originalAmount = round((float) ($remittance->amount ?? 0), 2);
        $originalSurplus = round((float) ($remittance->surplus ?? 0), 2);
        $originalDeficit = round((float) ($remittance->deficit ?? 0), 2);

        $shouldValidateCollections =
            $date !== $originalDate ||
            $amount !== $originalAmount ||
            $surplus !== $originalSurplus ||
            $deficit !== $originalDeficit;

        if ($shouldValidateCollections) {
            $remittance->loadMissing('submittedBy');
            $todayCollection = $this->calculateDateAmount($date, $this->collectionUserIdForRemittance($remittance->submittedBy));

            if ($todayCollection <= 0) {
                return response()->json([
                    'message' => 'No cash collections were found for the selected date.',
                    'errors' => [
                        'date' => ['No cash collections were found for the selected date.'],
                    ],
                ], 422);
            }
        }

        $remittance->update([
            'date' => $date,
            'amount' => $amount,
            'surplus' => (float) ($validated['surplus'] ?? 0),
            'deficit' => (float) ($validated['deficit'] ?? 0),
            'status' => $validated['status'] ?? $remittance->status,
            'remarks' => $validated['remarks'] ?? null,
        ]);

        $remittance->loadMissing('submittedBy');
        $approverUserIds = $this->resolveRemittanceApproverUserIds($remittance);

        $this->createRemittanceSubmittedNotifications($remittance, $approverUserIds);

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('title', 'Remittance remitted')
            ->delete();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Updated remittance "' . $remittance->remittance_reference_no . '" for date "' . $date .
                '" to amount "PHP ' . number_format((float) $remittance->amount, 2) . '".',
            user: Auth::user()
        );

        $payload = $this->broadcastRemittance($remittance, 'updated');

        return response()->json([
            'message' => 'Remittance updated successfully.',
            'remittance' => $payload,
        ]);
    }

    public function remit($id)
    {
        $remittance = Remittance::with('submittedBy')->findOrFail($id);
        $user = Auth::user();

        if (!$this->canManageRemittance($user, $remittance)) {
            return response()->json([
                'message' => $this->manageRemittanceDeniedMessage($remittance),
            ], 403);
        }

        if (strtolower((string) $remittance->status) === 'remitted') {
            return response()->json([
                'message' => 'This remittance has already been marked as remitted.',
            ], 422);
        }

        $remittance->update([
            'status' => 'remitted',
        ]);

        $approverUserId = (int) ($user?->user_id ?? 0);

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('recipient_user_id', $approverUserId)
            ->where('title', 'New remittance submitted')
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('title', 'Remittance remitted')
            ->delete();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Marked remittance "' . $remittance->remittance_reference_no . '" as remitted.',
            user: $user
        );

        $payload = $this->broadcastRemittance($remittance, 'updated');

        return response()->json([
            'message' => 'Remittance marked as remitted.',
            'remittance' => $payload,
            'transaction_lock' => $this->transactionLockForUser($user),
        ]);
    }

    public function unremit($id)
    {
        $remittance = Remittance::with('submittedBy')->findOrFail($id);
        $user = Auth::user();

        if (!$this->canManageRemittance($user, $remittance)) {
            return response()->json([
                'message' => $this->manageRemittanceDeniedMessage($remittance),
            ], 403);
        }

        if (strtolower((string) $remittance->status) !== 'remitted') {
            return response()->json([
                'message' => 'Only remitted records can be reverted.',
            ], 422);
        }

        $remittance->update([
            'status' => 'pending',
        ]);

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('title', 'Remittance remitted')
            ->delete();

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Reverted remittance "' . $remittance->remittance_reference_no . '" back to pending.',
            user: $user
        );

        $payload = $this->broadcastRemittance($remittance, 'updated');

        return response()->json([
            'message' => 'Remittance reverted to pending.',
            'remittance' => $payload,
            'transaction_lock' => $this->transactionLockForUser($user),
        ]);
    }

    private function calculateDateAmount(string $date, ?int $createdBy = null): float
    {
        $ticketsTotal = (float) VehicleTicket::query()
            ->whereDate('ticket_date', $date)
            ->when($createdBy, fn ($query) => $query->where('created_by', $createdBy))
            ->whereNull('voided_at')
            ->sum('ticket_fee');

        $paymentsTotal = (float) Payment::query()
            ->whereDate('payment_date', $date)
            ->when($createdBy, fn ($query) => $query->where('received_by', $createdBy))
            ->sum('amount_paid');

        return round($ticketsTotal + $paymentsTotal, 2);
    }

    private function dateCollectionBreakdown(string $date, ?int $createdBy = null): array
    {
        $payments = DB::table('payments as p')
            ->join('bills as b', 'b.bill_id', '=', 'p.bill_id')
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->whereDate('p.payment_date', $date)
            ->when($createdBy, fn ($query) => $query->where('p.received_by', $createdBy))
            ->select([
                DB::raw("'Payment' as transaction"),
                DB::raw("COALESCE(boat.boat_name, '-') as type_name"),
                'p.amount_paid as cash_received',
                DB::raw('COALESCE(p.payment_date, p.created_at) as sort_date'),
                'p.created_at as sort_created_at',
                'p.payment_id as source_id',
            ]);

        $tickets = DB::table('vehicle_tickets as vt')
            ->leftJoin('vehicle_types as vehicle_type', 'vehicle_type.vehicle_type_id', '=', 'vt.vehicle_type_id')
            ->whereDate('vt.ticket_date', $date)
            ->when($createdBy, fn ($query) => $query->where('vt.created_by', $createdBy))
            ->whereNull('vt.voided_at')
            ->select([
                DB::raw("CASE vt.ticket_type WHEN 'annual' THEN 'Annual Vehicle Ticket' ELSE 'Daily Vehicle Ticket' END as transaction"),
                DB::raw("COALESCE(vehicle_type.type_name, '-') as type_name"),
                'vt.ticket_fee as cash_received',
                DB::raw('COALESCE(vt.ticket_date, vt.created_at) as sort_date'),
                'vt.created_at as sort_created_at',
                'vt.ticket_id as source_id',
            ]);

        return DB::query()
            ->fromSub($payments->unionAll($tickets), 'collections')
            ->orderByDesc('sort_date')
            ->orderByDesc('sort_created_at')
            ->orderByDesc('source_id')
            ->get()
            ->map(fn ($row) => [
                'transaction' => $row->transaction,
                'type_name' => $row->type_name,
                'cash_received' => (float) $row->cash_received,
            ])
            ->values()
            ->all();
    }

    private function collectionUserIdForRemittance(?User $user): ?int
    {
        $role = strtolower(trim((string) ($user?->role ?? '')));

        return $role === 'inspector' ? (int) $user->user_id : null;
    }

    private function remittanceProgressForDate(string $date): array
    {
        $ticketCreatorIds = VehicleTicket::query()
            ->whereDate('ticket_date', $date)
            ->whereNull('voided_at')
            ->whereNotNull('created_by')
            ->distinct()
            ->pluck('created_by')
            ->map(fn ($userId) => (int) $userId)
            ->filter()
            ->values();

        if ($ticketCreatorIds->isEmpty()) {
            return [
                'eligible_users' => 0,
                'remitted_users' => 0,
                'pending_users' => 0,
                'percentage' => 0,
                'users' => [],
            ];
        }

        $inspectors = User::query()
            ->whereIn('user_id', $ticketCreatorIds)
            ->where('role', 'inspector')
            ->get(['user_id', 'first_name', 'last_name', 'email']);

        $inspectorIds = $inspectors
            ->pluck('user_id')
            ->map(fn ($userId) => (int) $userId)
            ->values();

        $remittedUserIds = Remittance::query()
            ->whereDate('date', $date)
            ->whereIn('submitted_by', $inspectorIds)
            ->pluck('submitted_by')
            ->map(fn ($userId) => (int) $userId)
            ->unique()
            ->values();

        $eligibleCount = $inspectorIds->count();
        $remittedCount = $remittedUserIds->count();

        return [
            'eligible_users' => $eligibleCount,
            'remitted_users' => $remittedCount,
            'pending_users' => max($eligibleCount - $remittedCount, 0),
            'percentage' => $eligibleCount > 0 ? (int) round(($remittedCount / $eligibleCount) * 100) : 0,
            'users' => $inspectors
                ->map(function (User $user) use ($remittedUserIds) {
                    $name = trim(collect([$user->first_name, $user->last_name])->filter()->join(' '));

                    return [
                        'user_id' => $user->user_id,
                        'name' => $name !== '' ? $name : $user->email,
                        'email' => $user->email,
                        'has_remitted' => $remittedUserIds->contains((int) $user->user_id),
                    ];
                })
                ->values(),
        ];
    }

    private function remittanceSubmittedMessage(Remittance $remittance): string
    {
        $remittance->loadMissing('submittedBy');
        $submittedAt = Carbon::parse($remittance->created_at ?? now())->timezone('Asia/Manila');
        $remittanceDate = Carbon::parse($remittance->date, 'Asia/Manila')->format('F j, Y');
        $submitterRole = strtolower(trim((string) ($remittance->submittedBy?->role ?? '')));
        $lockMessage = $submitterRole === 'coordinator'
            ? 'All transaction now is lock.'
            : 'The submitter daily vehicle tickets are locked now.';

        return 'Remittance "' . $remittance->remittance_reference_no . '" was submitted at ' .
            $submittedAt->format('g:i A') . ' for ' . $remittanceDate . ' with the amount of ₱' .
            number_format((float) $remittance->amount, 2) . '. ' . $lockMessage;
    }
}
