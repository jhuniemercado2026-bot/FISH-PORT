<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Builder;

class Boat extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'boat_id';

    protected $fillable = [
        'boat_name',
        'owner_id',
        'boat_type_id',
        'image_path',
        'status',
        'created_by',
    ];

    protected $hidden = [
        'updated_at',
        'image_path',
        'deleted_at',
    ];


    // ── Relationships ──
    public function owner()
    {
        return $this->belongsTo(BoatOwner::class, 'owner_id', 'owner_id')->withTrashed();
    }

    public function boatType()
    {
        return $this->belongsTo(BoatType::class, 'boat_type_id', 'boat_type_id')->withTrashed();
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function dockings()
    {
        return $this->hasMany(Docking::class, 'boat_id', 'boat_id');
    }

    public function banyeraTransactions()
    {
        return $this->hasMany(BanyeraTransaction::class, 'boat_id', 'boat_id');
    }

    public function bills()
    {
        return $this->hasMany(Bill::class, 'boat_id', 'boat_id');
    }

    // ── Scopes ──
    public static function managementRelations(): array
    {
        return [
            'owner' => fn ($ownerQuery) => $ownerQuery
                ->withTrashed()
                ->select('owner_id', 'owner_firstname', 'owner_lastname', 'contact_number', 'address'),
            'boatType' => fn ($typeQuery) => $typeQuery
                ->withTrashed()
                ->select('boat_type_id', 'type_name'),
            'createdBy' => fn ($userQuery) => $userQuery
                ->select('user_id', 'first_name', 'last_name', 'email'),
        ];
    }

    public function scopeActive($query)
    {
        return $query->whereNull($this->getQualifiedDeletedAtColumn());
    }

    public function scopeArchived($query)
    {
        return $query->onlyTrashed();
    }

    public function scopeForManagementIndex(Builder $query): Builder
    {
        return $query
            ->select('boat_id', 'boat_name', 'owner_id', 'boat_type_id', 'image_path', 'status', 'created_at', 'created_by')
            ->with(self::managementRelations())
            ->active();
    }

    public function scopeSearchManagement(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($search) {
            $inner
                ->where('boat_name', 'like', "{$search}%")
                ->orWhereHas('owner', function (Builder $ownerQuery) use ($search) {
                    $tokens = preg_split('/\s+/', $search, -1, PREG_SPLIT_NO_EMPTY) ?: [];

                    $ownerQuery->where(function (Builder $nameQuery) use ($search, $tokens) {
                        $nameQuery
                            ->where('owner_firstname', 'like', "{$search}%")
                            ->orWhere('owner_lastname', 'like', "{$search}%");

                        if (count($tokens) > 1) {
                            $nameQuery->orWhere(function (Builder $tokenQuery) use ($tokens) {
                                foreach ($tokens as $token) {
                                    $tokenQuery->where(function (Builder $partQuery) use ($token) {
                                        $partQuery
                                            ->where('owner_firstname', 'like', "{$token}%")
                                            ->orWhere('owner_lastname', 'like', "{$token}%");
                                    });
                                }
                            });
                        }
                    });
                })
                ->orWhereHas('boatType', function (Builder $typeQuery) use ($search) {
                    $typeQuery->where('type_name', 'like', "{$search}%");
                });
        });
    }

    public function scopeManagementFilters(
        Builder $query,
        ?string $search = '',
        ?string $status = 'all',
        ?string $owner = 'all',
        ?string $boatType = 'all'
    ): Builder {
        return $query
            ->searchManagement($search)
            ->when($status !== null && $status !== '' && $status !== 'all', fn (Builder $filtered) => $filtered->where('status', $status))
            ->when($owner !== null && $owner !== '' && $owner !== 'all', fn (Builder $filtered) => $filtered->where('owner_id', $owner))
            ->when($boatType !== null && $boatType !== '' && $boatType !== 'all', fn (Builder $filtered) => $filtered->where('boat_type_id', $boatType));
    }
}
