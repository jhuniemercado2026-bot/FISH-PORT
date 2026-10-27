<?php

namespace App\Services;

use App\Events\TransactionUpdated;
use App\Models\Bill;
use App\Models\BillingPenaltySetting;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;

class BillPenaltyService
{
    public function applyOverduePenalties(bool $notify = true): int
    {
        if (Schema::hasTable('billing_penalty_rules') && Schema::hasColumn('bill_penalties', 'penalty_rule_id')) return app(DatedBillPenaltyService::class)->applyAll($notify);
        $settings = BillingPenaltySetting::find(1);
        if (!$settings?->is_active || (float) $settings->amount <= 0) {
            $this->suspendPenalties();
            return 0;
        }

        $count = 0;
        Bill::query()->whereNotNull('boat_id')
            ->whereRaw('total_amount > (select coalesce(sum(amount_paid), 0) from payments where payments.bill_id = bills.bill_id)')
            ->orderBy('bill_id')->chunkById(100, function ($bills) use (&$count, $notify) {
                foreach ($bills as $bill) $count += $this->applyToBill((int) $bill->bill_id, $notify);
            }, 'bill_id');

        return $count;
    }

    public function applyToBill(int $billId, bool $notify = true): int
    {
        if (Schema::hasTable('billing_penalty_rules') && Schema::hasColumn('bill_penalties', 'penalty_rule_id')) return app(DatedBillPenaltyService::class)->applyToBill($billId, $notify);
        $result = DB::transaction(function () use ($billId) {
            // Settings and bill locks serialize policy edits and concurrent assessments.
            $settings = BillingPenaltySetting::whereKey(1)->lockForUpdate()->first();
            if (!$settings?->is_active || (float) $settings->amount <= 0) return null;
            $bill = Bill::whereKey($billId)->lockForUpdate()->first();
            if (!$bill || !$bill->boat_id) return null;

            $principal = $this->cents($bill->total_amount) - $this->cents($bill->penalty_amount);
            $payments = $bill->payments()->get(['amount_paid', 'payment_date']);
            $paid = $payments->sum(fn ($payment) => $this->cents($payment->amount_paid));
            // Only unpaid principal makes the bill eligible for another fixed fee.
            if ($principal <= $paid) return null;

            // Percentage assessments predate the peso rule. Rebuild these unpaid
            // bills from their issue date, rather than continuing the old schedule.
            $repairedLegacy = $bill->penalties()->whereNull('fixed_amount')->exists();
            if ($repairedLegacy) {
                $snapshot = [
                    'bill_id' => $bill->bill_id,
                    'bill_created_at' => $bill->created_at,
                    'total_amount' => $bill->total_amount,
                    'penalty_amount' => $bill->penalty_amount,
                    'settings' => $settings->toArray(),
                    'assessments' => $bill->penalties()->get()->toArray(),
                    'backed_up_at' => now()->toIso8601String(),
                ];
                $backupPath = 'penalty-repairs/' . $bill->bill_id . '-' . Str::uuid() . '.json';
                if (!Storage::disk('local')->put($backupPath, json_encode($snapshot, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR))) {
                    throw new RuntimeException('Unable to back up legacy penalty assessments. No charges were changed.');
                }
                $bill->penalties()->delete();
                $bill->forceFill(['total_amount' => $principal / 100, 'penalty_amount' => 0]);
            }

            $restoredCents = 0;
            foreach ($bill->penalties()->where('suspended_amount', '>', 0)->get() as $assessment) {
                $restoredCents += $this->cents($assessment->suspended_amount);
                $assessment->forceFill(['suspended_amount' => 0])->save();
            }
            if ($restoredCents > 0) {
                $bill->forceFill([
                    'total_amount' => ($this->cents($bill->total_amount) + $restoredCents) / 100,
                    'penalty_amount' => ($this->cents($bill->penalty_amount) + $restoredCents) / 100,
                ]);
            }

            $latest = $bill->penalties()->reorder()->orderByDesc('period_number')->first();
            $sameSchedule = $latest && (int) $latest->settings_version === $settings->version;
            $anchor = CarbonImmutable::parse(
                $sameSchedule ? $latest->schedule_anchor_at : ($latest?->period_ended_at ?? $bill->created_at),
                'Asia/Manila'
            )->setTimezone('Asia/Manila');
            $schedulePeriod = $sameSchedule ? (int) $latest->schedule_period_number + 1 : 1;
            $period = (int) ($latest?->period_number ?? 0) + 1;
            $now = CarbonImmutable::instance(now('Asia/Manila'));
            $fixedCents = $this->cents($settings->amount);
            $addedCents = 0;
            $charges = 0;

            while (true) {
                $duration = $settings->interval_value * $schedulePeriod;
                $periodEnd = match ($settings->interval_unit) {
                    'days' => $anchor->addDays($duration),
                    'months' => $anchor->addMonthsNoOverflow($duration),
                    'years' => $anchor->addYearsNoOverflow($duration),
                };
                if ($periodEnd->greaterThan($now)) break;

                $paidByDeadline = $payments->filter(fn ($payment) =>
                    CarbonImmutable::parse($payment->payment_date, 'Asia/Manila')->lessThanOrEqualTo($periodEnd)
                )->sum(fn ($payment) => $this->cents($payment->amount_paid));
                $baseCents = max(0, $principal - $paidByDeadline);
                $amountCents = $baseCents > 0 ? $fixedCents : 0;

                $bill->penalties()->create([
                    'period_number' => $period++, 'settings_version' => $settings->version,
                    'schedule_anchor_at' => $anchor->setTimezone(config('app.timezone', 'Asia/Manila')),
                    'schedule_period_number' => $schedulePeriod++,
                    'period_ended_at' => $periodEnd->setTimezone(config('app.timezone', 'Asia/Manila')),
                    'percentage' => 0, 'fixed_amount' => $settings->amount,
                    'interval_value' => $settings->interval_value, 'interval_unit' => $settings->interval_unit,
                    'base_amount' => $baseCents / 100, 'amount' => $amountCents / 100,
                ]);
                $addedCents += $amountCents;
                $charges += 1;
            }

            if ($charges === 0 && !$repairedLegacy && $restoredCents === 0) return null;
            $bill->forceFill([
                'total_amount' => ($this->cents($bill->total_amount) + $addedCents) / 100,
                'penalty_amount' => ($this->cents($bill->penalty_amount) + $addedCents) / 100,
            ])->save();

            return ['charges' => $charges, 'bill_id' => $bill->bill_id, 'boat_id' => $bill->boat_id];
        }, 3);

        if (!$result) return 0;
        if ($notify) DB::afterCommit(function () use ($result) {
            try {
                broadcast(new TransactionUpdated('billing', 'updated', $result));
            } catch (\Throwable $error) {
                report($error);
            }
        });
        return $result['charges'];
    }

