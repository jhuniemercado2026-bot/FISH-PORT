<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class VehicleType extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'vehicle_type_id';

    protected $fillable = [
        'type_name',
        'created_by',
    ];

    public function vehicleTickets()
    {
        return $this->hasMany(VehicleTicket::class, 'vehicle_type_id', 'vehicle_type_id');
    }

    public function activeVehicleTickets()
    {
        return $this->hasMany(VehicleTicket::class, 'vehicle_type_id', 'vehicle_type_id')
            ->whereNull('deleted_at');
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
