<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingPenaltyRule extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'amount' => 'decimal:2', 'interval_value' => 'integer', 'is_active' => 'boolean',
        'effective_from' => 'date:Y-m-d', 'effective_to' => 'date:Y-m-d',
    ];
}
