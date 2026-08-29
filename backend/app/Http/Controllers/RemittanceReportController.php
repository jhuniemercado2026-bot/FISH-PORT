<?php

namespace App\Http\Controllers;

use App\Models\Remittance;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RemittanceReportController extends Controller
{
    private function emptyReportPayload(): array
    {
        return [
            'rows' => [],
            'collectionSources' => [],
            'totalRemittances' => 0,
            'totalTodaysCashReceived' => 0,
            'totalSurplus' => 0,
            'totalDeficit' => 0,
            'totalCollectionSources' => 0,
        ];
    }

    private function collectionSources(?string $date, ?string $month, ?string $year): array
    {
        $payments = DB::table('payments as p')
            ->join('bills as b', 'b.bill_id', '=', 'p.bill_id')
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->select([
                DB::raw("'payment' as source_type"),
                'p.payment_id as source_id',
                DB::raw("'Payment' as transaction"),
                DB::raw("COALESCE(boat.boat_name, '-') as type_name"),
                'p.official_receipt_no',
                'p.payment_date as collection_date',
                'p.amount_paid as cash_received',
                DB::raw('COALESCE(p.payment_date, p.created_at) as sort_date'),
            ]);

        $tickets = DB::table('vehicle_tickets as vt')
            ->leftJoin('vehicle_types as vehicle_type', 'vehicle_type.vehicle_type_id', '=', 'vt.vehicle_type_id')
            ->whereNull('vt.voided_at')
            ->select([
                DB::raw("'vehicle_ticket' as source_type"),
                'vt.ticket_id as source_id',
                DB::raw("CASE vt.ticket_type WHEN 'annual' THEN 'Annual Vehicle Ticket' ELSE 'Daily Vehicle Ticket' END as transaction"),
                DB::raw("COALESCE(vehicle_type.type_name, '-') as type_name"),
                'vt.official_receipt_no',
                'vt.ticket_date as collection_date',
                'vt.ticket_fee as cash_received',
                DB::raw('COALESCE(vt.ticket_date, vt.created_at) as sort_date'),
            ]);

        $query = DB::query()->fromSub($payments->unionAll($tickets), 'collections');

        if ($date) {
            $query->whereDate('collection_date', $date);
        } elseif ($month && $year) {
            $query->whereYear('collection_date', $year)
                ->whereMonth('collection_date', $month);
        } elseif ($year) {
            $query->whereYear('collection_date', $year);
        }

        return $query
            ->orderBy('collection_date')
            ->orderBy('source_type')
            ->orderBy('source_id')
            ->get()
            ->map(fn ($row) => [
                'rowKey' => "{$row->source_type}-{$row->source_id}",
                'sourceType' => $row->source_type,
                'sourceId' => (int) $row->source_id,
                'transaction' => $row->transaction,
                'typeName' => $row->type_name,
                'officialReceiptNo' => $row->official_receipt_no,
                'date' => $row->collection_date,
                'cashReceived' => round((float) $row->cash_received, 2),
            ])
            ->values()
            ->all();
    }

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
            $amountToRemit = (float) ($remittance->amount ?? 0);
            $surplus = (float) ($remittance->surplus ?? 0);
            $deficit = (float) ($remittance->deficit ?? 0);

            return [
                'rowKey' => 'remittance-' . $remittance->remittance_id,
                'date' => optional($remittance->date)->toDateString(),
                'remittanceReferenceNo' => $remittance->remittance_reference_no ?? '-',
                'todaysCashReceived' => round($amountToRemit - $surplus + $deficit, 2),
                'amountToRemit' => round($amountToRemit, 2),
                'confirmedCash' => round($amountToRemit, 2),
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
        $collectionSources = $this->collectionSources($date, $month, $year);

        return [
            'rows' => $rows,
            'collectionSources' => $collectionSources,
            'totalRemittances' => $totalRemittances,
            'totalTodaysCashReceived' => $totalTodaysCashReceived,
            'totalSurplus' => $totalSurplus,
            'totalDeficit' => $totalDeficit,
            'totalCollectionSources' => round((float) collect($collectionSources)->sum('cashReceived'), 2),
        ];
    }

    public function daily(Request $request)
    {
        $date = trim((string) $request->query('date', ''));
        if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals($date, null, null));
    }

    public function monthly(Request $request)
    {
        $month = trim((string) $request->query('month', ''));
        $year = trim((string) $request->query('year', ''));

        if (!preg_match('/^\d{1,2}$/', $month) || !preg_match('/^\d{4}$/', $year)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals(null, $month, $year));
    }

    public function yearly(Request $request)
    {
        $year = trim((string) $request->query('year', ''));
        if (!preg_match('/^\d{4}$/', $year)) {
            return response()->json($this->emptyReportPayload(), 400);
        }

        return response()->json($this->getRemittanceRowsAndTotals(null, null, $year));
    }
}
