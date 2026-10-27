<?php

namespace App\Services;

use App\Models\BillingPenaltyRule;

class PenaltyRuleState
{
    public function current(): array
    {
        $rules = BillingPenaltyRule::orderBy('id')->get();
        $today = now('Asia/Manila')->toDateString();
        $current = $rules->first(fn ($rule) => $rule->is_active
            && $rule->effective_from->toDateString() <= $today
            && (! $rule->effective_to || $rule->effective_to->toDateString() >= $today));

        return [
            'is_active' => $current !== null,
            'amount' => $current?->amount ?? '0.00',
            'interval_value' => $current?->interval_value ?? 1,
            'interval_unit' => $current?->interval_unit ?? 'months',
            // Include every rule so future, expired, and off-rule edits invalidate previews too.
            'version' => hash('sha256', $rules->toJson()),
            'updated_at' => $rules->max('updated_at')?->toISOString(),
        ];
    }
}
