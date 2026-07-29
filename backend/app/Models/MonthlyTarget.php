<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MonthlyTarget extends Model
{
    protected $primaryKey = 'monthly_target_id';

    protected $fillable = [
        'target_year',
        'target_month',
        'amount',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'target_year' => 'integer',
        'target_month' => 'integer',
        'amount' => 'decimal:2',
    ];

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by', 'user_id');
    }
}
