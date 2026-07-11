<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BillItem extends Model
{
    protected $primaryKey = 'bill_item_id';

    protected $fillable = [
        'bill_id',
        'transaction_type',
        'docking_id',
        'banyera_id',
        'amount',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function bill()
    {
        return $this->belongsTo(Bill::class, 'bill_id', 'bill_id');
    }

    public function docking()
    {
        return $this->belongsTo(Docking::class, 'docking_id', 'docking_id');
    }

    public function banyeraTransaction()
    {
        return $this->belongsTo(BanyeraTransaction::class, 'banyera_id', 'banyera_id');
    }
}
