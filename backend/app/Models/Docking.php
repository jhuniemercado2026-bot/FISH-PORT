<?php

namespace App\Models;

use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Docking extends Model
{
    protected $primaryKey = 'docking_id';

    protected $fillable = [
        'boat_id',
        'fee_id',
        'docking_date',
        'docking_fee',
        'created_by',
        'void_reason',
        'voided_at',
        'voided_by',
    ];

    protected $casts = [
        'docking_date' => 'datetime',
        'docking_fee' => 'decimal:2',
        'voided_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected function serializeDate(DateTimeInterface $date): string
    {
        return Carbon::instance($date)->timezone('Asia/Manila')->format('Y-m-d H:i:s');
    }

    // Main linked boat for the docking record.
    public function boat()
    {
        return $this->belongsTo(Boat::class, 'boat_id', 'boat_id')->withTrashed();
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

    public function billItems()
    {
        return $this->hasMany(BillItem::class, 'docking_id', 'docking_id');
    }

    private function hasJoinedAlias(Builder $query, string $alias): bool
    {
        foreach ($query->getQuery()->joins ?? [] as $join) {
            if (preg_match('/\bas\s+' . preg_quote($alias, '/') . '$/i', (string) $join->table)) {
                return true;
            }
        }

        return false;
    }

    private function joinSearchRelations(Builder $query): Builder
    {
        if (!$this->hasJoinedAlias($query, 'docking_search_boats')) {
            $query->leftJoin(
                'boats as docking_search_boats',
                'dockings.boat_id',
                '=',
                'docking_search_boats.boat_id'
            );
        }

        if (!$this->hasJoinedAlias($query, 'docking_search_boat_types')) {
            $query->leftJoin(
                'boat_types as docking_search_boat_types',
                'docking_search_boats.boat_type_id',
                '=',
                'docking_search_boat_types.boat_type_id'
            );
        }

        return $query;
    }

    public static function managementRelations(): array
    {
        return [
            'boat' => fn ($boatQuery) => $boatQuery
                ->withTrashed()
                ->select('boat_id', 'owner_id', 'boat_type_id', 'boat_name'),
            'boat.owner' => fn ($ownerQuery) => $ownerQuery
                ->withTrashed()
                ->select('owner_id', 'owner_firstname', 'owner_lastname'),
            'boat.boatType' => fn ($typeQuery) => $typeQuery
                ->withTrashed()
                ->select('boat_type_id', 'type_name'),
            'createdBy:user_id,first_name,last_name,email',
            'voidedBy:user_id,first_name,last_name,email',
        ];
    }

    public static function calendarRelations(): array
    {
        return [
            'boat' => fn ($boatQuery) => $boatQuery
                ->withTrashed()
                ->select('boat_id', 'owner_id', 'boat_type_id', 'boat_name'),
            'boat.owner' => fn ($ownerQuery) => $ownerQuery
                ->withTrashed()
                ->select('owner_id', 'owner_firstname', 'owner_lastname'),
            'boat.boatType' => fn ($typeQuery) => $typeQuery
                ->withTrashed()
                ->select('boat_type_id', 'type_name'),
            'createdBy:user_id,first_name,last_name,email',
            'voidedBy:user_id,first_name,last_name,email',
        ];
    }

    public function scopeForTableIndex(Builder $query): Builder
    {
        return $query
            ->select([
                'dockings.docking_id',
                'dockings.boat_id',
                'dockings.fee_id',
                'dockings.docking_date',
                'dockings.docking_fee',
                'dockings.created_by',
                'dockings.void_reason',
                'dockings.voided_at',
                'dockings.voided_by',
                'dockings.created_at',
                'dockings.updated_at',
            ])
            ->with(self::managementRelations())
            ->withExists(['billItems as is_billed']);
    }

    public function scopeForManagementIndex(Builder $query): Builder
    {
        return $query->forTableIndex();
    }

    public function scopeForCalendarIndex(Builder $query): Builder
    {
        return $query
            ->select([
                'docking_id',
                'boat_id',
                'docking_date',
                'docking_fee',
                'created_by',
                'void_reason',
                'voided_at',
                'voided_by',
            ])
            ->with(self::calendarRelations());
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
                ->where('dockings.docking_fee', 'like', "{$search}%")
                ->orWhere('docking_search_boats.boat_name', 'like', "{$search}%")
                ->orWhere('docking_search_boat_types.type_name', 'like', "{$search}%");

            if ($dateStart && $dateEnd) {
                $inner->orWhere(function (Builder $dateQuery) use ($dateStart, $dateEnd) {
                    $dateQuery
                        ->where('dockings.docking_date', '>=', $dateStart)
                        ->where('dockings.docking_date', '<=', $dateEnd);
                });
            }
        });
    }

    public function scopeSearchManagement(Builder $query, ?string $search): Builder
    {
        return $query->searchTable($search);
    }

    public function scopeTableFilters(
        Builder $query,
        ?string $search = '',
        ?string $status = 'all',
        ?string $period = 'all',
        ?string $boatType = 'all'
    ): Builder {
        $now = Carbon::now('Asia/Manila');

        return $query
            ->searchTable($search)
            ->when($status === 'active', fn (Builder $filtered) => $filtered->whereNull('dockings.voided_at'))
            ->when($status === 'voided', fn (Builder $filtered) => $filtered->whereNotNull('dockings.voided_at'))
            ->when($boatType !== null && $boatType !== '' && $boatType !== 'all', function (Builder $filtered) use ($boatType) {
                $this->joinSearchRelations($filtered);
                $filtered->where('docking_search_boats.boat_type_id', $boatType);
            })
            ->when($period === 'today', fn (Builder $filtered) => $filtered->whereBetween('dockings.docking_date', [
                $now->copy()->startOfDay(),
                $now->copy()->endOfDay(),
            ]))
            ->when($period === 'week', fn (Builder $filtered) => $filtered->whereBetween('dockings.docking_date', [
                $now->copy()->startOfWeek()->startOfDay(),
                $now->copy()->endOfWeek()->endOfDay(),
            ]))
            ->when($period === 'month', fn (Builder $filtered) => $filtered->whereBetween('dockings.docking_date', [
                $now->copy()->startOfMonth()->startOfDay(),
                $now->copy()->endOfMonth()->endOfDay(),
            ]))
            ->when($period === 'year', fn (Builder $filtered) => $filtered->whereBetween('dockings.docking_date', [
                $now->copy()->startOfYear()->startOfDay(),
                $now->copy()->endOfYear()->endOfDay(),
            ]));
    }

    public function scopeManagementFilters(
        Builder $query,
        ?string $search = '',
        ?string $status = 'all',
        ?string $period = 'all',
        ?string $boatType = 'all'
    ): Builder {
        return $query->tableFilters($search, $status, $period, $boatType);
    }
}
