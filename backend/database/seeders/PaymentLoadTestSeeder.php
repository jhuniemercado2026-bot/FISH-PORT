<?php

namespace Database\Seeders;

use App\Models\Bill;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class PaymentLoadTestSeeder extends Seeder
{
    private const YEAR_PAYMENT_COUNTS = [
        2025 => 100,
        2026 => 150,
    ];

    private const PAYMENT_REFERENCE_START = 800001;
    private const RECEIPT_REFERENCE_START = 700001;

    public function run(): void
    {
        $now = now();

        $user = User::firstOrCreate(
            ['email' => 'payment-load-test@example.com'],
            [
                'password' => Hash::make('password'),
                'role' => 'head',
                'status' => 'active',
                'first_name' => 'Payment',
                'last_name' => 'Load Test',
                'gender' => 'male',
                'contact_number' => '09000000004',
                'birthday' => '1990-01-01',
                'address' => 'Opol Fish Port',
            ]
        );

        $this->call(BillLoadTestSeeder::class);

        $billsByYear = [];

        foreach (self::YEAR_PAYMENT_COUNTS as $year => $count) {
            $billsByYear[$year] = Bill::query()
                ->whereYear('created_at', $year)
                ->orderBy('bill_reference_no')
                ->limit($count)
                ->get(['bill_id', 'bill_reference_no', 'total_amount', 'created_at']);

            if ($billsByYear[$year]->count() < $count) {
                throw new \RuntimeException(sprintf('Expected %d bills for %d before seeding payments.', $count, $year));
            }
        }

        $bills = collect([]);
        foreach ($billsByYear as $year => $yearBills) {
            $bills = $bills->concat($yearBills);
        }

        $paymentCount = $bills->count();
        $paymentReferences = collect(range(0, $paymentCount - 1))
            ->map(fn (int $index) => (string) (self::PAYMENT_REFERENCE_START + $index));

        $receiptReferences = collect(range(0, $paymentCount - 1))
            ->map(fn (int $index) => (string) (self::RECEIPT_REFERENCE_START + $index));

        DB::transaction(function () use ($bills, $paymentReferences, $receiptReferences, $now, $user) {
            Payment::query()
                ->whereIn('payment_reference_no', $paymentReferences)
                ->orWhereIn('official_receipt_no', $receiptReferences)
                ->delete();

            $rows = [];

            foreach ($bills->values() as $index => $bill) {
                $totalAmount = (float) $bill->total_amount;
                $amountPaid = $index % 2 === 0 ? $totalAmount : max(round($totalAmount / 2, 2), 1);

                $rows[] = [
                    'payment_reference_no' => $paymentReferences[$index],
                    'bill_id' => $bill->bill_id,
                    'amount_paid' => $amountPaid,
                    'status' => $amountPaid >= $totalAmount ? 'paid' : 'partial',
                    'official_receipt_no' => $receiptReferences[$index],
                    'payment_method' => 'cash',
                    'payment_date' => $bill->created_at ?? $now,
                    'remarks' => 'Payment load test record',
                    'received_by' => $user->user_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('payments')->insert($chunk);
            }
        });

        if ($this->command) {
            $this->command->info(sprintf('PaymentLoadTestSeeder: %s payments created for 2025/2026 bills.', $paymentCount));
            foreach (self::YEAR_PAYMENT_COUNTS as $year => $count) {
                $this->command->info(sprintf('  %s: %s payments', $year, $count));
            }
        }
    }
}
