<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class YearlyTarget extends Model
{
    protected $primaryKey = 'yearly_target_id';

    protected $fillable = [
        'target_year',
        'amount',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'target_year' => 'integer',
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
