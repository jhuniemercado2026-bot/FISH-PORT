<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;

class ActivityLogController extends Controller
{
    public function index(\Illuminate\Http\Request $request)
    {
        $validated = $request->validate([
            'search' => 'nullable|string|max:255',
            'module' => 'nullable|string|max:100',
            'user' => 'nullable|string|max:150',
            'status' => 'nullable|string|in:info,warning,critical',
            'period' => 'nullable|string|in:all,today,week,month',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|min:1|max:100',
            'sort' => 'nullable|string|in:created_at_desc,created_at_asc',
        ]);

        $perPage = 10;

        $baseQuery = ActivityLog::query()
            ->forTableIndex()
            ->searchTable($validated['search'] ?? null)
            ->tableFilters($validated);
        $this->applyFiscalYear($baseQuery, $request, 'created_at');

        $stats = [
            'total_logs' => (clone $baseQuery)->count(),
            'info_count' => (clone $baseQuery)->where('severity', 'info')->count(),
            'warning_count' => (clone $baseQuery)->where('severity', 'warning')->count(),
            'critical_count' => (clone $baseQuery)->where('severity', 'critical')->count(),
            'today_count' => (clone $baseQuery)->whereDate('created_at', now('Asia/Manila')->toDateString())->count(),
        ];

        $logs = (clone $baseQuery)
            ->tableSort($validated['sort'] ?? 'created_at_desc')
            ->paginate($perPage)
            ->through(function ($log) {
                return [
                    'id' => $log->id,
                    'created_at' => optional($log->created_at)->toIso8601String(),
                    'timestamp' => optional($log->created_at)->toIso8601String(),
                    'user_name' => $log->user_name ?: 'System',
                    'user_role' => $log->user_role,
                    'action' => $log->action,
                    'module' => $log->module,
                    'details' => $log->details,
                    'severity' => $log->severity,
                ];
            });

        return response()->json([
            'data' => $logs->items(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
                'from' => $logs->firstItem(),
                'to' => $logs->lastItem(),
                'stats' => $stats,
            ],
        ]);
    }
}
