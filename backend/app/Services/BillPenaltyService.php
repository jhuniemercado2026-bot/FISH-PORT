<?php

namespace App\Services;

class BillPenaltyService
{
    public function applyOverduePenalties(bool $notify = true): int
    {
        return app(DatedBillPenaltyService::class)->applyAll($notify);
    }

    public function applyToBill(int $billId, bool $notify = true): int
    {
        return app(DatedBillPenaltyService::class)->applyToBill($billId, $notify);
    }
}
