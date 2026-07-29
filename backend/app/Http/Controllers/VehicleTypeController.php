<?php

namespace App\Http\Controllers;

use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\VehicleType;

class VehicleTypeController extends Controller
{
    private function transformVehicleType(VehicleType $type): array
    {
        return [
            'vehicle_type_id' => $type->vehicle_type_id,
            'type_name' => $type->type_name,
            'created_at' => $type->created_at?->toDateTimeString(),
            'created_by_name' => $type->createdBy?->full_name,
            'created_by_email' => $type->createdBy?->email ?? null,
            'tickets_count' => $type->tickets_count ?? 0,
            'daily_tickets_using' => $type->daily_tickets_using ?? 0,
            'annual_tickets_using' => $type->annual_tickets_using ?? 0,
        ];
    }

    public function index(Request $request)
    {
        $compact = $request->boolean('compact');

        $query = VehicleType::query()
            ->active()
            ->with('createdBy:user_id,first_name,last_name,email')
            ->select($compact
                ? ['vehicle_type_id', 'type_name', 'created_by']
                : ['vehicle_type_id', 'type_name', 'created_at', 'created_by']
            );

        if (!$compact) {
            $query->withCount([
                'vehicleTickets as tickets_count' => function ($query) use ($request) {
                    $query->whereNull('voided_at');
                    $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
                },
                'vehicleTickets as daily_tickets_using' => function ($query) use ($request) {
                    $query->where('ticket_type', 'daily')
                        ->whereNull('voided_at');
                    $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
                },
                'vehicleTickets as annual_tickets_using' => function ($query) use ($request) {
                    $query->where('ticket_type', 'annual')
                        ->whereNull('voided_at');
                    $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
                },
            ]);
        }

        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');

        if ($search !== '') {
            $query->where('type_name', 'like', "{$search}%");
        }

        if (in_array($status, ['used', 'active'], true)) {
            $query->whereHas('vehicleTickets', function ($query) use ($request) {
                $query->whereNull('voided_at');
                $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
            });
        } elseif (in_array($status, ['unused', 'inactive'], true)) {
            $query->whereDoesntHave('vehicleTickets', function ($query) use ($request) {
                $query->whereNull('voided_at');
                $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
            });
        }

        $summaryQuery = (clone $query);
        $summaryActiveTotal = (clone $summaryQuery)->count();
        $summaryTotal = VehicleType::withTrashed()->count();
        $summaryUsed = (clone $summaryQuery)
            ->whereHas('vehicleTickets', function ($query) use ($request) {
                $query->whereNull('voided_at');
                $this->applyFiscalYear($query, $request, 'vehicle_tickets.ticket_date');
            })
            ->count();
        $summaryUnused = max(0, $summaryActiveTotal - $summaryUsed);

        $query->orderByDesc('created_at')->orderByDesc('vehicle_type_id');

        if ($request->boolean('paginated')) {
            $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
            $page = max((int) $request->query('page', 1), 1);
            $page = $this->highlightedVehicleTypePage($query, $request->query('highlight_vehicle_type_id'), $page, $perPage);
            $vehicleTypes = $query->paginate($perPage, ['*'], 'page', $page);

            return response()->json([
                'data' => $vehicleTypes->getCollection()->map(fn (VehicleType $type) => $compact
                    ? [
                        'vehicle_type_id' => $type->vehicle_type_id,
                        'type_name' => $type->type_name,
                        'created_by_name' => $type->createdBy?->full_name,
                        'created_by_email' => $type->createdBy?->email,
                    ]
                    : $this->transformVehicleType($type)
                )->values(),
                'meta' => [
                    'current_page' => $vehicleTypes->currentPage(),
                    'last_page' => $vehicleTypes->lastPage(),
                    'per_page' => $vehicleTypes->perPage(),
                    'total' => $vehicleTypes->total(),
                    'from' => $vehicleTypes->firstItem(),
                    'to' => $vehicleTypes->lastItem(),
                ],
                'summary' => [
                    'total' => $summaryTotal,
                    'used' => $summaryUsed,
                    'unused' => $summaryUnused,
                ],
            ]);
        }

        return response()->json([
            'data' => $query->get()->map(fn (VehicleType $type) => $compact
                ? [
                    'vehicle_type_id' => $type->vehicle_type_id,
                    'type_name' => $type->type_name,
                    'created_by_name' => $type->createdBy?->full_name,
                    'created_by_email' => $type->createdBy?->email,
                ]
                : $this->transformVehicleType($type)
            )->values(),
            'summary' => [
                'total' => $summaryTotal,
                'used' => $summaryUsed,
                'unused' => $summaryUnused,
            ],
        ]);
    }

