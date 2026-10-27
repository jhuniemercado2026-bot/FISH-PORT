<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillPenalty extends Model
{
    protected $guarded = ['id'];

    protected $fillable = [
        'bill_id', 'penalty_rule_id', 'original_penalty_rule_id', 'period_number', 'settings_version',
        'schedule_anchor_at', 'schedule_period_number', 'period_ended_at',
        'percentage', 'fixed_amount', 'interval_value', 'interval_unit',
        'base_amount', 'amount', 'suspended_amount',
    ];

    protected $casts = [
        'percentage' => 'decimal:2', 'fixed_amount' => 'decimal:2', 'base_amount' => 'decimal:2', 'amount' => 'decimal:2',
        'suspended_amount' => 'decimal:2',
        'schedule_anchor_at' => 'datetime', 'period_ended_at' => 'datetime',
    ];

    public function getEffectiveAmountAttribute(): float
    {
        return max(0, round((float) $this->amount - (float) $this->suspended_amount, 2));
    }
}
