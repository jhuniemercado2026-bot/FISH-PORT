<?php

namespace App\Http\Controllers;

use App\Models\Boat;

class RegisteredBoatsReportController extends Controller
{
    public function index()
    {
        $boats = Boat::withTrashed()
            ->select('boat_id', 'boat_name', 'owner_id', 'boat_type_id', 'image_path', 'image_public_id', 'status', 'created_at', 'created_by', 'deleted_at')
            ->with(Boat::managementRelations())
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
