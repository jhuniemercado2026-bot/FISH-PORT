<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use App\Models\Notification;
use App\Models\Remittance;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Services\ActivityLogService;
use App\Services\TransactionLockService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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
        return [
            'remittance_id' => $remittance->remittance_id,
            'remittance_reference_no' => $remittance->remittance_reference_no,
            'date' => optional($remittance->date)->toDateString(),
            'amount' => round((float) $remittance->amount, 2),
            'surplus' => round((float) $remittance->surplus, 2),
            'deficit' => round((float) $remittance->deficit, 2),
            'status' => $remittance->status,
            'remarks' => $remittance->remarks,
        ];
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
        $statsQuery = (clone $query)->reorder();
        $stats = [
            'total_remittances' => (float) (clone $statsQuery)->sum('amount'),
            'total_surplus' => (float) (clone $statsQuery)->sum('surplus'),
            'total_deficit' => (float) (clone $statsQuery)->sum('deficit'),
        ];

        if ($request->boolean('all')) {
            $remittances = $query->get()->map(fn (Remittance $remittance) => $this->remittancePayload($remittance));

            return response()->json([
                'data' => $remittances,
                'stats' => $stats,
                'transaction_lock' => $this->transactionLockService->getActiveLock(),
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
            'transaction_lock' => $this->transactionLockService->getActiveLock(),
        ]);
    }

    public function todaySystemCashReceived(Request $request)
    {
        $date = Carbon::parse($request->query('date', now('Asia/Manila')->toDateString()), 'Asia/Manila')->toDateString();

        return response()->json([
            'date' => $date,
            'amount' => $this->calculateDateAmount($date),
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
            ->exists();

        if ($duplicateExists) {
            return response()->json([
                'message' => 'A remittance record for this date already exists.',
                'errors' => [
                    'date' => ['A remittance record for this date already exists.'],
                ],
            ], 422);
        }

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();
        $todayCashReceived = $this->calculateDateAmount($date);
        $amount = round((float) $validated['amount'], 2);

        if ($todayCashReceived <= 0) {
            return response()->json([
                'message' => 'No cash collections were found for the selected date.',
                'errors' => [
                    'date' => ['No cash collections were found for the selected date.'],
                ],
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

        // Immediately set a server-side transaction lock based on this submission so
        // other endpoints will be view-only while this remittance stands.
        try {
            $this->transactionLockService->setLockForRemittance($remittance);
        } catch (\Throwable $e) {
            // best-effort: do not prevent remittance creation if lock write fails
        }

        $headUserId = $this->resolveHeadUserId();

        Notification::create([
            'title' => 'New remittance submitted',
            'message' => 'Remittance "' . $remittance->remittance_reference_no . '" was submitted for ' .
                Carbon::createFromFormat('Y-m-d', $date, 'Asia/Manila')->format('F j, Y') . '.',
            'recipient_user_id' => $headUserId,
            'sender_user_id' => Auth::id(),
            'related_type' => 'remittance',
            'related_id' => $remittance->remittance_id,
            'is_read' => false,
        ]);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Remittance',
            details: 'Created remittance "' . $remittance->remittance_reference_no . '" for date "' . $date .
                '" with amount "PHP ' . number_format((float) $remittance->amount, 2) . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Remittance submitted successfully.',
            'remittance' => $this->remittancePayload($remittance),
            'transaction_lock' => $this->transactionLockService->getActiveLock(),
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
            $todayCashReceived = $this->calculateDateAmount($date);

            if ($todayCashReceived <= 0) {
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

        $headUserId = $this->resolveHeadUserId();

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('recipient_user_id', $headUserId)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Updated remittance "' . $remittance->remittance_reference_no . '" for date "' . $date .
                '" to amount "PHP ' . number_format((float) $remittance->amount, 2) . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Remittance updated successfully.',
            'remittance' => $this->remittancePayload($remittance),
        ]);
    }

    public function remit($id)
    {
        $remittance = Remittance::findOrFail($id);
        $user = Auth::user();

        if (($user?->role ?? null) !== 'head') {
            return response()->json([
                'message' => 'Only the head can mark remittances as remitted.',
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

        $remittedAt = Carbon::now('Asia/Manila');
        $remittanceDate = Carbon::parse($remittance->date, 'Asia/Manila')->toDateString();
        $headUserId = $this->resolveHeadUserId();
        $coordinatorUserId = $this->resolveCoordinatorRecipientUserId($remittance);
        $remittedMessage = 'Remittance "' . $remittance->remittance_reference_no . '" was remitted at ' .
            $remittedAt->format('g:i A') . ' for ' . $remittanceDate . ' with the amount of PHP ' .
            number_format((float) $remittance->amount, 2) . '. All transaction are close now.';

        Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('recipient_user_id', $headUserId)
            ->where('title', 'New remittance submitted')
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        $this->upsertRemittanceStatusNotification(
            remittance: $remittance,
            recipientUserId: $headUserId,
            senderUserId: $user?->user_id,
            message: $remittedMessage,
            isRead: false,
        );

        $this->upsertRemittanceStatusNotification(
            remittance: $remittance,
            recipientUserId: $coordinatorUserId,
            senderUserId: $user?->user_id,
            message: $remittedMessage,
            isRead: false,
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Marked remittance "' . $remittance->remittance_reference_no . '" as remitted.',
            user: $user
        );

        return response()->json([
            'message' => 'Remittance marked as remitted.',
            'remittance' => $this->remittancePayload($remittance),
            'transaction_lock' => $this->transactionLockService->getActiveLock(),
        ]);
    }

    public function unremit($id)
    {
        $remittance = Remittance::findOrFail($id);
        $user = Auth::user();

        if (($user?->role ?? null) !== 'head') {
            return response()->json([
                'message' => 'Only the head can undo remitted records.',
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

        $this->upsertRemittanceStatusNotification(
            remittance: $remittance,
            recipientUserId: $this->resolveHeadUserId(),
            senderUserId: $user?->user_id,
            message: null,
            isRead: true,
        );

        $this->upsertRemittanceStatusNotification(
            remittance: $remittance,
            recipientUserId: $this->resolveCoordinatorRecipientUserId($remittance),
            senderUserId: $user?->user_id,
            message: null,
            isRead: true,
        );

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Remittance',
            details: 'Reverted remittance "' . $remittance->remittance_reference_no . '" back to pending.',
            user: $user
        );

        return response()->json([
            'message' => 'Remittance reverted to pending.',
            'remittance' => $this->remittancePayload($remittance),
            'transaction_lock' => $this->transactionLockService->getActiveLock(),
        ]);
    }

    private function calculateDateAmount(string $date): float
    {
        $paymentsTotal = (float) Payment::query()
            ->whereBetween('payment_date', [$date . ' 00:00:00', $date . ' 23:59:59'])
            ->sum('amount_paid');

        $ticketsTotal = (float) VehicleTicket::query()
            ->whereDate('ticket_date', $date)
            ->whereNull('voided_at')
            ->sum('ticket_fee');

        return round($paymentsTotal + $ticketsTotal, 2);
    }

    private function resolveHeadUserId(): ?int
    {
        return User::query()
            ->where('role', 'head')
            ->orderBy('user_id')
            ->value('user_id');
    }

    private function resolveCoordinatorRecipientUserId(Remittance $remittance): ?int
    {
        $submittedBy = (int) ($remittance->submitted_by ?? 0);
        if ($submittedBy > 0) {
            return $submittedBy;
        }

        return User::query()
            ->where('role', 'coordinator')
            ->orderBy('user_id')
            ->value('user_id');
    }

    private function upsertRemittanceStatusNotification(
        Remittance $remittance,
        ?int $recipientUserId,
        ?int $senderUserId,
        ?string $message,
        bool $isRead
    ): void {
        if (!$recipientUserId) {
            return;
        }

        $notification = Notification::query()
            ->where('related_type', 'remittance')
            ->where('related_id', $remittance->remittance_id)
            ->where('recipient_user_id', $recipientUserId)
            ->where('title', 'Remittance remitted')
            ->latest('notification_id')
            ->first();

        $payload = [
            'title' => 'Remittance remitted',
            'sender_user_id' => $senderUserId,
            'is_read' => $isRead,
            'read_at' => $isRead ? now() : null,
        ];

        if ($message !== null) {
            $payload['message'] = $message;
        }

        if ($notification) {
            $notification->update($payload);
            return;
        }

        Notification::create([
            ...$payload,
            'message' => $message ?? 'Remittance status updated.',
            'recipient_user_id' => $recipientUserId,
            'related_type' => 'remittance',
            'related_id' => $remittance->remittance_id,
        ]);
    }
}
