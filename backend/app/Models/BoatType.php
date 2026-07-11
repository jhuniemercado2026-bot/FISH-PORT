<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Builder;
use App\Models\User;
use App\Models\Boat;

class BoatType extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'boat_type_id';

    protected $fillable = [
        'type_name',
        'created_by',
    ];

    protected $hidden = [
        'updated_at',
    ];

    // ── Relationships ──────────────────────────────────────────────────────────

    public function boats()
    {
        return $this->hasMany(Boat::class, 'boat_type_id', 'boat_type_id');
    }

    /**
     * Only counts non-archived boats.
     * Used with withCount('activeBoats as boats_count').
     */
    public function activeBoats()
    {
        return $this->hasMany(Boat::class, 'boat_type_id', 'boat_type_id')
                    ->whereNull('deleted_at');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    // ── Scopes ─────────────────────────────────────────────────────────────────

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
            ->with('createdBy:user_id,first_name,last_name,email')
            ->withCount('activeBoats as boats_count')
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
                ->where('type_name', 'like', "{$search}%");
        });
    }

    public function scopeUsageStatus(Builder $query, ?string $status): Builder
    {
        $status = match ($status) {
            'active' => 'used',
            'inactive' => 'unused',
            default => $status,
        };

        return $query
            ->when($status === 'used', fn (Builder $filtered) => $filtered->has('activeBoats'))
            ->when($status === 'unused', fn (Builder $filtered) => $filtered->doesntHave('activeBoats'));
    }

    public function scopeManagementFilters(Builder $query, ?string $search = '', ?string $status = 'all'): Builder
    {
        return $query
            ->searchManagement($search)
            ->usageStatus($status);
    }
}
