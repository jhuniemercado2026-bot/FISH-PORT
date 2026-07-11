<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $userId = $user?->user_id;

        $baseQuery = Notification::query()
            ->when($userId, fn ($query) => $query->where('recipient_user_id', $userId));
        $baseQuery = $this->applyFiscalYear($baseQuery, $request, 'created_at');

        $query = (clone $baseQuery);
        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'all');

        if ($status === 'read') {
            $query->where('is_read', true);
        } elseif ($status === 'unread') {
            $query->where('is_read', false);
        }

        if ($search !== '') {
            $monthNameMap = [
                'jan' => 1,
                'january' => 1,
                'feb' => 2,
                'february' => 2,
                'mar' => 3,
                'march' => 3,
                'apr' => 4,
                'april' => 4,
                'may' => 5,
                'jun' => 6,
                'june' => 6,
                'jul' => 7,
                'july' => 7,
                'aug' => 8,
                'august' => 8,
                'sep' => 9,
                'sept' => 9,
                'september' => 9,
                'oct' => 10,
                'october' => 10,
                'nov' => 11,
                'november' => 11,
                'dec' => 12,
                'december' => 12,
            ];

            $lowerSearch = strtolower($search);
            $monthOnlyMatch = preg_match('/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/i', $search, $monthMatches) === 1;

            if ($monthOnlyMatch) {
                $monthName = strtolower($monthMatches[1]);
                $monthNumber = $monthNameMap[$monthName] ?? null;
                $year = isset($monthMatches[2]) ? (int) $monthMatches[2] : null;

                if ($monthNumber) {
                    $query->whereMonth('created_at', $monthNumber);

                    if ($year) {
                        $query->whereYear('created_at', $year);
                    }
                }
            } else {
                $looksLikeDate = preg_match('/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?/', $search) === 1;

                if ($looksLikeDate) {
                    try {
                        $parsedDate = Carbon::createFromFormat('Y-m-d', $search, 'Asia/Manila');
                    } catch (\Throwable $error) {
                        try {
                            $parsedDate = Carbon::parse($search, 'Asia/Manila');
                        } catch (\Throwable $innerError) {
                            $parsedDate = null;
                        }
                    }

                    if ($parsedDate) {
                        $query->whereDate('created_at', $parsedDate->toDateString());
                    } else {
                        $query->whereRaw('1 = 0');
                    }
                } else {
                    $query->where(function ($subQuery) use ($search) {
                        $subQuery->where('title', 'like', "%{$search}%")
                            ->orWhere('message', 'like', "%{$search}%")
                            ->orWhereRaw('DATE(created_at) LIKE ?', ["%{$search}%"]);
                    });
                }
            }
        }

        $query->latest('created_at');

        if ($request->boolean('all')) {
            $notifications = $query->get();

            return response()->json([
                'notifications' => $notifications,
                'unread_count' => (clone $baseQuery)->where('is_read', false)->count(),
                'read_count' => (clone $baseQuery)->where('is_read', true)->count(),
                'total_count' => (clone $baseQuery)->count(),
            ]);
        }

        $perPage = min(max((int) $request->query('per_page', 8), 1), 100);
        $notifications = $query->paginate($perPage);

        return response()->json([
            'notifications' => $notifications->items(),
            'notifications_meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
                'from' => $notifications->firstItem(),
                'to' => $notifications->lastItem(),
            ],
            'unread_count' => (clone $baseQuery)->where('is_read', false)->count(),
            'read_count' => (clone $baseQuery)->where('is_read', true)->count(),
            'total_count' => (clone $baseQuery)->count(),
        ]);
    }

    /**
     * Return a lightweight notifications summary: unread count and latest notification preview.
     */
    public function summary(Request $request)
    {
        $user = Auth::user();
        $userId = $user?->user_id;

        $baseQuery = Notification::query()
            ->when($userId, fn ($query) => $query->where('recipient_user_id', $userId));
        $this->applyFiscalYear($baseQuery, $request, 'created_at');

        $latest = (clone $baseQuery)->latest('created_at')->first();

        return response()->json([
            'unread_count' => (clone $baseQuery)->where('is_read', false)->count(),
            'latest' => $latest ? [
                'notification_id' => $latest->notification_id,
                'title' => $latest->title,
                'message' => $latest->message,
                'related_type' => $latest->related_type,
                'related_id' => $latest->related_id,
                'is_read' => (bool) $latest->is_read,
                'created_at' => $latest->created_at?->toIso8601String(),
            ] : null,
        ]);
    }

    public function markRead(Request $request, $id)
    {
        $user = Auth::user();
        $userId = $user?->user_id;

        $notification = Notification::query()
            ->when($userId, fn ($query) => $query->where('recipient_user_id', $userId))
            ->findOrFail($id);

        if (!$notification->is_read) {
            $notification->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return response()->json([
            'message' => 'Notification marked as read.',
            'notification' => $notification->fresh(),
        ]);
    }
}
