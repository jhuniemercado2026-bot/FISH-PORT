<?php

namespace App\Http\Middleware;

use App\Services\BillPenaltyService;
use Closure;
use Illuminate\Http\Request;

class ApplyBoatBillPenalties
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->is('api/bills', 'api/bills/*', 'api/payments', 'api/payments/*',
            'api/boat-statement', 'api/owner-statement', 'api/billing-reports/*',
            'api/revenue-reports/*', 'api/dashboard-data')) {
            app(BillPenaltyService::class)->applyOverduePenalties();
        }
        return $next($request);
    }
}
