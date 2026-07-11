<?php

namespace Tests\Feature;

use App\Http\Controllers\RevenueReportController;
use Tests\TestCase;

class RevenueReportControllerTest extends TestCase
{
    public function test_revenue_rows_expose_fee_and_receivable_fields_for_report_consumers(): void
    {
        $controller = new class extends RevenueReportController {
            public function exposeNormalizeRevenueRow(object|array $row): array
            {
                return $this->normalizeRevenueRow($row);
            }
        };

        $normalized = $controller->exposeNormalizeRevenueRow((object) [
            'date' => '2025-01-01',
            'payorName' => 'Test Payor',
            'orNumber' => '123',
            'description' => 'Docking',
            'amount' => 125.5,
            'total' => 125.5,
            'quantity' => 1,
            'sourceType' => 'docking',
        ]);

        $this->assertSame(125.5, $normalized['amount']);
        $this->assertSame(125.5, $normalized['fee']);
        $this->assertSame(125.5, $normalized['receivable']);
        $this->assertSame(125.5, $normalized['total']);
    }
}
