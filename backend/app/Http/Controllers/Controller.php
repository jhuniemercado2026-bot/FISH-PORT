<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Bus\DispatchesJobs;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;

class Controller extends BaseController
{
    use AuthorizesRequests, DispatchesJobs, ValidatesRequests;

    protected function fiscalYear(Request $request): ?int
    {
        $year = trim((string) $request->query('fiscal_year', ''));

        return preg_match('/^\d{4}$/', $year) ? (int) $year : null;
    }

    protected function applyFiscalYear($query, Request $request, string $column)
    {
        $year = $this->fiscalYear($request);

        return $year ? $query->whereYear($column, $year) : $query;
    }
}
