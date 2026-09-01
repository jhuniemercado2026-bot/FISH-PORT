<?php

namespace App\Http\Controllers;

use App\Models\Boat;
use Illuminate\Http\Request;

class RegisteredBoatsReportController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId !== null && $userId !== '' && $userId !== 'all' && !ctype_digit((string) $userId)) {
            abort(400, 'Invalid user filter.');
        }
        $boatId = $request->query('boat_id');
        if ($boatId !== null && $boatId !== '' && $boatId !== 'all' && !ctype_digit((string) $boatId)) {
            abort(400, 'Invalid boat filter.');
        }

        $query = Boat::withTrashed()
            ->select('boat_id', 'boat_name', 'owner_id', 'boat_type_id', 'image_path', 'image_public_id', 'status', 'created_at', 'created_by', 'deleted_at')
            ->with(Boat::managementRelations());

        if ($userId !== null && $userId !== '' && $userId !== 'all') {
            $query->where('created_by', (int) $userId);
        }

        if ($boatId !== null && $boatId !== '' && $boatId !== 'all') {
            $query->where('boat_id', (int) $boatId);
        }

        $boats = $query
            ->orderByDesc('created_at')
            ->orderByDesc('boat_id')
            ->get()
            ->map(fn (Boat $boat) => $boat->makeVisible('deleted_at'))
            ->values();

        $total = $boats->count();

        return response()->json([
            'data' => $boats,
            'pagination' => [
                'total' => $total,
                'per_page' => $total,
                'current_page' => 1,
                'last_page' => 1,
            ],
        ]);
    }
}
