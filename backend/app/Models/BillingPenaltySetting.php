<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillingPenaltySetting extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'percentage' => 'decimal:2', 'amount' => 'decimal:2', 'interval_value' => 'integer',
        'is_active' => 'boolean', 'version' => 'integer',
    ];
}
