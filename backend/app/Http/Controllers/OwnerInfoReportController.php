<?php

namespace App\Http\Controllers;

use App\Models\BoatOwner;
use Illuminate\Http\Request;

class OwnerInfoReportController extends Controller
{
    public function index(Request $request)
    {
        // Optimize: Use pagination to prevent loading all owners into memory
        $perPage = (int) $request->query('per_page', 1000);
        $perPage = min($perPage, 1000); // Cap at 1000

        $owners = BoatOwner::withTrashed()
            ->orderBy('owner_lastname')
            ->orderBy('owner_firstname')
            ->select(['owner_id', 'owner_firstname', 'owner_lastname', 'address', 'contact_number', 'deleted_at'])
            ->paginate($perPage);

        return response()->json([
            'data' => $owners->items(),
            'pagination' => [
                'total' => $owners->total(),
                'per_page' => $owners->perPage(),
                'current_page' => $owners->currentPage(),
                'last_page' => $owners->lastPage(),
            ],
        ]);
    }
}
