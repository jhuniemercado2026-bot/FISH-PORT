<?php

namespace App\Http\Controllers;

use App\Models\VehicleTicket;
use App\Services\ActivityLogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class VehicleTicketController extends Controller
{
    private function hasDuplicateAnnualPlateNumber(
        ?string $plateNumber,
        ?string $ticketDate,
        ?string $endDate,
        ?int $ignoreTicketId = null
    ): bool {
        $normalizedPlate = mb_strtolower(trim((string) $plateNumber));

        if ($normalizedPlate === '' || !$ticketDate) {
            return false;
        }

        $newStart = Carbon::parse($ticketDate, 'Asia/Manila')->toDateString();
        $newEnd = $endDate
            ? Carbon::parse($endDate, 'Asia/Manila')->toDateString()
            : $newStart;

        $query = VehicleTicket::query()
            ->where('ticket_type', 'annual')
            ->whereNull('voided_at')
            ->whereRaw('LOWER(TRIM(plate_number)) = ?', [$normalizedPlate]);

        if ($ignoreTicketId) {
            $query->where('ticket_id', '!=', $ignoreTicketId);
        }

        return $query->get()->contains(function ($ticket) use ($newStart, $newEnd) {
            $existingStart = $ticket->ticket_date ? Carbon::parse($ticket->ticket_date, 'Asia/Manila')->toDateString() : '';
            $existingEnd = $ticket->end_date ? Carbon::parse($ticket->end_date, 'Asia/Manila')->toDateString() : ($ticket->ticket_date ? Carbon::parse($ticket->ticket_date, 'Asia/Manila')->toDateString() : '');

            if ($existingStart === '') {
                return false;
            }

            return $existingStart <= $newEnd && $existingEnd >= $newStart;
        });
    }

    private function ticketDateIsInFuture(?string $dateValue): bool
    {
        if (!$dateValue) {
            return false;
        }

        $ticketDate = Carbon::parse($dateValue, 'Asia/Manila')->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        return $ticketDate > $today;
    }

    private function prepareTicketForResponse(VehicleTicket $ticket): VehicleTicket
    {
        $ticket->createdBy?->append('full_name');
        $ticket->voidedBy?->append('full_name');
        $createdByName = trim((string) ($ticket->createdBy?->full_name ?? ''));
        $voidedByName = trim((string) ($ticket->voidedBy?->full_name ?? ''));

        $ticket->setAttribute('created_by_name', $createdByName !== '' ? $createdByName : $ticket->createdBy?->email);
        $ticket->setAttribute('voided_by_name', $voidedByName !== '' ? $voidedByName : $ticket->voidedBy?->email);
        $ticket->setAttribute('is_voided', !is_null($ticket->voided_at));
        $ticket->setAttribute('status', $this->resolveStatus($ticket));

        return $ticket;
    }

    private function loadTicketRelations(VehicleTicket $ticket): void
    {
        $ticket->load([
            'vehicleType',
            'fee',
            'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
            'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
        ]);
    }

    private function ticketStats(Request $request): array
    {
        $today = Carbon::now('Asia/Manila');
        $fiscalYear = $this->fiscalYear($request);
        $statsDate = $fiscalYear
            ? $today->copy()->year($fiscalYear)->toDateString()
            : $today->toDateString();
        $activeQuery = VehicleTicket::query()->whereNull('voided_at');
        $this->applyFiscalYear($activeQuery, $request, 'vehicle_tickets.ticket_date');

        $dailyCollectionsToday = (float) (clone $activeQuery)
            ->where('ticket_type', 'daily')
            ->whereDate('ticket_date', $statsDate)
            ->sum('ticket_fee');
        $annualCollectionsToday = (float) (clone $activeQuery)
            ->where('ticket_type', 'annual')
            ->whereDate('ticket_date', $statsDate)
            ->sum('ticket_fee');

        return [
            'annual_tickets' => (clone $activeQuery)->where('ticket_type', 'annual')->count(),
            'daily_tickets' => (clone $activeQuery)->where('ticket_type', 'daily')->count(),
            'annual_tickets_today' => (clone $activeQuery)->where('ticket_type', 'annual')->whereDate('ticket_date', $statsDate)->count(),
            'daily_tickets_today' => (clone $activeQuery)->where('ticket_type', 'daily')->whereDate('ticket_date', $statsDate)->count(),
            'daily_collections_today' => $dailyCollectionsToday,
            'annual_collections_today' => $annualCollectionsToday,
            'today_collections' => $dailyCollectionsToday + $annualCollectionsToday,
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
            ->where('ticket_id', (int) $highlightId)
            ->first(['ticket_id', 'ticket_date', 'created_at']);

        if (!$target?->ticket_date || !$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('ticket_date', '>', $target->ticket_date)
                    ->orWhere(function ($dateTieQuery) use ($target) {
                        $dateTieQuery
                            ->where('ticket_date', $target->ticket_date)
                            ->where(function ($createdTieQuery) use ($target) {
                                $createdTieQuery
                                    ->where('created_at', '>', $target->created_at)
                                    ->orWhere(function ($idTieQuery) use ($target) {
                                        $idTieQuery
                                            ->where('created_at', $target->created_at)
                                            ->where('ticket_id', '>', $target->ticket_id);
                                    });
                            });
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function index(Request $request)
    {
        $query = VehicleTicket::query()
            ->forTableIndex()
            ->searchTable($request->query('search'), $request->query('ticket_type'))
            ->tableFilters([
                'period' => $request->query('period', 'all'),
                'vehicle_type' => $request->query('vehicle_type', 'all'),
                'ticket_type' => $request->query('ticket_type', 'all'),
                'status' => $request->query('status', 'all'),
            ])
            ->tableSort((string) $request->query('sort', 'latest'));
        $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');

        if ($request->boolean('all')) {
            $tickets = $query->get();
            $tickets->each(fn ($ticket) => $this->prepareTicketForResponse($ticket));

            return response()->json($tickets);
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $page = $this->highlightedPage($query, $request->query('highlight_ticket_id'), $page, $perPage);
        $tickets = $query->paginate($perPage, ['*'], 'page', $page);

        $tickets->getCollection()->transform(function ($ticket) {
            return $this->prepareTicketForResponse($ticket);
        });

        return response()->json([
            'data' => $tickets->items(),
            'meta' => [
                'current_page' => $tickets->currentPage(),
                'last_page' => $tickets->lastPage(),
                'per_page' => $tickets->perPage(),
                'total' => $tickets->total(),
                'from' => $tickets->firstItem(),
                'to' => $tickets->lastItem(),
            ],
            'stats' => $request->boolean('include_stats', true) ? $this->ticketStats($request) : null,
        ]);
    }

    public function store(Request $request)
    {
        $request->merge([
            'control_number' => $request->filled('control_number') ? trim((string) $request->input('control_number')) : null,
            'official_receipt_no' => $request->filled('official_receipt_no') ? trim((string) $request->input('official_receipt_no')) : null,
            'plate_number' => $request->filled('plate_number') ? trim((string) $request->input('plate_number')) : null,
            'driver_name' => $request->filled('driver_name') ? trim((string) $request->input('driver_name')) : null,
        ]);

        $validated = $request->validate([
            'control_number' => [
                'nullable',
                'string',
                'max:100',
                Rule::when(
                    ($request->input('ticket_type') ?? null) === 'annual',
                    Rule::unique('vehicle_tickets', 'control_number')
                ),
            ],
            'official_receipt_no' => [
                'nullable',
                Rule::requiredIf(fn () => ($request->input('ticket_type') ?? null) === 'annual'),
                'digits:6',
                Rule::unique('vehicle_tickets', 'official_receipt_no'),
            ],
            'vehicle_type_id' => 'required|exists:vehicle_types,vehicle_type_id',
            'plate_number' => 'nullable|string|max:50',
            'driver_name' => 'nullable|string|max:150',
            'ticket_type' => 'required|in:annual,daily',
            'fee_id' => 'required|exists:fees,fee_id',
            'daily_fee' => 'nullable|numeric|min:0',
            'banyera_fee' => 'nullable|numeric|min:0',
            'ticket_fee' => 'required|numeric|min:0',
            'ticket_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:ticket_date',
        ]);

        if ($this->ticketDateIsInFuture($validated['ticket_date'] ?? null)) {
            return response()->json([
                'message' => 'Ticket date cannot be in the future.',
                'errors' => [
                    'ticket_date' => ['Ticket date cannot be in the future.'],
                ],
            ], 422);
        }

        if (
            ($validated['ticket_type'] ?? null) === 'annual' &&
            $this->hasDuplicateAnnualPlateNumber(
                $validated['plate_number'] ?? null,
                $validated['ticket_date'] ?? null,
                $validated['end_date'] ?? null
            )
        ) {
            return response()->json([
                'message' => 'An annual vehicle ticket with this plate number already exists for the same coverage period.',
                'errors' => [
                    'plate_number' => ['An annual vehicle ticket with this plate number already exists for the same coverage period.'],
                ],
            ], 422);
        }

        $ticket = VehicleTicket::create([
            ...$validated,
            'control_number' => ($validated['ticket_type'] ?? null) === 'annual' ? ($validated['control_number'] ?? null) : null,
            'official_receipt_no' => ($validated['ticket_type'] ?? null) === 'annual'
                ? (($validated['official_receipt_no'] ?? null) ? trim($validated['official_receipt_no']) : null)
                : null,
            'daily_fee' => $validated['daily_fee'] ?? 0,
            'banyera_fee' => $validated['banyera_fee'] ?? 0,
            'plate_number' => $validated['plate_number'] ?? '',
            'created_by' => Auth::id(),
        ]);

        $this->loadTicketRelations($ticket);
        $this->prepareTicketForResponse($ticket);
        $vehicleTypeName = trim((string) ($ticket->vehicleType?->type_name ?? 'vehicle type'));

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Vehicle Tickets',
            details: 'Created ' . strtolower((string) $ticket->ticket_type) .
                ' vehicle ticket for vehicle type "' . $vehicleTypeName . '" with the amount of ' .
                "\u{20B1}" . number_format((float) $ticket->ticket_fee, 2) . '.',
            user: Auth::user()
        );

        return response()->json($ticket, 201);
    }

    public function show($id)
    {
        $ticket = VehicleTicket::with([
            'vehicleType',
            'fee',
            'createdBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
            'voidedBy' => fn ($query) => $query->select('user_id', 'first_name', 'last_name', 'email'),
        ])->findOrFail($id);
        $this->prepareTicketForResponse($ticket);

        return response()->json($ticket);
    }

    public function dailyIndex(Request $request)
    {
        $request->query->set('ticket_type', 'daily');

        return $this->index($request);
    }

    public function annualIndex(Request $request)
    {
        $request->query->set('ticket_type', 'annual');

        return $this->index($request);
    }

    public function update(Request $request, $id)
    {
        $ticket = VehicleTicket::findOrFail($id);

        if (($ticket->ticket_type ?? null) === 'daily') {
            return response()->json([
                'message' => 'Daily vehicle ticket records cannot be edited. Void the ticket instead if it was entered by mistake.',
            ], 422);
        }

        if (!is_null($ticket->voided_at)) {
            return response()->json([
                'message' => 'This vehicle ticket has already been voided and can no longer be updated.',
            ], 422);
        }

        $request->merge([
            'control_number' => $request->filled('control_number') ? trim((string) $request->input('control_number')) : null,
            'official_receipt_no' => $request->filled('official_receipt_no') ? trim((string) $request->input('official_receipt_no')) : null,
            'plate_number' => $request->filled('plate_number') ? trim((string) $request->input('plate_number')) : null,
            'driver_name' => $request->filled('driver_name') ? trim((string) $request->input('driver_name')) : null,
        ]);

        $validated = $request->validate([
            'control_number' => [
                'nullable',
                'string',
                'max:100',
                Rule::when(
                    ($request->input('ticket_type') ?? null) === 'annual',
                    Rule::unique('vehicle_tickets', 'control_number')
                        ->ignore($ticket->ticket_id, 'ticket_id')
                ),
            ],
            'official_receipt_no' => [
                'nullable',
                Rule::requiredIf(fn () => ($request->input('ticket_type') ?? null) === 'annual'),
                'digits:6',
                Rule::unique('vehicle_tickets', 'official_receipt_no')
                    ->ignore($ticket->ticket_id, 'ticket_id'),
            ],
            'vehicle_type_id' => 'required|exists:vehicle_types,vehicle_type_id',
            'plate_number' => 'nullable|string|max:50',
            'driver_name' => 'nullable|string|max:150',
            'ticket_type' => 'required|in:annual,daily',
            'fee_id' => 'required|exists:fees,fee_id',
            'ticket_fee' => 'required|numeric|min:0',
            'ticket_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:ticket_date',
        ]);

        if (($validated['ticket_type'] ?? null) === 'daily') {
            return response()->json([
                'message' => 'Daily vehicle ticket records cannot be edited. Void the ticket instead if it was entered by mistake.',
            ], 422);
        }

        if ($this->ticketDateIsInFuture($validated['ticket_date'] ?? null)) {
            return response()->json([
                'message' => 'Ticket date cannot be in the future.',
                'errors' => [
                    'ticket_date' => ['Ticket date cannot be in the future.'],
                ],
            ], 422);
        }

        if (
            ($validated['ticket_type'] ?? null) === 'annual' &&
            $this->hasDuplicateAnnualPlateNumber(
                $validated['plate_number'] ?? null,
                $validated['ticket_date'] ?? null,
                $validated['end_date'] ?? null,
                (int) $ticket->ticket_id
            )
        ) {
            return response()->json([
                'message' => 'An annual vehicle ticket with this plate number already exists for the same coverage period.',
                'errors' => [
                    'plate_number' => ['An annual vehicle ticket with this plate number already exists for the same coverage period.'],
                ],
            ], 422);
        }

        $ticket->update([
            ...$validated,
            'control_number' => ($validated['ticket_type'] ?? null) === 'annual' ? ($validated['control_number'] ?? null) : null,
            'official_receipt_no' => ($validated['ticket_type'] ?? null) === 'annual'
                ? (($validated['official_receipt_no'] ?? null) ? trim($validated['official_receipt_no']) : null)
                : null,
            'daily_fee' => $validated['daily_fee'] ?? 0,
            'banyera_fee' => $validated['banyera_fee'] ?? 0,
            'plate_number' => $validated['plate_number'] ?? '',
        ]);
        $this->loadTicketRelations($ticket);
        $this->prepareTicketForResponse($ticket);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Vehicle Tickets',
            details: 'Updated ' . $ticket->ticket_type . ' vehicle ticket' .
                ($ticket->control_number ? ' "' . $ticket->control_number . '"' : '') . '.',
            user: Auth::user()
        );

        return response()->json($ticket);
    }

    public function void(Request $request, $id)
    {
        $ticket = VehicleTicket::findOrFail($id);

        if (!is_null($ticket->voided_at)) {
            return response()->json([
                'message' => 'This vehicle ticket has already been voided.',
            ], 422);
        }

        $validated = $request->validate([
            'void_reason' => 'required|string|max:500',
        ]);

        $ticket->update([
            'void_reason' => trim($validated['void_reason']),
            'voided_at' => now(),
            'voided_by' => Auth::id(),
        ]);

        $this->loadTicketRelations($ticket);
        $this->prepareTicketForResponse($ticket);

        app(ActivityLogService::class)->log(
            action: 'VOID',
            module: 'Vehicle Tickets',
            details: 'Voided ' . $ticket->ticket_type . ' vehicle ticket' .
                ($ticket->control_number ? ' "' . $ticket->control_number . '"' : '') .
                ' with reason: "' . trim($validated['void_reason']) . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Vehicle ticket voided successfully.',
            'ticket' => $ticket,
        ]);
    }

    public function unvoid($id)
    {
        $ticket = VehicleTicket::findOrFail($id);

        if (is_null($ticket->voided_at)) {
            return response()->json([
                'message' => 'This vehicle ticket is not voided.',
            ], 422);
        }

        $ticket->update([
            'void_reason' => null,
            'voided_at' => null,
            'voided_by' => null,
        ]);

        $this->loadTicketRelations($ticket);
        $this->prepareTicketForResponse($ticket);

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Vehicle Tickets',
            details: 'Restored voided ' . $ticket->ticket_type . ' vehicle ticket' .
                ($ticket->control_number ? ' "' . $ticket->control_number . '"' : '') . '.',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Vehicle ticket restored successfully.',
            'ticket' => $ticket,
        ]);
    }

    public function destroy($id)
    {
        return response()->json([
            'message' => 'Vehicle ticket records cannot be deleted or archived.',
        ], 422);
    }

    private function resolveStatus(VehicleTicket $ticket): string
    {
        if (!is_null($ticket->voided_at)) {
            return 'voided';
        }

        $today = Carbon::now('Asia/Manila')->startOfDay();
        $ticketDate = $ticket->ticket_date ? Carbon::parse($ticket->ticket_date, 'Asia/Manila')->startOfDay() : null;
        $endDate = $ticket->end_date ? Carbon::parse($ticket->end_date, 'Asia/Manila')->startOfDay() : null;

        if ($endDate && $endDate->lt($today)) {
            return 'expired';
        }

        if ($ticketDate && $ticketDate->gt($today)) {
            return 'pending';
        }

        return 'active';
    }
}
