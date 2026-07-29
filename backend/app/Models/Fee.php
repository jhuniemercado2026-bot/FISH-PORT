<?php

namespace App\Models;

use App\Enums\FeeTypeName;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class Fee extends Model
{
    protected $primaryKey = 'fee_id';

    protected $fillable = [
        'fee_type_name',
        'boat_type_id',
        'vehicle_type_id',
        'amount',
        'effective_from',
        'effective_to',
        'created_by',
    ];

    protected $appends = [
        'fee_name',
        'fee_type',
    ];

    protected $casts = [
        'fee_type_name' => FeeTypeName::class,
        'amount' => 'decimal:2',
        'effective_from' => 'date',
        'effective_to' => 'date',
    ];

    protected function feeName(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->resolveFeeTypeLabel()
        );
    }

    protected function feeType(): Attribute
    {
        return Attribute::make(
            get: fn () => ['fee_name' => $this->resolveFeeTypeLabel()]
        );
    }

    public function boatType()
    {
        return $this->belongsTo(BoatType::class, 'boat_type_id', 'boat_type_id')->withTrashed();
    }

    public function vehicleType()
    {
        return $this->belongsTo(VehicleType::class, 'vehicle_type_id', 'vehicle_type_id')->withTrashed();
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function dockings()
    {
        return $this->hasMany(Docking::class, 'fee_id', 'fee_id');
    }

    public function banyeraItems()
    {
        return $this->hasMany(BanyeraItem::class, 'fee_id', 'fee_id');
    }

    public function vehicleTickets()
    {
        return $this->hasMany(VehicleTicket::class, 'fee_id', 'fee_id');
    }

    public function scopeForTableIndex($query)
    {
        return $query->with([
            'boatType:boat_type_id,type_name',
            'vehicleType:vehicle_type_id,type_name',
            'createdBy:user_id,first_name,last_name,email',
        ]);
    }

    public function scopeForFormLookup($query)
    {
        return $query->select([
            'fee_id',
            'fee_type_name',
            'boat_type_id',
            'vehicle_type_id',
            'amount',
            'effective_from',
            'effective_to',
        ]);
    }

    public function scopeSearchTable($query, $search = '')
    {
        if (empty($search)) {
            return $query;
        }

        return $query->where(function ($q) use ($search) {
            $q->where('fee_type_name', 'like', "%{$search}%")
                ->orWhere('amount', 'like', "%{$search}%")
                ->orWhereHas('boatType', function ($subQuery) use ($search) {
                    $subQuery->where('type_name', 'like', "%{$search}%");
                })
                ->orWhereHas('vehicleType', function ($subQuery) use ($search) {
                    $subQuery->where('type_name', 'like', "%{$search}%");
                });
        });
    }

    public function scopeTableFilters($query, $status = 'all', $feeType = 'all', $period = 'all')
    {
        $today = now()->toDateString();

        if ($status !== 'all') {
            $query->where(function ($q) use ($status, $today) {
                if ($status === 'active') {
                    $q->where('effective_from', '<=', $today)
                        ->where(function ($subQ) use ($today) {
                            $subQ->whereNull('effective_to')
                                ->orWhere('effective_to', '>=', $today);
                        });
                } elseif ($status === 'pending') {
                    $q->where('effective_from', '>', $today);
                } elseif ($status === 'expired') {
                    $q->whereNotNull('effective_to')
                        ->where('effective_to', '<', $today);
                }
            });
        }

        if ($feeType !== 'all') {
            $query->where('fee_type_name', $feeType);
        }

        if ($period !== 'all') {
            if ($period === 'today') {
                $query->whereDate('effective_from', $today);
            } elseif ($period === 'week') {
                $startOfWeek = now()->subDays(now()->dayOfWeek)->toDateString();
                $query->whereBetween('effective_from', [$startOfWeek, $today]);
            } elseif ($period === 'month') {
                $query->whereYear('effective_from', now()->year)
                    ->whereMonth('effective_from', now()->month);
            }
        }

        return $query;
    }

    public function scopeTableSort($query)
    {
        return $query->orderBy('created_at', 'desc')
            ->orderBy('effective_from', 'desc')
            ->orderBy('fee_id', 'desc');
    }

    public function toArray(): array
    {
        $array = parent::toArray();
        $array['feeType'] = $array['fee_type'] ?? ['fee_name' => $this->resolveFeeTypeLabel()];

        return $array;
    }

    private function resolveFeeTypeLabel(): ?string
    {
        $value = $this->getAttribute('fee_type_name');

        if ($value instanceof FeeTypeName) {
            return $value->value;
        }

        return $value ? (string) $value : null;
    }
}
