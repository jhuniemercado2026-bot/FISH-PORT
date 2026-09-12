<?php

namespace App\Models;

use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;

class VehicleTicket extends Model
{
    protected $primaryKey = 'ticket_id';

    protected $fillable = [
        'control_number',
        'official_receipt_no',
        'vehicle_type_id',
        'plate_number',
        'driver_name',
        'ticket_type',
        'fee_id',
        'daily_fee',
        'banyera_fee',
        'ticket_fee',
        'ticket_date',
        'end_date',
        'created_by',
        'void_reason',
        'voided_at',
        'voided_by',
    ];

    protected $casts = [
        'daily_fee' => 'decimal:2',
        'banyera_fee' => 'decimal:2',
        'ticket_fee' => 'decimal:2',
        'ticket_date' => 'datetime:Y-m-d H:i:s',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'end_date' => 'date',
        'voided_at' => 'datetime',
    ];

    protected function serializeDate(DateTimeInterface $date): string
    {
        return Carbon::instance($date)->timezone('Asia/Manila')->format('Y-m-d H:i:s');
    }

    public function vehicleType()
    {
        return $this->belongsTo(VehicleType::class, 'vehicle_type_id', 'vehicle_type_id')->withTrashed();
    }

    public function fee()
    {
        return $this->belongsTo(Fee::class, 'fee_id', 'fee_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function voidedBy()
    {
        return $this->belongsTo(User::class, 'voided_by', 'user_id');
    }

    public function scopeForTableIndex($query)
    {
        return $query->with([
            'vehicleType:vehicle_type_id,type_name,deleted_at',
            'fee:fee_id,fee_type_name,amount,vehicle_type_id,boat_type_id,effective_from,effective_to',
            'createdBy:user_id,first_name,last_name,email',
            'voidedBy:user_id,first_name,last_name,email',
        ]);
    }

    public function scopeSearchTable($query, ?string $search, ?string $ticketType = null)
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        if ($ticketType === 'daily') {
            $dateStart = null;
            $dateEnd = null;

            try {
                if (preg_match('/[a-zA-Z-]|\d{1,2}\/\d{1,2}|\d{4}/', $search)) {
                    $parsedDate = Carbon::parse($search, 'Asia/Manila');
                    $dateStart = $parsedDate->copy()->startOfDay();
                    $dateEnd = $parsedDate->copy()->endOfDay();
                }
            } catch (\Throwable $error) {
                $dateStart = null;
                $dateEnd = null;
            }

            return $query->where(function ($inner) use ($search, $dateStart, $dateEnd) {
                $inner
                    ->where('ticket_fee', 'like', "{$search}%")
                    ->orWhereHas('vehicleType', function ($typeQuery) use ($search) {
                        $typeQuery->where('type_name', 'like', "{$search}%");
                    });

                if ($dateStart && $dateEnd) {
                    $inner->orWhereBetween('ticket_date', [$dateStart->toDateString(), $dateEnd->toDateString()]);
                }
            });
        }

        if ($ticketType === 'annual') {
            $dateStart = null;
            $dateEnd = null;

            try {
                if (preg_match('/[a-zA-Z-]|\d{1,2}\/\d{1,2}|\d{4}/', $search)) {
                    $parsedDate = Carbon::parse($search, 'Asia/Manila');
                    $dateStart = $parsedDate->copy()->startOfDay();
                    $dateEnd = $parsedDate->copy()->endOfDay();
                }
            } catch (\Throwable $error) {
                $dateStart = null;
                $dateEnd = null;
            }

            return $query->where(function ($inner) use ($search, $dateStart, $dateEnd) {
                $inner
                    ->where('plate_number', 'like', "{$search}%")
                    ->orWhere('driver_name', 'like', "{$search}%")
                    ->orWhere('ticket_fee', 'like', "{$search}%")
                    ->orWhereHas('vehicleType', function ($typeQuery) use ($search) {
                        $typeQuery->where('type_name', 'like', "{$search}%");
                    });

                if ($dateStart && $dateEnd) {
                    $inner->orWhereBetween('ticket_date', [$dateStart->toDateString(), $dateEnd->toDateString()]);
                }
            });
        }

        return $query->where(function ($inner) use ($search) {
            $inner
                ->where('control_number', 'like', "%{$search}%")
                ->orWhere('official_receipt_no', 'like', "%{$search}%")
                ->orWhere('plate_number', 'like', "%{$search}%")
                ->orWhere('driver_name', 'like', "%{$search}%")
                ->orWhere('ticket_type', 'like', "%{$search}%")
                ->orWhere('ticket_fee', 'like', "%{$search}%")
                ->orWhereDate('ticket_date', $search)
                ->orWhereHas('vehicleType', function ($typeQuery) use ($search) {
                    $typeQuery->where('type_name', 'like', "%{$search}%");
                })
                ->orWhereHas('fee', function ($feeQuery) use ($search) {
                    $feeQuery->where('fee_type_name', 'like', "%{$search}%");
                })
                ->orWhereHas('createdBy', function ($userQuery) use ($search) {
                    $userQuery
                        ->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
        });
    }

    public function scopeTableFilters($query, array $filters = [])
    {
        $period = (string) ($filters['period'] ?? 'all');
        $vehicleType = (string) ($filters['vehicle_type'] ?? 'all');
        $ticketType = (string) ($filters['ticket_type'] ?? 'all');
        $status = (string) ($filters['status'] ?? 'all');

        if ($vehicleType !== '' && $vehicleType !== 'all') {
            $query->where('vehicle_type_id', $vehicleType);
        }

        if (in_array($ticketType, ['daily', 'annual'], true)) {
            $query->where('ticket_type', $ticketType);
        }

        $now = Carbon::now('Asia/Manila');

        match ($period) {
            'today' => $query->whereDate('ticket_date', $now->toDateString()),
            'week' => $query->whereBetween('ticket_date', [
                $now->copy()->startOfWeek()->startOfDay(),
                $now->copy()->endOfWeek()->endOfDay(),
            ]),
            'month' => $query->whereBetween('ticket_date', [
                $now->copy()->startOfMonth()->startOfDay(),
                $now->copy()->endOfMonth()->endOfDay(),
            ]),
            'year' => $query->whereBetween('ticket_date', [
                $now->copy()->startOfYear()->startOfDay(),
                $now->copy()->endOfYear()->endOfDay(),
            ]),
            default => null,
        };

        match ($status) {
            'active' => $query->whereNull('voided_at'),
            'voided' => $query->whereNotNull('voided_at'),
            'expired' => $query->whereNull('voided_at')->whereDate('end_date', '<', $now->toDateString()),
            'pending' => $query->whereNull('voided_at')->whereDate('ticket_date', '>', $now->toDateString()),
            default => null,
        };

        return $query;
    }

    public function scopeTableSort($query, string $sort = 'latest')
    {
        return match ($sort) {
            'oldest' => $query->oldest('ticket_date')->oldest('created_at')->oldest('ticket_id'),
            default => $query->latest('ticket_date')->latest('created_at')->latest('ticket_id'),
        };
    }
}
