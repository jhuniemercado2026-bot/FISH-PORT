<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CollectionController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 10), 1), 100);
        $page = max((int) $request->query('page', 1), 1);
        $search = trim((string) $request->query('search', ''));

        $baseQuery = $this->collectionQuery($request);
        $this->applyPeriodFilter($baseQuery, (string) $request->query('period', 'all'));

        if ($search !== '') {
            $baseQuery->where(function ($query) use ($search) {
                $query
                    ->where('transaction', 'like', "%{$search}%")
                    ->orWhere('type_name', 'like', "%{$search}%")
                    ->orWhere('official_receipt_no', 'like', "%{$search}%")
                    ->orWhere('cash_received', 'like', "%{$search}%")
                    ->orWhereDate('collection_date', $search);
            });
        }

        $statsQuery = $this->collectionQuery($request);
        $today = now('Asia/Manila')->toDateString();

        $collections = $baseQuery
            ->orderByDesc('sort_date')
            ->orderByDesc('sort_created_at')
            ->orderByDesc('source_id')
            ->paginate($perPage, ['*'], 'page', $page);

        return response()->json([
            'data' => collect($collections->items())->map(fn ($row) => $this->transformCollectionRow($row))->values(),
            'meta' => [
                'current_page' => $collections->currentPage(),
                'last_page' => $collections->lastPage(),
                'per_page' => $collections->perPage(),
                'total' => $collections->total(),
                'from' => $collections->firstItem(),
                'to' => $collections->lastItem(),
            ],
            'stats' => [
                'total_collections' => (float) (clone $statsQuery)->sum('cash_received'),
                'collections_today' => (float) (clone $statsQuery)->whereDate('collection_date', $today)->sum('cash_received'),
                'collection_records' => (clone $statsQuery)->count(),
                'collection_categories' => (clone $statsQuery)->distinct()->count('source_type'),
            ],
        ]);
    }

    private function collectionQuery(Request $request)
    {
        return DB::query()->fromSub($this->collectionUnion($request), 'collections');
    }

    private function collectionUnion(Request $request)
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
                'p.created_at as sort_created_at',
            ]);
        $this->applyFiscalYear($payments, $request, 'p.payment_date');

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
                'vt.created_at as sort_created_at',
            ]);
        $this->applyFiscalYear($tickets, $request, 'vt.ticket_date');

        return $payments->unionAll($tickets);
    }

    private function transformCollectionRow(object $row): array
    {
        return [
            'id' => "{$row->source_type}-{$row->source_id}",
            'source_type' => $row->source_type,
            'source_id' => (int) $row->source_id,
            'transaction' => $row->transaction,
            'type_name' => $row->type_name,
            'official_receipt_no' => $row->official_receipt_no,
            'date' => $row->collection_date,
            'cash_received' => (float) $row->cash_received,
        ];
    }

    private function applyPeriodFilter($query, string $period)
    {
        $now = now('Asia/Manila');

        match ($period) {
            'today' => $query->whereDate('collection_date', $now->toDateString()),
            'week' => $query->whereBetween('collection_date', [
                $now->copy()->startOfWeek()->startOfDay(),
                $now->copy()->endOfWeek()->endOfDay(),
            ]),
            'month' => $query->whereBetween('collection_date', [
                $now->copy()->startOfMonth()->startOfDay(),
                $now->copy()->endOfMonth()->endOfDay(),
            ]),
            default => null,
        };

        return $query;
    }
}
