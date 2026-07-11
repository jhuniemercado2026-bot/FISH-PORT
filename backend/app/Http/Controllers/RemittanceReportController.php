<?php

namespace App\Http\Controllers;

use App\Models\Remittance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RemittanceReportController extends Controller
{
    private function getRemittanceRowsAndTotals(?string $date, ?string $month, ?string $year): array
    {
        $query = Remittance::query();

        if ($date) {
            $query->whereDate('date', $date);
        } elseif ($month && $year) {
            $query->whereYear('date', $year)
                ->whereMonth('date', $month);
        } elseif ($year) {
            $query->whereYear('date', $year);
        }

        $remittances = $query
            ->orderBy('date')
            ->orderBy('created_at')
            ->orderBy('remittance_id')
            ->get([
                'remittance_id',
                'remittance_reference_no',
                'date',
                'amount',
                'surplus',
                'deficit',
                'remarks',
                'status',
                'created_at',
            ]);

        $rows = $remittances->map(function (Remittance $remittance) {
            $confirmedCash = (float) ($remittance->amount ?? 0);
            $surplus = (float) ($remittance->surplus ?? 0);
            $deficit = (float) ($remittance->deficit ?? 0);

            return [
                'rowKey' => 'remittance-' . $remittance->remittance_id,
                'date' => optional($remittance->date)->toDateString(),
                'remittanceReferenceNo' => $remittance->remittance_reference_no ?? '-',
                'todaysCashReceived' => round($confirmedCash - $surplus + $deficit, 2),
                'confirmedCash' => round($confirmedCash, 2),
                'surplus' => round($surplus, 2),
                'deficit' => round($deficit, 2),
                'remarks' => $remittance->remarks ?? '-',
                'status' => strtoupper((string) ($remittance->status ?? '-')),
            ];
        })->all();

        // Calculate totals at DB level for better performance
        $totals = (clone $query)
            ->reorder()
            ->select(
                DB::raw('SUM(amount) as totalAmount'),
                DB::raw('SUM(surplus) as totalSurplus'),
                DB::raw('SUM(deficit) as totalDeficit')
            )
            ->first();

        $totalRemittances = round((float) ($totals->totalAmount ?? 0), 2);
        $totalSurplus = round((float) ($totals->totalSurplus ?? 0), 2);
        $totalDeficit = round((float) ($totals->totalDeficit ?? 0), 2);
        $totalTodaysCashReceived = round($totalRemittances - $totalSurplus + $totalDeficit, 2);

        return [
            'rows' => $rows,
            'totalRemittances' => $totalRemittances,
            'totalTodaysCashReceived' => $totalTodaysCashReceived,
            'totalSurplus' => $totalSurplus,
            'totalDeficit' => $totalDeficit,
        ];
    }

    public function daily(Request $request)
    {
        $date = trim((string) $request->query('date', ''));
        if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json(['rows' => [], 'totalRemittances' => 0, 'totalTodaysCashReceived' => 0, 'totalSurplus' => 0, 'totalDeficit' => 0], 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals($date, null, null));
    }

    public function monthly(Request $request)
    {
        $month = trim((string) $request->query('month', ''));
        $year = trim((string) $request->query('year', ''));

        if (!preg_match('/^\d{1,2}$/', $month) || !preg_match('/^\d{4}$/', $year)) {
            return response()->json(['rows' => [], 'totalRemittances' => 0, 'totalTodaysCashReceived' => 0, 'totalSurplus' => 0, 'totalDeficit' => 0], 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals(null, $month, $year));
    }

    public function yearly(Request $request)
    {
        $year = trim((string) $request->query('year', ''));
        if (!preg_match('/^\d{4}$/', $year)) {
            return response()->json(['rows' => [], 'totalRemittances' => 0, 'totalTodaysCashReceived' => 0, 'totalSurplus' => 0, 'totalDeficit' => 0], 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals(null, null, $year));
    }
}
