<?php

namespace App\Http\Controllers;

use App\Models\Boat;
use Illuminate\Http\Request;

class RegisteredBoatsReportController extends Controller
{
    public function index(Request $request)
    {
        // Optimize: Use pagination to avoid loading all boats into memory
        $perPage = (int) $request->query('per_page', 100);
        $perPage = min($perPage, 1000); // Cap at 1000 to prevent abuse

        $boats = Boat::forManagementIndex()
            ->orderByDesc('created_at')
            ->orderByDesc('boat_id')
            ->paginate($perPage);

        return response()->json([
            'data' => $boats->items(),
            'pagination' => [
                'total' => $boats->total(),
                'per_page' => $boats->perPage(),
                'current_page' => $boats->currentPage(),
                'last_page' => $boats->lastPage(),
            ],
        ]);
    }
}
