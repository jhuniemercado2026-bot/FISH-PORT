<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use RuntimeException;

class Remittance extends Model
{
    protected $primaryKey = 'remittance_id';

    protected $fillable = [
        'remittance_reference_no',
        'date',
        'amount',
        'surplus',
        'deficit',
        'status',
        'remarks',
        'submitted_by',
    ];

    protected $casts = [
        'date' => 'date',
        'amount' => 'decimal:2',
        'surplus' => 'decimal:2',
        'deficit' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Remittance $remittance) {
            if (!$remittance->remittance_reference_no) {
                $remittance->remittance_reference_no = static::generateUniqueReferenceNumber();
            }
        });
    }

    public function submittedBy()
    {
        return $this->belongsTo(User::class, 'submitted_by', 'user_id');
    }

    public function scopeForTableIndex(Builder $query): Builder
    {
        return $query->select([
            'remittance_id',
            'remittance_reference_no',
            'date',
            'amount',
            'surplus',
            'deficit',
            'status',
            'remarks',
            'created_at',
            'updated_at',
        ]);
    }

    public function scopeSearchTable(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($search) {
            $inner
                ->where('remittance_reference_no', 'like', "%{$search}%")
                ->orWhereDate('date', $search)
                ->orWhere('amount', 'like', "%{$search}%");
        });
    }

    public function scopeTableFilters(Builder $query, array $filters = []): Builder
    {
        $status = (string) ($filters['status'] ?? 'all');
        $period = (string) ($filters['period'] ?? 'all');

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        $now = now('Asia/Manila');

        match ($period) {
            'today' => $query->whereDate('date', $now->toDateString()),
            'week' => $query->whereBetween('date', [$now->copy()->startOfWeek()->startOfDay(), $now->copy()->endOfWeek()->endOfDay()]),
            'month' => $query->whereBetween('date', [$now->copy()->startOfMonth()->startOfDay(), $now->copy()->endOfMonth()->endOfDay()]),
            'year' => $query->whereBetween('date', [$now->copy()->startOfYear()->startOfDay(), $now->copy()->endOfYear()->endOfDay()]),
            default => null,
        };

        return $query;
    }

    public function scopeTableSort(Builder $query, ?string $sort = null): Builder
    {
        return match ($sort) {
            'date_asc' => $query->orderBy('date')->orderBy('created_at')->orderBy('remittance_id'),
            default => $query->orderByDesc('date')->orderByDesc('created_at')->orderByDesc('remittance_id'),
        };
    }

    private static function generateUniqueReferenceNumber(): string
    {
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $reference = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            if (!static::where('remittance_reference_no', $reference)->exists()) {
                return $reference;
            }
        }

        throw new RuntimeException('Unable to generate a unique remittance reference number.');
    }
}
