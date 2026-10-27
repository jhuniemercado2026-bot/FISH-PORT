<?php

namespace App\Services;

use App\Events\TransactionUpdated;
use App\Models\Bill;
use App\Models\BillingPenaltyRule;
use App\Models\BillingPenaltySetting;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class DatedBillPenaltyService
{
    public function applyAll(bool $notify = true, ?callable $progress = null): int
    {
        $count = 0;
        $query = Bill::query()->whereNotNull('boat_id')->where(function ($query) {
            $query->whereRaw('total_amount > (select coalesce(sum(amount_paid), 0) from payments where payments.bill_id = bills.bill_id)')
                ->orWhereHas('penalties', fn ($query) => $query->whereNotNull('penalty_rule_id')->where('suspended_amount', '>', 0));
        });
        $total = $progress ? (clone $query)->count() : 0;
        $processed = 0;
        if ($progress) $progress(0, $total);
        $query->orderBy('bill_id')->chunkById(100, function ($bills) use (&$count, &$processed, $total, $notify, $progress) {
            foreach ($bills as $bill) {
                $count += $this->applyToBill($bill->bill_id, $notify);
                if ($progress) $progress(++$processed, $total);
            }
        }, 'bill_id');
        return $count;
    }

    public function applyToBill(int $billId, bool $notify = true): int
    {
        $result = DB::transaction(function () use ($billId) {
            // One lock order for rule changes, assessments, and payment requests.
            $settings = BillingPenaltySetting::whereKey(1)->lockForUpdate()->firstOrFail();
            $rules = BillingPenaltyRule::orderBy('effective_from')->orderBy('id')->get();
            $bill = Bill::whereKey($billId)->lockForUpdate()->first();
            if (!$bill || !$bill->boat_id) return null;
            $principal = $this->cents($bill->total_amount) - $this->cents($bill->penalty_amount);
            $payments = $bill->payments()->get(['amount_paid', 'payment_date']);
            $paid = $payments->sum(fn ($payment) => $this->cents($payment->amount_paid));
            $assessments = $bill->penalties()->get();
            $paidFeeBudget = max(0, $paid - $principal);
            $effectiveCents = 0;
            $changed = false;
            foreach ($assessments as $assessment) {
                $currentCents = $this->cents($assessment->effective_amount);
                $paidFee = min($currentCents, $paidFeeBudget);
                $paidFeeBudget -= $paidFee;
                $rule = $rules->firstWhere('id', $assessment->penalty_rule_id);
                // Historical unlinked assessments retain their original snapshots.
                $targetCents = $currentCents;
                if ($rule && !$rule->is_active) $targetCents = $paidFee;
                elseif ($rule && $principal > $paid) $targetCents = $this->cents($assessment->amount);
                $suspended = $this->cents($assessment->amount) - $targetCents;
                if ($suspended !== $this->cents($assessment->suspended_amount)) {
                    $assessment->forceFill(['suspended_amount' => $suspended / 100])->save();
                    $changed = true;
                }
                $effectiveCents += $targetCents;
            }

            $charges = 0;
            if ($principal > $paid) {
                $anchor = CarbonImmutable::instance($bill->created_at)->setTimezone('Asia/Manila');
                $now = CarbonImmutable::instance(now('Asia/Manila'));
                $periodNumber = (int) $assessments->max('period_number');
                $occupiedDates = $assessments->filter(fn ($entry) => (!$entry->penalty_rule_id
                    && (!$entry->original_penalty_rule_id || $entry->effective_amount > 0))
                    || $rules->firstWhere('id', $entry->penalty_rule_id)?->is_active)
                    ->mapWithKeys(fn ($entry) => [$entry->period_ended_at->format('Y-m-d H:i:s') => true])->all();
                foreach ($rules->where('is_active', true) as $rule) {
                    $from = $rule->effective_from->toDateString();
                    $to = $rule->effective_to?->toDateString();
                    if ($from > $now->toDateString()) continue;
                    for ($period = 1; ; $period++) {
                        $duration = $rule->interval_value * $period;
                        $deadline = match ($rule->interval_unit) {
                            'days' => $anchor->addDays($duration),
                            'months' => $anchor->addMonthsNoOverflow($duration),
                            'years' => $anchor->addYearsNoOverflow($duration),
                        };
                        if ($deadline->greaterThan($now) || ($to && $deadline->toDateString() > $to)) break;
                        if ($deadline->toDateString() < $from) continue;
                        $storedDeadline = $deadline->setTimezone(config('app.timezone', 'Asia/Manila'))->format('Y-m-d H:i:s');
                        if (isset($occupiedDates[$storedDeadline])) continue;
                        $paidAtDeadline = $payments->filter(fn ($payment) =>
                            CarbonImmutable::parse($payment->payment_date, config('app.timezone', 'Asia/Manila'))->lessThanOrEqualTo($deadline)
                        )->sum(fn ($payment) => $this->cents($payment->amount_paid));
                        $base = max(0, $principal - $paidAtDeadline);
                        $amount = $base > 0 ? $this->cents($rule->amount) : 0;
                        $bill->penalties()->create([
                            'penalty_rule_id' => $rule->id, 'period_number' => ++$periodNumber,
                            'settings_version' => $settings->version,
                            'schedule_anchor_at' => $anchor->setTimezone(config('app.timezone', 'Asia/Manila')),
                            'schedule_period_number' => $period, 'period_ended_at' => $storedDeadline,
                            'percentage' => 0, 'fixed_amount' => $rule->amount, 'amount' => $amount / 100,
                            'base_amount' => $base / 100, 'interval_value' => $rule->interval_value,
                            'interval_unit' => $rule->interval_unit, 'suspended_amount' => 0,
                        ]);
                        $occupiedDates[$storedDeadline] = true;
                        $effectiveCents += $amount;
                        $charges++;
                    }
                }
            }
            if (!$changed && $charges === 0) return null;
            $bill->forceFill(['total_amount' => ($principal + $effectiveCents) / 100, 'penalty_amount' => $effectiveCents / 100])->save();
            return ['charges' => $charges, 'bill_id' => $bill->bill_id, 'boat_id' => $bill->boat_id];
        }, 3);
        if (!$result) return 0;
        if ($notify) DB::afterCommit(function () use ($result) {
            try { broadcast(new TransactionUpdated('billing', 'updated', $result)); }
            catch (\Throwable $error) { report($error); }
        });
        return $result['charges'];
    }

    private function cents($value): int
    {
        return (int) round((float) $value * 100);
    }
}
