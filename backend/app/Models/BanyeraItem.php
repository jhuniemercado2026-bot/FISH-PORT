<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BanyeraItem extends Model
{
    protected $primaryKey = 'item_id';

    protected $fillable = [
        'banyera_id',
        'classification_id',
        'quantity',
        'fee_id',
        'subtotal',
        'daug',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'daug' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function transaction()
    {
        return $this->belongsTo(BanyeraTransaction::class, 'banyera_id', 'banyera_id');
    }

    public function classification()
    {
        return $this->belongsTo(FishClassification::class, 'classification_id', 'classification_id');
    }

    public function fee()
    {
        return $this->belongsTo(Fee::class, 'fee_id', 'fee_id');
    }

}
