<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

class ServerTimeController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $now = now('Asia/Manila');

        return response()->json([
            'timestamp_ms' => $now->getTimestampMs(),
            'server_time' => $now->toIso8601String(),
            'timezone' => 'Asia/Manila',
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }
}
