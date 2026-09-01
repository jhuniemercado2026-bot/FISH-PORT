<?php

namespace App\Http\Controllers;

use App\Models\Docking;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DockingReportController extends Controller
{
    private function applyUserFilter($query, Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId === null || $userId === '' || $userId === 'all') return $query;
        if (!ctype_digit((string) $userId)) abort(400, 'Invalid user filter.');

        return $query->where('dockings.created_by', (int) $userId);
    }

    private function buildReportQuery()
    {
        return Docking::query()
            ->select([
                'dockings.docking_id',
                'dockings.boat_id',
                'dockings.docking_date',
                'dockings.docking_fee',
                'boats.boat_name',
                'boat_types.type_name',
            ])
            ->with([
                'boat' => fn ($query) => $query->select(['boat_id', 'boat_name', 'boat_type_id']),
                'boat.boatType' => fn ($query) => $query->select(['boat_type_id', 'type_name']),
            ])
            ->join('boats', 'boats.boat_id', '=', 'dockings.boat_id')
            ->leftJoin('boat_types', 'boat_types.boat_type_id', '=', 'boats.boat_type_id');
    }

    private function renderReport($query)
    {
        // Optimize: select only what we need and aggregate at DB level
        $rows = $query->orderBy('dockings.docking_date')
            ->orderBy('dockings.created_at')
            ->get()
            ->map(function (Docking $docking) {
                return [
                    'docking_id' => $docking->docking_id,
                    'docking_date' => $docking->docking_date?->format('Y-m-d H:i:s'),
                    'docking_fee' => (float) $docking->docking_fee,
                    'boat' => $docking->boat ? [
                        'boat_name' => $docking->boat->boat_name,
                        'boat_type' => $docking->boat->boatType ? [
                            'type_name' => $docking->boat->boatType->type_name,
                        ] : null,
                    ] : null,
                ];
            });

        $totalFee = $rows->sum('docking_fee');

        return response()->json([
            'rows' => $rows,
            'total_records' => $rows->count(),
            'total_fee' => round($totalFee, 2),
        ]);
    }

    public function daily(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
        ]);

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();

        $query = $this->buildReportQuery()
            ->whereDate('dockings.docking_date', $date);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }

    public function monthly(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'regex:/^(0[1-9]|1[0-2])$/'],
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildReportQuery()
            ->whereYear('dockings.docking_date', (int) $validated['year'])
            ->whereMonth('dockings.docking_date', (int) $validated['month']);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }

    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildReportQuery()
            ->whereYear('dockings.docking_date', (int) $validated['year']);

        return $this->renderReport($this->applyUserFilter($query, $request));
    }
}
