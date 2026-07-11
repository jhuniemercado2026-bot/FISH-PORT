<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FishClassification extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'classification_id';

    protected $fillable = [
        'classification_name',
        'created_by',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function banyeraItems()
    {
        return $this->hasMany(BanyeraItem::class, 'classification_id', 'classification_id');
    }

    public function activeBanyeraItems()
    {
        return $this->hasMany(BanyeraItem::class, 'classification_id', 'classification_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function scopeActive($query)
    {
        return $query->whereNull($this->getQualifiedDeletedAtColumn());
    }
}
