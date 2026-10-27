<?php

namespace App\Http\Controllers;

use App\Models\BillingPenaltySetting;
use App\Events\TransactionUpdated;
use App\Services\ActivityLogService;
use App\Services\BillPenaltyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BillingPenaltySettingController extends Controller
{
    public function show(Request $request)
    {
        abort_unless($request->user()?->role === 'head', 403);
        return response()->json(['data' => BillingPenaltySetting::findOrFail(1)]);
    }

    public function state()
    {
        return response()->json(['data' => BillingPenaltySetting::findOrFail(1)->only([
            'is_active', 'amount', 'interval_value', 'interval_unit', 'version', 'updated_at',
        ])]);
    }

    public function entries(Request $request, BillPenaltyService $penalties)
    {
        abort_unless($request->user()?->role === 'head', 403);
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', Rule::in(['all', 'applied', 'suspended', 'partial', 'zero'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50, 100])],
        ]);
        $penalties->applyOverduePenalties();
        $query = DB::table('bill_penalties as p')
            ->join('bills as b', 'b.bill_id', '=', 'p.bill_id')
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->select('p.*', 'b.bill_reference_no', 'b.created_at as bill_created_at', 'boat.boat_name');
        $search = trim($filters['search'] ?? '');
        if ($search !== '') {
            $query->where(fn ($query) => $query
                ->where('b.bill_reference_no', 'like', '%' . $search . '%')
                ->orWhere('boat.boat_name', 'like', '%' . $search . '%'));
        }
        match ($filters['status'] ?? 'all') {
            'applied' => $query->where('p.amount', '>', 0)->where('p.suspended_amount', '=', 0),
            'suspended' => $query->where('p.amount', '>', 0)->whereColumn('p.suspended_amount', '>=', 'p.amount'),
            'partial' => $query->where('p.suspended_amount', '>', 0)->whereColumn('p.suspended_amount', '<', 'p.amount'),
            'zero' => $query->where('p.amount', '<=', 0),
            default => null,
        };
        $entries = $query->orderByDesc('p.period_ended_at')->orderByDesc('p.id')
            ->paginate($filters['per_page'] ?? 10);
        $entries->through(function ($row) {
            $amount = (float) $row->amount;
            $suspended = (float) $row->suspended_amount;
            return [
                'id' => $row->id, 'bill_id' => $row->bill_id,
                'bill_reference_no' => $row->bill_reference_no,
                'bill_created_at' => $row->bill_created_at, 'boat_name' => $row->boat_name ?? '-',
                'period_ended_at' => $row->period_ended_at, 'period_number' => $row->period_number,
                'interval_value' => $row->interval_value, 'interval_unit' => $row->interval_unit,
                'amount' => $amount, 'applied_amount' => max(0, round($amount - $suspended, 2)),
                'status' => $amount <= 0 ? 'zero' : ($suspended >= $amount ? 'suspended' : ($suspended > 0 ? 'partial' : 'applied')),
            ];
        });
        return response()->json([
            'data' => $entries->items(),
            'meta' => [
                'current_page' => $entries->currentPage(), 'last_page' => $entries->lastPage(),
                'per_page' => $entries->perPage(), 'total' => $entries->total(),
                'from' => $entries->firstItem(), 'to' => $entries->lastItem(),
            ],
        ]);
    }

    public function update(Request $request, BillPenaltyService $penalties)
    {
        abort_unless($request->user()?->role === 'head', 403);
        abort_if(\Illuminate\Support\Facades\Schema::hasTable('billing_penalty_rules'), 409,
            'Penalties now use dated records. Refresh Settings and edit the specific penalty record.');
        $validated = $request->validate([
            'amount' => ['sometimes', 'required', 'numeric', 'between:0.01,9999999999.99', 'decimal:0,2'],
            'percentage' => ['prohibited'],
            'interval_value' => ['sometimes', 'required', 'integer', 'between:1,36500'],
            'interval_unit' => ['sometimes', 'required', Rule::in(['days', 'months', 'years'])],
            'is_active' => ['sometimes', 'required', 'boolean'],
        ]);
        abort_if($validated === [], 422, 'No penalty settings were provided.');

        $settings = DB::transaction(function () use ($validated, $request, $penalties) {
            $settings = BillingPenaltySetting::whereKey(1)->lockForUpdate()->firstOrFail();
            // Keep completed assessments under the old fee when editing its terms.
            // Switching off removes unpaid fees without creating new assessments.
            if ($settings->is_active && ($validated['is_active'] ?? true)) {
                $penalties->applyOverduePenalties(false);
            }
            $before = $settings->only(['amount', 'interval_value', 'interval_unit', 'is_active']);
            $settings->fill($validated);
            if ($settings->is_active && (float) $settings->amount <= 0) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'amount' => 'Set a penalty amount in pesos before activating the rule.',
                ]);
            }
            if ($settings->isDirty(['amount', 'interval_value', 'interval_unit'])) $settings->version += 1;
            $settings->updated_by = $request->user()->getKey();
            $settings->save();
            if ($settings->is_active) {
                $penalties->applyOverduePenalties(false);
            } else {
                $penalties->suspendPenalties();
            }
            app(ActivityLogService::class)->log(
                action: 'UPDATE', module: 'Boat Bill Penalty',
                details: app(ActivityLogService::class)->describeChanges($before, $settings->only(array_keys($before))),
                user: $request->user()
            );
            return $settings;
        });

        try {
            broadcast(new TransactionUpdated('bill-penalty-settings', 'updated', $settings->toArray()));
        } catch (\Throwable $error) {
            report($error);
        }

        return response()->json(['message' => $settings->is_active
            ? 'Penalty is on. Eligible bill balances have been updated.'
            : 'Penalty is off. Unpaid penalty charges have been removed from bill balances.', 'data' => $settings]);
    }
}
