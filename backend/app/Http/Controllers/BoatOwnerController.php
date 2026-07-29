<?php

namespace App\Http\Controllers;

use App\Models\BoatOwner;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BoatOwnerController extends Controller
{
    public function index(Request $request)
    {
        $query = BoatOwner::forManagementIndex()
            ->managementFilters($request->query('search', ''), $request->query('usage', $request->query('status', 'all')))
            ->latest();

        if ($request->boolean('all')) {
            $owners = $query->get();
            $owners->each(function ($o) {
                $o->append('full_name');
                $o->createdBy?->append('full_name');
            });

            return response()->json($owners);
        }

        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $owners = $query->paginate($perPage);

        $owners->getCollection()->transform(function ($o) {
            $o->append('full_name');
            $o->createdBy?->append('full_name');

            return $o;
        });

        return response()->json([
            'data' => $owners->items(),
            'meta' => [
                'current_page' => $owners->currentPage(),
                'last_page' => $owners->lastPage(),
                'per_page' => $owners->perPage(),
                'total' => $owners->total(),
                'from' => $owners->firstItem(),
                'to' => $owners->lastItem(),
            ],
            'stats' => [
                'total_owners' => BoatOwner::withTrashed()->count(),
                'boat_owners_in_use' => BoatOwner::active()->has('activeBoats')->count(),
                'boat_owners_not_in_use' => BoatOwner::active()->doesntHave('activeBoats')->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'owner_firstname' => 'required|string|max:50',
            'owner_lastname'  => 'required|string|max:50',
            'address'         => 'required|string',
            'contact_number'  => 'nullable|string|max:11',
        ]);

        $owner = BoatOwner::create([
            ...$validated,
            'created_by' => Auth::id(),
        ]);

        $owner->load('createdBy:user_id,first_name,last_name,email');
        $owner->loadCount('activeBoats as boats_count');
        $owner->append('full_name');
        $owner->createdBy?->append('full_name');
        $owner->makeHidden(['updated_at', 'deleted_at']);

        app(ActivityLogService::class)->log(
            action: 'INSERT',
            module: 'Boat Management',
            details: 'Created boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json($owner, 201);
    }

    public function show($id)
    {
        $owner = BoatOwner::with(['createdBy:user_id,first_name,last_name,email'])
                          ->withCount('activeBoats as boats_count')
                          ->findOrFail($id);

        $owner->append('full_name');
        $owner->createdBy?->append('full_name');

        return response()->json($owner);
    }

    public function update(Request $request, $id)
    {
        $owner = BoatOwner::findOrFail($id);
        $previousName = $owner->full_name;

        $validated = $request->validate([
            'owner_firstname' => 'sometimes|required|string|max:50',
            'owner_lastname'  => 'sometimes|required|string|max:50',
            'address'         => 'sometimes|required|string',
            'contact_number'  => 'nullable|string|max:11',
        ]);

        $owner->update($validated);
        $owner->append('full_name');

        app(ActivityLogService::class)->log(
            action: 'UPDATE',
            module: 'Boat Management',
            details: 'Updated boat owner "' . $previousName . '" to "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json([
            'owner_id' => $owner->owner_id,
            'owner_firstname' => $owner->owner_firstname,
            'owner_lastname' => $owner->owner_lastname,
            'address' => $owner->address,
            'contact_number' => $owner->contact_number,
            'full_name' => $owner->full_name,
        ]);
    }

    public function destroy($id)
    {
        $owner = BoatOwner::findOrFail($id);

        $owner->delete();

        app(ActivityLogService::class)->log(
            action: 'ARCHIVE',
            module: 'Archives',
            details: 'Archived boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner archived successfully.']);
    }

    public function restore($id)
    {
        $owner = BoatOwner::withTrashed()->findOrFail($id);
        $owner->restore();

        app(ActivityLogService::class)->log(
            action: 'RESTORE',
            module: 'Archives',
            details: 'Restored boat owner "' . $owner->full_name . '".',
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner restored successfully.']);
    }

    public function forceDelete($id)
    {
        $owner = BoatOwner::onlyTrashed()->withCount('boats')->findOrFail($id);

        if ($owner->boats_count > 0) {
            return response()->json([
                'message' => 'This boat owner is still linked to existing boats and cannot be permanently deleted.',
            ], 422);
        }

        $details = 'Permanently deleted archived boat owner "' . $owner->full_name . '".';
        $owner->forceDelete();

        app(ActivityLogService::class)->log(
            action: 'DELETE',
            module: 'Archives',
            details: $details,
            user: Auth::user()
        );

        return response()->json(['message' => 'Boat owner permanently deleted successfully.']);
    }
}
