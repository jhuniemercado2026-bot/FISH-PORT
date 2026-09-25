<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VisitingBoatsReportController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->query('user_id');
        if ($userId !== null && $userId !== '' && $userId !== 'all' && !ctype_digit((string) $userId)) {
            abort(400, 'Invalid user filter.');
        }
        $sourceType = trim((string) $request->query('source_type', ''));
        if ($sourceType !== '' && $sourceType !== 'all' && !in_array($sourceType, ['docking', 'banyera'], true)) {
            abort(400, 'Invalid visiting boat source type.');
        }
        $sourceId = $request->query('source_id');
        if ($sourceId !== null && $sourceId !== '' && $sourceId !== 'all' && !ctype_digit((string) $sourceId)) {
            abort(400, 'Invalid visiting boat filter.');
        }

        $dockings = DB::table('dockings as d')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'd.visiting_boat_type_id')
            ->leftJoin('users as creator', 'creator.user_id', '=', 'd.created_by')
            ->where('d.boat_category', 'visiting')
            ->whereNull('d.voided_at')
            ->when($userId !== null && $userId !== '' && $userId !== 'all', fn ($query) => $query->where('d.created_by', (int) $userId))
            ->select([
                DB::raw("'docking' as source_type"),
                'd.docking_id as source_id',
                DB::raw("'Visiting Boat for Docking' as transaction_type"),
                'd.visiting_boat_name as boat_name',
                DB::raw("TRIM(CONCAT(COALESCE(d.visiting_owner_firstname, ''), ' ', COALESCE(d.visiting_owner_lastname, ''))) as owner_name"),
                'd.visiting_owner_address as owner_address',
                'd.visiting_contact_number as contact_number',
                'boat_type.type_name as boat_type',
                'd.docking_date as transaction_date',
                'd.docking_fee as fee',
                'd.created_at as created_at',
                DB::raw("TRIM(CONCAT(COALESCE(creator.first_name, ''), ' ', COALESCE(creator.last_name, ''))) as created_by_name"),
            ]);

        $banyera = DB::table('banyera_transactions as bt')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'bt.visiting_boat_type_id')
            ->leftJoin('users as creator', 'creator.user_id', '=', 'bt.created_by')
            ->where('bt.boat_category', 'visiting')
            ->whereNull('bt.voided_at')
            ->when($userId !== null && $userId !== '' && $userId !== 'all', fn ($query) => $query->where('bt.created_by', (int) $userId))
            ->select([
                DB::raw("'banyera' as source_type"),
                'bt.banyera_id as source_id',
                DB::raw("'Visiting Boat for Banyera' as transaction_type"),
                'bt.visiting_boat_name as boat_name',
                DB::raw("TRIM(CONCAT(COALESCE(bt.visiting_owner_firstname, ''), ' ', COALESCE(bt.visiting_owner_lastname, ''))) as owner_name"),
                'bt.visiting_owner_address as owner_address',
                'bt.visiting_contact_number as contact_number',
                'boat_type.type_name as boat_type',
                'bt.transaction_date as transaction_date',
                'bt.total_fee as fee',
                'bt.created_at as created_at',
                DB::raw("TRIM(CONCAT(COALESCE(creator.first_name, ''), ' ', COALESCE(creator.last_name, ''))) as created_by_name"),
            ]);

        $visitingBoats = DB::query()
            ->fromSub($dockings->unionAll($banyera), 'visiting_boats')
            ->when($sourceType !== '' && $sourceType !== 'all', fn ($query) => $query->where('source_type', $sourceType))
            ->when($sourceId !== null && $sourceId !== '' && $sourceId !== 'all', fn ($query) => $query->where('source_id', (int) $sourceId))
            ->orderByDesc('transaction_date')
            ->orderByDesc('created_at')
            ->orderByDesc('source_id')
            ->get()
            ->map(fn ($row) => [
                'id' => "{$row->source_type}-{$row->source_id}",
                'source_type' => $row->source_type,
                'source_id' => (int) $row->source_id,
                'transaction_type' => $row->transaction_type,
                'boat_name' => $row->boat_name ?: '-',
                'owner_name' => $row->owner_name ?: '-',
                'owner_address' => $row->owner_address ?: '-',
                'contact_number' => $row->contact_number ?: '-',
                'boat_type' => $row->boat_type ?: '-',
                'transaction_date' => $row->transaction_date,
                'fee' => (float) $row->fee,
                'created_at' => $row->created_at,
                'created_by_name' => $row->created_by_name ?: '-',
            ])
            ->values();

        $total = $visitingBoats->count();

        return response()->json([
            'data' => $visitingBoats,
            'pagination' => [
                'total' => $total,
                'per_page' => $total,
                'current_page' => 1,
                'last_page' => 1,
            ],
        ]);
    }
}
