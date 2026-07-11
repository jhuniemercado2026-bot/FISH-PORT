<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FeeType extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'fee_type_id';

    protected $fillable = [
        'fee_name',
        'created_by',
    ];

    public function fees()
    {
        return $this->hasMany(Fee::class, 'fee_type_id', 'fee_type_id');
    }

    public function activeFees()
    {
        return $this->hasMany(Fee::class, 'fee_type_id', 'fee_type_id')->whereNull('deleted_at');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function scopeActive($query)
    {
        return $query->whereNull($this->getQualifiedDeletedAtColumn());
    }

    public function scopeArchived($query)
    {
        return $query->onlyTrashed();
    }
}
