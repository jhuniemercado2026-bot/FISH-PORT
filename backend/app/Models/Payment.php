<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class Payment extends Model
{
    protected $primaryKey = 'payment_id';

    protected $fillable = [
        'payment_reference_no',
        'bill_id',
        'amount_paid',
        'status',
        'official_receipt_no',
        'payment_method',
        'payment_date',
        'remarks',
        'received_by',
    ];

    protected $casts = [
        'amount_paid' => 'decimal:2',
        'payment_date' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Payment $payment) {
            if (!$payment->payment_reference_no) {
                $payment->payment_reference_no = static::generateUniquePaymentReferenceNumber();
            }
        });
    }

    public function scopeForTableIndex(Builder $query): Builder
    {
        return $query
            ->from('payments as p')
            ->join('bills as b', 'b.bill_id', '=', 'p.bill_id')
            ->leftJoin('boats as boat', 'boat.boat_id', '=', 'b.boat_id')
            ->leftJoin('boat_owners as owner', 'owner.owner_id', '=', 'boat.owner_id')
            ->leftJoin('boat_types as boat_type', 'boat_type.boat_type_id', '=', 'boat.boat_type_id')
            ->leftJoin('users as received_by', 'received_by.user_id', '=', 'p.received_by')
            ->select([
                'p.payment_id',
                'p.payment_reference_no',
                'p.bill_id',
                'p.amount_paid',
                'p.status',
                'p.official_receipt_no',
                'p.payment_method',
                'p.payment_date',
                'p.remarks',
                'p.received_by',
                'p.created_at',
                'p.updated_at',
                'b.bill_reference_no',
                'b.total_amount',
                DB::raw('COALESCE(SUM(p.amount_paid) OVER (PARTITION BY p.bill_id ORDER BY p.payment_date, p.payment_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0) as bill_total_paid'),
                DB::raw('(b.total_amount - COALESCE(SUM(p.amount_paid) OVER (PARTITION BY p.bill_id ORDER BY p.payment_date, p.payment_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0)) as balance'),
                'boat.boat_id',
                'boat.boat_name',
                'owner.owner_firstname',
                'owner.owner_lastname',
                'boat_type.type_name as boat_type',
                'received_by.first_name as received_by_first_name',
                'received_by.last_name as received_by_last_name',
                'received_by.email as received_by_email',
            ]);
    }

    public static function hydrateRunningTotals(Collection $payments): Collection
    {
        $runningTotalsById = [];
        $paymentsByBill = $payments
            ->filter(fn ($payment) => !empty($payment->bill_id))
            ->groupBy(fn ($payment) => (string) $payment->bill_id);

        foreach ($paymentsByBill as $billId => $billPayments) {
            $sortedPayments = $billPayments
                ->sortBy(function ($payment) {
                    $dateValue = (string) ($payment->payment_date ?? '');
                    $paymentId = (int) ($payment->payment_id ?? 0);

                    return [$dateValue === '' ? '0000-00-00' : $dateValue, $paymentId];
                })
                ->values();

            $runningTotal = 0.0;

            foreach ($sortedPayments as $payment) {
                $amountPaid = (float) ($payment->amount_paid ?? 0);
                $billTotal = (float) ($payment->total_amount ?? 0);
                $balanceBeforePayment = round(max($billTotal - $runningTotal, 0.0), 2);
                $runningTotal += $amountPaid;

                $runningTotalsById[(int) $payment->payment_id] = [
                    'total_amount' => $balanceBeforePayment,
                    'bill_total_paid' => round($runningTotal, 2),
                    'balance' => round(max($billTotal - $runningTotal, 0.0), 2),
                ];
            }
        }

        return $payments->map(function ($payment) use ($runningTotalsById) {
            $computed = $runningTotalsById[(int) $payment->payment_id] ?? null;

            if ($computed === null) {
                return $payment;
            }

            $payment->total_amount = $computed['total_amount'];
            $payment->bill_total_paid = $computed['bill_total_paid'];
            $payment->balance = $computed['balance'];

            return $payment;
        })->values();
    }

    public function scopeSearchTable(Builder $query, ?string $search): Builder
    {
        $search = trim((string) $search);

        if ($search === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($search) {
            $inner
                ->where('p.payment_reference_no', 'like', "%{$search}%")
                ->orWhere('p.amount_paid', 'like', "%{$search}%")
                ->orWhereDate('p.payment_date', $search)
                ->orWhere('boat.boat_name', 'like', "%{$search}%");
        });
    }

    public function scopeTableFilters(Builder $query, array $filters = []): Builder
    {
        $status = (string) ($filters['status'] ?? 'all');
        $period = (string) ($filters['period'] ?? 'all');

        if ($status !== '' && $status !== 'all') {
            $query->where('p.status', $status);
        }

        $now = now('Asia/Manila');

        match ($period) {
            'today' => $query->whereDate('p.payment_date', $now->toDateString()),
            'week' => $query->whereBetween('p.payment_date', [$now->copy()->startOfWeek()->startOfDay(), $now->copy()->endOfWeek()->endOfDay()]),
            'month' => $query->whereBetween('p.payment_date', [$now->copy()->startOfMonth()->startOfDay(), $now->copy()->endOfMonth()->endOfDay()]),
            'year' => $query->whereBetween('p.payment_date', [$now->copy()->startOfYear()->startOfDay(), $now->copy()->endOfYear()->endOfDay()]),
            default => null,
        };

        return $query;
    }

    public function scopeTableSort(Builder $query, ?string $sort = null): Builder
    {
        return match ($sort) {
            'date_asc' => $query->orderBy('p.payment_date')->orderBy('p.payment_id'),
            default => $query->orderByDesc('p.payment_date')->orderByDesc('p.payment_id'),
        };
    }

    private static function generateUniquePaymentReferenceNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $referenceNumber = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            if (!static::where('payment_reference_no', $referenceNumber)->exists()) {
                return $referenceNumber;
            }
        }

        throw new RuntimeException('Unable to generate a unique payment reference number.');
    }
}
