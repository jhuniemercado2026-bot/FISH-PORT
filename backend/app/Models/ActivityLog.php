<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class ActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'user_name',
        'user_role',
        'action',
        'module',
        'details',
        'severity',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function scopeForTableIndex(Builder $query): Builder
    {
        return $query->select([
            'id',
            'user_id',
            'created_at',
            'user_name',
            'user_role',
            'action',
            'module',
            'details',
            'severity',
        ]);
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
            $parsed = Carbon::parse($search, 'Asia/Manila');
            $dateStart = $parsed->copy()->startOfDay();
            $dateEnd = $parsed->copy()->endOfDay();
        } catch (\Throwable $error) {
            $dateStart = null;
            $dateEnd = null;
        }

        return $query->where(function (Builder $innerQuery) use ($search, $dateStart, $dateEnd) {
            $innerQuery
                ->where('module', 'like', "%{$search}%")
                ->orWhere('user_name', 'like', "%{$search}%")
                ->orWhere('created_at', 'like', "%{$search}%");

            if ($dateStart && $dateEnd) {
                $innerQuery->orWhereBetween('created_at', [$dateStart, $dateEnd]);
            }
        });
    }

    public function scopeTableFilters(Builder $query, array $filters = []): Builder
    {
        $module = trim((string) ($filters['module'] ?? ''));
        $user = trim((string) ($filters['user'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $period = trim((string) ($filters['period'] ?? 'all'));
        $now = Carbon::now('Asia/Manila');

        return $query
            ->when($module !== '' && $module !== 'all', fn (Builder $query) => $query->where('module', $module))
            ->when($user !== '' && $user !== 'all', fn (Builder $query) => $query->where('user_name', $user))
            ->when($status !== '' && $status !== 'all', fn (Builder $query) => $query->where('severity', $status))
            ->when($period === 'today', fn (Builder $query) => $query->whereDate('created_at', $now->toDateString()))
            ->when($period === 'week', fn (Builder $query) => $query->whereBetween('created_at', [
                $now->copy()->startOfWeek(),
                $now->copy()->endOfWeek(),
            ]))
            ->when($period === 'month', fn (Builder $query) => $query->whereBetween('created_at', [
                $now->copy()->startOfMonth(),
                $now->copy()->endOfMonth(),
            ]));
    }

    public function scopeTableSort(Builder $query, ?string $sort = 'created_at_desc'): Builder
    {
        return match ($sort) {
            'created_at_asc' => $query->orderBy('created_at')->orderBy('id'),
            default => $query->orderByDesc('created_at')->orderByDesc('id'),
        };
    }
}
