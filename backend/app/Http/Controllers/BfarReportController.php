<?php

namespace App\Http\Controllers;

use App\Models\BanyeraTransaction;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class BfarReportController extends Controller
{
    private function applyUserFilter($query, Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId === null || $userId === '' || $userId === 'all') return $query;
        if (!ctype_digit((string) $userId)) abort(400, 'Invalid user filter.');

        return $query->where('banyera_transactions.created_by', (int) $userId);
    }

    private function applyBoatFilter($query, Request $request)
    {
        $boatId = $request->query('boat_id');
        $sourceType = trim((string) $request->query('source_type', ''));
        $sourceId = $request->query('source_id');

        if ($boatId !== null && $boatId !== '' && $boatId !== 'all') {
            if (!ctype_digit((string) $boatId)) abort(400, 'Invalid boat filter.');
            return $query->where('banyera_transactions.boat_id', (int) $boatId);
        }

        if ($sourceType !== '' && $sourceType !== 'all') {
            if (!in_array($sourceType, ['docking', 'banyera'], true)) abort(400, 'Invalid visiting boat source type.');
            if ($sourceId !== null && $sourceId !== '' && $sourceId !== 'all') {
                if (!ctype_digit((string) $sourceId)) abort(400, 'Invalid visiting boat filter.');
                return $query->where('banyera_transactions.banyera_id', (int) $sourceId)
                    ->where('banyera_transactions.boat_category', 'visiting');
            }
            return $query->where('banyera_transactions.boat_category', 'visiting');
        }

        if ($sourceId !== null && $sourceId !== '' && $sourceId !== 'all') {
            if (!ctype_digit((string) $sourceId)) abort(400, 'Invalid visiting boat filter.');
            return $query->where('banyera_transactions.banyera_id', (int) $sourceId)
                ->where('banyera_transactions.boat_category', 'visiting');
        }

        return $query;
    }

    private function renderReportFromQuery($query)
    {
        // Fetch items directly from DB with JOIN for better performance
        $rows = $query
            ->leftJoin('banyera_items', 'banyera_items.banyera_id', '=', 'banyera_transactions.banyera_id')
            ->leftJoin('fish_classifications', 'fish_classifications.classification_id', '=', 'banyera_items.classification_id')
            ->select([
                'banyera_transactions.banyera_id',
                'banyera_transactions.boat_category',
                'banyera_transactions.transaction_date',
                'banyera_transactions.visiting_boat_name',
                'boats.boat_name',
                'fish_classifications.classification_name',
                'banyera_items.quantity',
                'banyera_items.daug',
            ])
            ->leftJoin('boats', 'boats.boat_id', '=', 'banyera_transactions.boat_id')
            ->orderBy('banyera_transactions.transaction_date')
            ->orderBy('banyera_transactions.banyera_id')
            ->orderBy('banyera_items.item_id')
            ->get()
            ->map(function ($item, $index) {
                $boatName = $item->boat_category === 'visiting'
                    ? ($item->visiting_boat_name ?: $item->boat_name)
                    : ($item->boat_name ?: $item->visiting_boat_name);
                $classificationName = $item->classification_name;
                $banyeraId = $item->banyera_id;

                return [
                    'rowKey' => 'bfar-' . $banyeraId . '-' . $index,
                    'date' => $item->transaction_date ? Carbon::parse($item->transaction_date, 'Asia/Manila')->format('Y-m-d H:i:s') : null,
                    'boat_category' => $item->boat_category ?? 'registered',
                    'boat_name' => $boatName,
                    'visiting_boat_name' => $item->visiting_boat_name,
                    'classification_name' => $classificationName,
                    'qty' => (int) ($item->quantity ?? 0),
                    'daug' => (float) ($item->daug ?? 0),
                ];
            });

        return response()->json([
            'rows' => $rows->values(),
            'total_records' => $rows->count(),
        ]);
    }

    private function buildBaseQuery()
    {
        return BanyeraTransaction::query()
            ->whereNull('banyera_transactions.voided_at');
    }

    public function daily(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
        ]);

        $date = Carbon::parse($validated['date'], 'Asia/Manila')->toDateString();
        $query = $this->buildBaseQuery()
            ->whereDate('banyera_transactions.transaction_date', $date);

        return $this->renderReportFromQuery(
            $this->applyBoatFilter($this->applyUserFilter($query, $request), $request)
        );
    }

    public function monthly(Request $request)
    {
        $validated = $request->validate([
            'month' => ['required', 'regex:/^(0[1-9]|1[0-2])$/'],
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildBaseQuery()
            ->whereYear('banyera_transactions.transaction_date', (int) $validated['year'])
            ->whereMonth('banyera_transactions.transaction_date', (int) $validated['month']);

        return $this->renderReportFromQuery(
            $this->applyBoatFilter($this->applyUserFilter($query, $request), $request)
        );
    }

    public function yearly(Request $request)
    {
        $validated = $request->validate([
            'year' => ['required', 'digits:4'],
        ]);

        $query = $this->buildBaseQuery()
            ->whereYear('banyera_transactions.transaction_date', (int) $validated['year']);

        return $this->renderReportFromQuery(
            $this->applyBoatFilter($this->applyUserFilter($query, $request), $request)
        );
    }
}
