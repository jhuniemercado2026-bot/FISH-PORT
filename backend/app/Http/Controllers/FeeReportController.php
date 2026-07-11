<?php

namespace App\Http\Controllers;

use App\Models\Fee;
use Carbon\Carbon;
use Illuminate\Http\Request;

class FeeReportController extends Controller
{
    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
        ]);

        $year = (int) $validated['year'];
        $startOfYear = Carbon::create($year, 1, 1)->startOfDay();
        $endOfYear = Carbon::create($year, 12, 31)->endOfDay();

        $fees = Fee::forFormLookup()
            ->with([
                'boatType:boat_type_id,type_name',
                'vehicleType:vehicle_type_id,type_name',
            ])
            ->where(function ($query) use ($startOfYear, $endOfYear) {
                $query->whereDate('effective_from', '<=', $endOfYear)
                    ->where(function ($subQuery) use ($startOfYear) {
                        $subQuery->whereNull('effective_to')
                            ->orWhereDate('effective_to', '>=', $startOfYear);
                    });
            })
            ->orderBy('fee_type_name')
            ->orderBy('effective_from', 'desc')
            ->get();

        return response()->json([
            'fees' => $fees,
            'total_records' => $fees->count(),
        ]);
    }
}
