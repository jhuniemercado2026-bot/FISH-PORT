<?php

namespace App\Http\Controllers;

use App\Models\BoatType;
use Illuminate\Http\Request;

class BoatTypesReportController extends Controller
{
    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
        ]);

        $year = (int) $validated['year'];
        $userId = $request->query('user_id');
        if ($userId !== null && $userId !== '' && $userId !== 'all' && !ctype_digit((string) $userId)) {
            abort(400, 'Invalid user filter.');
        }
        $boatTypeId = $request->query('boat_type_id');
        if ($boatTypeId !== null && $boatTypeId !== '' && $boatTypeId !== 'all' && !ctype_digit((string) $boatTypeId)) {
            abort(400, 'Invalid boat type filter.');
        }

        $boatTypesQuery = BoatType::withTrashed()
            ->select(['boat_type_id', 'type_name', 'created_at', 'deleted_at'])
            ->withCount([
                'boats as usage_count' => function ($query) use ($year, $userId) {
                    $query->withTrashed()->whereYear('created_at', $year);

                    if ($userId !== null && $userId !== '' && $userId !== 'all') {
                        $query->where('created_by', (int) $userId);
                    }
                },
            ]);

        if ($boatTypeId !== null && $boatTypeId !== '' && $boatTypeId !== 'all') {
            $boatTypesQuery->where('boat_type_id', (int) $boatTypeId);
        }

        $boatTypes = $boatTypesQuery
            ->orderByDesc('created_at')
            ->orderByDesc('boat_type_id')
            ->get();

        return response()->json([
            'boat_types' => $boatTypes,
            'total_usage' => $boatTypes->sum('usage_count'),
            'year' => (string) $year,
        ]);
    }
}
