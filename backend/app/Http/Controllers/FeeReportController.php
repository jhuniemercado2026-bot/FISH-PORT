<?php

namespace App\Http\Controllers;

use App\Models\Fee;
use App\Enums\FeeTypeName;
use Illuminate\Http\Request;

class FeeReportController extends Controller
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

        $fees = Fee::forFormLookup()
            ->with([
                'boatType:boat_type_id,type_name',
                'vehicleType:vehicle_type_id,type_name',
            ])
            ->whereYear('effective_from', $year)
            ->when($userId !== null && $userId !== '' && $userId !== 'all', fn ($query) => $query->where('created_by', (int) $userId))
            ->orderBy('fee_type_name')
            ->orderBy('effective_from', 'desc')
            ->get()
            ->map(function (Fee $fee) {
                $feeTypeName = $fee->getAttribute('fee_type_name');
                $feeTypeValue = $feeTypeName instanceof FeeTypeName ? $feeTypeName->value : $feeTypeName;

                return [
                    'fee_id' => $fee->fee_id,
                    'fee_type_name' => $feeTypeValue,
                    'fee_name' => $fee->fee_name,
                    'fee_type' => ['fee_name' => $fee->fee_name],
                    'amount' => (float) $fee->amount,
                    'boat_type_id' => $fee->boat_type_id,
                    'vehicle_type_id' => $fee->vehicle_type_id,
                    'boat_type' => $fee->boatType ? [
                        'boat_type_id' => $fee->boatType->boat_type_id,
                        'type_name' => $fee->boatType->type_name,
                    ] : null,
                    'vehicle_type' => $fee->vehicleType ? [
                        'vehicle_type_id' => $fee->vehicleType->vehicle_type_id,
                        'type_name' => $fee->vehicleType->type_name,
                    ] : null,
                    'effective_from' => $fee->effective_from?->toDateString(),
                    'effective_to' => $fee->effective_to?->toDateString(),
                ];
            })
            ->values();

        return response()->json([
            'fees' => $fees,
            'total_records' => $fees->count(),
        ]);
    }
}
