<?php

namespace App\Http\Controllers;

use App\Models\BoatType;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BoatTypeController extends Controller
{
    public function index(Request $request)
    {
        $query = BoatType::forManagementIndex()
            ->managementFilters($request->query('search', ''), $request->query('usage', $request->query('status', 'all')))
            ->latest();

        if ($request->boolean('all')) {
            $boatTypes = $query->get();

            return response()->json($boatTypes->map(function ($type) {
                return [
                    'boat_type_id' => $type->boat_type_id,
                    'type_name' => $type->type_name,
                ];
            })->values());
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $boatTypes = $query->paginate($perPage);

        return response()->json([
            'data' => $boatTypes->getCollection()->map(function ($type) {
                return [
                    'boat_type_id' => $type->boat_type_id,
                    'type_name' => $type->type_name,
                ];
            })->values(),
            'meta' => [
                'current_page' => $boatTypes->currentPage(),
                'last_page' => $boatTypes->lastPage(),
                'per_page' => $boatTypes->perPage(),
                'total' => $boatTypes->total(),
                'from' => $boatTypes->firstItem(),
                'to' => $boatTypes->lastItem(),
            ],
            'stats' => [
                'total_types' => BoatType::withTrashed()->count(),
                'boat_types_in_use' => BoatType::active()->has('activeBoats')->count(),
                'boat_types_not_in_use' => BoatType::active()->doesntHave('activeBoats')->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type_name' => 'required|string|max:50|unique:boat_types,type_name',
        ]);

        $boatType = BoatType::create([
            'type_name'  => $validated['type_name'],
            'created_by' => Auth::id(),
        ]);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Boat Management',
            details: 'Created boat type "' . $boatType->type_name . '".',
            user: Auth::user()
        );

        return response()->json([
            'boat_type_id' => $boatType->boat_type_id,
            'type_name' => $boatType->type_name,
        ], 201);
    }

    public function show($id)
    {
        $boatType = BoatType::findOrFail($id);

        return response()->json([
            'boat_type_id' => $boatType->boat_type_id,
            'type_name' => $boatType->type_name,
        ]);
    }

    public function update(Request $request, $id)
    {
        $boatType = BoatType::findOrFail($id);
        $previousTypeName = $boatType->type_name;

        $validated = $request->validate([
            'type_name' => 'required|string|max:50|unique:boat_types,type_name,' . $id . ',boat_type_id',
        ]);

        $boatType->update(['type_name' => $validated['type_name']]);

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Boat Management',
            details: 'Updated boat type "' . $previousTypeName . '" to "' . $boatType->type_name . '".',
            user: Auth::user()
        );

        return response()->json([
            'boat_type_id' => $boatType->boat_type_id,
            'type_name' => $boatType->type_name,
        ]);
    }

    public function destroy($id)
    {
        $boatType = BoatType::findOrFail($id);

        $boatType->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Archives',
            details: 'Archived boat type "' . $boatType->type_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat type archived successfully.']);
    }

    public function restore($id)
    {
        $boatType = BoatType::withTrashed()->findOrFail($id);
        $boatType->restore();

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Archives',
            details: 'Restored boat type "' . $boatType->type_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat type restored successfully.']);
    }

    public function forceDelete($id)
    {
        $boatType = BoatType::onlyTrashed()->withCount('boats')->findOrFail($id);

        if ($boatType->boats_count > 0) {
            return response()->json([
                'message' => 'This boat type is still linked to existing boats and cannot be permanently deleted.',
            ], 422);
        }

        $details = 'Permanently deleted archived boat type "' . $boatType->type_name . '".';
        $boatType->forceDelete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Archives',
            details: $details,
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat type permanently deleted successfully.']);
    }
}