    private function highlightedVehicleTypePage($query, ?string $highlightId, int $requestedPage, int $perPage): int
    {
        $highlightId = trim((string) $highlightId);

        if ($highlightId === '' || !ctype_digit($highlightId)) {
            return $requestedPage;
        }

        $target = (clone $query)
            ->reorder()
            ->where('vehicle_type_id', (int) $highlightId)
            ->first(['vehicle_type_id', 'created_at']);

        if (!$target?->created_at) {
            return $requestedPage;
        }

        $rowsBeforeTarget = (clone $query)
            ->reorder()
            ->where(function ($positionQuery) use ($target) {
                $positionQuery
                    ->where('created_at', '>', $target->created_at)
                    ->orWhere(function ($createdAtTieQuery) use ($target) {
                        $createdAtTieQuery
                            ->where('created_at', $target->created_at)
                            ->where('vehicle_type_id', '>', $target->vehicle_type_id);
                    });
            })
            ->count();

        return max(1, intdiv($rowsBeforeTarget, $perPage) + 1);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type_name' => 'required|string|max:100|unique:vehicle_types,type_name',
        ]);

        $vehicleType = VehicleType::create([
            'type_name' => $validated['type_name'],
            'created_by' => Auth::id(),
        ]);

        $vehicleType->load('createdBy:user_id,first_name,last_name,email');
        $vehicleType->loadCount([
            'vehicleTickets as tickets_count' => function ($query) {
                $query->whereNull('voided_at');
            },
            'vehicleTickets as daily_tickets_using' => function ($query) {
                $query->where('ticket_type', 'daily')
                    ->whereNull('voided_at');
            },
            'vehicleTickets as annual_tickets_using' => function ($query) {
                $query->where('ticket_type', 'annual')
                    ->whereNull('voided_at');
            },
        ]);
        $vehicleType->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Vehicle Tickets',
            details: 'Created vehicle type "' . $vehicleType->type_name . '".',
            user: Auth::user()
        );

        return response()->json($this->transformVehicleType($vehicleType), 201);
    }

    public function update(Request $request, $id)
    {
        $vehicleType = VehicleType::findOrFail($id);

        $validated = $request->validate([
            'type_name' => 'required|string|max:100|unique:vehicle_types,type_name,' . $id . ',vehicle_type_id',
        ]);

        $vehicleType->update([
            'type_name' => $validated['type_name'],
        ]);

        $vehicleType->load('createdBy:user_id,first_name,last_name,email');
        $vehicleType->loadCount([
            'vehicleTickets as tickets_count' => function ($query) {
                $query->whereNull('voided_at');
            },
            'vehicleTickets as daily_tickets_using' => function ($query) {
                $query->where('ticket_type', 'daily')
                    ->whereNull('voided_at');
            },
            'vehicleTickets as annual_tickets_using' => function ($query) {
                $query->where('ticket_type', 'annual')
                    ->whereNull('voided_at');
            },
        ]);
        $vehicleType->createdBy?->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Vehicle Tickets',
            details: 'Updated vehicle type "' . $vehicleType->type_name . '".',
            user: Auth::user()
        );

        return response()->json($this->transformVehicleType($vehicleType));
    }

    public function destroy($id)
    {
        $vehicleType = VehicleType::findOrFail($id);

        $vehicleType->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Archives',
            details: 'Archived vehicle type "' . $vehicleType->type_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Vehicle type archived successfully.']);
    }

    public function restore($id)
    {
        $vehicleType = VehicleType::onlyTrashed()->findOrFail($id);
        $vehicleType->load('createdBy:user_id,first_name,last_name,email');
        $vehicleTypeName = $vehicleType->type_name;

        $vehicleType->restore();
        $vehicleType->load('createdBy:user_id,first_name,last_name,email');

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Archives',
            details: 'Restored vehicle type "' . $vehicleTypeName . '".',
            user: Auth::user()
        );

        return response()->json([
            'message' => 'Vehicle type restored successfully.',
            'vehicle_type' => $this->transformVehicleType($vehicleType),
        ]);
    }
}
