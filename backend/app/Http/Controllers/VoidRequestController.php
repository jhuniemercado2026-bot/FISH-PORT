<?php

namespace App\Http\Controllers;

use App\Models\BanyeraTransaction;
use App\Models\BillItem;
use App\Models\Docking;
use App\Models\Notification;
use App\Models\User;
use App\Models\VehicleTicket;
use App\Services\ActivityLogService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class VoidRequestController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'transaction_type' => 'required|string|in:docking,banyera,tickets',
            'transaction_id' => 'required|integer|min:1',
            'void_reason' => 'required|string|max:500',
        ]);

        $transactionType = $validated['transaction_type'];
        $transactionId = (int) $validated['transaction_id'];
        $reason = trim($validated['void_reason']);
        $record = $this->findRecord($transactionType, $transactionId);

        if ($this->isVoided($record)) {
            return response()->json([
                'message' => 'This transaction has already been voided.',
            ], 422);
        }

        if ($this->isBilled($transactionType, $transactionId)) {
            return response()->json([
                'message' => 'This transaction has been billed and can no longer be requested for voiding.',
            ], 422);
        }

        $coordinators = User::query()
            ->where('role', 'coordinator')
            ->where('status', '!=', 'deactivated')
            ->get(['user_id']);

        if ($coordinators->isEmpty()) {
            return response()->json([
                'message' => 'No coordinators are available to receive this request.',
            ], 422);
        }

        $sender = Auth::user();
        $label = $this->recordLabel($transactionType, $record);
        $title = 'Void Request';
        $message = $this->notificationMessage($transactionType, $record, $reason);
        $relatedType = $this->notificationRelatedType($transactionType, $record);

        $notifications = $coordinators->map(function (User $coordinator) use ($title, $message, $sender, $relatedType, $transactionId) {
            return Notification::create([
                'title' => $title,
                'message' => $message,
                'recipient_user_id' => $coordinator->user_id,
                'sender_user_id' => $sender?->user_id,
                'related_type' => $relatedType,
                'related_id' => $transactionId,
                'is_read' => false,
            ]);
        });

        app(ActivityLogService::class)->log(
            action: 'REQUEST_VOID',
            module: 'Transactions',
            details: 'Requested coordinator void approval for ' . $label . ' with reason: "' . $reason . '".',
            user: $sender
        );

        return response()->json([
            'message' => 'Void request sent to coordinators.',
            'notifications_count' => $notifications->count(),
        ], 201);
    }

    private function findRecord(string $transactionType, int $transactionId): Model
    {
        return match ($transactionType) {
            'docking' => Docking::with(['boat', 'fee'])->findOrFail($transactionId),
            'banyera' => BanyeraTransaction::with('boat')->findOrFail($transactionId),
            'tickets' => VehicleTicket::with('vehicleType')->findOrFail($transactionId),
        };
    }

    private function isVoided(Model $record): bool
    {
        return !is_null($record->getAttribute('voided_at'));
    }

    private function isBilled(string $transactionType, int $transactionId): bool
    {
        if ($transactionType === 'docking') {
            return BillItem::query()
                ->where('transaction_type', 'docking')
                ->where('docking_id', $transactionId)
                ->exists();
        }

        if ($transactionType === 'banyera') {
            return BillItem::query()
                ->where('transaction_type', 'banyera')
                ->where('banyera_id', $transactionId)
                ->exists();
        }

        return false;
    }

    private function recordLabel(string $transactionType, Model $record): string
    {
        if ($transactionType === 'docking') {
            $boatName = $record->getRelation('boat')?->boat_name;

            return 'docking record #' . $record->getKey() . ($boatName ? ' for boat "' . $boatName . '"' : '');
        }

        if ($transactionType === 'banyera') {
            $boatName = $record->getRelation('boat')?->boat_name;

            return 'banyera transaction #' . $record->getKey() . ($boatName ? ' for boat "' . $boatName . '"' : '');
        }

        $controlNumber = trim((string) $record->getAttribute('control_number'));
        $plateNumber = trim((string) $record->getAttribute('plate_number'));
        $vehicleType = $record->getRelation('vehicleType')?->type_name;

        return 'vehicle ticket #' . $record->getKey()
            . ($controlNumber !== '' ? ' "' . $controlNumber . '"' : '')
            . ($plateNumber !== '' ? ' for plate "' . $plateNumber . '"' : '')
            . ($vehicleType ? ' (' . $vehicleType . ')' : '');
    }

    private function notificationMessage(string $transactionType, Model $record, string $reason): string
    {
        if ($transactionType === 'docking') {
            $boatName = $record->getRelation('boat')?->boat_name ?: 'Unknown boat';
            $fee = $this->formatMoney($record->getAttribute('docking_fee'));
            $dateTime = $this->formatDateTime($record->getAttribute('docking_date'));

            return 'Requested to void docking record, boat "' . $boatName . '" in ' . $dateTime . ' with fee "' . $fee . '". Reason: ' . $reason;
        }

        if ($transactionType === 'banyera') {
            $boatName = $record->getRelation('boat')?->boat_name ?: 'Unknown boat';
            $fee = $this->formatMoney($record->getAttribute('total_fee'));
            $dateTime = $this->formatDateTime($record->getAttribute('transaction_date'));

            return 'Requested to void banyera transaction, boat "' . $boatName . '" in ' . $dateTime . ' with fee "' . $fee . '". Reason: ' . $reason;
        }

        if ($transactionType === 'tickets') {
            $vehicleType = $record->getRelation('vehicleType')?->type_name ?: 'Vehicle';
            $ticketDate = $this->formatDateTime($record->getAttribute('ticket_date'));
            $ticketFee = $this->formatMoney($record->getAttribute('ticket_fee'));

            return 'Requested to void vehicle ticket, ' . $vehicleType . ' in ' . $ticketDate . ' with ' . $ticketFee . '. Reason: ' . $reason;
        }

        return 'Requested to void ' . $this->recordLabel($transactionType, $record) . '. Reason: ' . $reason;
    }

    private function notificationRelatedType(string $transactionType, Model $record): string
    {
        if ($transactionType === 'tickets') {
            $ticketType = strtolower((string) $record->getAttribute('ticket_type'));

            return $ticketType === 'annual' ? 'void_request_annual_ticket' : 'void_request_daily_ticket';
        }

        return 'void_request_' . $transactionType;
    }

    private function formatDateTime(mixed $value): string
    {
        if (!$value) {
            return 'N/A';
        }

        try {
            return Carbon::parse($value, 'Asia/Manila')->format('F j, Y \i\n g:i A');
        } catch (\Throwable) {
            return 'N/A';
        }
    }

    private function formatMoney(mixed $value): string
    {
        return '₱' . number_format((float) $value, 2);
    }
}