    public function suspendPenalties(): int
    {
        $count = 0;
        Bill::query()->whereNotNull('boat_id')->where('penalty_amount', '>', 0)
            ->whereRaw('total_amount > (select coalesce(sum(amount_paid), 0) from payments where payments.bill_id = bills.bill_id)')
            ->orderBy('bill_id')->chunkById(100, function ($bills) use (&$count) {
                foreach ($bills as $bill) {
                    $changed = DB::transaction(function () use ($bill) {
                        $settings = BillingPenaltySetting::whereKey(1)->lockForUpdate()->first();
                        if ($settings?->is_active && (float) $settings->amount > 0) return false;
                        $lockedBill = Bill::whereKey($bill->bill_id)->lockForUpdate()->firstOrFail();
                        $principal = $this->cents($lockedBill->total_amount) - $this->cents($lockedBill->penalty_amount);
                        $paid = $lockedBill->payments()->get()->sum(fn ($payment) => $this->cents($payment->amount_paid));
                        // Fees already paid stay recorded; only unpaid fees are removed.
                        $retainedCents = min($this->cents($lockedBill->penalty_amount), max(0, $paid - $principal));
                        if ($retainedCents === $this->cents($lockedBill->penalty_amount)) return false;
                        $remainingPaidFee = $retainedCents;
                        foreach ($lockedBill->penalties()->get() as $assessment) {
                            $feeCents = $this->cents($assessment->amount);
                            $keepCents = min($feeCents, $remainingPaidFee);
                            $remainingPaidFee -= $keepCents;
                            $assessment->forceFill(['suspended_amount' => ($feeCents - $keepCents) / 100])->save();
                        }
                        $lockedBill->forceFill([
                            'total_amount' => ($principal + $retainedCents) / 100,
                            'penalty_amount' => $retainedCents / 100,
                        ])->save();
                        return true;
                    }, 3);
                    if ($changed) $count++;
                }
            }, 'bill_id');
        return $count;
    }

    private function cents($value): int
    {
        return (int) round((float) $value * 100);
    }
}
