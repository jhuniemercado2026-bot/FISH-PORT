<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class BanyeraTransaction extends Model
{
    protected $primaryKey = 'banyera_id';

    protected $fillable = [
        'boat_id',
        'owner_id',
        'transaction_date',
        'total_fee',
        'owner_signature_data_url',
        'owner_signature_signed_at',
        'created_by',
        'void_reason',
        'voided_at',
        'voided_by',
    ];

    protected $casts = [
        'transaction_date' => 'datetime',
        'total_fee' => 'decimal:2',
        'owner_signature_signed_at' => 'datetime',
        'voided_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function boat()
    {
        return $this->belongsTo(Boat::class, 'boat_id', 'boat_id')->withTrashed();
    }

    public function items()
    {
        return $this->hasMany(BanyeraItem::class, 'banyera_id', 'banyera_id');
    }

    public function billItems()
    {
        return $this->hasMany(BillItem::class, 'banyera_id', 'banyera_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function voidedBy()
    {
        return $this->belongsTo(User::class, 'voided_by', 'user_id');
    }

    private function hasJoinedAlias(Builder $query, string $alias): bool
    {
        $joins = $query->getQuery()->joins ?? [];

        foreach ($joins as $join) {
            if (preg_match('/\bas\s+' . preg_quote($alias, '/') . '$/i', (string) $join->table)) {
                return true;
            }
        }

        return false;
    }

    private function joinSearchRelations(Builder $query): Builder
    {
        if (!$this->hasJoinedAlias($query, 'banyera_search_boats')) {
            $query->leftJoin(
                'boats as banyera_search_boats',
                'banyera_transactions.boat_id',
                '=',
                'banyera_search_boats.boat_id'
            );
        }

        if (!$this->hasJoinedAlias($query, 'banyera_search_boat_types')) {
            $query->leftJoin(
                'boat_types as banyera_search_boat_types',
                'banyera_search_boats.boat_type_id',
                '=',
                'banyera_search_boat_types.boat_type_id'
            );
        }

        return $query;
    }

    public function scopeForTableIndex(Builder $query, bool $includeVoided = false): Builder
    {
        return $query
            ->select([
                'banyera_transactions.banyera_id',
                'banyera_transactions.boat_id',
                'banyera_transactions.owner_id',
                'banyera_transactions.transaction_date',
                'banyera_transactions.total_fee',
                'banyera_transactions.owner_signature_data_url',
                'banyera_transactions.owner_signature_signed_at',
                'banyera_transactions.created_by',
                'banyera_transactions.void_reason',
                'banyera_transactions.voided_at',
                'banyera_transactions.voided_by',
                'banyera_transactions.created_at',
                'banyera_transactions.updated_at',
            ])
            ->with([
                'boat:boat_id,boat_name,owner_id,boat_type_id,image_path,status,deleted_at',
                'boat.owner:owner_id,owner_firstname,owner_lastname,address,contact_number,owner_signature_data_url,owner_signature_public_id,owner_signature_signed_at,owner_signature_updated_by,deleted_at',
                'boat.owner.ownerSignatureUpdatedByUser:user_id,first_name,last_name,email',
                'boat.boatType:boat_type_id,type_name,deleted_at',
                'items:item_id,banyera_id,classification_id,quantity,fee_id,subtotal,daug',
                'items.classification:classification_id,classification_name',
                'createdBy:user_id,first_name,last_name,email',
                'voidedBy:user_id,first_name,last_name,email',
            ])
            ->withExists(['billItems as billed_exists'])
            ->when(!$includeVoided, fn (Builder $filtered) => $filtered->whereNull('banyera_transactions.voided_at'));
    }

    public function scopeSearchTable(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

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

        $this->joinSearchRelations($query);

        return $query->where(function (Builder $inner) use ($search, $dateStart, $dateEnd) {
            $inner
                ->where('banyera_transactions.total_fee', 'like', "{$search}%")
                ->orWhere('banyera_search_boats.boat_name', 'like', "{$search}%")
                ->orWhere('banyera_search_boat_types.type_name', 'like', "{$search}%");

            if ($dateStart && $dateEnd) {
                $inner->orWhere(function (Builder $dateQuery) use ($dateStart, $dateEnd) {
                    $dateQuery
                        ->where('banyera_transactions.transaction_date', '>=', $dateStart)
                        ->where('banyera_transactions.transaction_date', '<=', $dateEnd);
                });
            }
        });
    }

    public function scopeTableFilters(
        Builder $query,
        ?string $search = '',
        ?string $status = 'all',
        ?string $period = 'all',
        ?string $fishType = 'all'
    ): Builder {
        $search = trim((string) ($search ?? ''));
        $status = (string) ($status ?? 'all');
        $period = (string) ($period ?? 'all');
        $fishType = (string) ($fishType ?? 'all');
        $now = Carbon::now('Asia/Manila');

        return $query
            ->searchTable($search)
            ->when($status === 'active', fn (Builder $filtered) => $filtered->whereNull('banyera_transactions.voided_at'))
            ->when($status === 'voided', fn (Builder $filtered) => $filtered->whereNotNull('banyera_transactions.voided_at'))
            ->when($fishType !== '' && $fishType !== 'all', function (Builder $filtered) use ($fishType) {
                $filtered->whereHas('items', function (Builder $itemQuery) use ($fishType) {
                    $itemQuery->where('classification_id', $fishType);
                });
            })
            ->when($period === 'today', fn (Builder $filtered) => $filtered->whereBetween('banyera_transactions.transaction_date', [
                $now->copy()->startOfDay(),
                $now->copy()->endOfDay(),
            ]))
            ->when($period === 'week', fn (Builder $filtered) => $filtered->whereBetween('banyera_transactions.transaction_date', [
                $now->copy()->startOfWeek()->startOfDay(),
                $now->copy()->endOfWeek()->endOfDay(),
            ]))
            ->when($period === 'month', fn (Builder $filtered) => $filtered->whereBetween('banyera_transactions.transaction_date', [
                $now->copy()->startOfMonth()->startOfDay(),
                $now->copy()->endOfMonth()->endOfDay(),
            ]))
            ->when(in_array($period, ['year', 'yearly'], true), fn (Builder $filtered) => $filtered->whereBetween('banyera_transactions.transaction_date', [
                $now->copy()->startOfYear()->startOfDay(),
                $now->copy()->endOfYear()->endOfDay(),
            ]));
    }

    public function scopeTableSort(Builder $query, ?string $sort = 'transaction_date_desc'): Builder
    {
        return match ($sort) {
            'transaction_date_asc' => $query->orderBy('banyera_transactions.transaction_date')->orderBy('banyera_transactions.created_at')->orderBy('banyera_transactions.banyera_id'),
            'created_at_asc' => $query->orderBy('banyera_transactions.created_at')->orderBy('banyera_transactions.banyera_id'),
            'created_at_desc' => $query->latest('banyera_transactions.created_at')->latest('banyera_transactions.banyera_id'),
            default => $query->latest('banyera_transactions.transaction_date')->latest('banyera_transactions.created_at')->latest('banyera_transactions.banyera_id'),
        };
    }
}
