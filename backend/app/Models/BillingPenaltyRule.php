<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingPenaltyRule extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'amount' => 'decimal:2', 'interval_value' => 'integer', 'is_active' => 'boolean', 'revision' => 'integer',
        'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d',
    ];

    /** Acquire the same ordered row/range locks for rule edits and assessments. Call within a transaction. */
    public static function lockAll(): \Illuminate\Database\Eloquent\Collection
    {
        return static::orderBy('id')->lockForUpdate()->get();
    }
}
