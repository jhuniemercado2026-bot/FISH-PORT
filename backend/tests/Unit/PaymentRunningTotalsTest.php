<?php

namespace Tests\Unit;

use App\Models\Payment;
use PHPUnit\Framework\TestCase;

class PaymentRunningTotalsTest extends TestCase
{
    public function test_it_calculates_cumulative_paid_and_balance_for_each_payment_record(): void
    {
        $payments = collect([
            (object) [
                'payment_id' => 1,
                'bill_id' => 10,
                'amount_paid' => 20,
                'total_amount' => 35,
                'payment_date' => '2024-01-01',
            ],
            (object) [
                'payment_id' => 2,
                'bill_id' => 10,
                'amount_paid' => 15,
                'total_amount' => 35,
                'payment_date' => '2024-01-02',
            ],
        ]);

        $result = Payment::hydrateRunningTotals($payments);

        $this->assertSame([35.0, 15.0], $result->pluck('total_amount')->all());
        $this->assertSame([20.0, 35.0], $result->pluck('bill_total_paid')->all());
        $this->assertSame([15.0, 0.0], $result->pluck('balance')->all());
    }
}
