<?php

namespace App\Http\Controllers;

use App\Events\TransactionUpdated;
use App\Models\BillPenalty;
use App\Models\BillingPenaltyRule;
use App\Services\PenaltyRuleState;
use App\Services\ActivityLogService;
use App\Services\DatedBillPenaltyService;
use App\Services\PenaltyToggleProgress;
use Illuminate\Support\Str;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BillingPenaltyRuleController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()?->role === 'head', 403);
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:200'],
            'status' => ['nullable', Rule::in(['all', 'on', 'off'])],
            'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $today = now('Asia/Manila')->toDateString();
        $query = BillingPenaltyRule::query();
        if ($search = trim($filters['search'] ?? '')) $query->where('name', 'like', '%' . $search . '%');
        match ($filters['status'] ?? 'all') {
            'on' => $query->where('is_active', true),
            'off' => $query->where('is_active', false),
            default => null,
        };
        $query->select('billing_penalty_rules.*')->selectRaw('(select count(*) from bill_penalties where penalty_rule_id = billing_penalty_rules.id or original_penalty_rule_id = billing_penalty_rules.id) as assessment_count');
        $records = $query->orderByDesc('effective_from')->orderByDesc('id')->paginate($filters['per_page'] ?? 10);
        $records->through(fn ($rule) => $this->payload($rule));
        return response()->json(['data' => $records->items(), 'today' => $today, 'meta' => [
            'current_page' => $records->currentPage(), 'last_page' => $records->lastPage(),
            'per_page' => $records->perPage(), 'total' => $records->total(), 'from' => $records->firstItem(), 'to' => $records->lastItem(),
        ]]);
    }

    public function store(Request $request, DatedBillPenaltyService $penalties)
    {
        abort_unless($request->user()?->role === 'head', 403);
        $values = $this->validated($request, false);
        $values['interval_unit'] = 'months';
        $rule = DB::transaction(function () use ($values, $request, $penalties) {
            BillingPenaltyRule::lockAll();
            $values['is_active'] ??= true;
            $this->validateWindow($values);
            $rule = BillingPenaltyRule::create([...$values, 'created_by' => $request->user()->getKey()]);
            $penalties->applyAll(false);
            app(ActivityLogService::class)->log(action: 'INSERT', module: 'Boat Bill Penalty',
                details: 'Added penalty rule "' . $rule->name . '" at PHP ' . $rule->amount . '.', user: $request->user());
            return $rule;
        }, 3);
        $this->broadcastChange();
        return response()->json(['message' => 'Penalty record added. Eligible bills have been updated.', 'data' => $this->payload($rule)], 201);
    }

    public function progress(Request $request, string $token, PenaltyToggleProgress $progress)
    {
        abort_unless($request->user()?->role === 'head', 403);
        abort_unless(Str::isUuid($token), 404);
        return response()->json(['data' => $progress->read($token, (int) $request->user()->getKey())]);
    }

    public function update(Request $request, int $id, DatedBillPenaltyService $penalties, PenaltyToggleProgress $progress)
    {
        abort_unless($request->user()?->role === 'head', 403);
        $values = $this->validated($request, true);
        $tracking = $request->validate(['progress_id' => ['nullable', 'uuid']]);
        $token = $tracking['progress_id'] ?? null;
        if ($token) $progress->start($token, (int) $request->user()->getKey(), $id);
        $lastProgress = -1;
        $onProgress = $token ? function (int $processed, int $total) use ($progress, $token, &$lastProgress) {
            $percent = $total ? min(90, 5 + (int) floor($processed / $total * 85)) : 90;
            if ($percent === $lastProgress) return;
            $lastProgress = $percent;
            $progress->update($token, ['progress' => $percent, 'processed' => $processed, 'total' => $total]);
        } : null;
        try {
            $rule = DB::transaction(function () use ($id, $values, $request, $penalties, $progress, $token, $onProgress) {
                BillingPenaltyRule::lockAll();
                $rule = BillingPenaltyRule::whereKey($id)->lockForUpdate()->firstOrFail();
                if ($token) $progress->update($token, ['progress' => 5]);
                if (!$token && $rule->is_active && ($values['is_active'] ?? true)) $penalties->applyAll(false);
                $before = $rule->only(['name', 'amount', 'interval_value', 'interval_unit', 'effective_from', 'effective_to', 'is_active']);
                $rule->fill($values);
                $lastAssessment = BillPenalty::where(fn ($query) => $query->where('penalty_rule_id', $rule->id)
                    ->orWhere('original_penalty_rule_id', $rule->id))->max('period_ended_at');
                if ($lastAssessment && $rule->isDirty(['amount', 'interval_value', 'interval_unit'])) {
                    throw ValidationException::withMessages(['amount' => 'This record already has bill charges. Add a new dated penalty record to change its amount or month interval.']);
                }
                $lastAssessmentDate = $lastAssessment ? CarbonImmutable::parse($lastAssessment, config('app.timezone', 'Asia/Manila'))
                    ->setTimezone('Asia/Manila')->toDateString() : null;
                if ($lastAssessmentDate && $rule->isDirty('effective_to') && $rule->effective_to && $rule->effective_to->toDateString() < $lastAssessmentDate) {
                    throw ValidationException::withMessages(['effective_to' => 'The end date cannot exclude penalty periods already recorded on bills.']);
                }
                if ($rule->is_active || $rule->isDirty(['effective_from', 'effective_to'])) {
                    $this->validateWindow($rule->toArray(), $rule->id);
                }
                if ($rule->isDirty()) $rule->revision += 1;
                $rule->save();
                $penalties->applyAll(false, $onProgress);
                app(ActivityLogService::class)->log(action: 'UPDATE', module: 'Boat Bill Penalty',
                    details: app(ActivityLogService::class)->describeChanges($before, $rule->only(array_keys($before))), user: $request->user());
                return $rule;
            }, 3);
            if ($token) $progress->update($token, ['progress' => 95]);
            $this->broadcastChange();
            if ($token) $progress->update($token, ['progress' => 100, 'status' => 'completed']);
            return response()->json(['message' => 'Penalty record updated. Bill balances have been refreshed.', 'data' => $this->payload($rule)]);
        } catch (\Throwable $error) {
            if ($token) $progress->update($token, ['status' => 'failed', 'message' => $error instanceof ValidationException
                ? collect($error->errors())->flatten()->first() : 'Penalty update failed. Please try again.']);
            throw $error;
        }
    }

    private function validated(Request $request, bool $partial): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $values = $request->validate([
            'name' => [$required, 'required', 'string', 'max:100'],
            'amount' => [$required, 'required', 'numeric', 'between:0.01,9999999999.99', 'decimal:0,2'],
            'interval_value' => [$required, 'required', 'integer', 'between:1,36500'],
            'interval_unit' => ['sometimes', 'required', Rule::in(['months'])],
            'effective_from' => [$required, 'required', 'date_format:Y-m-d'],
            'effective_to' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'is_active' => ['sometimes', 'required', 'boolean'],
        ]);
        if (!$values) throw ValidationException::withMessages(['name' => 'No changes were provided.']);
        return $values;
    }

    private function validateWindow(array $values, ?int $ignore = null): void
    {
        $from = CarbonImmutable::parse($values['effective_from'])->toDateString();
        $to = empty($values['effective_to']) ? null : CarbonImmutable::parse($values['effective_to'])->toDateString();
        if ($to && $to < $from) throw ValidationException::withMessages(['effective_to' => 'The end date must be on or after the start date.']);
        $overlaps = BillingPenaltyRule::query()->when($ignore, fn ($query) => $query->whereKeyNot($ignore))
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhere('effective_to', '>=', $from))
            ->when($to, fn ($query) => $query->where('effective_from', '<=', $to))->exists();
        if ($overlaps) {
            throw ValidationException::withMessages(['effective_from' => 'These dates overlap an existing penalty record. Choose a separate date range. If the existing record has no end date, set its Effective To before adding a later penalty. Turning a record Off does not free its dates.']);
        }
    }

    private function payload(BillingPenaltyRule $rule): array
    {
        return [...$rule->toArray(),
            'has_assessments' => isset($rule->assessment_count) ? $rule->assessment_count > 0 : BillPenalty::where(fn ($query) =>
                $query->where('penalty_rule_id', $rule->id)->orWhere('original_penalty_rule_id', $rule->id))->exists(),
            'status' => $rule->is_active ? 'on' : 'off',
        ];
    }

    private function broadcastChange(): void
    {
        try { broadcast(new TransactionUpdated('bill-penalty-settings', 'updated', app(PenaltyRuleState::class)->current())); }
        catch (\Throwable $error) { report($error); }
    }
}
