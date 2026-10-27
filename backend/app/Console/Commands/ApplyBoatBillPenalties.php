<?php

namespace App\Console\Commands;

use App\Services\BillPenaltyService;
use Illuminate\Console\Command;

class ApplyBoatBillPenalties extends Command
{
    protected $signature = 'bills:apply-penalties';
    protected $description = 'Assess elapsed penalty periods on unpaid boat bills';

    public function handle(BillPenaltyService $penalties): int
    {
        $this->info('Assessed ' . $penalties->applyOverduePenalties() . ' penalty period(s).');
        return self::SUCCESS;
    }
}
