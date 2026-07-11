<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

class Bill extends Model
{

    protected $primaryKey = 'bill_id';

    protected $fillable = [
        'bill_reference_no',
        'boat_id',
        'total_amount',
        'created_by',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Bill $bill) {
            if (!$bill->bill_reference_no) {
                $bill->bill_reference_no = static::generateUniqueBillReferenceNumber();
            }
        });
    }

    public function boat()
    {
        return $this->belongsTo(Boat::class, 'boat_id', 'boat_id')->withTrashed();
    }

    public function items()
    {
        return $this->hasMany(BillItem::class, 'bill_id', 'bill_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'bill_id', 'bill_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }


    public function scopeForTableIndex(Builder $query): Builder
    {
        return $query
            ->select('bill_id', 'bill_reference_no', 'boat_id', 'total_amount', 'created_by', 'created_at', 'updated_at')
            ->with([
                'boat' => fn ($query) => $query
                    ->select('boat_id', 'boat_name', 'owner_id', 'boat_type_id'),
                'boat.owner' => fn ($query) => $query
                    ->select('owner_id', 'owner_firstname', 'owner_lastname'),
                'boat.boatType' => fn ($query) => $query
                    ->select('boat_type_id', 'type_name'),
                'createdBy:user_id,first_name,last_name,email',
                'items:bill_item_id,bill_id,transaction_type,docking_id,banyera_id,amount',
            ])
            ->withExists(['payments as has_payments'])
            ->withSum('payments as total_paid', 'amount_paid');
    }

    public function scopeSearchTable(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($search) {
            $inner
                ->where('bill_reference_no', 'like', "%{$search}%")
                ->orWhere('total_amount', 'like', "%{$search}%")
                ->orWhere('created_at', 'like', "%{$search}%")
                ->orWhereHas('boat', function (Builder $boatQuery) use ($search) {
                    $boatQuery->where('boat_name', 'like', "%{$search}%");
                })
                ->orWhereHas('boat.boatType', function (Builder $boatTypeQuery) use ($search) {
                    $boatTypeQuery->where('type_name', 'like', "%{$search}%");
                });
        });
    }

    public function scopeTableFilters(
        Builder $query,
        ?string $search = '',
        ?string $status = 'all',
        ?string $period = 'all',
        ?string $boat = 'all'
    ): Builder {
        $now = now('Asia/Manila');
        $paymentTotalSql = '(select coalesce(sum(payments.amount_paid), 0) from payments where payments.bill_id = bills.bill_id)';

        return $query
            ->searchTable($search)
            ->when($boat !== null && $boat !== '' && $boat !== 'all', fn (Builder $filtered) => $filtered->where('bills.boat_id', $boat))
            ->when($status === 'paid', fn (Builder $filtered) => $filtered
                ->where('bills.total_amount', '>', 0)
                ->whereRaw("{$paymentTotalSql} >= bills.total_amount"))
            ->when($status === 'partial', fn (Builder $filtered) => $filtered
                ->whereRaw("{$paymentTotalSql} > 0")
                ->whereRaw("{$paymentTotalSql} < bills.total_amount"))
            ->when($status === 'unpaid', fn (Builder $filtered) => $filtered->whereRaw("{$paymentTotalSql} <= 0"))
            ->when($period === 'today', fn (Builder $filtered) => $filtered->whereBetween('bills.created_at', [
                $now->copy()->startOfDay(),
                $now->copy()->endOfDay(),
            ]))
            ->when($period === 'week', fn (Builder $filtered) => $filtered->whereBetween('bills.created_at', [
                $now->copy()->startOfWeek()->startOfDay(),
                $now->copy()->endOfWeek()->endOfDay(),
            ]))
            ->when($period === 'month', fn (Builder $filtered) => $filtered->whereBetween('bills.created_at', [
                $now->copy()->startOfMonth()->startOfDay(),
                $now->copy()->endOfMonth()->endOfDay(),
            ]))
            ->when($period === 'year', fn (Builder $filtered) => $filtered->whereBetween('bills.created_at', [
                $now->copy()->startOfYear()->startOfDay(),
                $now->copy()->endOfYear()->endOfDay(),
            ]));
    }

    public function scopeTableSort(Builder $query, ?string $sort = 'created_at_desc'): Builder
    {
        return match ($sort) {
            'created_at_asc' => $query->orderBy('created_at')->orderBy('bill_id'),
            'amount_desc' => $query->orderByDesc('total_amount')->orderByDesc('created_at')->orderByDesc('bill_id'),
            'amount_asc' => $query->orderBy('total_amount')->orderByDesc('created_at')->orderByDesc('bill_id'),
            default => $query->orderByDesc('created_at')->orderByDesc('bill_id'),
        };
    }

    public static function tableRelations(): array
    {
        return [
            'boat' => fn ($query) => $query
                ->select('boat_id', 'boat_name', 'owner_id', 'boat_type_id'),
            'boat.owner' => fn ($query) => $query
                ->select('owner_id', 'owner_firstname', 'owner_lastname'),
            'boat.boatType' => fn ($query) => $query
                ->select('boat_type_id', 'type_name'),
            'createdBy:user_id,first_name,last_name,email',
            'items:bill_item_id,bill_id,transaction_type,docking_id,banyera_id,amount',
            'items.docking:docking_id,boat_id,docking_date,docking_fee',
            'items.docking.boat:boat_id,boat_name',
            'items.banyeraTransaction:banyera_id,boat_id,transaction_date,total_fee',
            'items.banyeraTransaction.boat:boat_id,boat_name',
        ];
    }

    private static function generateUniqueBillReferenceNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $referenceNumber = str_pad((string) random_int(0, 999999999), 9, '0', STR_PAD_LEFT);

            if (!static::where('bill_reference_no', $referenceNumber)->exists()) {
                return $referenceNumber;
            }
        }

        throw new RuntimeException('Unable to generate a unique bill reference number.');
    }
}
